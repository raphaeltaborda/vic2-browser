// Browser layout/accessibility smoke test with a stub engine, never proprietary data.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME || undefined, headless:true, args:['--no-sandbox']});
  try {
    const html = fs.readFileSync('web/openvic-shell.html','utf8')
      .replace('$GODOT_HEAD_INCLUDE','')
      .replace('<script src="$GODOT_URL"></script>', `<script>class Engine {
        static getMissingFeatures() { return []; }
        async init() {} copyToFS() {} async start() {}
      }</script>`)
      .replace('$GODOT_CONFIG', JSON.stringify({executable:'index',gdextensionLibs:['openvic.wasm']}))
      .replace('$GODOT_THREADS_ENABLED','false');
    const page = await browser.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://vic2.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
    await page.goto('https://vic2.test/');
    await page.waitForFunction(()=>document.getElementById('godot-state').textContent==='carregado');
    fs.mkdirSync('build/screenshots',{recursive:true});
    for (const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,`${name}: horizontal overflow`);
      assert.equal(await page.locator('#pick-label').isEnabled(),true);
      assert.equal(await page.locator('#launch').isDisabled(),true);
      await page.screenshot({path:`build/screenshots/launcher-${name}.png`,fullPage:true});
    }
    await page.locator('#diagnostics summary').click();
    assert.equal(await page.locator('#copy-log').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('Desktop/mobile layout, initialization and diagnostics passed with a stub engine.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
