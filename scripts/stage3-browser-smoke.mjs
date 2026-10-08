import {assertNoPageErrors, countMarker, hasMarker, OPENVIC_SIDE_MODULE, runBrowserSmoke} from './lib/browser-smoke.mjs';

const root = process.argv[2] || 'build/stage3';

await runBrowserSmoke({root, collectRequests: true}, async ({page, consoleLines, pageErrors, requests}) => {
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

  const sideModuleRequested = requests.some(url => OPENVIC_SIDE_MODULE.test(url));
  const lookups = countMarker(consoleLines, '[Stage3] LOOKUP_OK');
  const reads = countMarker(consoleLines, '[Stage3] READ_OK');

  console.log('crossOriginIsolated=' + state.isolated);
  console.log('fixtureMounted=' + state.mounted);
  console.log('sideModuleRequested=' + sideModuleRequested);
  console.log('rootsOk=' + hasMarker(consoleLines, '[Stage3] ROOTS_OK'));
  console.log('lookupOk=' + (lookups === 2));
  console.log('readOk=' + (reads === 2));
  console.log('caseLookupOk=' + hasMarker(consoleLines, '[Stage3] CASE_LOOKUP_OK'));
  console.log('negativeLookupOk=' + hasMarker(consoleLines, '[Stage3] NEGATIVE_LOOKUP_OK'));
  console.log('readyMarker=' + hasMarker(consoleLines, '[Stage3] OPENVIC_FILESYSTEM_READY'));

  if (!state.isolated) throw new Error('threaded Web export is not cross-origin isolated');
  if (!state.mounted) throw new Error('Stage 3 shell did not mount the synthetic /vic2 fixture');
  if (!sideModuleRequested) throw new Error('browser never requested the OpenVic side module');
  if (!hasMarker(consoleLines, '[Stage3] ROOTS_OK')) throw new Error('OpenVic did not accept /vic2 as its dataloader root');
  if (lookups !== 2) throw new Error('OpenVic did not resolve both synthetic fixture files');
  if (reads !== 2) throw new Error('resolved fixture bytes were not readable and intact');
  if (!hasMarker(consoleLines, '[Stage3] CASE_LOOKUP_OK')) throw new Error('case-insensitive filename lookup did not pass');
  if (!hasMarker(consoleLines, '[Stage3] NEGATIVE_LOOKUP_OK')) throw new Error('negative lookup control did not pass');
  if (!hasMarker(consoleLines, '[Stage3] OPENVIC_FILESYSTEM_READY')) throw new Error('Stage 3 ready marker is missing');
  if (!state.ready || state.failed) throw new Error('Stage 3 project reported failure');
  assertNoPageErrors(pageErrors);
});
