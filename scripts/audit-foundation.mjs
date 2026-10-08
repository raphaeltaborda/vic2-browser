import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  throw new Error(message);
}

const required = [
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/FOUNDATION.md',
  'docs/BUILD_STAGE_1.md',
  'docs/BUILD_STAGE_2.md',
  'docs/BUILD_STAGE_3.md',
  'docs/BUILD_STAGE_4.md',
  'patches/openvic/0001-emscripten-side-module.patch',
  'patches/openvic/0002-web-gdextension-library.patch',
  'patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch',
  'patches/openvic-simulation/0001-wasm32-size-t-hashing.patch',
  'patches/openvic-dataloader/0001-emscripten-owned-file-buffer.patch',
  'scripts/apply-portability-patches.sh',
  'scripts/validate-stage1-wasm.mjs',
  'scripts/stage2-browser-smoke.mjs',
  'scripts/stage3-browser-smoke.mjs',
  'scripts/stage4-browser-smoke.mjs',
  'scripts/stage4-pages-smoke.mjs',
  '.github/workflows/build-openvic-wasm.yml',
  '.github/workflows/stage2-godot-smoke.yml',
  '.github/workflows/stage3-filesystem-smoke.yml',
  '.github/workflows/stage4-definition-loader.yml',
  '.github/workflows/test-launcher.yml',
  'stage2/project.godot',
  'stage2/Main.tscn',
  'stage2/Main.gd',
  'stage2/export_presets.cfg',
  'stage3/project.godot',
  'stage3/Main.tscn',
  'stage3/Main.gd',
  'stage3/export_presets.cfg',
  'stage3/stage3-shell.html',
  'stage4/project.godot',
  'stage4/Main.tscn',
  'stage4/Main.gd',
  'stage4/export_presets.cfg',
  'stage4/stage4-shell.html',
  'tests/launcher.test.cjs',
  'tests/launcher.browser.cjs',
  'web/openvic-shell.html',
];

for (const rel of required) {
  if (!exists(rel)) fail('required foundation file is missing: ' + rel);
}

const forbidden = [
  'scripts/patch_openvic_web.py',
  'scripts/prepare_openvic_godot_web.py',
  'docs/NATIVE_WEB_PORT.md',
];

for (const rel of forbidden) {
  if (exists(rel)) fail('legacy workaround file must not exist in V2: ' + rel);
}

const expectedPatches = new Set([
  'patches/openvic/0001-emscripten-side-module.patch',
  'patches/openvic/0002-web-gdextension-library.patch',
  'patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch',
  'patches/openvic-simulation/0001-wasm32-size-t-hashing.patch',
  'patches/openvic-dataloader/0001-emscripten-owned-file-buffer.patch',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full.replaceAll(path.sep, '/'));
  }
  return out;
}

const actualPatches = walk('patches').filter(rel => rel.endsWith('.patch'));
if (actualPatches.length !== expectedPatches.size) {
  fail('unexpected patch count: expected ' + expectedPatches.size + ', found ' + actualPatches.length);
}
for (const rel of actualPatches) {
  if (!expectedPatches.has(rel)) fail('unreviewed patch present: ' + rel);
}

for (const workflowPath of [
  '.github/workflows/build-openvic-wasm.yml',
  '.github/workflows/stage2-godot-smoke.yml',
  '.github/workflows/stage3-filesystem-smoke.yml',
  '.github/workflows/stage4-definition-loader.yml',
  '.github/workflows/test-launcher.yml',
]) {
  const workflow = read(workflowPath);
  for (const line of workflow.split(/\r?\n/)) {
    const match = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if (!match) continue;
    const value = match[1];
    const at = value.lastIndexOf('@');
    if (at < 0) fail(workflowPath + ': action without immutable revision: ' + value);
    const revision = value.slice(at + 1);
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      fail(workflowPath + ': action is not pinned to a 40-character commit SHA: ' + value);
    }
  }
}

const stage1 = read('.github/workflows/build-openvic-wasm.yml');
for (const pin of [
  'd3361890c62ede9464eb41af7f797e87dedf4b28',
  '8f83cabf147de7d8a511b4aaefd137777c4eb9c8',
  'b7f5feb25b4bc83307489afd5e5d76e50a4915cc',
  'b40b95636eb39cc0a55e9a0ef7575be90c21858e',
  '4.0.20',
]) {
  if (!stage1.includes(pin)) fail('Stage 1 workflow is missing pinned input: ' + pin);
}

const dataloaderPatch = read('patches/openvic-dataloader/0001-emscripten-owned-file-buffer.patch');
for (const token of [
  '#if defined(__EMSCRIPTEN__)',
  'std::fread',
  'lexy::buffer<lexy::default_encoding>',
  'lexy::read_file<lexy::default_encoding',
]) {
  if (!dataloaderPatch.includes(token)) fail('Emscripten parser buffer patch is missing: ' + token);
}
if (!dataloaderPatch.includes('#else') || !dataloaderPatch.includes('#endif')) {
  fail('Emscripten parser buffer patch must preserve the native read_file path');
}

const descriptorPatch = read('patches/openvic/0002-web-gdextension-library.patch');
const descriptorLine =
  'web.wasm32.single.release = "res://bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"';
if (!descriptorPatch.includes(descriptorLine)) {
  fail('Web GDExtension descriptor patch does not declare the validated release module');
}
if (/web\.wasm32\.single\.debug/.test(descriptorPatch)) {
  fail('Stage 1 must not declare an unbuilt Web debug library');
}

const targetPatch = read('patches/openvic/0001-emscripten-side-module.patch');
for (const token of ['-sSIDE_MODULE=1', '-pthread', 'Emscripten']) {
  if (!targetPatch.includes(token)) fail('OpenVic target patch is missing required token: ' + token);
}

const stage2Preset = read('stage2/export_presets.cfg');
for (const invariant of [
  'variant/extensions_support=true',
  'variant/thread_support=true',
]) {
  if (!stage2Preset.includes(invariant)) fail('Stage 2 Web preset is missing: ' + invariant);
}

const stage2Main = read('stage2/Main.gd');
for (const invariant of [
  'GDExtensionManager.is_extension_loaded(EXTENSION_PATH)',
  'Engine.has_singleton("OVGame")',
  '[Stage2] OPENVIC_GDEXTENSION_READY',
]) {
  if (!stage2Main.includes(invariant)) fail('Stage 2 runtime proof is missing: ' + invariant);
}
if (stage2Main.includes('/vic2') || stage2Main.includes('--base-path')) {
  fail('Stage 2 must remain independent from Victoria II data loading');
}

const stage2Smoke = read('scripts/stage2-browser-smoke.mjs');
for (const invariant of [
  'globalThis.crossOriginIsolated === true',
  'sideModuleRequested=',
  '[Stage2] OPENVIC_GDEXTENSION_READY',
]) {
  if (!stage2Smoke.includes(invariant)) fail('Stage 2 browser proof is missing: ' + invariant);
}

const stage2Workflow = read('.github/workflows/stage2-godot-smoke.yml');
for (const invariant of [
  'GODOT_VERSION: 4.7.2',
  'cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4',
  'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011',
  'sha256sum -c WASM_SHA256',
  'test "$(cat stage1-artifact/PORT_COMMIT)" = "${{ steps.stage1.outputs.head_sha }}"',
]) {
  if (!stage2Workflow.includes(invariant)) fail('Stage 2 workflow contract is missing: ' + invariant);
}

const stage3Main = read('stage3/Main.gd');
for (const invariant of [
  'set_compatibility_mode_roots(ROOT)',
  'lookup_file_path(relative_path)',
  '[Stage3] OPENVIC_FILESYSTEM_READY',
  '[Stage3] CASE_LOOKUP_OK',
  '[Stage3] NEGATIVE_LOOKUP_OK',
]) {
  if (!stage3Main.includes(invariant)) fail('Stage 3 OpenVic filesystem proof is missing: ' + invariant);
}
if (stage3Main.includes('load_defines_compatibility_mode') || stage3Main.includes('load_definitions')) {
  fail('Stage 3 must not invoke the definition loader');
}

const stage3Shell = read('stage3/stage3-shell.html');
for (const invariant of [
  '/vic2/common/defines.lua',
  '/vic2/common/Stage3Case.TXT',
  '/vic2/map/definition.csv',
  'engine.copyToFS(path, bytes)',
  'STAGE3_DEFINES_SENTINEL',
  'STAGE3_CASE_SENTINEL',
  'STAGE3_MAP_SENTINEL',
]) {
  if (!stage3Shell.includes(invariant)) fail('Stage 3 MEMFS fixture invariant is missing: ' + invariant);
}
if (stage3Shell.includes('/vic2/v2game.exe')) {
  fail('Stage 3 must mirror the production launcher and must not mount v2game.exe');
}

const stage3Preset = read('stage3/export_presets.cfg');
for (const invariant of [
  'variant/extensions_support=true',
  'variant/thread_support=true',
  'html/custom_html_shell="res://stage3-shell.html"',
]) {
  if (!stage3Preset.includes(invariant)) fail('Stage 3 Web preset is missing: ' + invariant);
}

const stage4Main = read('stage4/Main.gd');
for (const invariant of [
  'set_compatibility_mode_roots',
  'lookup_file_path',
  'load_defines_compatibility_mode',
  '[Stage4] LOAD_BEGIN',
  '[Stage4] LOAD_RETURN',
  '[Stage4] OPENVIC_DEFINITIONS_READY',
]) {
  if (!stage4Main.includes(invariant)) fail('Stage 4 loader contract is missing: ' + invariant);
}

const stage4Preset = read('stage4/export_presets.cfg');
for (const invariant of [
  'progressive_web_app/enabled=true',
  'progressive_web_app/ensure_cross_origin_isolation_headers=true',
]) {
  if (!stage4Preset.includes(invariant)) fail('Stage 4 Pages isolation preset is missing: ' + invariant);
}

const stage4Shell = read('stage4/stage4-shell.html');
for (const invariant of [
  'webkitdirectory',
  '/vic2/',
  'shouldMount(path)',
  'v2game.exe',
  'common/defines.lua',
  'engine.copyToFS',
  '__OPENVIC_STAGE4_WAITING__',
  'navigator.serviceWorker.register',
  'openvic-stage4-isolation-attempts',
  'registration.waiting.postMessage(\'update\')',
  'registration.update()',
  'updateViaCache: \'none\'',
  'OPENVIC_BUILD_ID',
]) {
  if (!stage4Shell.includes(invariant)) fail('Stage 4 browser harness invariant is missing: ' + invariant);
}
if (!stage4Shell.includes('/\\.(exe|dll|msi|zip|rar|7z|log|dmp)$/')) {
  fail('Stage 4 must preserve the production executable/archive exclusion policy');
}

const stage4Workflow = read('.github/workflows/stage4-definition-loader.yml');
for (const invariant of [
  'branch=main',
  'sha256sum -c WASM_SHA256',
  'GODOT_VERSION: 4.7.2',
  'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346',
  'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
  'scripts/stage4-pages-smoke.mjs',
  'EXPECTED_STAGE4_BUILD',
]) {
  if (!stage4Workflow.includes(invariant)) fail('Stage 4 workflow contract is missing: ' + invariant);
}

const launcher = read('web/openvic-shell.html');
for (const invariant of [
  "engine.copyToFS('/vic2/' + rel",
  "packURL.origin !== new URL(location.href).origin",
  "parts.some(part => !part || part === '.' || part === '..')",
]) {
  if (!launcher.includes(invariant)) fail('launcher safety invariant is missing: ' + invariant);
}

for (const rel of required.filter(name => /\.(md|patch|sh|mjs|cjs|yml|html)$/.test(name))) {
  const text = read(rel);
  if (text.includes('\r')) fail('CRLF detected despite LF-only repository policy: ' + rel);
}

console.log('Repository foundation audit passed.');
console.log('patches=' + actualPatches.length);
console.log('actions=pinned');
console.log('legacy-workarounds=absent');
console.log('launcher-safety=invariants-present');
