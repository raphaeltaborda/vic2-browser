import fs from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/validate-stage1-wasm.mjs <artifact.wasm>');
  process.exit(2);
}

const bytes = fs.readFileSync(path);
if (bytes.length < 8 || !bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
  throw new Error('artifact does not have the WebAssembly magic header');
}

const module = new WebAssembly.Module(bytes);
const exportNames = WebAssembly.Module.exports(module).map(entry => entry.name);
const dylinkSections = WebAssembly.Module.customSections(module, 'dylink.0');

if (!exportNames.includes('openvic_library_init')) {
  throw new Error('GDExtension entry symbol openvic_library_init is not exported');
}
if (dylinkSections.length !== 1) {
  throw new Error('expected exactly one dylink.0 section, found ' + dylinkSections.length);
}

console.log('validated=' + path);
console.log('bytes=' + bytes.length);
console.log('magic=0061736d');
console.log('entry=openvic_library_init');
console.log('dylink.0=present');
