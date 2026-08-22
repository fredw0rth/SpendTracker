const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

const sniff = (csv) => {
  const { rows } = R.parseCSV(csv);
  return { rows, map: R.sniffColumns(rows) };
};

test("Amex: signed amount column, charges positive", () => {
  const { map } = sniff(
    "Date,Description,Amount\n" +
    "01/08/2026,TESCO STORES 3792,12.50\n" +
    "02/08/2026,PRET A MANGER,4.20\n" +
    "25/08/2026,PAYMENT RECEIVED - THANK YOU,-300.00\n");
  assert.equal(map.hasHeader, true);
  assert.equal(map.dateCol, 0);
  assert.equal(map.descCol, 1);
  assert.equal(map.amountCol, 2);
  assert.equal(map.debitCol, null);
  assert.equal(map.spendIsPositive, true);
  assert.equal(map.confidence, "high");
});

test("Monzo-style: signed amount column, spends negative", () => {
  const { map } = sniff(
    "Date,Name,Amount\n" +
    "01/08/2026,Tesco,-12.50\n" +
    "02/08/2026,Pret,-4.20\n" +
    "03/08/2026,Refund,3.00\n");
  assert.equal(map.spendIsPositive, false, "the majority sign is the spend sign");
});

test("Lloyds: separate debit and credit columns", () => {
  const { map } = sniff(
    "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance\n" +
    "01/08/2026,DEB,'30-00-00,12345678,TESCO STORES,12.50,,1000.00\n" +
    "02/08/2026,CR,'30-00-00,12345678,SALARY,,2000.00,3000.00\n");
  assert.equal(map.dateCol, 0);
  assert.equal(map.descCol, 4);
  assert.equal(map.debitCol, 5);
  assert.equal(map.creditCol, 6);
});

test("HSBC: money in / money out wording", () => {
  const { map } = sniff(
    "Date,Description,Paid out,Paid in,Balance\n" +
    "01/08/2026,TESCO STORES,12.50,,1000.00\n" +
    "02/08/2026,REFUND,,3.00,1003.00\n");
  assert.equal(map.debitCol, 2);
  assert.equal(map.creditCol, 3);
  assert.equal(map.descCol, 1);
});

test("a lone debit column with no credit twin is treated as the amount", () => {
  const { map } = sniff("Date,Description,Debit\n01/08/2026,TESCO,12.50\n");
  assert.equal(map.debitCol, null);
  assert.equal(map.amountCol, 2);
});

test("headerless files are sniffed from content", () => {
  const { map } = sniff(
    "01/08/2026,TESCO STORES LONDON,12.50\n" +
    "02/08/2026,PRET A MANGER LONDON,4.20\n" +
    "03/08/2026,ODEON CINEMA LONDON,18.00\n");
  assert.equal(map.hasHeader, false);
  assert.equal(map.dateCol, 0);
  assert.equal(map.amountCol, 2);
  assert.equal(map.descCol, 1);
});

test("columns in an unusual order are still found", () => {
  const { map } = sniff(
    "Amount,Description,Date\n" +
    "12.50,TESCO STORES,01/08/2026\n" +
    "4.20,PRET A MANGER,02/08/2026\n");
  assert.equal(map.dateCol, 2);
  assert.equal(map.descCol, 1);
  assert.equal(map.amountCol, 0);
});

test("the date format is detected from the date column, not guessed per row", () => {
  const { map } = sniff("Date,Description,Amount\n01/08/2026,A,1.00\n25/08/2026,B,2.00\n");
  assert.equal(map.dateFormat, "DMY");
  assert.equal(map.dateAmbiguous, false);

  const us = sniff("Date,Description,Amount\n08/25/2026,A,1.00\n08/01/2026,B,2.00\n");
  assert.equal(us.map.dateFormat, "MDY");
  assert.equal(us.map.dateAmbiguous, false);
});

test("an ambiguous date column is reported so the UI can ask", () => {
  const { map } = sniff("Date,Description,Amount\n03/04/2026,A,1.00\n05/06/2026,B,2.00\n");
  assert.equal(map.dateAmbiguous, true);
});

test("an unreadable file reports no confidence instead of guessing", () => {
  const map = R.sniffColumns([]);
  assert.equal(map.confidence, "none");
  assert.equal(map.dateCol, null);
});

// ─── buildStatement ───────────────────────────────────────────────────────────

const build = (csv) => {
  const { rows } = R.parseCSV(csv);
  return R.buildStatement(rows, R.sniffColumns(rows));
};

test("builds normalised rows with amount always positive and sign in direction", () => {
  const st = build(
    "Date,Description,Amount\n" +
    "01/08/2026,TESCO STORES 3792,12.50\n" +
    "03/08/2026,REFUND ODEON,-8.00\n");
  assert.equal(st.length, 2);
  assert.deepEqual(
    st.map(r => [r.date, r.amount, r.direction]),
    [["2026-08-01", 12.5, "debit"], ["2026-08-03", 8, "credit"]]);
});

test("a spends-negative file is normalised to the same shape", () => {
  const st = build("Date,Name,Amount\n01/08/2026,Tesco,-12.50\n02/08/2026,Pret,-4.20\n03/08/2026,Refund,3.00\n");
  assert.deepEqual(st.map(r => r.direction), ["debit", "debit", "credit"]);
  assert.deepEqual(st.map(r => r.amount), [12.5, 4.2, 3]);
});

test("debit/credit columns resolve direction by which cell is filled", () => {
  const st = build(
    "Date,Description,Paid out,Paid in\n" +
    "01/08/2026,TESCO STORES,12.50,\n" +
    "02/08/2026,REFUND,,3.00\n");
  assert.deepEqual(st.map(r => [r.amount, r.direction]), [[12.5, "debit"], [3, "credit"]]);
});

test("card payments and transfers are flagged, not silently dropped", () => {
  const st = build(
    "Date,Description,Amount\n" +
    "01/08/2026,TESCO STORES,12.50\n" +
    "25/08/2026,PAYMENT RECEIVED - THANK YOU,-300.00\n" +
    "26/08/2026,TRANSFER TO SAVINGS,50.00\n");
  assert.equal(st.length, 3, "still present, so the user can see them");
  assert.deepEqual(st.map(r => r.ignored), [false, true, true]);
  assert.equal(st[1].ignoreReason, "Card payment");
  assert.equal(st[2].ignoreReason, "Transfer");
});

test("footer and total lines without a usable date are dropped", () => {
  const st = build(
    "Date,Description,Amount\n" +
    "01/08/2026,TESCO STORES,12.50\n" +
    ",Total,12.50\n" +
    "Balance carried forward,,\n");
  assert.equal(st.length, 1);
});

test("identical spends on the same day get distinct fingerprints", () => {
  const st = build("Date,Description,Amount\n01/08/2026,TESCO,5.00\n01/08/2026,TESCO,5.00\n");
  assert.equal(st.length, 2);
  assert.equal(st[0].dupIndex, 0);
  assert.equal(st[1].dupIndex, 1);
  assert.notEqual(st[0].fingerprint, st[1].fingerprint);
});

test("zero-value rows are skipped", () => {
  const st = build("Date,Description,Amount\n01/08/2026,NOTHING,0.00\n02/08/2026,TESCO,5.00\n");
  assert.deepEqual(st.map(r => r.description), ["TESCO"]);
});
