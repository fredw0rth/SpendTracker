const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

// ─── Amounts ──────────────────────────────────────────────────────────────────

test("reads plain and currency-prefixed amounts", () => {
  assert.deepEqual(R.parseAmount("12.50"), { value: 12.5, ok: true });
  assert.deepEqual(R.parseAmount("£12.50"), { value: 12.5, ok: true });
  assert.deepEqual(R.parseAmount(" £1,234.56 "), { value: 1234.56, ok: true });
  assert.deepEqual(R.parseAmount("1,234"), { value: 1234, ok: true });
});

test("reads every negative convention banks use", () => {
  assert.equal(R.parseAmount("-12.34").value, -12.34);
  assert.equal(R.parseAmount("(12.34)").value, -12.34);
  assert.equal(R.parseAmount("12.34-").value, -12.34);
  assert.equal(R.parseAmount("−12.34").value, -12.34, "unicode minus");
  assert.equal(R.parseAmount("–12.34").value, -12.34, "en dash");
  assert.equal(R.parseAmount("-£12.34").value, -12.34);
  assert.equal(R.parseAmount("£-12.34").value, -12.34);
});

test("CR marks money in, DR leaves the sign alone", () => {
  assert.equal(R.parseAmount("12.34 CR").value, -12.34);
  assert.equal(R.parseAmount("CR 12.34").value, -12.34);
  assert.equal(R.parseAmount("12.34 DR").value, 12.34);
});

test("rejects cells that are not amounts", () => {
  assert.equal(R.parseAmount("").ok, false);
  assert.equal(R.parseAmount(null).ok, false);
  assert.equal(R.parseAmount(undefined).ok, false);
  assert.equal(R.parseAmount("-").ok, false, "empty debit cell on a two-column layout");
  assert.equal(R.parseAmount("TESCO").ok, false);
  assert.equal(R.parseAmount("12.3.4").ok, false);
});

test("rounds to the penny", () => {
  assert.equal(R.parseAmount("12.005").value, 12.01);
  assert.equal(R.parseAmount("0.1").value, 0.1);
  assert.equal(R.parseAmount("+7").value, 7);
});

// ─── Date format detection ────────────────────────────────────────────────────

test("proves DD/MM from a day above 12", () => {
  const r = R.detectDateFormat(["01/08/2026", "31/08/2026", "15/08/2026"]);
  assert.equal(r.format, "DMY");
  assert.equal(r.ambiguous, false);
});

test("proves MM/DD from a second component above 12", () => {
  const r = R.detectDateFormat(["08/01/2026", "08/31/2026"]);
  assert.equal(r.format, "MDY");
  assert.equal(r.ambiguous, false);
});

test("falls back to DD/MM and flags a fully ambiguous column", () => {
  const r = R.detectDateFormat(["03/04/2026", "05/06/2026"]);
  assert.equal(r.format, "DMY");
  assert.equal(r.ambiguous, true, "the UI must offer a toggle here");
});

test("flags a column with contradictory evidence rather than trusting it", () => {
  const r = R.detectDateFormat(["31/01/2026", "01/31/2026"]);
  assert.equal(r.ambiguous, true);
});

test("one proving row settles the whole column", () => {
  // Every other row here reads happily as MM/DD; the 25th proves it is not.
  const r = R.detectDateFormat(["01/08/2026", "02/08/2026", "25/08/2026"]);
  assert.equal(r.format, "DMY");
  assert.equal(r.ambiguous, false);
});

// ─── Date parsing ─────────────────────────────────────────────────────────────

test("parses each layout to the app's day key", () => {
  assert.equal(R.parseDate("01/08/2026", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("08/01/2026", "MDY"), "2026-08-01");
  assert.equal(R.parseDate("2026-08-01", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("2026/08/01", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("1 Aug 2026", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("01-AUG-26", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("15 August 2026", "DMY"), "2026-08-15");
  assert.equal(R.parseDate("Aug 15, 2026", "DMY"), "2026-08-15");
});

test("an ISO date ignores the column's DD/MM vs MM/DD setting", () => {
  assert.equal(R.parseDate("2026-08-01", "MDY"), "2026-08-01");
});

test("zero-pads, so day keys sort as strings", () => {
  assert.equal(R.parseDate("1/8/2026", "DMY"), "2026-08-01");
  assert.ok("2026-08-01" < "2026-08-10");
});

test("expands two-digit years either side of the 70 cutoff", () => {
  assert.equal(R.parseDate("01/08/26", "DMY"), "2026-08-01");
  assert.equal(R.parseDate("01/08/99", "DMY"), "1999-08-01");
});

test("rejects dates that do not exist", () => {
  assert.equal(R.parseDate("31/02/2026", "DMY"), null);
  assert.equal(R.parseDate("32/01/2026", "DMY"), null);
  assert.equal(R.parseDate("13/01/2026", "MDY"), null, "month 13");
  assert.equal(R.parseDate("", "DMY"), null);
  assert.equal(R.parseDate("Balance carried forward", "DMY"), null);
  assert.equal(R.parseDate(null, "DMY"), null);
});

test("accepts a real leap day and rejects a fake one", () => {
  assert.equal(R.parseDate("29/02/2024", "DMY"), "2024-02-29");
  assert.equal(R.parseDate("29/02/2026", "DMY"), null);
});

// ─── Descriptions ─────────────────────────────────────────────────────────────

test("strips card-network noise from a merchant name", () => {
  assert.equal(R.normaliseDescription("TESCO STORES 3792"), "TESCO STORES");
  assert.equal(R.normaliseDescription("CARD PAYMENT TO TESCO ON 12 AUG"), "TESCO");
  assert.equal(R.normaliseDescription("tesco stores"), "TESCO STORES");
  assert.equal(R.normaliseDescription("AMZNMktplace XXXX1234"), "AMZNMKTPLACE");
  assert.equal(R.normaliseDescription("Pret A Manger LTD"), "PRET A MANGER");
});

test("normalising is stable and handles empties", () => {
  assert.equal(R.normaliseDescription(""), "");
  assert.equal(R.normaliseDescription(null), "");
  assert.equal(R.normaliseDescription("   "), "");
});

test("similarity ranks the same merchant above a different one", () => {
  assert.equal(R.similarity("TESCO", "TESCO"), 1);
  assert.ok(R.similarity("TESCO STORES 3792", "Tesco") > 0.4);
  assert.ok(R.similarity("TESCO STORES 3792", "Tesco") > R.similarity("TESCO STORES 3792", "Odeon Cinema"));
  assert.equal(R.similarity("TESCO", ""), 0);
});

// ─── Fingerprints ─────────────────────────────────────────────────────────────

test("a fingerprint is stable for the same row and differs for a changed one", () => {
  const row = { date: "2026-08-01", normDesc: "TESCO", amount: 12.5, dupIndex: 0 };
  assert.equal(R.rowFingerprint(row), R.rowFingerprint({ ...row }));
  assert.notEqual(R.rowFingerprint(row), R.rowFingerprint({ ...row, amount: 12.51 }));
  assert.notEqual(R.rowFingerprint(row), R.rowFingerprint({ ...row, date: "2026-08-02" }));
  assert.notEqual(R.rowFingerprint(row), R.rowFingerprint({ ...row, dupIndex: 1 }),
    "two identical spends on one day must fingerprint differently");
});
