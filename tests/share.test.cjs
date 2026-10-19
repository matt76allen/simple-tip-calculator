const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = 'https://simpletipcalculator.com/';
test('sharing and copy fallbacks', async t => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  async function scenario(native, clipboard, run) {
    const page = await browser.newPage({ viewport: { width: 320, height: 850 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(({ native, clipboard }) => {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: native === 'unavailable' ? undefined : async payload => {
            window.sharedPayload = payload;
            if (native === 'cancel') throw new DOMException('Cancelled', 'AbortError');
            if (native === 'failure') throw new DOMException('Unavailable', 'NotAllowedError');
          }
        });
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: clipboard === 'unavailable' ? undefined : {
            writeText: async text => {
              window.copiedText = text;
              if (clipboard === 'failure') throw new DOMException('Denied', 'NotAllowedError');
              if (clipboard === 'pending') await new Promise(resolve => { window.finishCopy = resolve; });
            }
          }
        });
      }, { native, clipboard });
      await page.goto('http://127.0.0.1:8000/');
      await run(page);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    } finally { await page.close(); }
  }
  try {
    await t.test('native share receives only the fixed website title and URL', () => scenario('success', 'success', async page => {
      await page.getByLabel('Bill Amount', { exact: true }).fill('127.38');
      const share = page.getByRole('button', { name: 'Share this calculator', exact: true });
      await share.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#share-calculator').disabled);
      assert.deepEqual(await page.evaluate(() => window.sharedPayload), { title: 'Simple Tip Calculator', url });
      assert.equal(await page.locator('#share-fallback').isVisible(), false);
      assert.equal(await page.locator('#share-status').textContent(), '');
      assert.equal(await page.evaluate(() => window.copiedText), undefined);
    }));
    await t.test('cancelling native share is silent and does not copy', () => scenario('cancel', 'success', async page => {
      await page.getByRole('button', { name: 'Share this calculator', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('#share-calculator').disabled);
      assert.equal(await page.locator('#share-fallback').isVisible(), false);
      assert.equal(await page.locator('#manual-copy').isVisible(), false);
      assert.equal(await page.locator('#share-status').textContent(), '');
      assert.equal(await page.evaluate(() => window.copiedText), undefined);
    }));
    await t.test('unsupported native share offers Copy Link; success appears only after copying resolves', () => scenario('unavailable', 'pending', async page => {
      await page.getByRole('button', { name: 'Share this calculator', exact: true }).tap();
      assert.equal(await page.locator('#share-calculator').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#copy-link').evaluate(el => el === document.activeElement), true);
      await page.getByRole('button', { name: 'Copy Link', exact: true }).press('Enter');
      await page.waitForFunction(() => typeof window.finishCopy === 'function');
      assert.equal(await page.locator('#share-status').textContent(), '');
      assert.equal(await page.evaluate(() => window.copiedText), url);
      await page.evaluate(() => window.finishCopy());
      await page.waitForFunction(() => document.querySelector('#share-status').textContent === 'Link copied!');
      assert.equal(await page.locator('#manual-copy').isVisible(), false);
    }));
    await t.test('native share errors offer a working Copy Link fallback', () => scenario('failure', 'success', async page => {
      await page.getByRole('button', { name: 'Share this calculator', exact: true }).click();
      await page.getByRole('button', { name: 'Copy Link', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#share-status').textContent === 'Link copied!');
      assert.equal(await page.evaluate(() => window.copiedText), url);
    }));
    for (const clipboard of ['failure', 'unavailable']) {
      await t.test(`clipboard ${clipboard} provides a selected, read-only URL`, () => scenario('unavailable', clipboard, async page => {
        await page.getByRole('button', { name: 'Share this calculator', exact: true }).click();
        await page.getByRole('button', { name: 'Copy Link', exact: true }).click();
        await page.locator('#manual-copy').waitFor({ state: 'visible' });
        const input = page.getByLabel('Select and copy this link:');
        assert.equal(await input.inputValue(), url);
        assert.equal(await input.evaluate(el => el.readOnly), true);
        assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, url.length]);
        assert.equal(await input.evaluate(el => el === document.activeElement), true);
        assert.equal((await page.locator('#share-status').textContent()).includes('Link copied!'), false);
      }));
    }
  } finally { await browser.close(); }
});
