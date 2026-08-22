---
name: verify
description: Build, run, and drive SpendTracker locally to verify changes end-to-end.
---

# Verifying SpendTracker changes

Single-file React PWA. Browser runs `app.js` (compiled from `app.jsx`); `crypto.js` is the
lock/setup layer; `reconcile.js` is the statement-reading/matching logic (plain JS, no compile
step, no React or DOM — also loaded directly by the tests); `index.html` loads React 18.3.1 UMD
from unpkg.

## Unit tests

`npm test` (Node's built-in runner, zero dependencies). Covers `reconcile.js` plus the app
internals it touches, loaded out of the **compiled** `app.js` via `tests/harness.js` — so a
forgotten rebuild fails the tests instead of silently shipping nothing. Run these before the
browser pass; they're seconds rather than minutes.

## Build (after any app.jsx edit)

```
npx -y -p typescript@4.9.5 tsc app.jsx --allowJs --jsx react --target es2019 --module none \
  --strict false --alwaysStrict --skipLibCheck --noEmitOnError false --outDir .
```

Then bump `CACHE_NAME` in `sw.js` (line 3) **and `BUILD` in `crypto.js` to match** — they are meant
to move together, and `BUILD` is what the "SpendTracker build vNN" line at the bottom of Settings
shows, which is how you tell a stale deployed copy from a current one. Type warnings about `React`
etc. are expected noise. `crypto.js` and `reconcile.js` are not compiled — edit them directly.

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

- **Modals scroll**: `Modal` is a flex column — a fixed `S.modalHeader` and a scrolling
  `S.modalBody` capped at `88vh`. Content below the fold is reached by scrolling that body, not
  the page. Before this, a sheet taller than the screen was simply unreachable.
- Text like "Coffee" appears BOTH in the reconcile sheet and on the Summary tab behind it —
  `getByText(...).first()` picks the one behind the overlay and the click is "intercepted". Scope
  queries to the pager's pane before clicking.
- The review step's tabs are **"Findings"** and **"Your week log"**.
- **The reconcile tabs are `role="tab"`, not buttons** — `getByRole("button", {name: "Your week log"})`
  will not match; use `getByRole("tab", ...)`.
- **Seeding state directly**: `window.SpendVault.save(s)` is queued through a promise chain — wait
  ~1s before `page.reload()` or the seed is lost.
- **Reconcile**: Summary tab → "⇄ Reconcile". Paste a CSV into the textarea (faster than a file
  input), "Read statement" → column-confirmation step → "Cross-reference". Results group into
  collapsible sections. Rows render with the week log's own components (`EntryLine`/`SplitLine`/
  `CreditLine`) and tapping one opens the app's spend sheet ON TOP — `ReconcileModal` is mounted
  BEFORE `EntryModal` in App so the sheet paints above it. Results recompute on any data change, so
  a fixed row leaves its category without re-uploading. Statement dates must fall inside a
  tracked pay period *and* inside the statement's own span, or rows/entries are set aside instead
  of flagged — build fixtures around today's date or everything reads as "missing". Matching keys
  on date + amount only, so a fixture whose names differ from the logged labels still matches.
- **Reconcile week log**: page 2 of the review step, reached by swiping or the tabs. A flat list,
  newest first, each row carrying its own date — no day headings, unlike the Week tab. Rows are
  read-only and annotated with a verdict glyph (✓ / ≠ / !). Scoped to the card being reconciled,
  credits included (they carry `method` too), so every row shown has a verdict. The card name is
  omitted from rows unless "All cards" is on, since the header already states it. Its header total
  is every row listed added up ("logged to <card>") — deliberately NOT the Week tab's
  personal-spend-against-budget figure across all cards, which is a different number for the same
  week.
- **Saved statements**: one per payment method in `state.statements`, stored packed
  (`packStatement`/`unpackStatement` in reconcile.js — fingerprints survive the round trip, which
  is what keeps `recon` stamps working). Summary shows a chip per card; tapping opens the modal via
  `openWith` straight to that statement's results, skipping upload and column-mapping. "Update
  statement" on the results returns to step 1 in update mode.
- **Period history**: Week tab → the `◀ Month YYYY ▶` stepper (`[aria-label="Earlier period"]` /
  `"Later period"`), which walks `state.monthHistory` oldest→newest then back to live.

## Gotchas

- Vault state lives in IndexedDB — a fresh Playwright context = fresh account, no cleanup needed.
- The **service worker** serves fetches itself once installed, which `page.route` can't intercept —
  so a `page.reload()` loses the stubbed React and the app dies with "React is not defined". Stub it
  before the first `goto`: `page.addInitScript(() => Object.defineProperty(navigator,
  "serviceWorker", { get: () => undefined }))`.
- A **mouse drag cannot scroll a scroll-snap container** in Chromium — the pager only responds to
  real touch. Use a `hasTouch` context and CDP `Input.dispatchTouchEvent` (see `swipe.js` pattern),
  or the page will appear stuck on 0.
- Accent colours as TEXT go through `readableAccentText` — at full strength amber and green are
  ~2.1:1 on the light theme's cream and effectively illegible. Fills and tints keep the raw colour.
- The keypad's confirm key is `↵` normally but **`→` on the first step of a split** — match
  `/^(↵|→)$/` or the split flow hangs.
- The category grid's "None" tile has the accessible name `∅ ✓ None`, so `{ name: "None", exact:
  true }` never matches; use `button:has-text("None")`. Missing it leaves the grid open and every
  subsequent step fails somewhere confusing.
- Scheduled pins expand into virtual week entries (`makePinEntry`); one-off pins stay in
  `state.pins`. Aggregations that add "entries + pins" rely on that split to avoid double-counting.
- UI copy must be British English (CLAUDE.md).
