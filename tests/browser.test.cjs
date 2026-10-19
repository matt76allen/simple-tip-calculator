// Optional browser check: requires Playwright and Chromium in the environment.
// Start the local server first (see README.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('calculator works with typing, keyboard, touch, and a narrow screen', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 850 }, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    const remoteRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:8000/')) remoteRequests.push(request.url());
    });
    await page.goto('http://127.0.0.1:8000/');
    const bill = page.getByLabel('Bill Amount', { exact: true });
    const button = name => page.getByRole('button', { name, exact: true });
    const value = id => page.locator(`#${id}`).textContent();
    async function check(percent, tip, total) {
      assert.equal(await value('percent'), percent);
      assert.equal(await value('tip'), tip);
      assert.equal(await value('total'), total);
      assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
    }
    await check('20%', '—', '—');
    assert.equal(await page.locator('input').count(), 1);
    assert.deepEqual(await page.locator('.result-label').allTextContents(), ['Tip Percentage', 'Tip Amount', 'Total Including Tip']);
    assert.equal(await page.locator('button:disabled').count(), 6);
    await bill.fill('50');
    await check('20%', '$10.00', '$60.00');
    assert.equal(await bill.inputValue(), '50'); // No formatting while typing.
    await bill.press('Enter');
    assert.equal(await bill.inputValue(), '50.00');
    await button('Increase tip amount').tap();
    await check('22%', '$11.00', '$61.00');
    await button('Decrease tip percentage').focus();
    await page.keyboard.press('Enter');
    await check('21%', '$10.50', '$60.50');
    await page.keyboard.press('Space');
    await check('20%', '$10.00', '$60.00');
    await bill.fill('62');
    await check('20%', '$12.40', '$74.40');
    await button('Decrease tip amount').click();
    await check('19.35%', '$12.00', '$74.00');
    await bill.fill('124');
    await check('19.35%', '$24.00', '$148.00');

    for (const [name, percent, tip, total] of [
      ['Increase tip amount', '20.97%', '$13.00', '$75.00'],
      ['Decrease total including tip', '19.35%', '$12.00', '$74.00'],
      ['Increase total including tip', '20.97%', '$13.00', '$75.00'],
    ]) {
      await page.reload();
      await bill.fill('62');
      await button(name).click();
      await check(percent, tip, total);
    }

    await page.reload();
    await bill.fill('80');
    await button('Decrease tip amount').click(); // $15 / $80 = 18.75%.
    await check('18.75%', '$15.00', '$95.00');
    await button('Decrease tip percentage').click();
    await check('18%', '$14.40', '$94.40');
    await button('Increase tip percentage').click();
    await check('19%', '$15.20', '$95.20');

    await page.reload();
    await bill.fill('33.33');
    await check('20%', '$6.67', '$40.00');
    for (let i = 0; i < 6; i++) await button('Decrease total including tip').click();
    await check('2.01%', '$0.67', '$34.00');
    assert.equal(await button('Decrease total including tip').isDisabled(), true);

    for (const input of ['50abc', '-1', '1.234', '1e2', '90071992547409.92', '80000000000000']) {
      await page.reload();
      await bill.fill('50');
      await bill.fill(input);
      assert.ok(await page.locator('#bill-error').textContent());
      assert.equal(await bill.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('button:disabled').count(), 6);
      await check('20%', '—', '—');
    }
    await bill.fill('0');
    await check('20%', '$0.00', '$0.00');
    assert.equal(await page.locator('button:disabled').count(), 6);
    await bill.fill('');
    await check('20%', '—', '—');
    assert.equal(await page.locator('#bill-error').textContent(), '');
    await bill.fill('.5');
    await bill.press('Tab');
    assert.equal(await bill.inputValue(), '0.50');
    await check('20%', '$0.10', '$0.60');
    await bill.fill('75000000000000');
    await check('20%', '$15000000000000.00', '$90000000000000.00');
    assert.equal(await page.locator('body').innerText().then(text => /NaN|Infinity/.test(text)), false);

    await page.reload();
    await bill.fill('50');
    await bill.press('Enter');
    await page.screenshot({ path: '/workspace/scratch/simple-tip-calculator-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: '/workspace/scratch/simple-tip-calculator-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
  } finally {
    await browser.close();
  }
});
