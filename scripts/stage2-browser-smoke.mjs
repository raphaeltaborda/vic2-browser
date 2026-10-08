import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.argv[2] || 'build/stage2');
const chrome = process.env.CHROME;

if (!chrome) throw new Error('CHROME environment variable is required');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('Stage 2 export is missing index.html: ' + root);
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

function safeFile(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  return candidate;
}

const server = http.createServer((req, res) => {
  const file = safeFile(req.url || '/');
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(file)) || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox'],
});

const consoleLines = [];
const pageErrors = [];
const requested = [];

try {
  const page = await browser.newPage();

  page.on('console', msg => consoleLines.push(msg.text()));
  page.on('pageerror', err => pageErrors.push(err.stack || err.message));
  page.on('request', request => requested.push(request.url()));

  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.waitForFunction(
    () => globalThis.__OPENVIC_STAGE2_READY__ === true || globalThis.__OPENVIC_STAGE2_FAILURE__ === true,
    null,
    {timeout: 90000},
  );

  const state = await page.evaluate(() => ({
    ready: globalThis.__OPENVIC_STAGE2_READY__ === true,
    failed: globalThis.__OPENVIC_STAGE2_FAILURE__ === true,
    isolated: globalThis.crossOriginIsolated === true,
  }));

  const sideModuleRequest = requested.find(url => /libopenvic\.web\.template_release\.wasm32\.threads\.wasm(?:\?|$)/.test(url));
  const marker = consoleLines.find(line => line.includes('[Stage2] OPENVIC_GDEXTENSION_READY'));

  console.log('url=' + url);
  console.log('crossOriginIsolated=' + state.isolated);
  console.log('sideModuleRequested=' + Boolean(sideModuleRequest));
  console.log('readyMarker=' + Boolean(marker));
  if (sideModuleRequest) console.log('sideModuleURL=' + sideModuleRequest);

  if (!state.isolated) throw new Error('threaded Web export is not cross-origin isolated');
  if (!sideModuleRequest) throw new Error('browser never requested the OpenVic WebAssembly side module');
  if (!marker) throw new Error('Godot did not emit the Stage 2 OpenVic-ready marker');
  if (!state.ready || state.failed) throw new Error('Stage 2 project reported extension initialization failure');
  if (pageErrors.length) throw new Error('browser page errors:\n' + pageErrors.join('\n\n'));
} catch (error) {
  console.error('--- browser console ---');
  for (const line of consoleLines) console.error(line);
  console.error('--- page errors ---');
  for (const line of pageErrors) console.error(line);
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
