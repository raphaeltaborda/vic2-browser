import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.webmanifest', 'application/manifest+json'],
]);

function resolveRequest(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  return candidate;
}

export async function startStaticExportServer(rootDir) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    throw new Error('Web export is missing index.html: ' + root);
  }

  const server = http.createServer((req, res) => {
    const file = resolveRequest(root, req.url || '/');
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME.get(path.extname(file)) || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

export async function runBrowserSmoke({root, url, collectRequests = false, timeout = 30000}, test) {
  const chrome = process.env.CHROME;
  if (!chrome) throw new Error('CHROME environment variable is required');

  const localServer = root ? await startStaticExportServer(root) : null;
  const target = url || localServer?.url;
  if (!target) throw new Error('runBrowserSmoke requires root or url');

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
    page.on('console', message => consoleLines.push(message.text()));
    page.on('pageerror', error => pageErrors.push(error.stack || error.message));
    if (collectRequests) page.on('request', request => requests.push(request.url()));

    await page.goto(target, {waitUntil: 'domcontentloaded', timeout});
    await test({page, target, consoleLines, pageErrors, requests});
  } catch (error) {
    console.error('--- browser console ---');
    for (const line of consoleLines) console.error(line);
    console.error('--- page errors ---');
    for (const line of pageErrors) console.error(line);
    throw error;
  } finally {
    await browser.close();
    if (localServer) await localServer.close();
  }
}

export function assertNoPageErrors(pageErrors) {
  if (pageErrors.length) {
    throw new Error('browser page errors:\n' + pageErrors.join('\n\n'));
  }
}

export function hasMarker(consoleLines, marker) {
  return consoleLines.some(line => line.includes(marker));
}

export function countMarker(consoleLines, marker) {
  return consoleLines.filter(line => line.includes(marker)).length;
}

export const OPENVIC_SIDE_MODULE = /libopenvic\.web\.template_release\.wasm32\.threads\.wasm(?:\?|$)/;
