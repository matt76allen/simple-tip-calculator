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
- `pwa.js` and `manifest.webmanifest`: home-screen installation and device-specific instructions.
- `sw.js`: saves public app files for offline use; online visits prefer fresh files.
- `icons/`: prebuilt receipt icons for Android and Apple home screens.

## Home screen and offline use

Serve the site over HTTPS (or localhost for development). The Add to Home Screen link uses the browser's install prompt when available and otherwise explains the browser menu or iPhone/iPad Safari Share menu. Installed standalone apps hide this link.

After the first successful online load finishes saving the app files, the calculator and both policy pages work offline. Bill and tip values are not saved. External websites and support payments still require an internet connection. Browsers may evict cached files or restrict storage in private mode.

The icons and manifest need no build step. When changing cached app files, increment `CACHE_NAME` in `sw.js` and keep `APP_FILES` complete. The worker precaches a complete version before activating, removes only obsolete calculator caches, and checks the network before using an offline copy. Keep hosting `sw.js` without a long-lived immutable cache header.

## Verify

Run the calculation tests with Node.js (no packages needed):

```sh
node --test tests/calculator.test.cjs
```

An optional browser test checks typing, display, keyboard, touch, validation, and mobile layout. In the prepared cloud environment, Playwright and Chromium are already available. With the local server running:

```sh
node --test tests/browser.test.cjs tests/share.test.cjs tests/pwa.test.cjs
```

For another machine, install Playwright separately and set `CHROMIUM_PATH` if your Chromium executable is elsewhere. The website itself has no package dependencies.

Sharing tests simulate browser API success, cancellation, and failure. Test the real device sharing panel on the published HTTPS site too; browser support and embedded-preview permissions vary. Sharing always uses `https://simpletipcalculator.com/`, never bill or tip values.

The PWA test uses a real service worker and disables networking to verify offline reloads, calculations, and policy navigation. Native install prompts and iPhone instructions are simulated; verify actual home-screen installation on an Android phone and an iPhone after deployment. Visit online first, wait for “Ready for offline use” in the install instructions, then use airplane mode to check offline access.

The public site is simpletipcalculator.com. The footer links to the policy pages and an optional external Buy Me a Coffee page; no payment widget is embedded. Changes pushed to `main` are deployed through the connected Vercel project.
