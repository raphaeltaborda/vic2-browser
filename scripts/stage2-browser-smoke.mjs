import {assertNoPageErrors, hasMarker, OPENVIC_SIDE_MODULE, runBrowserSmoke} from './lib/browser-smoke.mjs';

const root = process.argv[2] || 'build/stage2';

await runBrowserSmoke({root, collectRequests: true}, async ({page, target, consoleLines, pageErrors, requests}) => {
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
  const sideModule = requests.find(url => OPENVIC_SIDE_MODULE.test(url));

  console.log('url=' + target);
  console.log('crossOriginIsolated=' + state.isolated);
  console.log('sideModuleRequested=' + Boolean(sideModule));
  console.log('readyMarker=' + hasMarker(consoleLines, '[Stage2] OPENVIC_GDEXTENSION_READY'));

  if (!state.isolated) throw new Error('threaded Web export is not cross-origin isolated');
  if (!sideModule) throw new Error('browser never requested the OpenVic WebAssembly side module');
  if (!hasMarker(consoleLines, '[Stage2] OPENVIC_GDEXTENSION_READY')) {
    throw new Error('Godot did not emit the Stage 2 OpenVic-ready marker');
  }
  if (!state.ready || state.failed) throw new Error('Stage 2 project reported extension initialization failure');
  assertNoPageErrors(pageErrors);
});
