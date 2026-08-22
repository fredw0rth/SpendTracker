const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

test("parses a plain comma file", () => {
  const { rows, delimiter } = R.parseCSV("Date,Description,Amount\n01/08/2026,TESCO,12.50\n");
  assert.equal(delimiter, ",");
  assert.deepEqual(rows, [["Date", "Description", "Amount"], ["01/08/2026", "TESCO", "12.50"]]);
});

test("keeps commas inside quoted fields", () => {
  const { rows } = R.parseCSV('Date,Description,Amount\n01/08/2026,"TESCO STORES 3792, LONDON",12.50\n');
  assert.equal(rows[1][1], "TESCO STORES 3792, LONDON");
  assert.equal(rows[1].length, 3);
});

test("unescapes doubled quotes", () => {
  const { rows } = R.parseCSV('A,B\n1,"say ""hi"" now"\n');
  assert.equal(rows[1][1], 'say "hi" now');
});

test("keeps newlines inside quoted fields", () => {
  const { rows } = R.parseCSV('A,B\n1,"line one\nline two"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], "line one\nline two");
});

test("handles CRLF line endings", () => {
  const { rows } = R.parseCSV("A,B\r\n1,2\r\n3,4\r\n");
  assert.deepEqual(rows, [["A", "B"], ["1", "2"], ["3", "4"]]);
});

test("handles lone-CR line endings", () => {
  const { rows } = R.parseCSV("A,B\r1,2\r");
  assert.deepEqual(rows, [["A", "B"], ["1", "2"]]);
});

test("strips a leading BOM", () => {
  const { rows } = R.parseCSV("﻿Date,Amount\n01/08/2026,1.00\n");
  assert.equal(rows[0][0], "Date");
});

test("sniffs a semicolon delimiter", () => {
  const { rows, delimiter } = R.parseCSV("Date;Description;Amount\n01/08/2026;TESCO;12,50\n");
  assert.equal(delimiter, ";");
  assert.equal(rows[1][1], "TESCO");
});

test("sniffs a tab delimiter", () => {
  const { rows, delimiter } = R.parseCSV("Date\tDescription\tAmount\n01/08/2026\tTESCO\t12.50\n");
  assert.equal(delimiter, "\t");
  assert.equal(rows[1].length, 3);
});

test("does not split on commas when the file is tab-delimited", () => {
  const { rows, delimiter } = R.parseCSV("Date\tDescription\n01/08/2026\tTESCO, LONDON\n");
  assert.equal(delimiter, "\t");
  assert.equal(rows[1][1], "TESCO, LONDON");
});

test("tolerates ragged rows", () => {
  const { rows } = R.parseCSV("A,B,C\n1,2,3\n4,5\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[2].length, 2);
});

test("drops blank lines but keeps genuinely empty cells", () => {
  const { rows } = R.parseCSV("A,B\n\n1,\n");
  assert.deepEqual(rows, [["A", "B"], ["1", ""]]);
});

test("returns nothing for empty input", () => {
  assert.deepEqual(R.parseCSV("").rows, []);
  assert.deepEqual(R.parseCSV("   \n  \n").rows, []);
});

test("honours a forced delimiter", () => {
  const { rows } = R.parseCSV("a;b,c\n", ",");
  assert.deepEqual(rows, [["a;b", "c"]]);
});
