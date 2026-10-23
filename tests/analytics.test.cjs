const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8000/';
const production = 'https://simpletipcalculator.com';

test('analytics sends only fixed page metadata and leaves the calculator independent', async t => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  async function scenario(setup, run) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      // Serve the real files at a simulated production origin. Never send test
      // traffic to the user's Google property.
      await context.route(`${production}/**`, async route => {
        const url = new URL(route.request().url());
        const response = await context.request.get(`${base}${url.pathname.slice(1)}`);
        await route.fulfill({ response });
      });
      await setup(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await run(page);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  const mockGoogle = context => context.route('https://www.googletagmanager.com/**', route => route.fulfill({ contentType: 'text/javascript', body: 'window.googleTagLoaded = true;' }));
  const commands = page => page.evaluate(() => (window.dataLayer || []).map(command => [...command]));
  try {
    await t.test('calculator is usable before the deferred Google script loads', () => scenario(async context => {
      await mockGoogle(context);
      await context.addInitScript(() => {
        window.pendingAnalyticsIdle = [];
        window.requestIdleCallback = callback => { window.pendingAnalyticsIdle.push(callback); };
      });
    }, async page => {
      await page.goto(production);
      await page.waitForFunction(() => window.pendingAnalyticsIdle.length > 0);
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
      await page.getByLabel('Bill Amount', { exact: true }).fill('50');
      assert.equal(await page.locator('#total').textContent(), '$60.00');
      await page.evaluate(() => window.pendingAnalyticsIdle.shift()());
      await page.waitForFunction(() => window.googleTagLoaded === true);
      assert.equal((await commands(page)).filter(command => command[0] === 'event').length, 1);
    }));
    await t.test('correct ID, a single page view, sanitized URLs, and no bill/tip interaction events', () => scenario(mockGoogle, async page => {
      await page.goto(`${production}/?bill=123456.78&tip=91234.56#private-values`, { referer: 'https://example.com/private?bill=43210.99#details' });
      await page.waitForFunction(() => window.googleTagLoaded === true);
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').getAttribute('src'), 'https://www.googletagmanager.com/gtag/js?id=G-0HBEB4V626');
      const before = await commands(page);
      const config = before.find(command => command[0] === 'config');
      assert.equal(config[1], 'G-0HBEB4V626');
      assert.equal(config[2].page_location, `${production}/`);
      assert.equal(config[2].page_referrer, 'https://example.com/');
      assert.equal(config[2].allow_google_signals, false);
      assert.equal(config[2].allow_ad_personalization_signals, false);
      assert.equal(config[2].send_page_view, false);
      assert.equal(before.filter(command => command[0] === 'event' && command[1] === 'page_view').length, 1);
      assert.equal(JSON.stringify(before).includes('123456.78'), false);
      assert.equal(JSON.stringify(before).includes('91234.56'), false);
      await page.getByLabel('Bill Amount', { exact: true }).fill('123.45');
      await page.getByRole('button', { name: 'Increase tip amount', exact: true }).click();
      await page.getByRole('button', { name: 'Decrease tip percentage', exact: true }).click();
      assert.deepEqual(await commands(page), before);
      assert.equal(await page.locator('#total').textContent(), '$148.14');
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      assert.deepEqual(await commands(page), before);
    }));
    await t.test('policy pages also track one page view with their own fixed title and URL', () => scenario(mockGoogle, async page => {
      for (const [path, title] of [['privacy.html', 'Privacy Policy'], ['terms.html', 'Terms of Use']]) {
        await page.goto(`${production}/${path}?bill=99.99#tip=7`);
        await page.waitForFunction(() => window.googleTagLoaded === true);
        const views = (await commands(page)).filter(command => command[0] === 'event');
        assert.equal(views.length, 1);
        assert.equal(views[0][2].page_title, `${title} | Simple Tip Calculator`);
        assert.equal(views[0][2].page_location, `${production}/${path}`);
      }
    }));
    await t.test('offline startup skips Google; reconnection initializes one page view', () => scenario(async context => {
      await mockGoogle(context);
      await context.addInitScript(() => {
        window.testOnline = false;
        Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline });
      });
    }, async page => {
      await page.goto(production);
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
      assert.deepEqual(await commands(page), []);
      await page.getByLabel('Bill Amount', { exact: true }).fill('50');
      assert.equal(await page.locator('#total').textContent(), '$60.00');
      await page.evaluate(() => { window.testOnline = true; window.dispatchEvent(new Event('online')); });
      await page.waitForFunction(() => window.googleTagLoaded === true);
      const views = (await commands(page)).filter(command => command[0] === 'event');
      assert.equal(views.length, 1);
      assert.equal(views[0][1], 'page_view');
    }));
    await t.test('blocked Google does not break calculations; retry does not duplicate page views', () => {
      let attempts = 0;
      return scenario(context => context.route('https://www.googletagmanager.com/**', route => {
        attempts++;
        return attempts === 1 ? route.abort('failed') : route.fulfill({ contentType: 'text/javascript', body: 'window.googleTagLoaded = true;' });
      }), async page => {
        await page.goto(production);
        await page.waitForFunction(() => window.dataLayer && !document.querySelector('script[src*="googletagmanager.com"]'));
        await page.getByLabel('Bill Amount', { exact: true }).fill('50');
        assert.equal(await page.locator('#tip').textContent(), '$10.00');
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(() => window.googleTagLoaded === true);
        assert.equal(attempts, 2);
        assert.equal((await commands(page)).filter(command => command[0] === 'event').length, 1);
      });
    });
    await t.test('local previews do not load the Google tag or generate report traffic', async () => {
      const page = await browser.newPage();
      try {
        await page.goto(base);
        assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
        assert.deepEqual(await commands(page), []);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});
