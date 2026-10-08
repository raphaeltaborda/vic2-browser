import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.argv[2] || 'build/stage4');
const chrome = process.env.CHROME;

if (!chrome) throw new Error('CHROME environment variable is required');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Stage 4 export is missing index.html');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
]);

function resolveFile(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, rel);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url || '/');
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
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
const browser = await chromium.launch({executablePath: chrome, headless: true, args: ['--no-sandbox']});

const consoleLines = [];
const pageErrors = [];

try {
  const page = await browser.newPage();
  page.on('console', message => consoleLines.push(message.text()));
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));

  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.waitForFunction(
    () => globalThis.__OPENVIC_STAGE4_WAITING__ === true || globalThis.__OPENVIC_STAGE4_FAILURE__ === true,
    null,
    {timeout: 90000},
  );

  const state = await page.evaluate(() => ({
    waiting: globalThis.__OPENVIC_STAGE4_WAITING__ === true,
    failed: globalThis.__OPENVIC_STAGE4_FAILURE__ === true,
    isolated: globalThis.crossOriginIsolated === true,
    fileInputEnabled: !document.getElementById('files').disabled,
    pickEnabled: !document.getElementById('pick').disabled,
    runDisabled: document.getElementById('run').disabled,
  }));

  const hasHarnessMarker = consoleLines.some(line => line.includes('[Stage4] HARNESS_READY'));

  console.log('crossOriginIsolated=' + state.isolated);
  console.log('waitingForGameData=' + state.waiting);
  console.log('fileInputEnabled=' + state.fileInputEnabled);
  console.log('runDisabledBeforeSelection=' + state.runDisabled);
  console.log('harnessMarker=' + hasHarnessMarker);

  if (!state.isolated) throw new Error('Stage 4 CI server is not cross-origin isolated');
  if (!state.waiting || state.failed) throw new Error('Stage 4 did not reach clean waiting-for-data state');
  if (!state.fileInputEnabled || !state.pickEnabled) throw new Error('local folder picker was not enabled');
  if (!state.runDisabled) throw new Error('loader button must remain disabled before a valid local installation is selected');
  if (!hasHarnessMarker) throw new Error('Stage 4 harness marker is missing');
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
