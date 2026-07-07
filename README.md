# SpendTracker — how this is put together, and how to update it later

## The files, and what each one does

| File | What it is |
|---|---|
| `index.html` | The page shell. Loads React, then `app.js`, then `crypto.js`, then mounts the app. |
| `app.js` | **The tracker code your phone runs.** Plain JavaScript, ready to execute — no compiling needed at launch. |
| `app.jsx` | **The readable source for `app.js`.** This is what Claude edits when you ask for a change. Written in JSX (React's HTML-in-JS syntax), which browsers can't run directly. |
| `crypto.js` | **The security layer.** Encryption, the passphrase/Face ID lock screen, first-run setup, and the recovery code. Plain JavaScript with no compiled twin — edit it directly. |
| `manifest.json` | Tells iOS this is an installable app — name, icon, colours, fullscreen behaviour. |
| `sw.js` | The service worker. Caches the app so it still opens if you have no signal. |
| `icon-192.png` / `icon-512.png` | The home screen icon. |

## Why two app files (`app.jsx` and `app.js`)?

`app.jsx` is what's readable and editable — it's the version Claude works with.
Browsers can't run JSX directly though, so it needs to be **compiled** into plain
JavaScript first. That compiled output is `app.js`, and that's the one `index.html`
actually loads on your phone.

The first version of this used a tool called Babel to do that compiling
*in the browser, every single time you opened the app*. That's fine on a laptop but
genuinely slow on a phone — compiling ~1,000 lines of code on every cold launch adds
real, noticeable delay. So now the compiling happens **once, in advance**, and your
phone just loads the finished result. Same code, same behaviour, much faster launch.

**The practical consequence:** if `app.jsx` is ever edited without also regenerating
`app.js` from it, your phone won't see the change — it's still running the old
`app.js`. The two need to move together.

**The exact compile step** (for whoever regenerates `app.js`): the build uses
TypeScript's compiler, targeting an older Safari so optional-chaining/`??` are lowered
while everything else stays as-is:

```
npx typescript@4.9.5 app.jsx --jsx react --target es2019 --module none \
  --strict false --alwaysStrict --skipLibCheck --noEmitOnError false --outDir .
```

(The type-check *warnings* it prints — `React` undefined, `window.SpendVault`, etc. —
are expected and harmless; there are no type declarations, and `--noEmitOnError false`
still writes a correct `app.js`.) After regenerating, bump `CACHE_NAME` in `sw.js` so
returning phones fetch the new files instead of a stale cache.

## How future updates actually work

Come back to this conversation (or a new one with Claude) and describe what you want
changed, same as always. Claude will:

1. Edit `app.jsx` (the readable source)
2. Recompile it into a fresh `app.js`
3. Hand you both files again, ready to re-upload

**Your side, to get the update onto your phone:**

- If hosted on **GitHub Pages** (recommended — see below): open the GitHub app or
  website on your phone, upload the new `app.js` (and `index.html` if that changed
  too), and commit. Your home screen icon picks up the change automatically next
  time you open it — no reinstalling, no App Store, nothing else needed.
- If hosted anywhere else that lets you upload files (Netlify, your own web space,
  etc.): same idea — just overwrite the old `app.js` with the new one.

This is the "upload an update file" workflow you asked about — it's genuinely that
simple once it's hosted somewhere.

## Getting it hosted in the first place

You need these files sitting on a real web address, because iOS's "Add to Home
Screen", offline storage, and the encryption itself (browsers only expose the
crypto engine over a secure connection) all require the app to load over
`https://`, not from a file on your computer.

**GitHub Pages** is the best fit for what you described (being able to push updates
yourself):

1. Create a free GitHub account if you don't have one
2. Create a new repository (e.g. `spendtracker`)
3. Upload all the files to it
4. In the repo's Settings → Pages, enable GitHub Pages for that repository
5. GitHub gives you a URL like `https://yourname.github.io/spendtracker/`
6. Open that URL in **Safari on your iPhone** → Share button → **Add to Home Screen**

From then on, editing any file through GitHub's own website or app and committing
is all it takes to push an update — GitHub Pages picks it up automatically.

## Your data, and how the encryption works

Everything you log — entries, credits, pins, settings — stays **on your phone, in
Safari's own storage**. It is not sent anywhere: not to Claude, not to GitHub, not
to any server. And it is now stored **encrypted** (AES-256), so what actually sits
on the phone is unreadable ciphertext.

The first time you open the app it walks you through setup: your budget, then a
**passphrase**, then a one-time **recovery code**, then (optionally) **Face ID**.
Any one of those three can unlock the app; the passphrase is the master.
If you already had data logged before the encryption update, the app offers the
same setup and carries all your existing data across, encrypted, automatically.

Three things to genuinely understand:

1. **The passphrase is never stored and can't be reset.** If you forget it, the
   recovery code shown at setup is the only way back in. Save that code somewhere
   safe and offline (password manager, or written down) — without both, the data
   is unrecoverable by design. Nobody can help, and that's the point.
2. **Face ID is a convenience, not the foundation.** It only offers itself on
   devices whose browser supports holding a key behind biometrics (newer iPhones);
   everywhere else, the passphrase works identically.
3. **What this protects and what it doesn't.** If Safari's storage were copied off
   the phone, or the phone is shared/unlocked around others, your numbers are
   ciphertext behind a lock screen. It does *not* protect a session you've already
   unlocked and left open — so there's a 🔒 button (bottom-right) to re-lock
   instantly, and the app **auto-locks itself** after about 2 minutes in the
   background (tune `AUTO_LOCK_MS` in `crypto.js`).

The monthly and weekly budgets are **linked** — set either one (in first-run setup
or later in Settings) and the other is worked out from the number of weeks in your
current pay period. Change either box and the partner recalculates.

## Logging spends — the quality-of-life bits

- **Amount entry works in pence, filling from the right** — the display starts at
  `£0.00` and each digit shifts in, so `1` `2` `5` `0` = £12.50. No decimal point to
  place; there's a `00` key for round pounds.
- **The keypad remembers your last card** and defaults to it next time.
- **Tap any logged item to edit it** — fix the amount, card, label, or personal/work
  type instead of deleting and re-adding. (Editing one half of a *split* keeps its
  amount locked, since the two halves must still sum to the original total.)
- **A floating ＋ button (bottom-left)** logs to today's week from any tab, so you
  don't have to find the right week first.

## Moving your account between browsers/devices

Each browser keeps its **own separate storage** — Safari, Chrome, and the home-screen
app each start as a fresh "account", and there's no way around that from inside a web
app (browsers deliberately sandbox storage per-browser, and a page can't read a device
serial or reach into another browser's data). So to carry your data across, you move it
yourself:

- **Export** (Settings → *Move to another device* → **Export account**) gives you your
  account as a backup — a file or copied text. It's the **encrypted** vault, so it's
  only openable with your passphrase/recovery code; safe to save or send to yourself.
- **Import** it on the other browser/phone — either at the **welcome screen**
  ("Been here before? Import a previous account") or in **Settings → Import account**.
  Importing **replaces** whatever's on that device with the backup, then you unlock it
  with that account's passphrase. Export the current one first if you might want it back.

This is manual (a button, not live sync). True automatic cloud sync would need a small
backend — and because the vault is already encrypted client-side, such a server would
only ever hold ciphertext it can't read. That groundwork is done; just ask when you
want it.
