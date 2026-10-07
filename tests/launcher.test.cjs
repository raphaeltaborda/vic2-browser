const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('web/openvic-shell.html', 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)<\/script>/);
assert.ok(match, 'launcher inline script not found');

const code = match[1]
  .replace('$GODOT_CONFIG', JSON.stringify({executable: 'index', gdextensionLibs: ['openvic.wasm']}))
  .replace('$GODOT_THREADS_ENABLED', 'false');

function setup({failStart = false} = {}) {
  const elements = new Map();
  const windowListeners = new Map();

  class Element {
    constructor() {
      this.style = {};
      this.disabled = true;
      this.textContent = '';
      this.children = [];
      this.listeners = {};
      this.classList = {add() {}, remove() {}};
    }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); }
    replaceChildren() { this.children = []; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    focus() {}
    click() { this.listeners.click?.(); }
  }

  const mounted = [];
  const requests = [];
  const intervals = new Map();
  let config;
  let starts = 0;

  const context = vm.createContext({
    document: {
      body: new Element(),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement() { return new Element(); }
    },
    window: {
      addEventListener(name, callback) { windowListeners.set(name, callback); }
    },
    navigator: {},
    sessionStorage: {removeItem() {}},
    Engine: class {
      static getMissingFeatures() { return []; }
      constructor(c) { config = c; }
      async init() {}
      copyToFS(path, buffer) { mounted.push([path, buffer.byteLength]); }
      async start() {
        starts++;
        if (failStart) throw new Error('fixture startup failure');
      }
    },
    fetch: async url => {
      requests.push(String(url));
      return {ok: true, arrayBuffer: async () => new ArrayBuffer(4)};
    },
    console: {log() {}, error() {}},
    URL,
    performance,
    Date,
    location: {href: 'https://example.test/vic2/', reload() {}},
    setTimeout,
    clearTimeout,
    setInterval: fn => {
      const id = intervals.size + 1;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: id => intervals.delete(id),
    requestAnimationFrame: callback => setTimeout(callback, 0),
  });

  vm.runInContext(code, context);

  return {
    context,
    elements,
    mounted,
    requests,
    intervals,
    windowListeners,
    get config() { return config; },
    get starts() { return starts; }
  };
}

const ready = () => new Promise(resolve => setTimeout(resolve, 10));

const required = [
  'v2game.exe',
  'common/defines.lua',
  'map/definition.csv',
  'map/provinces.bmp',
  'interface/sound.sfx',
  'interface/core.gui',
  'localisation/test.csv',
  'history/countries/test.txt'
];

function makeFile(path, {size = 4, raw = false} = {}) {
  return {
    name: path.split('/').pop(),
    webkitRelativePath: raw ? path : 'Victoria II/' + path,
    size,
    arrayBuffer: async () => new ArrayBuffer(size)
  };
}

function selectFiles(env, files) {
  env.context.fixtures = files;
  vm.runInContext(
    'selected = fixtures; validateSelection(); ownership.checked = true; ownership.listeners.change();',
    env.context
  );
}

function select(env, paths) {
  selectFiles(env, paths.map(path => makeFile(path)));
}

test('rejects an installation missing required interface data before startup', async () => {
  const env = setup();
  await ready();

  select(env, required.filter(path => path !== 'interface/sound.sfx'));

  assert.equal(env.elements.get('launch').disabled, true);
  await vm.runInContext('boot()', env.context);
  assert.equal(env.starts, 0);
});

test('validates required paths case-insensitively without rewriting mounted names', async () => {
  const env = setup();
  await ready();

  select(env, required.map(path => path.toUpperCase()));

  assert.equal(env.elements.get('launch').disabled, false);
  await vm.runInContext('boot()', env.context);
  assert(env.mounted.some(([path]) => path === '/vic2/COMMON/DEFINES.LUA'));
});

test('rejects unsafe and case-colliding relative paths before launch', async () => {
  const unsafe = setup();
  await ready();
  selectFiles(unsafe, [
    ...required.map(path => makeFile(path)),
    makeFile('Victoria II/../escape.txt', {raw: true})
  ]);
  assert.equal(unsafe.elements.get('launch').disabled, true);

  const duplicate = setup();
  await ready();
  selectFiles(duplicate, [
    ...required.map(path => makeFile(path)),
    makeFile('COMMON/DEFINES.LUA')
  ]);
  assert.equal(duplicate.elements.get('launch').disabled, true);
});

test('mounts local game data, excludes extras and starts only once', async () => {
  const env = setup();
  await ready();

  select(env, [
    ...required,
    'MOD/foo/data.txt',
    'Save Games/test.v2',
    'Map/Cache/test.bin',
    'SETUP.MSI',
    'gfx/flags/ABC.tga',
    'music/theme.mp3'
  ]);

  assert.equal(env.elements.get('launch').disabled, false);

  await vm.runInContext('boot()', env.context);
  await vm.runInContext('boot()', env.context);

  assert.equal(env.starts, 1);
  assert.equal(env.elements.get('game-files').disabled, true);
  assert.equal(env.elements.get('ownership').disabled, true);
  assert.equal(env.elements.get('mount-progress').value, 100);

  assert(env.mounted.some(([path]) => path === '/vic2/gfx/flags/ABC.tga'));
  assert(env.mounted.some(([path]) => path === '/vic2/music/theme.mp3'));
  assert(!env.mounted.some(([path]) => /v2game|mod\/|save games|map\/cache|\.msi/i.test(path)));

  assert.equal(
    env.requests.length,
    1,
    'Only the project PCK is fetched by the shell; local Victoria II files never leave the browser'
  );
  assert(env.requests[0].includes('index.pck'));
});

test('stderr is diagnostic; actual JavaScript errors become terminal', async () => {
  const env = setup();
  await ready();
  select(env, required);

  await vm.runInContext('boot()', env.context);

  env.config.onPrintError('recoverable warning');
  env.config.onPrint('[WebLoadRaw] after warning');
  assert.match(env.elements.get('runtime-status').textContent, /after warning/);

  env.windowListeners.get('error')({message: 'fatal fixture'});
  assert.match(env.elements.get('runtime-status').textContent, /fatal fixture/);

  env.config.onPrint('[WebLoadRaw] ignored after terminal');
  assert.match(env.elements.get('runtime-status').textContent, /fatal fixture/);
});

test('runtime phases stay visible and diagnostic logs stay bounded', async () => {
  const env = setup();
  await ready();
  select(env, required);

  await vm.runInContext('boot()', env.context);

  env.config.onPrint('[WebLoadRaw] compatibility loader');
  assert.match(env.elements.get('runtime-status').textContent, /compatibility loader/);

  vm.runInContext('lastPhaseAt = performance.now() - 46000;', env.context);
  for (const callback of env.intervals.values()) callback();

  assert.match(env.elements.get('runtime-status').textContent, /Sem nova etapa há 46s/);

  vm.runInContext('for (let i = 0; i < 900; i++) log("fixture " + i)', env.context);
  await ready();

  assert.equal(env.elements.get('log').textContent.split('\n').length, 500);
});

test('failed engine start requires reload and cannot be retried on a damaged instance', async () => {
  const env = setup({failStart: true});
  await ready();
  select(env, required);

  await vm.runInContext('boot()', env.context);

  assert.match(env.elements.get('error').textContent, /fixture startup failure/);
  assert.equal(env.elements.get('launch').disabled, true);
  assert.equal(env.elements.get('diagnostics').open, true);

  await vm.runInContext('boot()', env.context);
  assert.equal(env.starts, 1);
});
