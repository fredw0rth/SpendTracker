const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

const build = (csv) => {
  const { rows } = R.parseCSV(csv);
  return R.buildStatement(rows, R.sniffColumns(rows));
};
const CSV =
  "Date,Description,Amount\n" +
  "21/08/2026,TESCO STORES 3792 LONDON,25.50\n" +
  "22/08/2026,PRET A MANGER,4.20\n" +
  "22/08/2026,PRET A MANGER,4.20\n" +          // a genuine duplicate on the same day
  "23/08/2026,REFUND - ODEON,-8.00\n" +
  "25/08/2026,PAYMENT RECEIVED - THANK YOU,-300.00\n";

test("a saved statement comes back as the statement that was saved", () => {
  const before = build(CSV);
  const after = R.unpackStatement(R.packStatement(before));
  assert.equal(after.length, before.length);
  const shape = (r) => [r.date, r.description, r.amount, r.direction, r.ignored, r.ignoreReason, r.dupIndex, r.normDesc];
  assert.deepEqual(after.map(shape), before.map(shape));
});

test("fingerprints survive the round trip, so reconciled rows stay reconciled", () => {
  // This is the whole point: a reopened statement must still recognise what was already dealt
  // with, and `recon` stamps on entries are matched by fingerprint alone.
  const before = build(CSV);
  const after = R.unpackStatement(R.packStatement(before));
  assert.deepEqual(after.map(r => r.fingerprint), before.map(r => r.fingerprint));
});

test("duplicate rows keep their distinct identities across a save", () => {
  const after = R.unpackStatement(R.packStatement(build(CSV)));
  const prets = after.filter(r => r.description === "PRET A MANGER");
  assert.equal(prets.length, 2);
  assert.deepEqual(prets.map(r => r.dupIndex), [0, 1]);
  assert.notEqual(prets[0].fingerprint, prets[1].fingerprint);
});

test("card payments are still recognised after a reload", () => {
  const after = R.unpackStatement(R.packStatement(build(CSV)));
  const payment = after.find(r => /PAYMENT RECEIVED/.test(r.description));
  assert.equal(payment.ignored, true);
  assert.equal(payment.ignoreReason, "Card payment");
});

test("a saved statement reconciles identically to the freshly parsed one", () => {
  const dayKeys = [];
  for (let d = 1; d <= 31; d++) dayKeys.push("2026-08-" + String(d).padStart(2, "0"));
  const dayIndex = R.buildDayIndex([{ archiveIndex: null, weeks: [{ index: 1, dayKeys }] }]);
  const candidates = [
    { key: "e1", kind: "entry", day: "2026-08-21", amount: 25.5, label: "Tesco", direction: "debit", recon: null, ref: {} },
    { key: "e2", kind: "entry", day: "2026-08-22", amount: 3.0, label: "Coffee", direction: "debit", recon: null, ref: {} },
  ];
  const fresh = R.reconcile({ statement: build(CSV), candidates, dayIndex });
  const saved = R.reconcile({ statement: R.unpackStatement(R.packStatement(build(CSV))), candidates, dayIndex });
  assert.deepEqual(saved.summary, fresh.summary);
  assert.deepEqual(saved.matched.map(m => m.candidate.key), fresh.matched.map(m => m.candidate.key));
  assert.deepEqual(saved.amountMismatch.map(m => m.candidate.key), fresh.amountMismatch.map(m => m.candidate.key));
});

test("the packed form carries only what cannot be recomputed", () => {
  const packed = R.packStatement(build(CSV));
  assert.deepEqual(Object.keys(packed[0]).sort(), ["a", "c", "d", "t"]);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(build(CSV)).length,
    "saving the parsed rows verbatim would put roughly three times as much through the encrypted vault");
});

test("the span is what the statement actually covers", () => {
  assert.deepEqual(R.statementSpan(build(CSV)), { from: "2026-08-21", to: "2026-08-25" });
  assert.equal(R.statementSpan([]), null);
  assert.equal(R.statementSpan(null), null);
});

test("a corrupt or half-written saved statement does not take the app down", () => {
  assert.deepEqual(R.unpackStatement(null), []);
  assert.deepEqual(R.unpackStatement([]), []);
  assert.deepEqual(R.unpackStatement([null, undefined, {}, { d: "" }]), []);
  assert.deepEqual(R.unpackStatement([{ d: "2026-08-01", a: 0 }]), [], "a zero amount is not a transaction");
  const odd = R.unpackStatement([{ d: "2026-08-01", t: null, a: "12.5", c: 1 }]);
  assert.equal(odd.length, 1);
  assert.equal(odd[0].amount, 12.5);
  assert.equal(odd[0].direction, "credit");
  assert.equal(odd[0].description, "");
});

test("packing tolerates rubbish rather than throwing", () => {
  assert.deepEqual(R.packStatement(null), []);
  assert.deepEqual(R.packStatement([null, {}, { date: "" }]), []);
});
