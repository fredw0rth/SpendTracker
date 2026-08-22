const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

// Two consecutive pay periods, payday on the 25th: July's period ends 24 Aug, August's begins
// 25 Aug. Live is listed first, exactly as app.jsx builds it.
const periods = [
  { archiveIndex: null, weeks: [
    { index: 1, dayKeys: ["2026-08-25", "2026-08-26", "2026-08-27"] },
    { index: 2, dayKeys: ["2026-08-28", "2026-08-29", "2026-08-30"] },
  ] },
  { archiveIndex: 0, weeks: [
    { index: 1, dayKeys: ["2026-07-25", "2026-07-26"] },
    { index: 2, dayKeys: ["2026-08-23", "2026-08-24"] },
  ] },
];
const index = R.buildDayIndex(periods);

test("a day in the live period routes to the live period and its week", () => {
  assert.deepEqual(R.periodIndexFor("2026-08-26", index), { archiveIndex: null, weekIndex: 1 });
  assert.deepEqual(R.periodIndexFor("2026-08-29", index), { archiveIndex: null, weekIndex: 2 });
});

test("a day in an archived period routes to that archive", () => {
  assert.deepEqual(R.periodIndexFor("2026-07-25", index), { archiveIndex: 0, weekIndex: 1 });
  assert.deepEqual(R.periodIndexFor("2026-08-23", index), { archiveIndex: 0, weekIndex: 2 });
});

test("a statement spanning a payday routes each side to its own period", () => {
  // This is the whole reason reconciliation looks at archives at all.
  const before = R.periodIndexFor("2026-08-24", index);
  const after = R.periodIndexFor("2026-08-25", index);
  assert.equal(before.archiveIndex, 0);
  assert.equal(after.archiveIndex, null);
});

test("a day outside every tracked period has no home", () => {
  assert.equal(R.periodIndexFor("2025-01-01", index), null);
  assert.equal(R.periodIndexFor("2026-08-31", index), null, "a gap between periods is still a gap");
});

test("missing or empty days are handled without throwing", () => {
  assert.equal(R.periodIndexFor(null, index), null);
  assert.equal(R.periodIndexFor("", index), null);
  assert.equal(R.periodIndexFor("2026-08-26", null), null);
});

test("the live period wins if a day somehow appears in two", () => {
  const overlapping = R.buildDayIndex([
    { archiveIndex: null, weeks: [{ index: 3, dayKeys: ["2026-08-24"] }] },
    { archiveIndex: 0, weeks: [{ index: 2, dayKeys: ["2026-08-24"] }] },
  ]);
  assert.deepEqual(R.periodIndexFor("2026-08-24", overlapping), { archiveIndex: null, weekIndex: 3 });
});

test("an index built from nothing is empty rather than broken", () => {
  assert.deepEqual(R.periodIndexFor("2026-08-24", R.buildDayIndex([])), null);
  assert.deepEqual(R.periodIndexFor("2026-08-24", R.buildDayIndex()), null);
  assert.deepEqual(R.periodIndexFor("2026-08-24", R.buildDayIndex([{ archiveIndex: null }])), null);
});
