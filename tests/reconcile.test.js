const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

// Helpers ─────────────────────────────────────────────────────────────────────
// A statement row as buildStatement would produce it.
let n = 0;
function row(date, description, amount, extra) {
  const r = Object.assign({
    id: "s" + (n++), date, description,
    normDesc: R.normaliseDescription(description),
    amount, direction: "debit", ignored: false, ignoreReason: "", dupIndex: 0,
  }, extra || {});
  r.fingerprint = R.rowFingerprint(r);
  return r;
}
// A logged candidate as app.jsx would flatten an entry/split/pin into.
function cand(key, day, amount, label, extra) {
  return Object.assign({ key, kind: "entry", day, amount, label, method: "Amex", recon: null, ref: {} }, extra || {});
}
// A day index covering all of August 2026 as one period, one week.
function augustIndex() {
  const dayKeys = [];
  for (let d = 1; d <= 31; d++) dayKeys.push("2026-08-" + String(d).padStart(2, "0"));
  return R.buildDayIndex([{ archiveIndex: null, weeks: [{ index: 1, dayKeys }] }]);
}

test("an exact same-day, same-amount pair matches", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO STORES 3792", 12.5)],
    candidates: [cand("e1", "2026-08-01", 12.5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].how, "exact");
  assert.equal(res.missingFromApp.length, 0);
  assert.equal(res.notOnStatement.length, 0);
});

test("a spend posted a few days late still matches", () => {
  const res = R.reconcile({
    statement: [row("2026-08-04", "TESCO STORES 3792", 12.5)],
    candidates: [cand("e1", "2026-08-01", 12.5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].how, "date-drift");
});

test("a spend outside the drift window is not matched", () => {
  const res = R.reconcile({
    statement: [row("2026-08-02", "PRET A MANGER", 4), row("2026-08-20", "TESCO STORES 3792", 12.5)],
    candidates: [cand("e1", "2026-08-10", 12.5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 0, "10 days apart is not a late posting");
  assert.equal(res.missingFromApp.length, 2);
  assert.equal(res.notOnStatement.length, 1);
});

test("a mistyped amount is reported as a mismatch, not as two problems", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "ODEON CINEMA", 18.0)],
    candidates: [cand("e1", "2026-08-01", 8.0, "Odeon Cinema")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.amountMismatch[0].delta, 10);
  assert.equal(res.missingFromApp.length, 0);
  assert.equal(res.notOnStatement.length, 0);
});

test("two identical spends on one day pair one-to-one", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5), row("2026-08-01", "TESCO", 5, { dupIndex: 1 })],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", "2026-08-01", 5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 2);
  assert.equal(new Set(res.matched.map(m => m.candidate.key)).size, 2, "must not both latch onto one entry");
  assert.equal(res.missingFromApp.length, 0);
  assert.equal(res.notOnStatement.length, 0);
});

test("logging a spend twice leaves the duplicate flagged", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5)],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", "2026-08-01", 5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.notOnStatement.length, 1);
});

test("a statement row with nothing logged is missing from the app", () => {
  const res = R.reconcile({
    statement: [row("2026-08-05", "GAIL'S BAKERY", 6.4)],
    candidates: [],
    dayIndex: augustIndex(),
  });
  assert.equal(res.missingFromApp.length, 1);
  assert.equal(res.missingFromApp[0].description, "GAIL'S BAKERY");
});

test("an entry the statement never mentions is flagged", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5)],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", "2026-08-01", 30, "Cash for haircut")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.notOnStatement.length, 1);
  assert.equal(res.notOnStatement[0].key, "e2");
});

test("entries outside the statement's own date span are not flagged as missing", () => {
  // The statement covers 1–3 Aug; the period also contains late July.
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5), row("2026-08-03", "PRET", 4)],
    candidates: [
      cand("e1", "2026-08-01", 5, "Tesco"),
      cand("e2", "2026-08-03", 4, "Pret"),
      cand("e3", "2026-07-28", 20, "Logged before this statement starts"),
    ],
    dayIndex: R.buildDayIndex([{ archiveIndex: null, weeks: [{ index: 1, dayKeys: ["2026-07-28", "2026-08-01", "2026-08-03"] }] }]),
  });
  assert.equal(res.notOnStatement.length, 0, "the statement says nothing about late July");
  assert.equal(res.outsideStatement.length, 1);
  assert.equal(res.outsideStatement[0].key, "e3");
});

test("rows outside every tracked period are set aside, not matched", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5), row("2025-01-01", "OLD THING", 9)],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.outOfRange.length, 1);
  assert.equal(res.outOfRange[0].date, "2025-01-01");
  assert.equal(res.matched.length, 1);
});

test("ignored rows never reach the matcher", () => {
  const res = R.reconcile({
    statement: [
      row("2026-08-01", "TESCO", 5),
      row("2026-08-25", "PAYMENT RECEIVED - THANK YOU", 300, { direction: "credit", ignored: true, ignoreReason: "Card payment" }),
    ],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.skipped.length, 1);
  assert.equal(res.missingFromApp.length, 0, "a card payment must never be offered as a spend to add");
});

test("a refund is surfaced as an incoming row", () => {
  const res = R.reconcile({
    statement: [row("2026-08-06", "REFUND ODEON", 8, { direction: "credit" })],
    candidates: [],
    dayIndex: augustIndex(),
  });
  assert.equal(res.missingFromApp.length, 1);
  assert.equal(res.missingFromApp[0].direction, "credit", "the UI offers this as a credit, not a spend");
});

test("undated entries are set aside rather than judged", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5)],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", null, 9, "Undated old entry")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.undated.length, 1);
  assert.equal(res.notOnStatement.length, 0);
});

test("a split reconciles as one transaction at the group total", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "DISHOOM", 60)],
    candidates: [cand("g1", "2026-08-01", 60, "Dishoom", {
      kind: "split", ref: { your: { id: "a", amount: 30 }, their: { id: "b", amount: 30 } },
    })],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1, "must match the £60 total, not look for two £30 rows");
  assert.equal(res.missingFromApp.length, 0);
});

test("a split whose total is wrong is reported against the total", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "DISHOOM", 60)],
    candidates: [cand("g1", "2026-08-01", 50, "Dishoom", {
      kind: "split", ref: { your: { id: "a", amount: 25 }, their: { id: "b", amount: 25 } },
    })],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.amountMismatch[0].delta, 10);
  assert.equal(res.amountMismatch[0].candidate.kind, "split");
});

test("a pinned cost matches exactly like any other transaction", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "NETFLIX.COM", 10.99)],
    candidates: [cand("p1", "2026-08-01", 10.99, "Netflix", { kind: "pin", ref: { pinId: "x", occKey: "2026-7-1" } })],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].candidate.kind, "pin");
});

test("a pinned cost charged at a new price is a mismatch it can act on", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "RENT", 950)],
    candidates: [cand("p1", "2026-08-01", 900, "Rent", { kind: "pin", ref: { pinId: "x", occKey: "2026-7-1" } })],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.amountMismatch[0].candidate.kind, "pin");
  assert.equal(res.amountMismatch[0].delta, 50);
});

test("a pinned cost absent from the statement is flagged like any entry", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "TESCO", 5)],
    candidates: [
      cand("e1", "2026-08-01", 5, "Tesco"),
      cand("p1", "2026-08-01", 10.99, "Netflix", { kind: "pin", ref: { pinId: "x", occKey: "2026-7-1" } }),
    ],
    dayIndex: augustIndex(),
  });
  assert.equal(res.notOnStatement.length, 1);
  assert.equal(res.notOnStatement[0].kind, "pin", "so the UI can offer 'skip this occurrence'");
});

test("re-uploading the same statement re-matches instead of re-flagging", () => {
  const st = [row("2026-08-01", "TESCO STORES 3792", 12.5)];
  // First pass leaves nothing logged; the user adds it, stamped with the row's fingerprint.
  const first = R.reconcile({ statement: st, candidates: [], dayIndex: augustIndex() });
  assert.equal(first.missingFromApp.length, 1);
  const fp = first.missingFromApp[0].fingerprint;

  // Second upload: the entry now carries that fingerprint. Even with a date the drift window
  // would miss and a description that no longer resembles the merchant, it is still recognised.
  const second = R.reconcile({
    statement: st,
    candidates: [cand("e1", "2026-08-19", 12.5, "renamed beyond recognition", { recon: fp })],
    dayIndex: augustIndex(),
  });
  assert.equal(second.matched.length, 1);
  assert.equal(second.matched[0].how, "remembered");
  assert.equal(second.missingFromApp.length, 0);
});

test("summary counts every row exactly once", () => {
  const res = R.reconcile({
    statement: [
      row("2026-08-01", "TESCO", 5),
      row("2026-08-02", "ODEON", 18),
      row("2026-08-03", "GAILS", 6.4),
      row("2026-08-25", "PAYMENT RECEIVED", 300, { ignored: true, ignoreReason: "Card payment" }),
      row("2025-01-01", "ANCIENT", 9),
    ],
    candidates: [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", "2026-08-02", 8, "Odeon")],
    dayIndex: augustIndex(),
  });
  const s = res.summary;
  assert.equal(s.matched + s.amountMismatch + s.missingFromApp + s.outOfRange + s.skipped, s.rows);
  assert.deepEqual([s.matched, s.amountMismatch, s.missingFromApp, s.outOfRange, s.skipped], [1, 1, 1, 1, 1]);
});

test("matching is order-independent", () => {
  const build = (st, cs) => R.reconcile({ statement: st, candidates: cs, dayIndex: augustIndex() });
  const st = [row("2026-08-01", "TESCO", 5), row("2026-08-02", "PRET", 4), row("2026-08-03", "ODEON", 18)];
  const cs = [cand("e1", "2026-08-01", 5, "Tesco"), cand("e2", "2026-08-02", 4, "Pret"), cand("e3", "2026-08-03", 18, "Odeon")];
  const a = build(st, cs);
  const b = build(st.slice().reverse(), cs.slice().reverse());
  assert.equal(a.matched.length, 3);
  assert.equal(b.matched.length, 3);
  assert.deepEqual(
    a.matched.map(m => m.candidate.key).sort(),
    b.matched.map(m => m.candidate.key).sort());
});

test("an empty statement reports everything as unknown rather than crashing", () => {
  const res = R.reconcile({ statement: [], candidates: [cand("e1", "2026-08-01", 5, "Tesco")], dayIndex: augustIndex() });
  assert.equal(res.matched.length, 0);
  assert.equal(res.notOnStatement.length, 0, "with no statement span, nothing can be called missing");
  assert.equal(res.outsideStatement.length, 1);
  assert.equal(res.span, null);
});

test("reconcile copes with no arguments at all", () => {
  const res = R.reconcile();
  assert.equal(res.summary.rows, 0);
});

test("a refund matches a logged credit, never a spend of the same size", () => {
  const refund = row("2026-08-06", "REFUND ODEON", 8, { direction: "credit" });
  const spend = cand("e1", "2026-08-06", 8, "Odeon");                                  // money out
  const credit = cand("c1", "2026-08-06", 8, "Odeon refund", { kind: "credit", direction: "credit" });

  const wrong = R.reconcile({ statement: [refund], candidates: [spend], dayIndex: augustIndex() });
  assert.equal(wrong.matched.length, 0, "a refund is not the same event as an £8 purchase");
  assert.equal(wrong.missingFromApp.length, 1);

  const right = R.reconcile({ statement: [refund], candidates: [credit], dayIndex: augustIndex() });
  assert.equal(right.matched.length, 1);
});

test("a spend never matches a logged credit", () => {
  const res = R.reconcile({
    statement: [row("2026-08-06", "ODEON", 8)],
    candidates: [cand("c1", "2026-08-06", 8, "Odeon refund", { kind: "credit", direction: "credit" })],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 0);
  assert.equal(res.missingFromApp.length, 1);
});

// ─── Matching on date and amount, not on what you called it ───────────────────

test("a mistyped amount is caught even when the names share nothing", () => {
  // You logged "Lunch"; the statement calls it "PRET A MANGER 4392 LONDON". Requiring the names
  // to agree would report one transaction as a missing spend AND an extra entry.
  const res = R.reconcile({
    statement: [row("2026-08-01", "PRET A MANGER 4392 LONDON", 12.4)],
    candidates: [cand("e1", "2026-08-01", 4.2, "Lunch")],
    dayIndex: augustIndex(),
  });
  assert.equal(R.similarity("PRET A MANGER 4392 LONDON", "Lunch"), 0, "no name signal at all");
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.missingFromApp.length, 0);
  assert.equal(res.notOnStatement.length, 0);
});

test("a late posting matches on amount alone, whatever it is called", () => {
  const res = R.reconcile({
    statement: [row("2026-08-04", "SQ *THE COFFEE JAR", 3.6)],
    candidates: [cand("e1", "2026-08-01", 3.6, "Flat white")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].how, "date-drift");
});

test("amounts too far apart are left as two separate problems", () => {
  // A £30 cash spend and a forgotten £4.20 coffee on the same day are not one mistyped charge.
  const res = R.reconcile({
    statement: [row("2026-08-01", "PRET A MANGER", 4.2)],
    candidates: [cand("e1", "2026-08-01", 30, "Haircut, cash")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 0, "pairing these would destroy both if corrected");
  assert.equal(res.missingFromApp.length, 1);
  assert.equal(res.notOnStatement.length, 1);
});

test("the tolerance boundary is where it says it is", () => {
  const at = (logged) => R.reconcile({
    statement: [row("2026-08-01", "SHOP", 100)],
    candidates: [cand("e1", "2026-08-01", logged, "Thing")],
    dayIndex: augustIndex(),
  }).amountMismatch.length;
  assert.equal(at(25), 1, "75% drift is still the same transaction");
  assert.equal(at(24), 0, "76% is not");
});

test("the closest amount wins when several could be the one", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "SHOP", 20)],
    candidates: [cand("e1", "2026-08-01", 9, "A"), cand("e2", "2026-08-01", 18, "B")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.amountMismatch[0].candidate.key, "e2");
});

test("the nearer date wins over the closer amount", () => {
  const res = R.reconcile({
    statement: [row("2026-08-04", "SHOP", 20)],
    candidates: [cand("e1", "2026-08-04", 12, "same day, further amount"),
                 cand("e2", "2026-08-02", 19, "closer amount, two days off")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch[0].candidate.key, "e1");
});

test("the description breaks a tie it cannot decide on its own", () => {
  // Both candidates are the same distance out on date and amount; only the name separates them.
  const res = R.reconcile({
    statement: [row("2026-08-01", "ODEON CINEMA LEICESTER SQ", 20)],
    candidates: [cand("e1", "2026-08-01", 15, "Tesco big shop"),
                 cand("e2", "2026-08-01", 15, "Odeon cinema")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.amountMismatch.length, 1);
  assert.equal(res.amountMismatch[0].candidate.key, "e2");
});

test("an exact amount is always preferred over a near one", () => {
  const res = R.reconcile({
    statement: [row("2026-08-01", "SHOP", 20)],
    candidates: [cand("e1", "2026-08-01", 19, "nearly"), cand("e2", "2026-08-01", 20, "exactly")],
    dayIndex: augustIndex(),
  });
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].candidate.key, "e2");
  assert.equal(res.notOnStatement.length, 1, "and the near miss stays flagged rather than paired");
});

test("the tolerance is adjustable", () => {
  const opts = { statement: [row("2026-08-01", "SHOP", 100)], candidates: [cand("e1", "2026-08-01", 30, "Thing")], dayIndex: augustIndex() };
  assert.equal(R.reconcile({ ...opts, amountTolerance: 0.9 }).amountMismatch.length, 1);
  assert.equal(R.reconcile({ ...opts, amountTolerance: 0.5 }).amountMismatch.length, 0);
});
