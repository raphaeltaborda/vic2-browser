import {assertNoPageErrors, hasMarker, runBrowserSmoke} from './lib/browser-smoke.mjs';

const root = process.argv[2] || 'build/stage4';

await runBrowserSmoke({root}, async ({page, consoleLines, pageErrors}) => {
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

  console.log('crossOriginIsolated=' + state.isolated);
  console.log('waitingForGameData=' + state.waiting);
  console.log('fileInputEnabled=' + state.fileInputEnabled);
  console.log('runDisabledBeforeSelection=' + state.runDisabled);
  console.log('harnessMarker=' + hasMarker(consoleLines, '[Stage4] HARNESS_READY'));

  if (!state.isolated) throw new Error('Stage 4 CI server is not cross-origin isolated');
  if (!state.waiting || state.failed) throw new Error('Stage 4 did not reach clean waiting-for-data state');
  if (!state.fileInputEnabled || !state.pickEnabled) throw new Error('local folder picker was not enabled');
  if (!state.runDisabled) throw new Error('loader button must remain disabled before a valid local installation is selected');
  if (!hasMarker(consoleLines, '[Stage4] HARNESS_READY')) throw new Error('Stage 4 harness marker is missing');
  assertNoPageErrors(pageErrors);
});
