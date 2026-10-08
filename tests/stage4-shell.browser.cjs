const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    headless: true,
    args: ['--no-sandbox'],
  });

  try {
    const html = fs.readFileSync('stage4/stage4-shell.html', 'utf8')
      .replace('$GODOT_HEAD_INCLUDE', '')
      .replace('<script src="$GODOT_URL"></script>', `<script>class Engine {
        static getMissingFeatures() { return []; }
        constructor(config) { this.config = config; }
        async init() {}
        copyToFS() {}
        startGame() { return new Promise(() => {}); }
      }</script>`)
      .replace('$GODOT_CONFIG', JSON.stringify({executable: 'index', gdextensionLibs: ['openvic.wasm']}))
      .replace('$GODOT_THREADS_ENABLED', 'false')
      .replace('__OPENVIC_BUILD_SHA__', 'BROWSER_BUILD')
      .replace('__OPENVIC_STAGE1_SHA__', 'BROWSER_STAGE1');

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://vic2.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto('https://vic2.test/');
    await page.waitForFunction(() => document.getElementById('engine-state').textContent === 'pronto');

    fs.mkdirSync('build/screenshots', {recursive: true});
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({width, height});
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${name}: horizontal overflow`,
      );
      assert.equal(await page.locator('#pick').isEnabled(), true);
      assert.equal(await page.locator('#run').isDisabled(), true);
      await page.screenshot({path: `build/screenshots/stage4-${name}.png`, fullPage: true});
    }

    await page.locator('details summary').click();
    assert.equal(await page.locator('#copy').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Stage 4 desktop/mobile layout and waiting state passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
