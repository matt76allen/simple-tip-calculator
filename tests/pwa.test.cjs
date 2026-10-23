const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const base = 'http://127.0.0.1:8000/';

test('offline calculator and home-screen installation', async t => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    await t.test('first online visit caches the whole app; offline reload and policy navigation work', async () => {
      const context = await browser.newContext({ viewport: { width: 320, height: 850 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // Verify activation removes only our obsolete app caches.
        await page.goto(base + 'icon.svg');
        await page.evaluate(async () => {
          await caches.open('simple-tip-calculator-v0');
          await caches.open('simple-tip-calculator-v1');
          await caches.open('simple-tip-calculator-v2');
          await caches.open('unrelated-cache');
        });
        await page.goto(base);
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
        assert.equal(await page.locator('a').evaluateAll(links => links.every(link => getComputedStyle(link).textDecorationLine === 'none')), true);
        const share = await page.locator('#share-calculator').boundingBox();
        const install = await page.locator('#install-app').boundingBox();
        const coffee = await page.locator('.coffee-link').boundingBox();
        assert.ok(install.y >= share.y + share.height);
        assert.ok(coffee.y >= install.y + install.height);
        const names = await page.evaluate(() => caches.keys());
        assert.equal(names.includes('simple-tip-calculator-v0'), false);
        assert.equal(names.includes('simple-tip-calculator-v1'), false);
        assert.equal(names.includes('simple-tip-calculator-v2'), false);
        assert.equal(names.includes('unrelated-cache'), true);
        const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
        assert.equal(manifest.name, 'Simple Tip Calculator');
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.start_url, '/');
        for (const icon of manifest.icons) {
          const dimensions = await page.evaluate(async src => {
            const blob = await (await fetch(src)).blob();
            const bitmap = await createImageBitmap(blob);
            return `${bitmap.width}x${bitmap.height}`;
          }, icon.src);
          assert.equal(dimensions, icon.sizes);
        }
        await context.setOffline(true);
        await page.reload();
        await page.getByLabel('Bill Amount', { exact: true }).fill('50');
        assert.equal(await page.locator('#tip').textContent(), '$10.00');
        assert.equal(await page.locator('#total').textContent(), '$60.00');
        await page.getByRole('button', { name: 'Increase tip amount', exact: true }).click();
        assert.equal(await page.locator('#tip').textContent(), '$11.00');
        assert.equal(await page.locator('#percent').textContent(), '22%');
        await page.reload();
        assert.equal(await page.locator('#bill').inputValue(), '');
        assert.equal(await page.locator('#tip').textContent(), '—');
        for (const title of ['Privacy Policy', 'Terms of Use']) {
          await page.getByRole('link', { name: title, exact: true }).click();
          assert.equal(await page.locator('h1').textContent(), title);
          assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator('a').evaluateAll(links => links.every(link => getComputedStyle(link).textDecorationLine === 'none')), true);
          await page.getByRole('link', { name: 'Back to Simple Tip Calculator' }).click();
        }
        const cached = await page.evaluate(async () => {
          const cache = await caches.open('simple-tip-calculator-v3');
          return (await cache.keys()).map(request => new URL(request.url).pathname);
        });
        assert.equal(cached.length, 16);
        assert.ok(cached.includes('/analytics.js'));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });

    await t.test('a slow online response wins over cached files; failed network falls back to the saved response', async () => {
      const root = resolve(__dirname, '..');
      let slow = false;
      const server = createServer(async (request, response) => {
        try {
          const pathname = new URL(request.url, 'http://localhost').pathname;
          const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
          if (!file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
          let data = await readFile(file);
          if (slow && pathname === '/styles.css') {
            // The old four-second timeout would return the stale cached CSS.
            await new Promise(resolve => setTimeout(resolve, 5100));
            data = Buffer.concat([data, Buffer.from('\n/* fresh slow network response */')]);
          }
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
          response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
          response.end(data);
        } catch { response.writeHead(404).end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
        slow = true;
        const fresh = await page.evaluate(async () => (await fetch('styles.css?slow-check')).text());
        assert.ok(fresh.includes('fresh slow network response'));
        await context.setOffline(true);
        const offline = await page.evaluate(async () => (await fetch('styles.css?offline-check')).text());
        assert.equal(offline, fresh);
      } finally {
        await context.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });

    async function installPage(userAgent, run) {
      const context = await browser.newContext({ viewport: { width: 320, height: 850 }, ...(userAgent ? { userAgent } : {}) });
      try {
        // Isolate our fallback tests from a real Chromium installability event.
        await context.addInitScript(() => window.addEventListener('beforeinstallprompt', event => {
          if (!event.testPrompt) { event.preventDefault(); event.stopImmediatePropagation(); }
        }));
        const page = await context.newPage();
        await page.goto(base);
        await run(page);
      } finally { await context.close(); }
    }
    await t.test('iPhone gets accessible instructions; Escape closes and restores focus', () => installPage('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', async page => {
      const button = page.getByRole('button', { name: 'Add to Home Screen', exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      const instructions = await page.locator('#install-instructions').textContent();
      assert.ok(instructions.includes('Safari'));
      assert.ok(instructions.includes('Share'));
      assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
    }));
    await t.test('Android without a prompt gets browser-menu instructions', () => installPage('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', async page => {
      await page.getByRole('button', { name: 'Add to Home Screen', exact: true }).click();
      assert.ok((await page.locator('#install-instructions').textContent()).includes('Install app or Add to Home screen'));
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.getByRole('dialog').isVisible(), false);
    }));
    await t.test('native prompt is used once, dismissal stays quiet, and installed apps hide the link', () => installPage(null, async page => {
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.testPrompt = true;
        event.prompt = async () => { window.promptCalls = (window.promptCalls || 0) + 1; };
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(event);
        window.defaultPromptPrevented = event.defaultPrevented;
      });
      const button = page.getByRole('button', { name: 'Add to Home Screen', exact: true });
      await button.click();
      await page.waitForFunction(() => !document.querySelector('#install-app').disabled);
      assert.equal(await page.evaluate(() => window.promptCalls), 1);
      assert.equal(await page.evaluate(() => window.defaultPromptPrevented), true);
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      await button.click();
      assert.equal(await page.getByRole('dialog').isVisible(), true);
      assert.equal(await page.evaluate(() => window.promptCalls), 1);
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      assert.equal(await page.locator('#install-row').isVisible(), false);
      assert.equal(await page.getByRole('dialog').isVisible(), false);
    }));
    await t.test('failed native prompt offers manual instructions', () => installPage(null, async page => {
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.testPrompt = true;
        event.prompt = async () => { throw new Error('No prompt available'); };
        window.dispatchEvent(event);
      });
      await page.getByRole('button', { name: 'Add to Home Screen', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#install-instructions').textContent()).includes('bookmark'));
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.locator('#install-app').evaluate(el => el === document.activeElement), true);
    }));
    await t.test('standalone iOS apps hide the installation link', async () => {
      const context = await browser.newContext();
      try {
        await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
        const page = await context.newPage();
        await page.goto(base);
        assert.equal(await page.locator('#install-row').isVisible(), false);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});
