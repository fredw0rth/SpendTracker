const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// A period to hang the week maths off: 31 Jul 2026 → 30 Aug 2026, 31 days.
const { start: PSTART, end: PEND } = A.periodBounds(2026, 7, "last-working");
const WEEKS = A.buildWeeks(PSTART, PEND);
const PERIOD_DAYS = Math.round((PEND - PSTART) / 86400000) + 1;
const WEEKS_IN_PERIOD = PERIOD_DAYS / 7;

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);
const entry = (over) => Object.assign(
  { id: "e", amount: 0, method: "Amex", type: "personal", weekIndex: 1, order: 1 }, over || {});
const data = (over) => Object.assign(
  { monthlyBudget: 1000, weeklyBudget: 1000 / WEEKS_IN_PERIOD, entries: [], pins: [], credits: [] }, over || {});

// ─── The reported bug ─────────────────────────────────────────────────────────
// Overspending must make the per-day figure WORSE. It used to make it look bigger:
// `remaining` went negative and fmt() printed its magnitude, so £7 "grew" to £10.

test("once overspent, logging another transaction pushes the per-day figure down, not up", () => {
  const budget = 1000;
  const daysLeft = 7;
  // £1049 spent against a £1000 budget — £49 over.
  const before = A.computeBudgetSummary(
    data({ monthlyBudget: budget, entries: [entry({ amount: 1049 })] }), WEEKS_IN_PERIOD, daysLeft);
  // ...then a further £21 goes on.
  const after = A.computeBudgetSummary(
    data({ monthlyBudget: budget, entries: [entry({ amount: 1049 }), entry({ id: "e2", amount: 21 })] }),
    WEEKS_IN_PERIOD, daysLeft);

  near(before.dailyFromMonth, -7, "before");
  near(after.dailyFromMonth, -10, "after");
  assert.ok(after.dailyFromMonth < before.dailyFromMonth,
    "spending more must never increase the daily allowance");

  // And it has to survive the formatter, which is where the original bug actually lived.
  assert.equal(A.fmt(before.dailyFromMonth), "-£7.00");
  assert.equal(A.fmt(after.dailyFromMonth), "-£10.00");
});

test("remaining goes negative rather than flooring, and stays negative through fmt", () => {
  const s = A.computeBudgetSummary(data({ entries: [entry({ amount: 1210 })] }), WEEKS_IN_PERIOD, 30);
  near(s.remaining, -210, "remaining");
  assert.equal(A.fmt(s.remaining), "-£210.00");
});

// ─── The formatter ────────────────────────────────────────────────────────────

test("fmt keeps the sign; fmtAbs strips it", () => {
  assert.equal(A.fmt(1234.5), "£1,234.50");
  assert.equal(A.fmt(0), "£0.00");
  assert.equal(A.fmt(-1234.5), "-£1,234.50");
  assert.equal(A.fmtAbs(-1234.5), "£1,234.50", "fmtAbs is for rows that pick their own sign glyph");
});

test("fmt(-0) renders as £0.00, not -£0.00", () => {
  assert.equal(A.fmt(-0), "£0.00");
  assert.equal(A.fmt(0 - 0), "£0.00");
});

// ─── computeBudgetSummary ─────────────────────────────────────────────────────

test("credits add back and business/excluded spend never counts against the budget", () => {
  const s = A.computeBudgetSummary(data({
    entries: [entry({ amount: 100 }), entry({ id: "b", amount: 500, type: "business" }),
              entry({ id: "x", amount: 300, type: "excluded" })],
    credits: [{ id: "c", amount: 40, weekIndex: 1 }],
  }), WEEKS_IN_PERIOD, 10);
  near(s.totalEntries, 100, "only personal spend counts");
  near(s.remaining, 1000 - 100 + 40, "credits add back");
  assert.equal(s.businessEntries.length, 1);
});

test("a past period (no days left) yields 0 per day rather than dividing by zero", () => {
  const s = A.computeBudgetSummary(data({ entries: [entry({ amount: 1210 })] }), WEEKS_IN_PERIOD, 0);
  assert.equal(s.dailyFromMonth, 0);
  near(s.remaining, -210, "remaining still reflects the overspend");
});

// ─── Flat fixed costs vs the weekly rate ──────────────────────────────────────

test("flat pins come off the weekly rate, so week budgets and remaining measure the same pot", () => {
  const pins = [{ id: "p1", amount: 155, type: "personal" }];
  const s = A.computeBudgetSummary(data({ pins }), WEEKS_IN_PERIOD, 10);

  near(s.totalPinned, 155, "flat pins are counted");
  near(s.spendableWeekly, (1000 - 155) / WEEKS_IN_PERIOD, "the rate is net of fixed costs");

  // The real point: the per-week budgets must sum to the same pot `remaining` starts from.
  const budgets = A.getRebalancedBudgets(WEEKS, [], s.spendableWeekly, []);
  const summed = Object.values(budgets).reduce((a, b) => a + b, 0);
  near(summed, 1000 - 155, "week budgets sum to the budget after fixed costs");
  near(summed, s.remaining, "which is exactly what remaining measures against");
});

test("business and excluded pins are left out of the fixed-cost total", () => {
  const s = A.computeBudgetSummary(data({
    pins: [{ id: "p1", amount: 100, type: "personal" },
           { id: "p2", amount: 400, type: "business" },
           { id: "p3", amount: 300, type: "excluded" }],
  }), WEEKS_IN_PERIOD, 10);
  near(s.totalPinned, 100, "only personal fixed costs reduce the budget");
});

// ─── getRebalancedBudgets ─────────────────────────────────────────────────────

test("short weeks are pro-rated by day count, so the weeks sum to the monthly budget", () => {
  const weekly = 1000 / WEEKS_IN_PERIOD;
  const budgets = A.getRebalancedBudgets(WEEKS, [], weekly, []);
  WEEKS.forEach(w => near(budgets[w.index], (weekly / 7) * w.days.length, `week ${w.index}`));
  near(Object.values(budgets).reduce((a, b) => a + b, 0), 1000, "sum");
  // The period genuinely has partial weeks, or this test proves nothing.
  assert.ok(WEEKS.some(w => w.days.length < 7), "expected at least one stub week");
});

test("an overspend is spread across the days of every later week", () => {
  const weekly = 700; // a clean £100/day
  const base = A.getRebalancedBudgets(WEEKS, [], weekly, []);
  const over = 120;
  const spent = [entry({ amount: base[1] + over, weekIndex: 1 })];
  const after = A.getRebalancedBudgets(WEEKS, spent, weekly, []);

  const laterDays = WEEKS.slice(1).reduce((s, w) => s + w.days.length, 0);
  WEEKS.slice(1).forEach(w => {
    near(after[w.index], base[w.index] - over * (w.days.length / laterDays), `week ${w.index} reduced`);
  });
  // Every later week gives up the same amount PER DAY — that's the point of spreading by days.
  const perDayCut = WEEKS.slice(1).map(w => (base[w.index] - after[w.index]) / w.days.length);
  perDayCut.forEach(c => near(c, perDayCut[0], "per-day cut is uniform"));
});

test("the final week absorbs its own overspend — there is nowhere left to spread it", () => {
  const weekly = 700;
  const last = WEEKS[WEEKS.length - 1];
  const base = A.getRebalancedBudgets(WEEKS, [], weekly, []);
  const after = A.getRebalancedBudgets(
    WEEKS, [entry({ amount: base[last.index] + 500, weekIndex: last.index })], weekly, []);
  WEEKS.forEach(w => near(after[w.index], base[w.index], `week ${w.index} untouched`));
});

test("an earlier week's overspend never claws back a week that has already lapsed", () => {
  const weekly = 700;
  const base = A.getRebalancedBudgets(WEEKS, [], weekly, []);
  const third = WEEKS[2];
  const after = A.getRebalancedBudgets(
    WEEKS, [entry({ amount: base[third.index] + 200, weekIndex: third.index })], weekly, []);
  near(after[WEEKS[0].index], base[WEEKS[0].index], "week 1 untouched");
  near(after[WEEKS[1].index], base[WEEKS[1].index], "week 2 untouched");
  assert.ok(after[WEEKS[3].index] < base[WEEKS[3].index], "week 4 absorbs it");
});

test("credits offset that week's spend before any overspend is measured", () => {
  const weekly = 700;
  const base = A.getRebalancedBudgets(WEEKS, [], weekly, []);
  const spend = [entry({ amount: base[1] + 100, weekIndex: 1 })];
  const credits = [{ id: "c", amount: 100, weekIndex: 1 }];
  const after = A.getRebalancedBudgets(WEEKS, spend, weekly, credits);
  WEEKS.forEach(w => near(after[w.index], base[w.index], `week ${w.index}: credit cancelled the overspend`));
});

test("a week's budget never goes negative, however large the earlier overspend", () => {
  const budgets = A.getRebalancedBudgets(
    WEEKS, [entry({ amount: 100000, weekIndex: 1 })], 700, []);
  WEEKS.forEach(w => assert.ok(budgets[w.index] >= 0, `week ${w.index} floored at 0`));
});

// ─── The headline "left"/"over" figure ────────────────────────────────────────
// The header and the Summary hero used to render "-£70.00" above the fixed word "left".
// remainingDisplay swaps the word instead of the sign, and hands back the figure, the word
// and the colour together so they cannot drift apart.

const RED = "#ef4444", AMBER = "#f97316", GREEN = "#22c55e";

test("under budget reads as money left; over budget reads as money over", () => {
  const under = A.remainingDisplay(30, 100);
  assert.deepEqual({ figure: under.figure, label: under.label }, { figure: "£30.00", label: "left" });

  const over = A.remainingDisplay(-70, 100);
  assert.deepEqual({ figure: over.figure, label: over.label }, { figure: "£70.00", label: "over" });
});

test("the headline figure never carries a minus, whatever the input", () => {
  for (const n of [-0.006, -1, -70, -1234.56, -1e6, 0, 0.5, 70, 1234.56]) {
    assert.ok(!A.remainingDisplay(n, 100).figure.includes("-"),
      `remainingDisplay(${n}) produced a signed figure: ${A.remainingDisplay(n, 100).figure}`);
  }
});

test("the word and the colour always agree — 'over' if and only if red", () => {
  for (const n of [-1000, -70, -0.006, 0, 0.5, 15, 70, 1000]) {
    const d = A.remainingDisplay(n, 100);
    assert.equal(d.label === "over", d.color === RED, `disagreement at ${n}: ${d.label}/${d.color}`);
    assert.equal(d.over, d.label === "over", `over flag out of step at ${n}`);
  }
});

test("a fraction of a penny under zero reads '£0.00 left', not '£0.00 over' in red", () => {
  // Rounding to pence BEFORE choosing the word is what prevents the contradiction.
  const crumb = A.remainingDisplay(-0.004, 100);
  assert.equal(crumb.figure, "£0.00");
  assert.equal(crumb.label, "left");
  assert.notEqual(crumb.color, RED);

  // A penny over really is over.
  const penny = A.remainingDisplay(-0.006, 100);
  assert.equal(penny.figure, "£0.01");
  assert.equal(penny.label, "over");
  assert.equal(penny.color, RED);
});

test("negative zero reads as left, matching fmt(-0)", () => {
  assert.equal(A.remainingDisplay(-0, 100).label, "left");
  assert.equal(A.fmt(-0), "£0.00");
});

test("exactly nothing left is still 'left', and sits in the warning band", () => {
  const d = A.remainingDisplay(0, 100);
  assert.deepEqual({ figure: d.figure, label: d.label, color: d.color },
    { figure: "£0.00", label: "left", color: AMBER });
});

test("the amber warning band starts at 15% of the monthly budget", () => {
  assert.equal(A.remainingDisplay(15.01, 100).color, GREEN, "just above the band");
  assert.equal(A.remainingDisplay(14.99, 100).color, AMBER, "just inside it");
});

test("the thousands separator survives the magnitude", () => {
  assert.equal(A.remainingDisplay(-1234.56, 5000).figure, "£1,234.56");
  assert.equal(A.remainingDisplay(1234.56, 5000).figure, "£1,234.56");
});

test("the per-day rate keeps its minus — only the headline figure swaps the word", () => {
  // Deliberately two conventions: a stock figure says "over" in words, a rate stays signed,
  // because "£10.00" on a per-day card is exactly the misreading this whole fix removed.
  const s = A.computeBudgetSummary(
    data({ entries: [entry({ amount: 1070 })] }), WEEKS_IN_PERIOD, 7);
  assert.equal(A.fmt(s.dailyFromMonth), "-£10.00", "per-day stays signed");
  assert.equal(A.remainingDisplay(s.remaining, 1000).figure, "£70.00", "headline drops the sign");
  assert.equal(A.remainingDisplay(s.remaining, 1000).label, "over", "...and says it in a word");
});
