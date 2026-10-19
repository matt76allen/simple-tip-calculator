# Simple Tip Calculator

A lightweight, mobile-friendly calculator made with plain HTML, CSS, and JavaScript. No installation, build, accounts, or external requests are needed.

## Run locally

From this repository, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open your browser at localhost on port 8000. You can also open `index.html` directly for the calculator itself.

## How it works

Enter the bill (the only editable number). The initial tip is 20%. Each arrow moves its row to the next strictly lower or higher whole dollar or percentage point, keeping the bill fixed. Changing the bill preserves your chosen percentage.

Money is calculated in integer cents. The percentage is retained as an exact fraction so rounding its display never changes the calculation. Empty or invalid bills disable the arrows; totals cannot go below the bill.

- `index.html`: page content and accessible controls.
- `styles.css`: responsive teal, white, and charcoal styling.
- `calculator.js`: calculation and validation rules, independent of the page.
- `app.js`: connects the bill and arrows to the calculator.
- `share.js`: shares only the website link, with clipboard and manual-copy fallbacks.
- `privacy.html` and `terms.html`: the site's privacy policy and terms, with shared responsive styling.
- `footer.js`: keeps the copyright year current on all three pages.

## Verify

Run the calculation tests with Node.js (no packages needed):

```sh
node --test tests/calculator.test.cjs
```

An optional browser test checks typing, display, keyboard, touch, validation, and mobile layout. In the prepared cloud environment, Playwright and Chromium are already available. With the local server running:

```sh
node --test tests/browser.test.cjs tests/share.test.cjs
```

For another machine, install Playwright separately and set `CHROMIUM_PATH` if your Chromium executable is elsewhere. The website itself has no package dependencies.

Sharing tests simulate browser API success, cancellation, and failure. Test the real device sharing panel on the published HTTPS site too; browser support and embedded-preview permissions vary. Sharing always uses `https://simpletipcalculator.com/`, never bill or tip values.

The public site is simpletipcalculator.com. The footer links to the policy pages and an optional external Buy Me a Coffee page; no payment widget is embedded. Changes pushed to `main` are deployed through the connected Vercel project.
