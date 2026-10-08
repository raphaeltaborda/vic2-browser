import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.argv[2] || 'build/stage3');
const chrome = process.env.CHROME;

if (!chrome) throw new Error('CHROME environment variable is required');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('Stage 3 export is missing index.html: ' + root);
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
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
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox'],
});

const consoleLines = [];
const pageErrors = [];
const requests = [];

try {
  const page = await browser.newPage();
  page.on('console', msg => consoleLines.push(msg.text()));
  page.on('pageerror', err => pageErrors.push(err.stack || err.message));
  page.on('request', request => requests.push(request.url()));

  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.waitForFunction(
    () => globalThis.__OPENVIC_STAGE3_READY__ === true || globalThis.__OPENVIC_STAGE3_FAILURE__ === true,
    null,
    {timeout: 90000},
  );

  const state = await page.evaluate(() => ({
    ready: globalThis.__OPENVIC_STAGE3_READY__ === true,
    failed: globalThis.__OPENVIC_STAGE3_FAILURE__ === true,
    mounted: globalThis.__OPENVIC_STAGE3_MOUNTED__ === true,
    isolated: globalThis.crossOriginIsolated === true,
  }));

  const sideModuleRequested = requests.some(url =>
    /libopenvic\.web\.template_release\.wasm32\.threads\.wasm(?:\?|$)/.test(url)
  );
  const has = marker => consoleLines.some(line => line.includes(marker));

  console.log('crossOriginIsolated=' + state.isolated);
  console.log('fixtureMounted=' + state.mounted);
  console.log('sideModuleRequested=' + sideModuleRequested);
  console.log('rootsOk=' + has('[Stage3] ROOTS_OK'));
  console.log('lookupOk=' + (consoleLines.filter(line => line.includes('[Stage3] LOOKUP_OK')).length === 2));
  console.log('readOk=' + (consoleLines.filter(line => line.includes('[Stage3] READ_OK')).length === 2));
  console.log('negativeLookupOk=' + has('[Stage3] NEGATIVE_LOOKUP_OK'));
  console.log('readyMarker=' + has('[Stage3] OPENVIC_FILESYSTEM_READY'));

  if (!state.isolated) throw new Error('threaded Web export is not cross-origin isolated');
  if (!state.mounted) throw new Error('Stage 3 shell did not mount the synthetic /vic2 fixture');
  if (!sideModuleRequested) throw new Error('browser never requested the OpenVic side module');
  if (!has('[Stage3] ROOTS_OK')) throw new Error('OpenVic did not accept /vic2 as its dataloader root');
  if (consoleLines.filter(line => line.includes('[Stage3] LOOKUP_OK')).length !== 2) {
    throw new Error('OpenVic did not resolve both synthetic fixture files');
  }
  if (consoleLines.filter(line => line.includes('[Stage3] READ_OK')).length !== 2) {
    throw new Error('resolved fixture bytes were not readable and intact');
  }
  if (!has('[Stage3] NEGATIVE_LOOKUP_OK')) throw new Error('negative lookup control did not pass');
  if (!has('[Stage3] OPENVIC_FILESYSTEM_READY')) throw new Error('Stage 3 ready marker is missing');
  if (!state.ready || state.failed) throw new Error('Stage 3 project reported failure');
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
