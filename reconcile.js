// ─── Bank statement reconciliation ────────────────────────────────────────────
// Pure logic for reading a bank/credit-card CSV and cross-referencing it against what's
// been logged in SpendTracker. Deliberately knows nothing about React, the DOM, the vault,
// or the app's own object shapes — the caller (app.jsx) adapts entries/pins into the small
// `candidate` shape below, and adapts the result buckets back into reducer ops.
//
// That seam is what makes this file directly require()-able from the Node tests while still
// loading as a plain <script> in the browser alongside crypto.js.
(function (root) {
  "use strict";

  // ─── CSV ────────────────────────────────────────────────────────────────────
  // A real parser rather than split(","): bank descriptions routinely contain commas
  // ("TESCO STORES 3792, LONDON"), and quoted fields may contain newlines.

  const DELIMITERS = [",", ";", "\t", "|"];

  function parseWithDelimiter(text, delim) {
    const rows = [];
    let row = [], field = "", inQuotes = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // "" is an escaped quote
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === delim) { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    // Drop blank trailing lines — a trailing newline is normal and isn't a row.
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ""));
  }

  // How well a delimiter explains the file: the share of rows agreeing on a column count,
  // weighted by how many columns that is. A wrong delimiter yields one giant column (score -1).
  function scoreRows(rows) {
    if (!rows.length) return -1;
    const counts = {};
    for (const r of rows) counts[r.length] = (counts[r.length] || 0) + 1;
    let modal = 0, modalN = 0;
    for (const k of Object.keys(counts)) {
      const n = counts[k], c = Number(k);
      if (n > modalN || (n === modalN && c > modal)) { modal = c; modalN = n; }
    }
    if (modal < 2) return -1;
    return (modalN / rows.length) * modal;
  }

  function parseCSV(text, forceDelimiter) {
    let s = String(text == null ? "" : text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);           // strip BOM
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");        // CRLF and lone-CR line endings
    if (!s.trim()) return { rows: [], delimiter: forceDelimiter || "," };
    if (forceDelimiter) return { rows: parseWithDelimiter(s, forceDelimiter), delimiter: forceDelimiter };
    let best = null, bestScore = -Infinity, bestDelim = ",";
    for (const d of DELIMITERS) {
      const rows = parseWithDelimiter(s, d);
      const score = scoreRows(rows);
      if (score > bestScore) { best = rows; bestScore = score; bestDelim = d; }
    }
    return { rows: best || [], delimiter: bestDelim };
  }

  // ─── Amounts ────────────────────────────────────────────────────────────────
  // Returns pounds as a float, matching how the app stores `entry.amount`. Negative means
  // money in. "CR" is treated as a credit marker (money in) — that's what it means on the
  // card statements that use it; a "DR" marker leaves the sign alone.
  // Continental "1.234,56" grouping is NOT supported: it's indistinguishable from "1.234"
  // meaning one pound twenty-three, and no UK bank exports it.

  function parseAmount(str) {
    if (str == null) return { value: 0, ok: false };
    let s = String(str).replace(/ /g, " ").trim();
    if (!s || /^[-‒–—−]+$/.test(s)) return { value: 0, ok: false };

    let negative = false, creditMarker = false;
    const marker = s.match(/(^|\s)(CR|DR)\.?(\s|$)/i);
    if (marker) {
      if (marker[2].toUpperCase() === "CR") creditMarker = true;
      s = s.replace(/(^|\s)(CR|DR)\.?(\s|$)/i, " ").trim();
    }
    // Currency symbols come off BEFORE the sign is read: banks write both "-£12.34" and "£-12.34".
    s = s.replace(/[£$€]/g, "").trim();
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }   // (12.34) accounting negative
    s = s.replace(/[‒–—−]/g, "-");                        // unicode dashes → hyphen
    if (/^-/.test(s)) { negative = !negative; s = s.slice(1).trim(); }
    else if (/-$/.test(s)) { negative = !negative; s = s.slice(0, -1).trim(); } // trailing-minus style
    if (/^\+/.test(s)) s = s.slice(1).trim();
    s = s.replace(/\s/g, "").replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(s)) return { value: 0, ok: false };
    let v = Math.round(parseFloat(s) * 100) / 100;
    if (isNaN(v)) return { value: 0, ok: false };
    if (negative) v = -v;
    if (creditMarker) v = -Math.abs(v);
    return { value: v, ok: true };
  }

  // ─── Dates ──────────────────────────────────────────────────────────────────
  // Emits the app's own zero-padded local "YYYY-MM-DD" day key (see dayKey in app.jsx), so
  // a statement date and an entry's `day` are directly comparable as strings.

  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const pad2 = (n) => String(n).padStart(2, "0");
  // A bare 2-digit year: 70-99 reads as 19xx, 00-69 as 20xx.
  const normYear = (y) => (y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y);

  // Splits a date string into components without yet deciding day-vs-month order.
  function dateParts(str) {
    if (str == null) return null;
    const s = String(str).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return { kind: "ymd", y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})[\s\-\/]+(\d{2,4})/);      // 15 Aug 2026 / 15-AUG-26
    if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return { kind: "named", y: normYear(+m[3]), m: mo, d: +m[1] }; }
    m = s.match(/^([A-Za-z]{3,})[\s\-\/]+(\d{1,2})[,\s\-\/]+(\d{2,4})/);     // Aug 15, 2026
    if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return { kind: "named", y: normYear(+m[3]), m: mo, d: +m[2] }; }
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (m) return { kind: "ambiguous", a: +m[1], b: +m[2], y: normYear(+m[3]) };
    return null;
  }

  // 03/04/2026 is genuinely ambiguous, so the format is decided once per COLUMN, not per cell:
  // scan every value for one that proves the order (a component > 12), and fall back to DD/MM
  // (this is a UK app) flagged as ambiguous so the UI can offer a toggle.
  function detectDateFormat(values) {
    let dmy = 0, mdy = 0, parsed = 0;
    for (const v of values || []) {
      const p = dateParts(v);
      if (!p) continue;
      parsed++;
      if (p.kind !== "ambiguous") continue;
      if (p.a > 12 && p.b <= 12) dmy++;
      else if (p.b > 12 && p.a <= 12) mdy++;
    }
    if (dmy && !mdy) return { format: "DMY", ambiguous: false, parsed };
    if (mdy && !dmy) return { format: "MDY", ambiguous: false, parsed };
    if (dmy && mdy) return { format: "DMY", ambiguous: true, parsed };  // contradictory — trust neither
    return { format: "DMY", ambiguous: true, parsed };
  }

  function parseDate(str, format) {
    const p = dateParts(str);
    if (!p) return null;
    let y, mo, d;
    if (p.kind === "ambiguous") {
      y = p.y;
      if (format === "MDY") { mo = p.a; d = p.b; } else { d = p.a; mo = p.b; }
    } else { y = p.y; mo = p.m; d = p.d; }
    if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
    const dt = new Date(y, mo - 1, d);   // local, like dayKeyToDate — never Date.parse
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + "-" + pad2(mo) + "-" + pad2(d);
  }

  // ─── Descriptions ───────────────────────────────────────────────────────────
  // Strips the noise card networks bolt onto a merchant name so two spellings of the same
  // shop compare equal: reference numbers, card fragments, embedded dates, scheme prefixes.

  function normaliseDescription(s) {
    let t = String(s == null ? "" : s).toUpperCase();
    t = t.replace(/[^A-Z0-9&\s]/g, " ");
    t = t.replace(/\bON \d{1,2} [A-Z]{3}\b/g, " ");
    t = t.replace(/\b\d{1,2} [A-Z]{3} \d{2,4}\b/g, " ");
    t = t.replace(/\bX{2,}\d+\b/g, " ");
    t = t.replace(/\b\d{4,}\b/g, " ");
    t = t.replace(/^\s*(POS|CARD PAYMENT TO|CARD PURCHASE|PAYMENT TO|DIRECT DEBIT|DD|SO|STANDING ORDER|VIS|VISA|MASTERCARD|CONTACTLESS)\b/g, " ");
    t = t.replace(/\b(LTD|LIMITED|PLC|GBR|GBP)\b/g, " ");
    return t.replace(/\s+/g, " ").trim();
  }

  function bigrams(s) {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  }

  // Dice coefficient over character bigrams — no dependency, and forgiving of the truncation
  // and abbreviation that card descriptors apply to merchant names.
  function similarity(a, b) {
    const A = normaliseDescription(a), B = normaliseDescription(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    const ga = bigrams(A.replace(/\s/g, "")), gb = bigrams(B.replace(/\s/g, ""));
    if (!ga.length || !gb.length) return 0;
    const pool = new Map();
    for (const g of ga) pool.set(g, (pool.get(g) || 0) + 1);
    let hits = 0;
    for (const g of gb) { const n = pool.get(g) || 0; if (n > 0) { pool.set(g, n - 1); hits++; } }
    return (2 * hits) / (ga.length + gb.length);
  }

  // ─── Fingerprints ───────────────────────────────────────────────────────────
  // FNV-1a. Not cryptographic and doesn't need to be: it only has to be stable across
  // re-uploads of the same statement so already-reconciled rows aren't flagged twice.
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function rowFingerprint(row) {
    return hashStr([row.date, row.normDesc, Number(row.amount).toFixed(2), row.dupIndex || 0].join("|"));
  }

  // ─── Column mapping ─────────────────────────────────────────────────────────

  const DATE_HEADERS   = ["date","transaction date","date of transaction","txn date","posted date","posting date","value date","completed date","started date","date completed"];
  const DESC_HEADERS   = ["description","details","transaction description","narrative","merchant","payee","reference","name","transaction","memo","notes","type of transaction"];
  const DEBIT_HEADERS  = ["debit","debit amount","money out","paid out","withdrawal","withdrawals","out","payments"];
  const CREDIT_HEADERS = ["credit","credit amount","money in","paid in","deposit","deposits","in","receipts"];
  const AMOUNT_HEADERS = ["amount","value","transaction amount","amount gbp","amount (gbp)","billing amount","net amount"];

  const headerKey = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ()]/g, " ").replace(/\s+/g, " ").trim();
  const colOf = (headers, list) => headers.findIndex(h => list.indexOf(h) !== -1);

  function columnValues(rows, col, from) {
    const out = [];
    for (let i = from; i < rows.length; i++) if (rows[i][col] != null) out.push(rows[i][col]);
    return out;
  }
  const fractionParsing = (vals, fn) => (vals.length ? vals.filter(v => fn(v)).length / vals.length : 0);

  // Works out which column is which. Header names first (covering the UK banks people actually
  // use), then content sniffing so a headerless or unrecognised export is still readable rather
  // than a dead end. Whatever it decides is shown to the user for correction before anything runs.
  function sniffColumns(rows) {
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    if (!rows.length || width < 2) {
      return { dateCol: null, descCol: null, amountCol: null, debitCol: null, creditCol: null,
               dateFormat: "DMY", dateAmbiguous: true, spendIsPositive: true, hasHeader: false, confidence: "none" };
    }

    // A header row is one whose own cells don't read as dates while later rows' do.
    const firstRowHasDate = rows[0].some(c => dateParts(c));
    const laterHasDate = rows.slice(1, 12).some(r => r.some(c => dateParts(c)));
    const hasHeader = !firstRowHasDate && (laterHasDate || rows.length === 1);
    const headers = hasHeader ? rows[0].map(headerKey) : [];
    const from = hasHeader ? 1 : 0;

    let dateCol = hasHeader ? colOf(headers, DATE_HEADERS) : -1;
    let descCol = hasHeader ? colOf(headers, DESC_HEADERS) : -1;
    let debitCol = hasHeader ? colOf(headers, DEBIT_HEADERS) : -1;
    let creditCol = hasHeader ? colOf(headers, CREDIT_HEADERS) : -1;
    let amountCol = hasHeader ? colOf(headers, AMOUNT_HEADERS) : -1;

    // A lone debit column with no credit twin is really just the amount column.
    if (debitCol !== -1 && creditCol === -1 && amountCol === -1) { amountCol = debitCol; debitCol = -1; }
    if (creditCol !== -1 && debitCol === -1 && amountCol !== -1) creditCol = -1;

    const headerMatched = dateCol !== -1 && descCol !== -1 && (amountCol !== -1 || debitCol !== -1);

    if (dateCol === -1) {
      let best = -1, bestFrac = 0.5;
      for (let c = 0; c < width; c++) {
        const f = fractionParsing(columnValues(rows, c, from), v => !!dateParts(v));
        if (f > bestFrac) { bestFrac = f; best = c; }
      }
      dateCol = best;
    }
    if (amountCol === -1 && debitCol === -1) {
      let best = -1, bestFrac = 0.5;
      for (let c = 0; c < width; c++) {
        if (c === dateCol) continue;
        const f = fractionParsing(columnValues(rows, c, from), v => parseAmount(v).ok);
        if (f > bestFrac) { bestFrac = f; best = c; }
      }
      amountCol = best;
    }
    if (descCol === -1) {
      // The free-text column: longest average content among the columns not already claimed.
      let best = -1, bestLen = 0;
      for (let c = 0; c < width; c++) {
        if (c === dateCol || c === amountCol || c === debitCol || c === creditCol) continue;
        const vals = columnValues(rows, c, from);
        if (!vals.length) continue;
        const avg = vals.reduce((s, v) => s + String(v).trim().length, 0) / vals.length;
        if (avg > bestLen) { bestLen = avg; best = c; }
      }
      descCol = best;
    }

    const dateInfo = dateCol >= 0 ? detectDateFormat(columnValues(rows, dateCol, from)) : { format: "DMY", ambiguous: true };

    // Which sign is a spend. With separate debit/credit columns it's settled by construction;
    // with one signed column, the majority sign is the spend sign (most rows on a statement
    // are purchases). Amex charges positive, most current accounts make spends negative.
    let spendIsPositive = true;
    if (debitCol === -1 && amountCol >= 0) {
      let pos = 0, neg = 0;
      for (const v of columnValues(rows, amountCol, from)) {
        const a = parseAmount(v);
        if (!a.ok || a.value === 0) continue;
        if (a.value > 0) pos++; else neg++;
      }
      spendIsPositive = pos >= neg;
    }

    return {
      dateCol: dateCol === -1 ? null : dateCol,
      descCol: descCol === -1 ? null : descCol,
      amountCol: amountCol === -1 ? null : amountCol,
      debitCol: debitCol === -1 ? null : debitCol,
      creditCol: creditCol === -1 ? null : creditCol,
      dateFormat: dateInfo.format,
      dateAmbiguous: dateInfo.ambiguous,
      spendIsPositive,
      hasHeader,
      confidence: headerMatched ? "high" : (dateCol !== -1 && (amountCol !== -1 || debitCol !== -1) ? "medium" : "low"),
    };
  }

  // ─── Statement rows ─────────────────────────────────────────────────────────
  // Rows that aren't spending at all. Paying the card off appears on the card statement as
  // money in AND on the current account as money out — logging either would double-count.
  // These are surfaced to the user as skipped-with-a-reason, never silently dropped.
  const IGNORE_PATTERNS = [
    [/PAYMENT RECEIVED/, "Card payment"],
    [/PAYMENT THANK YOU/, "Card payment"],
    [/THANK YOU/, "Card payment"],
    [/DIRECT DEBIT PAYMENT/, "Card payment"],
    [/\bTRANSFER (TO|FROM)\b/, "Transfer"],
    [/\bBANK GIRO CREDIT\b/, "Transfer"],
    [/\bSALARY\b/, "Salary"],
    [/\bINTEREST\b/, "Interest"],
  ];
  function ignoreReasonFor(normDesc) {
    for (const [re, reason] of IGNORE_PATTERNS) if (re.test(normDesc)) return reason;
    return "";
  }

  // Turns raw CSV rows + a column mapping into normalised statement rows. `amount` is always
  // positive; `direction` carries the sign. Rows without a usable date are dropped — that's
  // what the totals/footer lines banks append look like.
  function buildStatement(rows, mapping) {
    const m = mapping || {};
    const data = m.hasHeader ? rows.slice(1) : rows;
    const out = [];
    const seen = new Map();
    for (let i = 0; i < data.length; i++) {
      const r = data[i] || [];
      const date = m.dateCol == null ? null : parseDate(r[m.dateCol], m.dateFormat);
      if (!date) continue;

      let value = null;
      if (m.debitCol != null || m.creditCol != null) {
        const d = m.debitCol != null ? parseAmount(r[m.debitCol]) : { ok: false, value: 0 };
        const c = m.creditCol != null ? parseAmount(r[m.creditCol]) : { ok: false, value: 0 };
        if (d.ok && Math.abs(d.value) > 0) value = Math.abs(d.value);
        else if (c.ok && Math.abs(c.value) > 0) value = -Math.abs(c.value);
        else continue;
      } else {
        if (m.amountCol == null) continue;
        const a = parseAmount(r[m.amountCol]);
        if (!a.ok) continue;
        value = m.spendIsPositive === false ? -a.value : a.value;
      }
      if (!value) continue;

      const description = String(r[m.descCol] == null ? "" : r[m.descCol]).trim();
      const normDesc = normaliseDescription(description);
      const amount = Math.round(Math.abs(value) * 100) / 100;
      const key = date + "|" + normDesc + "|" + amount.toFixed(2);
      const dupIndex = seen.get(key) || 0;
      seen.set(key, dupIndex + 1);
      const reason = ignoreReasonFor(normDesc);
      const row = {
        id: "s" + i,
        date,
        description,
        normDesc,
        amount,
        direction: value > 0 ? "debit" : "credit",
        ignored: !!reason,
        ignoreReason: reason,
        dupIndex,
        raw: r,
      };
      row.fingerprint = rowFingerprint(row);
      out.push(row);
    }
    return out;
  }

  // ─── Period lookup ──────────────────────────────────────────────────────────
  // `periods` is [{ archiveIndex, weeks: [{ index, dayKeys }] }] — built by the caller from the
  // app's own buildWeeks output, so the week a day belongs to is decided by exactly the same
  // data weekIndexForDay reads. Live period is listed first, so it wins any overlap.
  function buildDayIndex(periods) {
    const map = Object.create(null);
    for (const p of periods || []) {
      for (const w of p.weeks || []) {
        for (const k of w.dayKeys || []) {
          if (!(k in map)) map[k] = { archiveIndex: p.archiveIndex, weekIndex: w.index };
        }
      }
    }
    return map;
  }
  function periodIndexFor(day, dayIndex) {
    if (!day || !dayIndex) return null;
    return dayIndex[day] || null;
  }

  // ─── Matching ───────────────────────────────────────────────────────────────
  // Candidates are what the caller has logged, flattened to:
  //   { key, kind: "entry"|"split"|"pin"|"credit", amount, day, label, method, direction, recon, ref }
  // `amount` is the GROUP total for a split (the two halves are one card transaction) and the
  // occurrence amount for a pin. `direction` defaults to "debit"; a logged credit is "credit" and
  // only ever matches an incoming statement row, so a £8 refund can never pair with an £8 spend.
  // `ref` is opaque — the caller uses it to build reducer ops.

  const pence = (n) => Math.round(Number(n) * 100);
  const samePenny = (a, b) => pence(a) === pence(b);
  // How far apart two amounts are, as a fraction of the larger one.
  const amountDrift = (a, b) => {
    const hi = Math.max(Math.abs(a), Math.abs(b));
    return hi === 0 ? 0 : Math.abs(a - b) / hi;
  };
  // Lexicographic tuple comparison, so a ranking reads as a list of tie-breakers.
  function lexLess(a, b) {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
    return false;
  }
  function daysApart(a, b) {
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    const da = Date.UTC(pa[0], pa[1] - 1, pa[2]), db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round(Math.abs(da - db) / 86400000);
  }

  function reconcile(opts) {
    const o = opts || {};
    const dayWindow = o.dayWindow == null ? 3 : o.dayWindow;      // card postings lag the purchase
    // How far two amounts may differ and still be treated as the same charge, as a fraction of the
    // larger: 0.75 keeps £8-vs-£18 (a dropped digit) while rejecting £4.20-vs-£30.
    const amountTolerance = o.amountTolerance == null ? 0.75 : o.amountTolerance;
    const dayIndex = o.dayIndex || null;
    const all = (o.statement || []).slice();

    const skipped = all.filter(r => r.ignored);
    const live = all.filter(r => !r.ignored);

    const inRange = [], outOfRange = [];
    for (const r of live) {
      if (dayIndex && !periodIndexFor(r.date, dayIndex)) outOfRange.push(r);
      else inRange.push(r);
    }

    // Deterministic order so a greedy pass is reproducible (and testable).
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : pence(a.amount) - pence(b.amount));
    inRange.sort(byDate);

    // The statement only covers the dates it covers. An entry logged outside that span isn't
    // "missing from the statement" — the statement simply says nothing about it.
    const span = inRange.length
      ? { from: inRange[0].date, to: inRange[inRange.length - 1].date }
      : null;

    const cands = (o.candidates || []).slice().sort((a, b) => {
      const ad = a.day || "", bd = b.day || "";
      if (ad !== bd) return ad < bd ? -1 : 1;
      if (pence(a.amount) !== pence(b.amount)) return pence(a.amount) - pence(b.amount);
      return String(a.key) < String(b.key) ? -1 : 1;
    });

    const usedRow = new Set(), usedCand = new Set();
    const matched = [], amountMismatch = [];
    const take = (row, cand, how) => {
      usedRow.add(row.id); usedCand.add(cand.key);
      const rec = { row, candidate: cand, how, delta: Math.round((row.amount - cand.amount) * 100) / 100 };
      if (samePenny(row.amount, cand.amount)) matched.push(rec); else amountMismatch.push(rec);
    };

    const dirOf = (c) => c.direction || "debit";
    // Only candidates of the same direction are eligible: money out matches money out.
    const free = (row) => cands.filter(c => !usedCand.has(c.key) && (!row || dirOf(c) === row.direction));

    // Pass 0 — already reconciled on a previous upload of this statement.
    for (const row of inRange) {
      if (usedRow.has(row.id)) continue;
      const c = free(row).find(c => c.recon && c.recon === row.fingerprint);
      if (c) take(row, c, "remembered");
    }
    // Pass 1 — same amount, same day. Greedy and 1-to-1, so two identical spends on one day
    // pair with two statement rows rather than both latching onto the first.
    for (const row of inRange) {
      if (usedRow.has(row.id)) continue;
      const c = free(row).find(c => c.day === row.date && samePenny(c.amount, row.amount));
      if (c) take(row, c, "exact");
    }
    // Pass 2 — same amount, a few days either side.
    for (const row of inRange) {
      if (usedRow.has(row.id)) continue;
      let best = null, bestScore = null;
      for (const c of free(row)) {
        if (!c.day || !samePenny(c.amount, row.amount)) continue;
        const gap = daysApart(c.day, row.date);
        if (gap > dayWindow) continue;
        const score = [gap, -similarity(row.description, c.label)];
        if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) { best = c; bestScore = score; }
      }
      if (best) take(row, best, "date-drift");
    }
    // Pass 3 — the date lines up but the amount doesn't, which is what catches a mistyped figure.
    // The DESCRIPTION IS NOT REQUIRED TO AGREE: what you type is a note to yourself ("Lunch"),
    // while the statement carries the acquirer's descriptor ("PRET A MANGER 4392 LONDON"), and
    // gating on that would report one transaction as two separate problems. So the pairing runs
    // on date proximity and on the amounts being close enough to be the same charge mistyped;
    // similarity only breaks ties between candidates that are otherwise equally plausible.
    for (const row of inRange) {
      if (usedRow.has(row.id)) continue;
      let best = null, bestScore = null;
      for (const c of free(row)) {
        if (!c.day) continue;
        const gap = daysApart(c.day, row.date);
        if (gap > dayWindow) continue;
        // Past a point two amounts are simply different transactions. Without this guard, a £30
        // cash spend and a forgotten £4.20 coffee on the same day would pair up and "correcting"
        // one would quietly destroy both.
        const drift = amountDrift(row.amount, c.amount);
        if (drift > amountTolerance) continue;
        const score = [gap, drift, -similarity(row.description, c.label)];
        if (!bestScore || lexLess(score, bestScore)) { best = c; bestScore = score; }
      }
      if (best) take(row, best, "amount");
    }

    const missingFromApp = inRange.filter(r => !usedRow.has(r.id));

    const notOnStatement = [], undated = [], outsideStatement = [];
    for (const c of cands) {
      if (usedCand.has(c.key)) continue;
      if (!c.day) { undated.push(c); continue; }
      // No usable rows at all means no coverage: nothing can be called missing from a
      // statement that says nothing. Same for a day the statement's span doesn't reach.
      if (!span || c.day < span.from || c.day > span.to) { outsideStatement.push(c); continue; }
      notOnStatement.push(c);
    }

    return {
      matched, amountMismatch, missingFromApp, notOnStatement,
      outOfRange, skipped, undated, outsideStatement,
      span,
      summary: {
        rows: all.length,
        matched: matched.length,
        amountMismatch: amountMismatch.length,
        missingFromApp: missingFromApp.length,
        notOnStatement: notOnStatement.length,
        outOfRange: outOfRange.length,
        skipped: skipped.length,
        undated: undated.length,
      },
    };
  }

  // ─── Reconciliation status, by logged item ──────────────────────────────────
  // The result buckets are organised by what needs doing. A view that lists what you LOGGED —
  // the week log alongside the findings — needs the opposite: given one logged item, what did
  // the statement say about it? This inverts the buckets once so such a view can annotate rows
  // without re-running the matcher or scanning the buckets per row.
  function statusIndex(result) {
    const out = Object.create(null);
    if (!result) return out;
    const put = (key, v) => { if (key != null && !(key in out)) out[key] = v; };
    for (const m of result.matched || []) put(m.candidate.key, { status: "matched", how: m.how, row: m.row });
    for (const m of result.amountMismatch || []) put(m.candidate.key, { status: "mismatch", delta: m.delta, row: m.row });
    for (const c of result.notOnStatement || []) put(c.key, { status: "extra" });
    // Not problems — the statement simply has nothing to say about these.
    for (const c of result.undated || []) put(c.key, { status: "undated" });
    for (const c of result.outsideStatement || []) put(c.key, { status: "uncovered" });
    return out;
  }

  // ─── Split re-weighting ─────────────────────────────────────────────────────
  // A split is one card transaction stored as two entries (a personal half that counts against
  // the budget, and an excluded half that doesn't). Correcting its total has to decide where the
  // difference lands; proportional is the honest default, and the caller shows both resulting
  // halves before the fix can be applied. Rounds to the penny with the remainder going to the
  // personal half, so the two always sum back to exactly `total`.
  function resplit(yourAmount, theirAmount, total) {
    const oldTotal = Math.round((Number(yourAmount) + Number(theirAmount)) * 100);
    const target = Math.round(Number(total) * 100);
    if (target <= 0) return { your: 0, their: 0 };
    if (oldTotal <= 0) return { your: Math.round(target) / 100, their: 0 };
    const their = Math.round((Number(theirAmount) * 100 / oldTotal) * target);
    const your = target - their;
    return { your: your / 100, their: their / 100 };
  }

  const API = {
    parseCSV, parseAmount, dateParts, detectDateFormat, parseDate,
    normaliseDescription, similarity, hashStr, rowFingerprint,
    sniffColumns, buildStatement, ignoreReasonFor,
    buildDayIndex, periodIndexFor, reconcile, statusIndex, resplit,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SpendReconcile = API;
})(typeof window !== "undefined" ? window : globalThis);
