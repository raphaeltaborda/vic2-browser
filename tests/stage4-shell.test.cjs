const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('stage4/stage4-shell.html', 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)<\/script>/);
assert.ok(match, 'Stage 4 inline script not found');

const code = match[1]
  .replace('$GODOT_CONFIG', JSON.stringify({executable: 'index', gdextensionLibs: ['openvic.wasm']}))
  .replace('$GODOT_THREADS_ENABLED', 'false')
  .replace('__OPENVIC_BUILD_SHA__', 'TEST_BUILD')
  .replace('__OPENVIC_STAGE1_SHA__', 'TEST_STAGE1');

function setup({failStart = false} = {}) {
  const elements = new Map();
  const listeners = new Map();
  const storage = new Map();

  class Element {
    constructor() {
      this.style = {};
      this.disabled = true;
      this.hidden = false;
      this.textContent = '';
      this.value = 0;
      this.children = [];
      this.listeners = {};
      this.className = '';
      this.open = false;
    }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    removeEventListener(name) { delete this.listeners[name]; }
    focus() {}
    click() { return this.listeners.click?.(); }
  }

  const mounted = [];
  let starts = 0;
  let engineConfig;

  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement() { return new Element(); },
    },
    window: {
      addEventListener(name, callback) { listeners.set(name, callback); },
    },
    navigator: {
      clipboard: {async writeText() {}},
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    Engine: class {
      static getMissingFeatures() { return []; }
      constructor(config) { engineConfig = config; }
      async init() {}
      copyToFS(path, buffer) { mounted.push([path, buffer.byteLength]); }
      startGame() {
        starts++;
        return failStart ? Promise.reject(new Error('fixture startup failure')) : new Promise(() => {});
      }
    },
    console: {log() {}, error() {}},
    globalThis: null,
    location: {reload() {}},
    performance,
    Date,
    URL,
    ArrayBuffer,
    TextEncoder,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: callback => setTimeout(callback, 0),
  });
  context.globalThis = context;
  vm.runInContext(code, context);

  return {
    context,
    elements,
    mounted,
    listeners,
    get starts() { return starts; },
    get engineConfig() { return engineConfig; },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 15));

const required = [
  'v2game.exe',
  'common/defines.lua',
  'map/definition.csv',
  'map/provinces.bmp',
  'interface/sound.sfx',
  'interface/core.gui',
  'localisation/test.csv',
  'history/countries/test.txt',
];

function makeFile(path, {size = 4, raw = false} = {}) {
  return {
    name: path.split('/').pop(),
    webkitRelativePath: raw ? path : 'Victoria II/' + path,
    size,
    arrayBuffer: async () => new ArrayBuffer(size),
  };
}

function select(env, paths) {
  env.context.fixtures = paths.map(path => makeFile(path));
  vm.runInContext('selected = fixtures; validateSelection();', env.context);
}

test('initializes into a safe waiting state', async () => {
  const env = setup();
  await tick();
  assert.equal(env.elements.get('pick').disabled, false);
  assert.equal(env.elements.get('files').disabled, false);
  assert.equal(env.elements.get('run').disabled, true);
  assert.equal(vm.runInContext('__OPENVIC_STAGE4_WAITING__', env.context), true);
});

test('rejects incomplete, unsafe and case-colliding selections', async () => {
  const incomplete = setup();
  await tick();
  select(incomplete, required.filter(path => path !== 'interface/core.gui'));
  assert.equal(incomplete.elements.get('run').disabled, true);

  const unsafe = setup();
  await tick();
  unsafe.context.fixtures = [...required.map(makeFile), makeFile('Victoria II/../escape.txt', {raw: true})];
  vm.runInContext('selected = fixtures; validateSelection();', unsafe.context);
  assert.equal(unsafe.elements.get('run').disabled, true);

  const duplicate = setup();
  await tick();
  duplicate.context.fixtures = [...required.map(makeFile), makeFile('COMMON/DEFINES.LUA')];
  vm.runInContext('selected = fixtures; validateSelection();', duplicate.context);
  assert.equal(duplicate.elements.get('run').disabled, true);
});

test('validates paths case-insensitively while preserving mounted names', async () => {
  const env = setup();
  await tick();
  select(env, required.map(path => path.toUpperCase()));
  assert.equal(env.elements.get('run').disabled, false);

  await vm.runInContext('run.listeners.click()', env.context);
  await tick();

  assert(env.mounted.some(([path]) => path === '/vic2/COMMON/DEFINES.LUA'));
  assert.equal(env.starts, 1);
});

test('mount policy excludes executables, mods, saves, archives and map cache', async () => {
  const env = setup();
  await tick();
  select(env, [
    ...required,
    'mod/example/data.txt',
    'Save Games/test.v2',
    'map/cache/cache.bin',
    'installer.zip',
    'gfx/flags/ABC.tga',
  ]);

  await vm.runInContext('run.listeners.click()', env.context);
  await tick();

  assert(env.mounted.some(([path]) => path === '/vic2/gfx/flags/ABC.tga'));
  assert(!env.mounted.some(([path]) => /v2game\.exe|mod\/|save games|map\/cache|\.zip$/i.test(path)));
  assert.equal(env.starts, 1);

  await vm.runInContext('run.listeners.click()', env.context);
  assert.equal(env.starts, 1);
});

test('engine rejection becomes a terminal shell failure with no retry', async () => {
  const env = setup({failStart: true});
  await tick();
  select(env, required);

  await vm.runInContext('run.listeners.click()', env.context);
  await tick();

  assert.equal(vm.runInContext('__OPENVIC_STAGE4_FAILURE__', env.context), true);
  assert.equal(vm.runInContext('__OPENVIC_STAGE4_STATE__', env.context), 'shell-failed');
  assert.match(env.elements.get('stage-state').textContent, /falha/);

  await vm.runInContext('run.listeners.click()', env.context);
  assert.equal(env.starts, 1);
});

test('stderr uses the bounded diagnostic path and diagnostics carry provenance', async () => {
  const env = setup();
  await tick();
  env.engineConfig.onPrintError('warning fixture');
  vm.runInContext('for (let i = 0; i < 1200; i++) log("line " + i)', env.context);
  assert.equal(env.elements.get('log').textContent.split('\n').length, 1000);
  assert.match(env.elements.get('log').textContent, /line 1199/);
  assert.equal(vm.runInContext('OPENVIC_BUILD_ID', env.context), 'TEST_BUILD');
  assert.equal(vm.runInContext('OPENVIC_STAGE1_ID', env.context), 'TEST_STAGE1');
});
