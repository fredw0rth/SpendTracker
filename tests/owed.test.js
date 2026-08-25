const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// A period's worth of state, shaped the way the app stores it.
const entry = (over) => Object.assign(
  { id: "e" + Math.random().toString(36).slice(2), amount: 10, label: "Thing", method: "Amex",
    type: "personal", weekIndex: 1, day: "2026-08-10", order: 1 }, over || {});

function stateWith(liveEntries, archives) {
  return A.normalizeState({
    ...A.defaultState(),
    payYear: 2026, payMonth: 7, monthLabel: "Aug 2026",
    entries: liveEntries || [],
    monthHistory: (archives || []).map((a, i) => ({
      monthLabel: a.label || ("M" + i), payYear: 2026, payMonth: i,
      entries: a.entries || [], pins: [], credits: [],
      monthlyBudget: 1000, weeklyBudget: 250, paydayKind: "last-working", paydayDay: 25,
    })),
  });
}

// ─── What lands on the list ───────────────────────────────────────────────────

test("only a split's other half and work spend are owed back", () => {
  const rows = A.owedItems(stateWith([
    entry({ id: "mine",  amount: 20, type: "personal", splitGroupId: "g" }),
    entry({ id: "their", amount: 40, type: "excluded", splitGroupId: "g" }),
    entry({ id: "work",  amount: 200, type: "business" }),
  ]));
  assert.deepEqual(rows.map(r => r.entry.id).sort(), ["their", "work"]);
  assert.equal(rows.find(r => r.entry.id === "their").kind, "split");
  assert.equal(rows.find(r => r.entry.id === "work").kind, "work");
});

test("nothing personal, and no credit, ever appears", () => {
  const s = stateWith([entry({ amount: 50 }), entry({ amount: 5, type: "credit" })]);
  s.credits = [{ id: "c1", amount: 40, weekIndex: 1, day: "2026-08-11" }];
  assert.equal(A.owedItems(s).length, 0);
});

test("claims are collected from archived periods too, tagged with their archive", () => {
  const rows = A.owedItems(stateWith(
    [entry({ id: "now", amount: 30, type: "excluded" })],
    [{ label: "Jun", entries: [entry({ id: "old", amount: 90, type: "business", day: "2026-06-04" })] },
     { label: "Jul", entries: [entry({ id: "mid", amount: 60, type: "excluded", day: "2026-07-04" })] }]));

  assert.deepEqual(rows.map(r => r.entry.id), ["old", "mid", "now"], "oldest period first");
  assert.equal(rows[0].archiveIndex, 0);
  assert.equal(rows[1].archiveIndex, 1);
  assert.equal(rows[2].archiveIndex, null, "the live period is archiveIndex null");
  assert.equal(rows[0].periodLabel, "Jun");
});

test("scheduled pins are not owed items — they live in their own collection", () => {
  const s = stateWith([]);
  s.pins = [{ id: "p1", amount: 40, label: "Shared broadband", type: "excluded", freq: "monthly", method: "Amex" }];
  assert.equal(A.owedItems(s).length, 0);
});

// ─── Ordering ─────────────────────────────────────────────────────────────────

test("within a period, oldest spend first, and undated items sort last", () => {
  const rows = A.owedItems(stateWith([
    entry({ id: "b", amount: 1, type: "excluded", day: "2026-08-20" }),
    entry({ id: "undated", amount: 1, type: "excluded", day: undefined }),
    entry({ id: "a", amount: 1, type: "excluded", day: "2026-08-02" }),
  ]));
  assert.deepEqual(rows.map(r => r.entry.id), ["a", "b", "undated"]);
});

// ─── Settled state ────────────────────────────────────────────────────────────

test("an item is outstanding until settledOn is written", () => {
  const open = A.owedItems(stateWith([entry({ type: "excluded" })]))[0];
  assert.equal(open.settled, false);
  const done = A.owedItems(stateWith([entry({ type: "excluded", settledOn: "2026-09-01" })]))[0];
  assert.equal(done.settled, true);
});

test("totals count only what is still outstanding, split by kind", () => {
  const rows = A.owedItems(stateWith([
    entry({ amount: 40, type: "excluded" }),
    entry({ amount: 25, type: "excluded", settledOn: "2026-09-01" }),
    entry({ amount: 200, type: "business" }),
  ]));
  const t = A.owedTotals(rows);
  assert.equal(t.split, 40, "the settled £25 is excluded");
  assert.equal(t.work, 200);
  assert.equal(t.total, 240);
  assert.equal(t.outstanding, 2);
});

// ─── Going stale ──────────────────────────────────────────────────────────────

test("an item is flagged once it is OWED_STALE_PERIODS periods old", () => {
  const archives = [];
  for (let i = 0; i < 8; i++) archives.push({ label: "M" + i, entries: [] });
  archives[0].entries = [entry({ id: "ancient", amount: 15, type: "excluded" })];
  archives[7].entries = [entry({ id: "recent", amount: 15, type: "excluded" })];
  const rows = A.owedItems(stateWith([], archives));

  const ancient = rows.find(r => r.entry.id === "ancient");
  const recent = rows.find(r => r.entry.id === "recent");
  assert.equal(ancient.periodsAgo, 8);
  assert.equal(recent.periodsAgo, 1);
  assert.ok(ancient.periodsAgo >= A.OWED_STALE_PERIODS, "the old one is stale");
  assert.ok(recent.periodsAgo < A.OWED_STALE_PERIODS, "the recent one is not");
  assert.equal(A.owedTotals(rows).stale, 1);
});

// ─── The invariant the whole feature rests on ─────────────────────────────────

test("ticking an item off changes NO budget figure", () => {
  const split = [
    entry({ id: "mine",  amount: 20, type: "personal", splitGroupId: "g" }),
    entry({ id: "their", amount: 40, type: "excluded", splitGroupId: "g" }),
    entry({ id: "work",  amount: 200, type: "business" }),
  ];
  const settled = split.map(e =>
    e.type === "personal" ? e : { ...e, settledOn: "2026-09-01" });

  const data = (entries) => ({ monthlyBudget: 1000, weeklyBudget: 250, entries, pins: [], credits: [] });
  const before = A.computeBudgetSummary(data(split), 4.4, 10);
  const after  = A.computeBudgetSummary(data(settled), 4.4, 10);

  assert.deepEqual(
    { spent: after.totalSpent, left: after.remaining, perDay: after.dailyFromMonth, weekly: after.spendableWeekly },
    { spent: before.totalSpent, left: before.remaining, perDay: before.dailyFromMonth, weekly: before.spendableWeekly },
    "settling must move no money — if this fails, a split's own half is being double-counted");
  assert.equal(before.remaining, 980, "only your £20 of the £60 dinner ever counted");
});

test("settledOn does not disturb the weekly rebalancer either", () => {
  const weeks = A.buildWeeks(...Object.values(A.periodBounds(2026, 7, "last-working")));
  const raw = [entry({ amount: 40, type: "excluded", weekIndex: 1 })];
  const done = [entry({ amount: 40, type: "excluded", weekIndex: 1, settledOn: "2026-09-01" })];
  assert.deepEqual(A.getRebalancedBudgets(weeks, done, 250, []),
                   A.getRebalancedBudgets(weeks, raw, 250, []));
});

// ─── Surviving a rollover ─────────────────────────────────────────────────────

test("settledOn survives being archived by a month rollover", () => {
  const s = stateWith([entry({ id: "kept", amount: 40, type: "excluded", settledOn: "2026-09-01" })]);
  const next = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  const archived = next.monthHistory[next.monthHistory.length - 1].entries.find(e => e.id === "kept");
  assert.equal(archived.settledOn, "2026-09-01", "MONTH_ROLLOVER must keep whole entries, not hand-listed fields");
  assert.equal(A.owedItems(next).find(r => r.entry.id === "kept").settled, true);
});
