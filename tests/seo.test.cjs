const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8000/';
const canonicalOrigin = 'https://simpletipcalculator.com';

test('a crawler can discover the sitemap and reach indexable canonical pages without JavaScript', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const robots = await context.request.get(base + 'robots.txt');
    assert.equal(robots.status(), 200);
    const instructions = await robots.text();
    assert.match(instructions, /User-agent:\s*\*/i);
    assert.match(instructions, /Allow:\s*\//i);
    assert.doesNotMatch(instructions, /^Disallow:\s*\/\s*$/im);
    const sitemapUrl = instructions.match(/^Sitemap:\s*(\S+)/im)[1];
    assert.equal(new URL(sitemapUrl).origin, canonicalOrigin);
    const sitemap = await context.request.get(base + new URL(sitemapUrl).pathname.slice(1));
    assert.equal(sitemap.status(), 200);
    const page = await context.newPage();
    const urls = await page.evaluate(xml => {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      if (document.querySelector('parsererror')) throw new Error('Invalid sitemap XML');
      return [...document.querySelectorAll('url > loc')].map(element => element.textContent);
    }, await sitemap.text());
    assert.equal(urls.length, 3);
    assert.equal(new Set(urls).size, urls.length);
    const titles = new Set();
    for (const url of urls) {
      assert.equal(new URL(url).origin, canonicalOrigin);
      const response = await page.goto(base + new URL(url).pathname.slice(1));
      assert.equal(response.status(), 200);
      assert.doesNotMatch(response.headers()['x-robots-tag'] || '', /noindex|none/i);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), url);
      assert.doesNotMatch(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex|nofollow|none/i);
      const title = await page.title();
      assert.ok(title.length > 0);
      assert.equal(titles.has(title), false);
      titles.add(title);
      assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok((await page.locator('main').innerText()).length > 100);
      for (const href of await page.locator('footer nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
        assert.equal((await context.request.get(base + href)).status(), 200);
      }
    }
    await page.goto(base);
    const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    assert.equal(structured['@context'], 'https://schema.org');
    const calculator = structured['@graph'].find(item => item['@type'] === 'WebApplication');
    assert.equal(calculator.url, urls[0]);
    assert.equal(calculator.isAccessibleForFree, true);
    assert.equal(Number(calculator.offers.price), 0);
    assert.equal(calculator.aggregateRating, undefined);
    const socialImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    assert.equal((await context.request.get(base + new URL(socialImage).pathname.slice(1))).status(), 200);
    await context.close();
  } finally { await browser.close(); }
});
