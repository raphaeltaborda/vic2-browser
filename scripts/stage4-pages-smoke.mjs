import { chromium } from 'playwright';

const url = process.env.STAGE4_PAGE_URL;
const chrome = process.env.CHROME;
const expectedBuild = process.env.EXPECTED_STAGE4_BUILD;

if (!url) throw new Error('STAGE4_PAGE_URL is required');
if (!chrome) throw new Error('CHROME is required');

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox'],
});

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
    {timeout: 120000},
  );

  const state = await page.evaluate(async () => ({
    waiting: globalThis.__OPENVIC_STAGE4_WAITING__ === true,
    failed: globalThis.__OPENVIC_STAGE4_FAILURE__ === true,
    isolated: globalThis.crossOriginIsolated === true,
    controlled: navigator.serviceWorker?.controller != null,
    serviceWorker: Boolean((await navigator.serviceWorker?.getRegistration())?.active),
    pageTitle: document.title,
    pickerEnabled: !document.getElementById('pick')?.disabled,
    build: globalThis.__OPENVIC_STAGE4_BUILD__ || '',
  }));

  console.log('pageURL=' + page.url());
  console.log('crossOriginIsolated=' + state.isolated);
  console.log('serviceWorkerControlled=' + state.controlled);
  console.log('serviceWorkerActive=' + state.serviceWorker);
  console.log('waitingForGameData=' + state.waiting);
  console.log('pickerEnabled=' + state.pickerEnabled);
  console.log('build=' + state.build);

  if (!state.isolated) throw new Error('deployed Pages site is not cross-origin isolated');
  if (!state.controlled || !state.serviceWorker) throw new Error('Godot Service Worker is not controlling the deployed page');
  if (!state.waiting || state.failed) throw new Error('deployed Stage 4 did not reach waiting-for-local-data state');
  if (!state.pickerEnabled) throw new Error('Victoria II folder picker is not enabled on deployed Pages site');
  if (expectedBuild && state.build !== expectedBuild) {
    throw new Error('deployed Pages build mismatch: expected ' + expectedBuild + ', got ' + state.build);
  }
  if (pageErrors.length) throw new Error('public Pages errors:\n' + pageErrors.join('\n\n'));
} catch (error) {
  console.error('--- public Pages console ---');
  for (const line of consoleLines) console.error(line);
  console.error('--- public Pages errors ---');
  for (const line of pageErrors) console.error(line);
  throw error;
} finally {
  await browser.close();
}
