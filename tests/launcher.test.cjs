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
    constructor() { this.style = {}; this.disabled = true; this.textContent = ''; this.children = []; this.listeners = {}; this.classList = {add() {}, remove() {}}; }
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
  let config, starts = 0;
  const context = vm.createContext({
    document: {body: new Element(), getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement() { return new Element(); }},
    window: {addEventListener() {}}, navigator: {}, sessionStorage: {removeItem() {}},
    Engine: class {
      static getMissingFeatures() { return []; }
      constructor(c) { config = c; }
      async init() {}
      copyToFS(path, buffer) { mounted.push([path, buffer.byteLength]); }
      async start() { starts++; if (failStart) throw new Error('fixture startup failure'); }
    },
    fetch: async url => { requests.push(String(url)); return {ok:true, arrayBuffer: async () => new ArrayBuffer(4)}; },
    console: {log() {}, error() {}}, URL, performance, Date,
    location: {href:'https://example.test/vic2/', reload() {}},
    setTimeout, clearTimeout, setInterval: fn => { const id = intervals.size + 1; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame: callback => setTimeout(callback, 0),
  });
  vm.runInContext(code, context);
  return {context, elements, mounted, requests, intervals, get config() { return config; }, get starts() { return starts; }};
}
const ready = () => new Promise(resolve => setTimeout(resolve, 10));
const required = ['v2game.exe','common/defines.lua','map/definition.csv','map/provinces.bmp','interface/sound.sfx','interface/core.gui','localisation/test.csv','history/countries/test.txt'];
function select(env, paths) {
  env.context.fixtures = paths.map(path => ({name:path.split('/').pop(),webkitRelativePath:'Victoria II/'+path,size:4,arrayBuffer:async()=>new ArrayBuffer(4)}));
  vm.runInContext('selected = fixtures; validateSelection(); ownership.checked = true; ownership.listeners.change();', env.context);
}

test('rejects an installation missing sound/interface data before startup', async () => {
  const env=setup(); await ready();
  select(env, required.filter(p=>p!=='interface/sound.sfx'));
  assert.equal(env.elements.get('launch').disabled,true);
  await vm.runInContext('boot()',env.context);
  assert.equal(env.starts,0);
});

test('mounts game data locally, excludes extras, locks input and starts once', async () => {
  const env=setup(); await ready();
  select(env, [...required,'mod/foo/data.txt','save games/test.v2','map/cache/test.bin','setup.msi','gfx/flags/ABC.tga','music/theme.mp3']);
  assert.equal(env.elements.get('launch').disabled,false);
  await vm.runInContext('boot()',env.context);
  await vm.runInContext('boot()',env.context);
  assert.equal(env.starts,1);
  assert.equal(env.elements.get('game-files').disabled,true);
  assert.equal(env.elements.get('ownership').disabled,true);
  assert.equal(env.elements.get('mount-progress').value,100);
  assert(env.mounted.some(([p])=>p==='/vic2/gfx/flags/ABC.tga'));
  assert(env.mounted.some(([p])=>p==='/vic2/music/theme.mp3'));
  assert(!env.mounted.some(([p])=>/v2game|mod\/|save games|map\/cache|\.msi/.test(p)));
  assert.equal(env.requests.length,1, 'Only the project PCK is fetched by the shell; local files never leave the browser');
  assert(env.requests[0].includes('index.pck'));
});

test('raw loader phases remain visible, silence is reported, logs stay bounded', async () => {
  const env=setup(); await ready(); select(env,required);
  await vm.runInContext('boot()',env.context);
  env.config.onPrint('[WebLoadRaw] sound.sfx: reading file');
  assert.match(env.elements.get('runtime-status').textContent,/sound.sfx: reading file/);
  vm.runInContext('lastPhaseAt = performance.now() - 46000;',env.context);
  for(const callback of env.intervals.values()) callback();
  assert.match(env.elements.get('runtime-status').textContent,/Sem nova etapa há 46s/);
  vm.runInContext('for(let i=0;i<900;i++) log("fixture " + i)',env.context);
  await ready();
  assert.equal(env.elements.get('log').textContent.split('\n').length,500);
  env.config.onPrintError('fixture failure');
  env.config.onPrint('[WebLoadRaw] later phase');
  assert.match(env.elements.get('runtime-status').textContent,/fixture failure/);
});

test('failed engine start requires reload and cannot be retried on damaged instance', async () => {
  const env=setup({failStart:true}); await ready(); select(env,required);
  await vm.runInContext('boot()',env.context);
  assert.match(env.elements.get('error').textContent,/fixture startup failure/);
  assert.equal(env.elements.get('launch').disabled,true);
  assert.equal(env.elements.get('diagnostics').open,true);
  await vm.runInContext('boot()',env.context);
  assert.equal(env.starts,1);
});


test('port patch keeps compatibility playlist indices bounded', () => {
  const prepare = fs.readFileSync('scripts/prepare_openvic_godot_web.py', 'utf8');
  const match = prepare.match(/playlist_new = """([\s\S]*?)"""/);
  assert.ok(match, 'playlist_new patch body not found');
  const generated = match[1];
  assert.match(generated, /range\(len\(song_names\)\)/);
  assert.match(generated, /possible_indices\.erase\(title_index\)/);
  assert.match(generated, /possible_indices\.erase\(last_played\)/);
  assert.match(generated, /if possible_indices\.is_empty\(\):/);
  assert.doesNotMatch(generated, /possible_indices\.remove_at\(title_index\)/);
  assert.doesNotMatch(generated, /possible_indices\.remove_at\(last_played\)/);

  const select = prepare.match(/select_new = """([\s\S]*?)"""/);
  assert.ok(select, 'select_new patch body not found');
  assert.match(select[1], /if playlist\.is_empty\(\):/);
  assert.match(select[1], /last_played = _selected_track/);
});

test('raw sound trace distinguishes file IO from grammar parsing', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  for (const marker of [
    'sound.sfx: reading file',
    'sound.sfx: file read',
    'sound.sfx: grammar parse begin',
    'sound.sfx: grammar parse done; ok=%d',
  ]) {
    assert.ok(portPatch.includes(marker), 'missing diagnostic marker: ' + marker);
  }
});


test('Web dataloader bypasses lexy mmap with buffered file IO', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /ParseHandler::load_file/);
  assert.match(portPatch, /std::fopen\(path, "rb"\)/);
  assert.match(portPatch, /std::fread\(bytes\.data\(\), 1, size, file\)/);
  assert.match(portPatch, /#if defined\(__EMSCRIPTEN__\)/);
  assert.match(portPatch, /load_buffer_impl\(std::move\(buffer\), path, fallback\)/);
});


test('Web lookup_file uses opendir fallback instead of filesystem directory_iterator', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /#include <dirent\.h>/);
  assert.match(portPatch, /::opendir\(parent\.c_str\(\)\)/);
  assert.match(portPatch, /::readdir\(directory\)/);
  assert.match(portPatch, /sound lookup fallback/);
  assert.match(portPatch, /#else\n\t\tstd::error_code ec;/);
});

test('sound definition walker is traced around each Web file lookup', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /sound define %\.\*s -> %s/);
  assert.match(portPatch, /sound define resolved: %s/);
});


test('Web sound.sfx bypasses generic pre-count and reserve traversal', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /sound\.sfx: entry %zu begin/);
  assert.match(portPatch, /sound\.sfx: direct walk done; entries=%zu/);
  assert.match(portPatch, /dryad::node_try_cast<ast::AssignStatement>/);
  assert.match(portPatch, /#else\n\treturn expect_dictionary_reserve_length/);
  assert.match(portPatch, /#else\n\tret &= expect_dictionary_keys/);
});


test('Web boot defers sound effects instead of aborting on sound.sfx', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /sound\.sfx: skipped on Web; audio deferred/);
  assert.match(portPatch, /sound\.sfx: empty registry locked/);
  const block = portPatch.match(/sound_new = """([\s\S]*?)"""/);
  assert.ok(block, 'sound_new patch body not found');
  assert.match(block[1], /#if defined\(__EMSCRIPTEN__\)/);
  assert.match(block[1], /return true;\n#else/);
  assert.match(block[1], /sound_effect_manager\.load_sound_defines_file/);
});


test('WASM diagnostics include assertions and stack overflow checks', () => {
  const portPatch = fs.readFileSync('scripts/patch_openvic_web.py', 'utf8');
  assert.match(portPatch, /-sASSERTIONS=2/);
  assert.match(portPatch, /-sSTACK_OVERFLOW_CHECK=2/);
  assert.match(portPatch, /target_compile_options\([\s\S]*?-g2/);
  assert.match(portPatch, /target_link_options\([\s\S]*?-g2/);
});
