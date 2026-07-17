---
name: verify
description: Build, run, and drive SpendTracker locally to verify changes end-to-end.
---

# Verifying SpendTracker changes

Single-file React PWA. Browser runs `app.js` (compiled from `app.jsx`); `crypto.js` is the
lock/setup layer; `index.html` loads React 18.3.1 UMD from unpkg.

## Build (after any app.jsx edit)

```
npx -y -p typescript@4.9.5 tsc app.jsx --allowJs --jsx react --target es2019 --module none \
  --strict false --alwaysStrict --skipLibCheck --noEmitOnError false --outDir .
```

Then bump `CACHE_NAME` in `sw.js` (line 3). Type warnings about `React` etc. are expected noise.

## Run + drive

- Serve: `python3 -m http.server 8123` from the repo root.
- The agent proxy blocks unpkg.com in the browser. Fetch React once via npm and intercept:
  `npm pack react@18.3.1 react-dom@18.3.1`, extract `package/umd/*.production.min.js`, then in
  Playwright `page.route('**://unpkg.com/**', ...)` fulfil with the local files.
- Chromium executable: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (adjust to the
  installed `chromium-*` dir). Viewport 390×844 matches the phone layout.

## Flows worth knowing

- **First run**: budget → Continue; passphrase ×2 (min 8 chars) → Continue; tick the recovery
  checkbox → Continue; "Finish setup" / "Skip — use passphrase only". Dismiss the tour hint
  (`aria-label="Dismiss"`).
- **Log a spend**: Week tab → "Log spend". Keypad enters **pence** (`2`,`5`,`5`,`0` = £25.50);
  `↵` saves. Personal spends then show the category grid — click a tile label ("Groceries",
  "None"). The modal stays open after each save for rapid logging; close it via its header ✕
  or by clicking the overlay above the sheet (other ✕ glyphs exist inside modals — toggle
  thumbs and delete buttons — so prefer the overlay: `page.mouse.click(195, 60)`).
- **Pins**: Pinned tab → "+ Pin"; category via the "Change ▸" row; frequency segments
  One-off/Monthly/Weekly/Daily; "Save".
- **Settings**: gear (`aria-label="Settings"`) → "🎨 Open customisation" for themes, payment
  types, and category editing (colour input `aria-label="<name> colour"`, delete is the row ✕).
- **Theme check**: quick visual pass via `document.documentElement.dataset.theme = 'light'`
  (real toggle lives in Customisation).

## Gotchas

- Vault state lives in IndexedDB — a fresh Playwright context = fresh account, no cleanup needed.
- Scheduled pins expand into virtual week entries (`makePinEntry`); one-off pins stay in
  `state.pins`. Aggregations that add "entries + pins" rely on that split to avoid double-counting.
- UI copy must be British English (CLAUDE.md).
