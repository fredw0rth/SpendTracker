// Pins with a start and an optional end date. A new pin's start date is its first occurrence;
// nothing is generated before it (no backfilling into the current period) or after its end.
// Pins created before this have neither date and must behave exactly as they always did.
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// Nov 2026 under last-working-day: Fri 30 Oct – Sun 29 Nov.
const { start, end } = A.periodBounds(2026, 10, "last-working");
const weeks = A.buildWeeks(start, end);
const days = (pins) => A.expandScheduledPins(pins, weeks).map(o => o.day);
const pin = (over) => ({ id: "p", label: "Gym", amount: 40, method: "Amex", type: "personal", ...over });

test("a pin with no dates is unchanged", () => {
  assert.deepEqual(days([pin({ freq: "monthly", day: 5 })]), ["2026-11-05"]);
  assert.equal(days([pin({ freq: "weekly", day: 4 })]).length, 4);
});

test("a monthly pin starting mid-period isn't backfilled to earlier in it", () => {
  // Starting 20 Nov on the 20th: the 20th is its first payment, nothing before.
  assert.deepEqual(days([pin({ freq: "monthly", day: 20, startDay: "2026-11-20" })]), ["2026-11-20"]);
  // A day-5 pin that starts on the 20th has no payment in this period at all.
  assert.deepEqual(days([pin({ freq: "monthly", day: 5, startDay: "2026-11-20" })]), []);
});

test("weekly and daily pins start on their start date", () => {
  const weekly = days([pin({ freq: "weekly", day: 4, startDay: "2026-11-19" })]); // Thursdays
  assert.deepEqual(weekly, ["2026-11-19", "2026-11-26"]);
  const daily = days([pin({ freq: "daily", startDay: "2026-11-27" })]);
  assert.deepEqual(daily, ["2026-11-27", "2026-11-28", "2026-11-29"]);
});

test("nothing is generated after the end date, which is inclusive", () => {
  const daily = days([pin({ freq: "daily", startDay: "2026-11-02", endDay: "2026-11-04" })]);
  assert.deepEqual(daily, ["2026-11-02", "2026-11-03", "2026-11-04"]);
  assert.deepEqual(days([pin({ freq: "monthly", day: 5, endDay: "2026-11-04" })]), [], "ended the day before");
});

test("a flat pin counts in any period its dates overlap", () => {
  assert.equal(A.pinActiveInWeeks(pin({ freq: "none" }), weeks), true);
  assert.equal(A.pinActiveInWeeks(pin({ freq: "none", startDay: "2026-11-29" }), weeks), true);
  assert.equal(A.pinActiveInWeeks(pin({ freq: "none", startDay: "2026-11-30" }), weeks), false, "starts next period");
  assert.equal(A.pinActiveInWeeks(pin({ freq: "none", endDay: "2026-10-29" }), weeks), false, "ended last period");
  assert.deepEqual(A.flatPinsForWeeks([pin({ id: "a", freq: "none" }), pin({ id: "b", freq: "monthly", day: 1 }),
    pin({ id: "c", freq: "none", startDay: "2027-01-01" })], weeks).map(p => p.id), ["a"]);
});

test("a not-yet-started flat pin costs nothing in this period's leftover or export", () => {
  const s = A.normalizeState(A.defaultState());
  Object.assign(s, { payYear: 2026, payMonth: 10, monthLabel: "Nov 2026", paydayKind: "last-working", monthlyBudget: 1000, monthHistory: [] });
  s.pins = [pin({ id: "future", freq: "none", amount: 300, startDay: "2027-01-01" })];
  assert.equal(A.periodLeftover(s), 1000);
  assert.equal(A.buildLedgerRows(s, null, { today: "2026-11-22", includeUpcoming: true }).length, 0);
});

test("reconciliation sees only occurrences inside the pin's dates", () => {
  const s = A.normalizeState(A.defaultState());
  Object.assign(s, { payYear: 2026, payMonth: 10, monthLabel: "Nov 2026", paydayKind: "last-working", monthHistory: [] });
  s.pins = [pin({ freq: "monthly", day: 5, startDay: "2026-11-20" })];
  const cands = A.reconcileCandidates(A.reconcilePeriods(s)[0], null);
  assert.equal(cands.length, 0);
});
