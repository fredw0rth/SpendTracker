// ─────────────────────────────────────────────────────────────────────────────
//  crypto.js — SpendTracker's at-rest encryption + lock screen
//
//  WHY THIS FILE IS PLAIN JAVASCRIPT (not JSX like app.jsx)
//  app.jsx has to be compiled to app.js before a browser can run it, and that
//  compile step needs tooling (Babel/tsc) that isn't always around. This file
//  sidesteps that entirely: it's written in the plain JS the browser runs
//  directly, using React.createElement (aliased `h` below) instead of JSX.
//  So there is NO compiled twin of this file to keep in sync — what you read
//  here is exactly what runs. Edit it directly.
//
//  THE SECURITY MODEL, HONESTLY
//  Your data is encrypted with AES-GCM using a random 256-bit "data key" (DEK).
//  The DEK never touches disk in the clear and is never derived from anything
//  guessable — it's random. To let you actually get back in, a *copy* of that
//  DEK is stored three times over, each copy locked ("wrapped") by a different
//  key you can reproduce:
//    1. passphrase  → PBKDF2 stretches your passphrase into a wrapping key
//    2. recovery    → a one-time random code does the same job
//    3. biometric   → Face ID / Touch ID via WebAuthn's PRF extension (optional,
//                     and only where the browser supports it — see enrollBiometric)
//  Unlocking with ANY of the three unwraps the DEK, which then decrypts the data.
//
//  What this protects: the data at rest. If Safari's storage for this app were
//  ever copied off the device, an attacker sees ciphertext, not your spending.
//  It also means a future cloud-sync backend would only ever hold ciphertext.
//  What it does NOT protect: a running, already-unlocked session, or malicious
//  code served to this app's own origin. Encryption at rest can't defend a
//  process that's already been handed the key. See README for the full picture.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  const h = React.createElement;
  const { useState, useEffect, useRef } = React;

  // ─── Storage keys ───────────────────────────────────────────────────────────
  // The encrypted vault lives in IndexedDB (see the storage layer below), because
  // iOS reliably keeps IndexedDB for home-screen PWAs but frequently evicts or
  // sandboxes localStorage between launches — which is why an earlier build kept
  // showing the setup screen again. VAULT_KEY is now only the *old* localStorage
  // location, read once to migrate any existing vault into IndexedDB.
  const VAULT_DB = "spendtracker_secure";   // IndexedDB database name
  const VAULT_STORE = "kv";                 // object store within it
  const VAULT_RECORD = "vault";             // key of the single vault record
  const VAULT_KEY = "spendtracker_vault";   // legacy localStorage location (migrated away)
  const LEGACY_KEY = "spendtracker_v6";     // the old *plaintext* store, migrated then deleted

  // PBKDF2 work factor. Higher = slower to brute-force a stolen vault, but also
  // slower to unlock on your phone. 250k is a sensible middle for mobile Safari.
  // Stored in the vault so it can be raised later without breaking old vaults.
  const KDF_ITERATIONS = 250000;

  // Auto-lock: if the app is backgrounded for at least this long, it re-locks on
  // return. Short enough to protect an app left open, long enough not to lock on a
  // quick glance at a notification. Tune here.
  const AUTO_LOCK_MS = 2 * 60 * 1000; // 2 minutes

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ─── Binary <-> base64 (chunked, so large blobs don't blow the call stack) ────
  function toB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }
  function fromB64(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }

  // ─── Key derivation & primitives ──────────────────────────────────────────────
  // Turn a human secret (passphrase or recovery code) into an AES-GCM wrapping key.
  async function deriveKEK(secret, salt, iterations) {
    const base = await crypto.subtle.importKey(
      "raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: iterations || KDF_ITERATIONS, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // A high-entropy byte string (e.g. a PRF output) → an AES-GCM key. SHA-256 first
  // for domain separation and a fixed 256-bit length.
  async function keyFromBytes(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return crypto.subtle.importKey(
      "raw", digest, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async function generateDEK() {
    // extractable so we can export/wrap it; the exported raw form only ever
    // exists momentarily in memory while being encrypted under a KEK.
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }

  // Wrap = encrypt the DEK's raw bytes under a wrapping key.
  async function wrapDEK(dek, kek) {
    const raw = await crypto.subtle.exportKey("raw", dek);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
    return { iv: toB64(iv), ct: toB64(ct) };
  }
  // Unwrap = decrypt back to a usable DEK. Throws if the wrapping key is wrong
  // (AES-GCM's auth tag fails) — that's how we detect a bad passphrase.
  async function unwrapDEK(wrap, kek) {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(wrap.iv) }, kek, fromB64(wrap.ct));
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }

  async function encryptState(dek, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, enc.encode(JSON.stringify(obj)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }
  async function decryptState(dek, blob) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(blob.iv) }, dek, fromB64(blob.ct));
    return JSON.parse(dec.decode(pt));
  }

  // ─── Recovery code (128 bits, Crockford base32 — no ambiguous I/L/O/U) ─────────
  const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function makeRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let bits = 0, value = 0, out = "";
    for (const b of bytes) {
      value = (value << 8) | b; bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out.match(/.{1,5}/g).join("-"); // group into fives for readability
  }
  // Accept the code back regardless of casing, spacing, or the classic look-alike
  // typos (O→0, I/L→1, U→V), so a hand-copied code still works.
  function normalizeRecovery(input) {
    return input.toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1").replace(/U/g, "V");
  }

  // ─── WebAuthn PRF (Face ID / Touch ID) — best-effort, gracefully optional ─────
  // Not every browser/device exposes the PRF extension (iOS Safari support is
  // patchy). Every function here throws a plain Error on any failure so callers
  // can fall back to the passphrase without the app breaking.
  function biometricSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }

  async function evaluatePRF(credentialId, prfSalt) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: credentialId }],
        userVerification: "required",
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
    const res = assertion.getClientExtensionResults();
    if (!res || !res.prf || !res.prf.results || !res.prf.results.first) {
      throw new Error("PRF output unavailable on this device");
    }
    return new Uint8Array(res.prf.results.first);
  }

  // Register a platform credential and, if it exposes PRF, wrap the DEK under a
  // key derived from its PRF output. Returns the biometric wrap, or throws.
  async function enrollBiometric(dek) {
    if (!biometricSupported()) throw new Error("Biometrics not available in this browser");
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "SpendTracker", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "spendtracker-local",
          displayName: "SpendTracker",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required",
        },
        extensions: { prf: {} },
        timeout: 60000,
      },
    });
    const ext = cred.getClientExtensionResults();
    if (!ext || !ext.prf || !ext.prf.enabled) {
      throw new Error("This device's Face ID can't be used to hold a key (no PRF support)");
    }
    const credentialId = new Uint8Array(cred.rawId);
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const prfOut = await evaluatePRF(credentialId, prfSalt);
    const kek = await keyFromBytes(prfOut);
    const wrap = await wrapDEK(dek, kek);
    return { credentialId: toB64(credentialId), prfSalt: toB64(prfSalt), ...wrap };
  }

  async function unlockWithBiometric(vault) {
    const w = vault.wraps.biometric;
    if (!w) throw new Error("Face ID isn't set up for this vault");
    const prfOut = await evaluatePRF(fromB64(w.credentialId), fromB64(w.prfSalt));
    const kek = await keyFromBytes(prfOut);
    const dek = await unwrapDEK(w, kek);
    const state = await decryptState(dek, vault.state);
    return { dek, state };
  }

  // ─── Vault assembly & unlock ──────────────────────────────────────────────────
  // Build a brand-new vault around some initial app state. biometricWrap may be
  // null (Face ID skipped or unsupported).
  async function buildVault({ passphrase, recoveryCode, initialState, biometricWrap }) {
    const dek = await generateDEK();
    const pSalt = crypto.getRandomValues(new Uint8Array(16));
    const rSalt = crypto.getRandomValues(new Uint8Array(16));
    const pKek = await deriveKEK(passphrase, pSalt, KDF_ITERATIONS);
    const rKek = await deriveKEK(normalizeRecovery(recoveryCode), rSalt, KDF_ITERATIONS);
    const vault = {
      v: 1,
      kdf: { iterations: KDF_ITERATIONS },
      wraps: {
        passphrase: { salt: toB64(pSalt), ...(await wrapDEK(dek, pKek)) },
        recovery: { salt: toB64(rSalt), ...(await wrapDEK(dek, rKek)) },
        biometric: biometricWrap || null,
      },
      state: await encryptState(dek, initialState),
    };
    return { vault, dek };
  }

  // enrollBiometric needs the DEK, but the DEK is generated inside buildVault.
  // So for the Face-ID-at-setup path we generate the DEK up front here, build
  // both non-biometric wraps AND the biometric wrap around it, then assemble.
  async function buildVaultWithBiometric({ passphrase, recoveryCode, initialState }) {
    const dek = await generateDEK();
    const pSalt = crypto.getRandomValues(new Uint8Array(16));
    const rSalt = crypto.getRandomValues(new Uint8Array(16));
    const pKek = await deriveKEK(passphrase, pSalt, KDF_ITERATIONS);
    const rKek = await deriveKEK(normalizeRecovery(recoveryCode), rSalt, KDF_ITERATIONS);
    // enroll uses the same dek so all three wraps open the same data
    const biometricWrap = await enrollBiometric(dek);
    const vault = {
      v: 1,
      kdf: { iterations: KDF_ITERATIONS },
      wraps: {
        passphrase: { salt: toB64(pSalt), ...(await wrapDEK(dek, pKek)) },
        recovery: { salt: toB64(rSalt), ...(await wrapDEK(dek, rKek)) },
        biometric: biometricWrap,
      },
      state: await encryptState(dek, initialState),
    };
    return { vault, dek };
  }

  async function unlockWithPassphrase(vault, passphrase) {
    const w = vault.wraps.passphrase;
    const kek = await deriveKEK(passphrase, fromB64(w.salt), vault.kdf.iterations);
    const dek = await unwrapDEK(w, kek); // throws on wrong passphrase
    const state = await decryptState(dek, vault.state);
    return { dek, state };
  }
  async function unlockWithRecovery(vault, code) {
    const w = vault.wraps.recovery;
    const kek = await deriveKEK(normalizeRecovery(code), fromB64(w.salt), vault.kdf.iterations);
    const dek = await unwrapDEK(w, kek);
    const state = await decryptState(dek, vault.state);
    return { dek, state };
  }

  // ─── Durable storage (IndexedDB, with a localStorage safety net) ──────────────
  function idbOpen() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(VAULT_DB, 1); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = () => { req.result.createObjectStore(VAULT_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet(key) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE, "readonly");
      const req = tx.objectStore(VAULT_STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  function idbSet(key, val) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE, "readwrite");
      tx.objectStore(VAULT_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  // Ask the browser to keep our storage instead of evicting it under pressure.
  // On iOS, being installed to the Home Screen makes this far more likely to be
  // granted. Best-effort — never blocks setup or unlock if it fails.
  async function requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        if (!already) await navigator.storage.persist();
      }
    } catch { /* ignore */ }
  }

  // Read the vault: IndexedDB first; if empty, migrate a vault left behind in
  // localStorage by an earlier build, then use that.
  async function loadVault() {
    try {
      const v = await idbGet(VAULT_RECORD);
      if (v) return v;
    } catch (e) { console.warn("[SpendTracker] IndexedDB read failed", e); }
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        try { await idbSet(VAULT_RECORD, v); localStorage.removeItem(VAULT_KEY); } catch { /* keep localStorage copy if IDB write fails */ }
        return v;
      }
    } catch { /* ignore */ }
    return null;
  }

  // Write the vault to IndexedDB; if that ever fails on a device, fall back to
  // localStorage so a save is never silently lost.
  async function saveVault(vault) {
    try {
      await idbSet(VAULT_RECORD, vault);
    } catch (e) {
      console.warn("[SpendTracker] IndexedDB write failed, falling back to localStorage", e);
      try { localStorage.setItem(VAULT_KEY, JSON.stringify(vault)); } catch { /* out of options */ }
    }
  }

  // ─── In-memory session — the only place a decrypted key/state lives ────────────
  // app.js talks to the app through window.SpendVault (see load()/save() there).
  // Writes are serialized through a promise chain so rapid state changes can't
  // race and corrupt the stored blob.
  const Session = {
    _dek: null,
    _vault: null,
    _state: null,
    _queue: Promise.resolve(),
    start(dek, vault, state) { this._dek = dek; this._vault = vault; this._state = state; },
    getState() { return this._state; },
    save(state) {
      this._state = state;
      if (!this._dek) return;
      this._queue = this._queue
        .then(async () => {
          this._vault.state = await encryptState(this._dek, state);
          await saveVault(this._vault);
        })
        .catch((e) => console.error("[SpendTracker] encrypted save failed", e));
    },
    lock() {
      this._dek = null;
      this._state = null; // vault object kept so we can re-unlock without a disk read
      window.dispatchEvent(new Event("spendtracker:lock"));
    },
  };

  window.SpendVault = {
    getState: () => Session.getState(),
    save: (s) => Session.save(s),
    requestLock: () => Session.lock(),
    // Erase every local trace of the vault, then reload back to first-run setup.
    // Note: a Face ID passkey lives in the OS keychain, not here, so it can't be
    // removed programmatically — it's left orphaned (harmless) and can be deleted
    // in iOS Settings › Passwords if desired.
    wipe: async () => {
      // Null the session first so any queued/in-flight save can't rewrite the vault
      // after we've deleted it.
      Session._dek = null; Session._state = null; Session._vault = null;
      try { localStorage.removeItem(VAULT_KEY); localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      await new Promise((resolve) => {
        try {
          const req = indexedDB.deleteDatabase(VAULT_DB);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        } catch (e) { resolve(); }
      });
      location.reload();
    },
  };

  // ─── Pay-period geometry (reuses app.js's global date helpers) ────────────────
  // How many weeks the current pay period spans, so setup can convert between a
  // monthly and a weekly budget in both directions. A period runs from the previous
  // month's payday up to the day before this month's payday — the same span the app
  // itself uses. Falls back to ~4.29 weeks if those helpers aren't reachable.
  function weeksInCurrentPeriod() {
    try {
      const now = londonNow(); now.setHours(0, 0, 0, 0);
      const { year, month } = periodLabelFor(now);
      const prevMonth = month - 1 < 0 ? 11 : month - 1;
      const prevYear = month - 1 < 0 ? year - 1 : year;
      const periodStart = lastWorkingDay(prevYear, prevMonth);
      const periodEnd = addDays(lastWorkingDay(year, month), -1);
      const days = Math.round((periodEnd - periodStart) / 86400000) + 1;
      return { days, weeks: days / 7 };
    } catch (e) {
      return { days: 30, weeks: 30 / 7 };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  UI — all React.createElement, dark theme matching the app
  // ─────────────────────────────────────────────────────────────────────────────
  const C = {
    page: { fontFamily: "'Inter', system-ui, sans-serif", background: "#030712", minHeight: "100vh", color: "#e2e8f0", maxWidth: 480, margin: "0 auto", padding: "0 20px", display: "flex", flexDirection: "column", justifyContent: "center", boxSizing: "border-box" },
    brand: { fontSize: 28, fontWeight: 800, letterSpacing: "-1px", color: "#f1f5f9", marginBottom: 4 },
    sub: { fontSize: 13, color: "#64748b", marginBottom: 24, lineHeight: 1.5 },
    label: { fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 },
    input: { width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, color: "#f1f5f9", padding: "13px 14px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14 },
    primary: { width: "100%", background: "#0369a1", border: "none", borderRadius: 10, color: "#f1f5f9", padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 },
    primaryDisabled: { opacity: 0.4, cursor: "default" },
    link: { background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer", padding: "12px 0", width: "100%" },
    ghost: { width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 10, color: "#cbd5e1", padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 10 },
    err: { color: "#f87171", fontSize: 13, marginBottom: 12, minHeight: 18 },
    note: { fontSize: 12, color: "#64748b", lineHeight: 1.6, marginTop: 4 },
    codeBox: { background: "#0f172a", border: "1px dashed #334155", borderRadius: 10, padding: "16px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 18, letterSpacing: "1px", color: "#93c5fd", textAlign: "center", wordBreak: "break-all", marginBottom: 12 },
    check: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#cbd5e1", margin: "8px 0 16px", cursor: "pointer", lineHeight: 1.5 },
    warn: { background: "#1c1207", border: "1px solid #92400e", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#fcd34d", lineHeight: 1.6, marginBottom: 14 },
  };

  // ── Lock screen: unlock an existing vault ──
  function LockScreen({ vault, onUnlocked }) {
    const [pass, setPass] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [mode, setMode] = useState("passphrase"); // "passphrase" | "recovery"
    const hasBiometric = !!(vault.wraps && vault.wraps.biometric);

    // Offer Face ID immediately if it's enrolled — the common daily path.
    useEffect(() => {
      if (!hasBiometric) return;
      let cancelled = false;
      (async () => {
        try {
          const { dek, state } = await unlockWithBiometric(vault);
          if (!cancelled) onUnlocked(dek, vault, state);
        } catch {
          /* user cancelled or unsupported — fall through to passphrase */
        }
      })();
      return () => { cancelled = true; };
    }, []);

    async function submit() {
      setBusy(true); setErr("");
      try {
        const res = mode === "recovery"
          ? await unlockWithRecovery(vault, pass)
          : await unlockWithPassphrase(vault, pass);
        onUnlocked(res.dek, vault, res.state);
      } catch {
        setErr(mode === "recovery" ? "That recovery code didn't work." : "Incorrect passphrase.");
        setBusy(false);
      }
    }

    async function tryBiometric() {
      setErr("");
      try {
        const { dek, state } = await unlockWithBiometric(vault);
        onUnlocked(dek, vault, state);
      } catch {
        setErr("Face ID didn't complete — enter your passphrase.");
      }
    }

    return h("div", { style: C.page },
      h("div", { style: C.brand }, "SpendTracker"),
      h("div", { style: C.sub }, mode === "recovery"
        ? "Enter your recovery code to unlock."
        : "Locked. Enter your passphrase to unlock."),
      h("input", {
        style: C.input,
        type: mode === "recovery" ? "text" : "password",
        inputMode: mode === "recovery" ? "text" : undefined,
        autoCapitalize: "none", autoCorrect: "off", spellCheck: false,
        placeholder: mode === "recovery" ? "XXXXX-XXXXX-…" : "Passphrase",
        value: pass,
        onChange: (e) => setPass(e.target.value),
        onKeyDown: (e) => { if (e.key === "Enter" && pass) submit(); },
        autoFocus: true,
      }),
      h("div", { style: C.err }, err),
      h("button", {
        style: { ...C.primary, ...(pass && !busy ? {} : C.primaryDisabled) },
        disabled: !pass || busy,
        onClick: submit,
      }, busy ? "Unlocking…" : "Unlock"),
      hasBiometric && mode === "passphrase" &&
        h("button", { style: C.ghost, onClick: tryBiometric }, "Unlock with Face ID"),
      h("button", { style: C.link, onClick: () => { setErr(""); setPass(""); setMode(mode === "recovery" ? "passphrase" : "recovery"); } },
        mode === "recovery" ? "Use passphrase instead" : "Forgot passphrase? Use recovery code")
    );
  }

  // ── Setup flow: onboarding (fresh) or migration (existing plaintext data) ──
  //  steps: budget (onboarding only) → passphrase → recovery → biometric → done
  function SetupFlow({ mode, seedState, onUnlocked }) {
    const isMigrate = mode === "migrate";
    const [step, setStep] = useState(isMigrate ? "passphrase" : "budget");

    // budget step — monthly and weekly are two-way linked through the number of
    // weeks in the current pay period: enter either and the other auto-fills.
    // Defaults to £1000/month (→ a matching weekly). Measured once on mount so it
    // stays stable while the user types.
    const [period] = useState(() => weeksInCurrentPeriod());
    const W = period.weeks || 1;
    const round2 = (n) => Math.round(n * 100) / 100;
    const [monthly, setMonthly] = useState("1000");
    const [weekly, setWeekly] = useState(() => String(round2(1000 / (period.weeks || 1))));
    function onMonthlyChange(v) { setMonthly(v); const m = parseFloat(v); setWeekly(isNaN(m) ? "" : String(round2(m / W))); }
    function onWeeklyChange(v) { setWeekly(v); const w = parseFloat(v); setMonthly(isNaN(w) ? "" : String(round2(w * W))); }

    // passphrase step
    const [pass, setPass] = useState("");
    const [confirm, setConfirm] = useState("");

    // recovery step
    const [recoveryCode] = useState(() => makeRecoveryCode());
    const [savedAck, setSavedAck] = useState(false);
    const [copied, setCopied] = useState(false);

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    // Assemble the initial app state: migration carries the existing data across;
    // onboarding starts from the app's defaults with the budget the user just set.
    function makeInitialState() {
      if (isMigrate) return seedState;
      const base = window.defaultState ? window.defaultState() : {};
      const m = parseFloat(monthly);
      const w = parseFloat(weekly);
      return {
        ...base,
        monthlyBudget: isNaN(m) ? base.monthlyBudget : m,
        weeklyBudget: isNaN(w) ? base.weeklyBudget : w,
      };
    }

    async function commit(withBiometric) {
      setBusy(true); setErr("");
      try {
        const initialState = makeInitialState();
        const built = withBiometric
          ? await buildVaultWithBiometric({ passphrase: pass, recoveryCode, initialState })
          : await buildVault({ passphrase: pass, recoveryCode, initialState, biometricWrap: null });
        await requestPersistentStorage();
        await saveVault(built.vault);
        if (isMigrate) localStorage.removeItem(LEGACY_KEY); // drop the plaintext copy
        onUnlocked(built.dek, built.vault, initialState);
      } catch (e) {
        // Biometric enrollment is the only step that can fail here on a good path
        // (device declined / unsupported). Surface it and let them continue without.
        setErr(withBiometric
          ? "Couldn't set up Face ID on this device. You can continue with just your passphrase."
          : "Something went wrong setting up encryption. Please try again.");
        setBusy(false);
      }
    }

    // — Step: first budget —
    if (step === "budget") {
      const ok = parseFloat(monthly) > 0;
      return h("div", { style: C.page },
        h("div", { style: C.brand }, "Welcome"),
        h("div", { style: C.sub }, "Set your budget — enter either figure and the other fills in automatically. Then we'll lock your data down with a passphrase."),
        h("label", { style: C.label }, "Monthly budget (£)"),
        h("input", { style: C.input, type: "number", inputMode: "decimal", placeholder: "e.g. 1000", value: monthly, onChange: (e) => onMonthlyChange(e.target.value), autoFocus: true }),
        h("label", { style: C.label }, "Weekly budget (£)"),
        h("input", { style: C.input, type: "number", inputMode: "decimal", placeholder: "auto", value: weekly, onChange: (e) => onWeeklyChange(e.target.value) }),
        h("div", { style: C.note }, `Linked across this pay period — ${period.days} days ≈ ${round2(W)} weeks. Change either box and the other recalculates. You can fine-tune everything in Settings later.`),
        h("button", { style: { ...C.primary, ...(ok ? {} : C.primaryDisabled) }, disabled: !ok, onClick: () => setStep("passphrase") }, "Continue")
      );
    }

    // — Step: passphrase —
    if (step === "passphrase") {
      const tooShort = pass.length > 0 && pass.length < 8;
      const mismatch = confirm.length > 0 && confirm !== pass;
      const ok = pass.length >= 8 && confirm === pass;
      return h("div", { style: C.page },
        h("div", { style: C.brand }, "Choose a passphrase"),
        h("div", { style: C.sub }, "This encrypts everything you log. It's never stored — only you know it, and it can't be reset without your recovery code."),
        h("input", { style: C.input, type: "password", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, placeholder: "Passphrase (min 8 characters)", value: pass, onChange: (e) => setPass(e.target.value), autoFocus: true }),
        h("input", { style: C.input, type: "password", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, placeholder: "Confirm passphrase", value: confirm, onChange: (e) => setConfirm(e.target.value) }),
        h("div", { style: C.err }, tooShort ? "Use at least 8 characters." : mismatch ? "Passphrases don't match." : ""),
        h("button", { style: { ...C.primary, ...(ok ? {} : C.primaryDisabled) }, disabled: !ok, onClick: () => setStep("recovery") }, "Continue"),
        !isMigrate && h("button", { style: C.link, onClick: () => setStep("budget") }, "← Back")
      );
    }

    // — Step: recovery code —
    if (step === "recovery") {
      return h("div", { style: C.page },
        h("div", { style: C.brand }, "Your recovery code"),
        h("div", { style: C.sub }, "The one way back in if you forget your passphrase. Save it somewhere safe and offline — a password manager, or written down. We can't recover it for you."),
        h("div", { style: C.codeBox }, recoveryCode),
        h("button", { style: C.ghost, onClick: () => { navigator.clipboard.writeText(recoveryCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { /* clipboard denied — code is on screen to copy by hand */ }); } }, copied ? "✓ Copied" : "Copy code"),
        h("label", { style: C.check },
          h("input", { type: "checkbox", checked: savedAck, onChange: (e) => setSavedAck(e.target.checked), style: { marginTop: 2 } }),
          h("span", null, "I've saved this recovery code. I understand it's the only way back in if I forget my passphrase.")
        ),
        h("button", { style: { ...C.primary, ...(savedAck ? {} : C.primaryDisabled) }, disabled: !savedAck, onClick: () => setStep("biometric") }, "Continue"),
        h("button", { style: C.link, onClick: () => setStep("passphrase") }, "← Back")
      );
    }

    // — Step: biometric (optional) —
    if (step === "biometric") {
      const supported = biometricSupported();
      return h("div", { style: C.page },
        h("div", { style: C.brand }, "Enable Face ID?"),
        h("div", { style: C.sub }, supported
          ? "Unlock with Face ID or Touch ID instead of typing your passphrase each time. Your passphrase still works, and stays the master key."
          : "Face ID unlock isn't available in this browser. You'll unlock with your passphrase — which works everywhere."),
        err && h("div", { style: C.err }, err),
        supported && h("button", { style: { ...C.primary, ...(busy ? C.primaryDisabled : {}) }, disabled: busy, onClick: () => commit(true) }, busy ? "Setting up…" : "Enable Face ID"),
        h("button", { style: supported ? C.ghost : { ...C.primary, ...(busy ? C.primaryDisabled : {}) }, disabled: busy, onClick: () => commit(false) }, supported ? "Skip — use passphrase only" : (busy ? "Finishing…" : "Finish setup"))
      );
    }

    return null;
  }

  // ── Discreet floating lock button, shown only while unlocked ──
  function LockButton() {
    return h("button", {
      "aria-label": "Lock app",
      onClick: () => Session.lock(),
      style: {
        position: "fixed",
        right: "calc(14px + env(safe-area-inset-right))",
        bottom: "calc(14px + env(safe-area-inset-bottom))",
        width: 44, height: 44, borderRadius: "50%",
        background: "rgba(15,23,42,0.9)", border: "1px solid #334155",
        color: "#94a3b8", fontSize: 18, cursor: "pointer", zIndex: 50,
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
      },
    }, "🔒");
  }

  // ── Root: decides what to show, gates the real app behind unlock ──
  function Root() {
    const [phase, setPhase] = useState("boot"); // boot | onboard | migrate | locked | unlocked
    const [vault, setVault] = useState(null);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        await requestPersistentStorage();
        const existing = await loadVault();
        if (cancelled) return;
        if (existing) { setVault(existing); setPhase("locked"); return; }
        if (localStorage.getItem(LEGACY_KEY)) { setPhase("migrate"); return; }
        setPhase("onboard");
      })();
      return () => { cancelled = true; };
    }, []);

    // Re-lock returns to the lock screen without losing the (encrypted) data.
    useEffect(() => {
      const onLock = () => setPhase("locked");
      window.addEventListener("spendtracker:lock", onLock);
      return () => window.removeEventListener("spendtracker:lock", onLock);
    }, []);

    // Auto-lock after the app has been in the background for AUTO_LOCK_MS. We only
    // lock while actually unlocked, and only when the away time exceeds the grace
    // period, so switching apps briefly doesn't force a re-entry.
    useEffect(() => {
      let hiddenAt = null;
      const onVisibility = () => {
        if (document.hidden) {
          hiddenAt = Date.now();
        } else {
          if (phase === "unlocked" && hiddenAt && Date.now() - hiddenAt >= AUTO_LOCK_MS) {
            Session.lock();
          }
          hiddenAt = null;
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [phase]);

    function handleUnlocked(dek, v, state) {
      Session.start(dek, v, state);
      setVault(v);
      setPhase("unlocked");
    }

    if (phase === "boot") return null;
    if (phase === "unlocked") {
      return h(React.Fragment, null, h(App), h(LockButton));
    }
    if (phase === "locked" && vault) {
      return h(LockScreen, { vault, onUnlocked: handleUnlocked });
    }
    if (phase === "migrate") {
      let seed = null;
      try { seed = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch { seed = null; }
      return h(SetupFlow, { mode: "migrate", seedState: seed, onUnlocked: handleUnlocked });
    }
    // onboard
    return h(SetupFlow, { mode: "onboard", seedState: null, onUnlocked: handleUnlocked });
  }

  window.SpendTrackerRoot = Root;
})();
