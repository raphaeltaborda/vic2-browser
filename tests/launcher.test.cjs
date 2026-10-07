const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('web/openvic-shell.html', 'utf8');
const code = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  .replace('$GODOT_CONFIG', JSON.stringify({executable: 'index', gdextensionLibs: ['openvic.wasm']}))
  .replace('$GODOT_THREADS_ENABLED', 'false');

function setup({failStart = false} = {}) {
  const elements = new Map();

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
    window: {addEventListener() {}},
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

function select(env, paths) {
  env.context.fixtures = paths.map(path => ({
    name: path.split('/').pop(),
    webkitRelativePath: 'Victoria II/' + path,
    size: 4,
    arrayBuffer: async () => new ArrayBuffer(4)
  }));

  vm.runInContext(
    'selected = fixtures; validateSelection(); ownership.checked = true; ownership.listeners.change();',
    env.context
  );
}

test('rejects an installation missing required interface data before startup', async () => {
  const env = setup();
  await ready();

  select(env, required.filter(path => path !== 'interface/sound.sfx'));

  assert.equal(env.elements.get('launch').disabled, true);
  await vm.runInContext('boot()', env.context);
  assert.equal(env.starts, 0);
});

test('mounts local game data, excludes extras and starts only once', async () => {
  const env = setup();
  await ready();

  select(env, [
    ...required,
    'mod/foo/data.txt',
    'save games/test.v2',
    'map/cache/test.bin',
    'setup.msi',
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
  assert(!env.mounted.some(([path]) => /v2game|mod\/|save games|map\/cache|\.msi/.test(path)));

  assert.equal(
    env.requests.length,
    1,
    'Only the project PCK is fetched by the shell; local Victoria II files never leave the browser'
  );
  assert(env.requests[0].includes('index.pck'));
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

  env.config.onPrintError('fixture failure');
  env.config.onPrint('[WebLoadRaw] later phase');
  assert.match(env.elements.get('runtime-status').textContent, /fixture failure/);
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
