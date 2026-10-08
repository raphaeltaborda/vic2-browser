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
  'patches/openvic/0001-emscripten-side-module.patch',
  'patches/openvic/0002-web-gdextension-library.patch',
  'patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch',
  'patches/openvic-simulation/0001-wasm32-size-t-hashing.patch',
  'scripts/apply-portability-patches.sh',
  'scripts/validate-stage1-wasm.mjs',
  '.github/workflows/build-openvic-wasm.yml',
  '.github/workflows/test-launcher.yml',
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
  '4.0.20',
]) {
  if (!stage1.includes(pin)) fail('Stage 1 workflow is missing pinned input: ' + pin);
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
