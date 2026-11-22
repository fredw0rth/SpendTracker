// Three changes for the monthly hand-off to the Finances Tracker: the day a spend posted to the
// card, a summary block at the top of the Report, and credits linked to the Owed items they repay.
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// August 2026 under the last-working-day rule: the period runs Fri 31 Jul – Thu 27 Aug.
function account() {
  const s = A.normalizeState(A.defaultState());
  Object.assign(s, { payYear: 2026, payMonth: 7, monthLabel: "Aug 2026", paydayKind: "last-working", monthHistory: [] });
  s.categories = s.categories.concat([{ id: "rent", name: "Rent", icon: "home", color: "#000", group: "housing" }]);
  s.entries = [
    { id: "coffee", amount: 4, label: "Coffee", method: "Amex", type: "personal", category: "eatingout", weekIndex: 1, day: "2026-08-01", order: 1 },
    { id: "food", amount: 30, label: "Tesco", method: "Amex", type: "personal", category: "groceries", weekIndex: 1, day: "2026-08-02", order: 2 },
    { id: "taxi", amount: 20, label: "Taxi", method: "Amex", type: "business", weekIndex: 1, day: "2026-08-03", order: 3 },
    { id: "cash", amount: 5, label: "Market", method: "Cash", type: "personal", category: "groceries", weekIndex: 1, day: "2026-08-03", order: 4 },
    // A £60 dinner split: £25 yours, £35 a friend's.
    { id: "dinY", amount: 25, label: "Dinner", method: "Amex", type: "personal", category: "eatingout", splitGroupId: "g1", weekIndex: 2, day: "2026-08-08", order: 5 },
    { id: "dinT", amount: 35, label: "Dinner", method: "Amex", type: "excluded", splitGroupId: "g1", weekIndex: 2, day: "2026-08-08", order: 5 },
  ];
  s.pins = [
    { id: "rentpin", label: "Rent", amount: 800, method: "Lloyds", type: "personal", category: "rent", freq: "monthly", day: 5 },
  ];
  s.credits = [];
  return s;
}
const byId = (rows) => Object.fromEntries(rows.map(r => [r.id, r]));

// ─── Posted dates ─────────────────────────────────────────────────────────────

function reconcileAgainst(s, statement) {
  const periods = A.reconcilePeriods(s);
  const cands = periods.flatMap(p => A.reconcileCandidates(p, null));
  const R = require("../reconcile.js");
  const idx = R.buildDayIndex(periods.map(p => ({ archiveIndex: p.archiveIndex, weeks: p.weekKeys })));
  return R.reconcile({ statement, candidates: cands, dayIndex: idx });
}
const row = (id, date, amount, description) => ({ id, date, amount, description, normDesc: description.toLowerCase(), direction: "debit" });

test("a statement match records the day the spend posted, on entries, splits and pins", () => {
  const s = account();
  const res = reconcileAgainst(s, [
    row("r1", "2026-08-03", 4, "PRET"),        // coffee logged on the 1st, posted two days later
    row("r2", "2026-08-10", 60, "RESTAURANT"), // the split, as one card charge
    row("r3", "2026-08-05", 800, "RENT"),
  ]);
  const ops = A.postedDateOps(res.matched);
  s.entries = ops.filter(o => o.kind === "entry").reduce((list, o) => list.map(e => e.id === o.entry.id ? o.entry : e), s.entries);
  s.pins = ops.filter(o => o.kind === "pin").reduce((list, o) => A.applyReconPinOp(list, o), s.pins);
  const rows = A.buildLedgerRows(s, null, { today: "2026-08-31" });
  const r = byId(rows);
  const rent = rows.find(x => x.description === "Rent");
  assert.equal(r.coffee.postedDate, "2026-08-03");
  assert.equal(r.coffee.date, "2026-08-01", "the logged day is unchanged, so the pay period is too");
  assert.equal(r.coffee.status, "reconciled");
  assert.equal(r.dinY.postedDate, "2026-08-10");
  assert.equal(r.dinT.postedDate, "2026-08-10");
  assert.equal(rent.postedDate, "2026-08-05");
  assert.equal(rent.status, "confirmed");
  assert.equal(r.food.postedDate, "", "not on the statement, so no posted date");
});

test("a pairing whose amounts differ is a guess, and records nothing", () => {
  const s = account();
  const res = reconcileAgainst(s, [row("r1", "2026-08-02", 32, "TESCO")]);
  assert.equal(res.amountMismatch.length, 1);
  assert.deepEqual(A.postedDateOps(res.matched), []);
});

test("re-running against the same statement writes nothing new", () => {
  const s = account();
  s.entries[0] = { ...s.entries[0], postedOn: "2026-08-03" };
  const res = reconcileAgainst(s, [row("r1", "2026-08-03", 4, "PRET")]);
  assert.deepEqual(A.postedDateOps(res.matched), []);
});

test("a posted date on a pin counts as recorded activity for that period", () => {
  const s = account();
  s.entries = []; s.credits = [];
  s.pins[0] = { ...s.pins[0], posted: { "2026-7-5": "2026-08-05" } };
  assert.equal(A.periodHasRecordedActivity(s), true);
});

// ─── Credits that pay back Owed items ─────────────────────────────────────────

test("only the part of a credit that isn't a repayment adds to the budget", () => {
  assert.equal(A.creditBudgetAmount({ amount: 35, kind: "refund" }), 35);
  assert.equal(A.creditBudgetAmount({ amount: 35, kind: "refund", repays: ["dinT"], repaysAmount: 35 }), 0);
  assert.equal(A.creditBudgetAmount({ amount: 40, kind: "refund", repays: ["dinT"], repaysAmount: 35 }), 5, "a friend rounding up");
  assert.equal(A.creditBudgetAmount({ amount: 30, kind: "refund", repays: ["dinT"], repaysAmount: 35 }), 0, "never negative");
  assert.equal(A.creditBudgetAmount({ amount: 35, kind: "income" }), 0);
  assert.equal(A.budgetCreditTotal([{ amount: 10, kind: "refund" }, { amount: 35, kind: "refund", repaysAmount: 35 }]), 10);
});

test("linking a credit ticks the items off on its day; unlinking or deleting unticks them", () => {
  const s = account();
  const rows = A.owedItems(s);
  const ups = A.repaymentSyncUpdates(rows, "c1", ["dinT", "taxi"], "2026-08-12");
  assert.deepEqual(ups.map(u => [u.next.id, u.next.settledOn, u.next.settledBy]).sort(),
    [["dinT", "2026-08-12", "c1"], ["taxi", "2026-08-12", "c1"]]);
  // Now settled by c1; drop the taxi from the link.
  s.entries = s.entries.map(e => (e.id === "dinT" || e.id === "taxi") ? { ...e, settledOn: "2026-08-12", settledBy: "c1" } : e);
  const again = A.repaymentSyncUpdates(A.owedItems(s), "c1", ["dinT"], "2026-08-12");
  assert.equal(again.length, 1);
  assert.equal(again[0].next.id, "taxi");
  assert.equal(again[0].next.settledOn, undefined);
  assert.equal(again[0].next.settledBy, undefined);
});

test("items ticked off by hand, or by another credit, are never touched", () => {
  const s = account();
  s.entries = s.entries.map(e => e.id === "dinT" ? { ...e, settledOn: "2026-08-09" }
                               : e.id === "taxi" ? { ...e, settledOn: "2026-08-09", settledBy: "other" } : e);
  assert.deepEqual(A.repaymentSyncUpdates(A.owedItems(s), "c1", [], null), []);
  assert.deepEqual(A.repaymentSyncUpdates(A.owedItems(s), "c1", ["dinT", "taxi"], "2026-08-12"), []);
});

test("the export shows how much of a credit was a repayment, and which credit settled an item", () => {
  const s = account();
  s.entries = s.entries.map(e => e.id === "dinT" ? { ...e, settledOn: "2026-08-12", settledBy: "c1" } : e);
  s.credits = [{ id: "c1", amount: 40, kind: "refund", label: "Sam", method: "Lloyds", weekIndex: 2, day: "2026-08-12", repays: ["dinT"], repaysAmount: 35 }];
  const r = byId(A.buildLedgerRows(s, null, { today: "2026-08-31" }));
  assert.equal(r.c1.repaysAmount, "35.00");
  assert.equal(r.c1.repays, "dinT");
  assert.equal(r.dinT.settledBy, "c1");
  assert.equal(r.dinT.settled, "yes");
  const csv = A.buildLedgerCSV(s, null, { today: "2026-08-31" });
  assert.ok(csv.split("\n")[0].endsWith("postedDate,repaysAmount,repays,settledBy"), "new columns are appended at the end");
});

// ─── Report summary for the Finances Tracker ──────────────────────────────────

test("the Report opens with the Monthly row's figures for that pay period", () => {
  const s = account();
  s.credits = [
    { id: "c1", amount: 40, kind: "refund", label: "Sam", method: "Lloyds", weekIndex: 2, day: "2026-08-12", repays: ["dinT"], repaysAmount: 35 },
    { id: "c2", amount: 50, kind: "gift", label: "Mum", method: "Lloyds", weekIndex: 2, day: "2026-08-12" },
  ];
  const f = A.financeTrackerFigures(s, "2026-07-31");
  assert.equal(f.housing, 800);
  assert.equal(f.essentials, 35, "groceries, card and cash");
  assert.equal(f.discretionary, 29, "coffee and your share of dinner");
  assert.equal(f.ownSpend, 864);
  assert.equal(f.cardGross, 4 + 30 + 20 + 60 + 800, "everything charged to a card, both halves of the split and work included");
  assert.equal(f.cashSpend, 5);
  assert.equal(f.workSpend, 20);
  assert.equal(f.paidBack, 35);
  assert.equal(f.moneyIn.refund, 5);
  assert.equal(f.moneyIn.gift, 50);

  const periods = A.reconcilePeriods(s);
  const text = A.buildReportText(A.normalizeState(s), periods[0].weeks, {}, s);
  assert.match(text, /FOR THE FINANCES TRACKER \(pay period Aug 2026\)/);
  assert.match(text, /Housing\s+£800\.00/);
  assert.match(text, /In: paid back \(splits, work\)\s+£35\.00/);
});
