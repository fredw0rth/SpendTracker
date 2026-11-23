// Accounts for moves (Trading 212 and the like) and the Summary tab's Waiting to come out card:
// accounts that only ever appear under Move, the "coming back out later" tick, and the running
// total of what's parked in them.
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

const T212 = "trading212";

// August 2026 under the last-working-day rule: the period runs Fri 31 Jul – Thu 27 Aug.
function account() {
  const s = A.normalizeState(A.defaultState());
  Object.assign(s, { payYear: 2026, payMonth: 7, monthLabel: "Aug 2026", paydayKind: "last-working", monthHistory: [] });
  s.entries = [
    { id: "coffee", amount: 4, label: "Coffee", method: "Amex", type: "personal", category: "eatingout", weekIndex: 1, day: "2026-08-01", order: 1 },
  ];
  s.pins = []; s.credits = [];
  s.moves = [
    // Rent parked in Trading 212, ticked to come back out.
    { id: "in1", amount: 834, from: "Lloyds", to: T212, purpose: "rent", comesOut: true, weekIndex: 1, day: "2026-08-01" },
    // Savings: staying put, so not ticked.
    { id: "in2", amount: 300, from: "Lloyds", to: T212, purpose: "saving", weekIndex: 1, day: "2026-08-01" },
    // The rent coming back out, ticked.
    { id: "out1", amount: 834, from: T212, to: "Lloyds", purpose: "rent", comesOut: true, weekIndex: 3, day: "2026-08-15" },
    // A card bill between two payment types: nothing to do with Trading 212.
    { id: "bill", amount: 200, from: "Lloyds", to: "Amex", purpose: "cardbill", weekIndex: 2, day: "2026-08-10" },
  ];
  return s;
}
const byId = (rows) => Object.fromEntries(rows.map(r => [r.id, r]));

test("every account starts with Trading 212 as an account for moves, never as a payment type", () => {
  const fresh = A.normalizeState(A.defaultState());
  assert.deepEqual(fresh.moveAccounts.map(a => a.name), ["Trading 212"]);
  assert.ok(!fresh.methods.some(m => /212/.test(m.name)), "not a payment type");
  // An account from before this existed (no list at all) gets it too...
  const old = A.normalizeState({ entries: [], methods: fresh.methods });
  assert.equal(old.moveAccounts[0].id, T212);
  // ...but deleting every account for moves is a choice, and sticks.
  assert.deepEqual(A.normalizeState({ moveAccounts: [] }).moveAccounts, []);
  // And it survives the month rolling over.
  const s = account();
  const next = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  assert.equal(next.moveAccounts[0].id, T212);
});

test("waiting to come out: already there, plus ticked moves in, less ticked moves out", () => {
  const s = account();
  s.moveAccounts = [{ ...s.moveAccounts[0], startAside: 500, startNote: "Lloyds card, Lakes trip" }];
  s.moves.push({ id: "in3", amount: 200, from: "Lloyds", to: T212, purpose: "holiday", comesOut: true, weekIndex: 3, day: "2026-08-16" });
  const w = A.waitingToComeOut(s);
  const t = w.rows[0];
  assert.equal(t.start, 500);
  assert.equal(t.movedIn, 1034, "rent and holiday; the unticked saving isn't counted");
  assert.equal(t.takenOut, 834);
  assert.equal(t.waiting, 700);
  assert.deepEqual(t.byPurpose, { rent: 834, holiday: 200 });
  assert.equal(w.total, 700);
});

test("waiting to come out runs across every period, not just the one on screen", () => {
  const s = account();
  const next = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  const added = A.reducer(next, { type: "MOVE", op: "add", archiveIndex: null,
    move: { id: "sep", amount: 150, from: "Lloyds", to: T212, purpose: "holiday", comesOut: true, weekIndex: 1 } });
  // August's moves are archived now, and still count alongside September's.
  assert.equal(A.waitingToComeOut(added).rows[0].movedIn, 834 + 150);
  assert.equal(A.waitingToComeOut(added).rows[0].waiting, 150);
});

test("a move ticked as coming back out isn't saving", () => {
  const s = account();
  const t = A.moveTotals(s.moves, A.moveAccountList(s));
  // Only the unticked £300 saving counts; the rent going in and out is neither saved nor unsaved.
  assert.equal(t.intoSavings, 300);
  assert.equal(t.outOfSavings, 0);
  assert.equal(t.netSaved, 300);
  assert.equal(t.byPurpose.rent, 1668, "purposes still total every move");
});

test("the export names Trading 212 and says which moves were set-aside money", () => {
  const s = account();
  const r = byId(A.buildLedgerRows(s, null, { today: "2026-08-31" }));
  assert.equal(r.in1.moveTo, "Trading 212");
  assert.equal(r.in1.moveToAccountType, "savings");
  assert.equal(r.in1.moveComesOut, "yes");
  assert.equal(r.in2.moveComesOut, "no");
  assert.equal(r.out1.card, "Trading 212", "where it came from");
  assert.equal(r.out1.accountType, "savings");
  assert.equal(r.bill.moveComesOut, "no");
  assert.equal(r.coffee.moveComesOut, "", "blank on everything that isn't a move");
  const header = A.buildLedgerCSV(s, null, { today: "2026-08-31" }).split("\n")[0];
  assert.ok(header.endsWith(",movePurpose,moveComesOut"), "appended, never inserted");
});

test("the Report lists Trading 212 by name and marks set-aside money", () => {
  const s = account();
  const text = A.buildReportText(A.normalizeState(s), A.reconcilePeriods(s)[0].weeks, {}, s);
  assert.match(text, /£834\.00  Lloyds → Trading 212  ·  Rent · coming back out later/);
  assert.match(text, /£834\.00  Trading 212 → Lloyds  ·  Rent · set-aside money out/);
  assert.match(text, /£300\.00  Lloyds → Trading 212  ·  Saving · /);
});

test("the tick's few words depend on which way the money went", () => {
  const accounts = A.DEFAULT_MOVE_ACCOUNTS;
  assert.equal(A.comesOutNote({ to: T212, comesOut: true }, accounts), " · coming back out later");
  assert.equal(A.comesOutNote({ from: T212, to: "Lloyds", comesOut: true }, accounts), " · set-aside money out");
  assert.equal(A.comesOutNote({ to: T212 }, accounts), "");
});

test("an account named by a credit or a move can't be removed", () => {
  const s = account();
  s.credits = [{ id: "c1", amount: 10, method: "HSBC", weekIndex: 1 }];
  const used = A.usedAccountIds(s);
  assert.ok(used.has("HSBC"), "credits count");
  assert.ok(used.has(T212), "moves count, both ends");
  assert.ok(used.has("Lloyds"));
  assert.ok(!used.has("Cash"));
});

test("accounts for moves travel in the data file, and a damaged list is refused", () => {
  const s = account();
  s.moveAccounts = [{ ...s.moveAccounts[0], startAside: 776 }];
  const back = A.parseDataExport(A.buildDataExport(s, "test")).data;
  assert.equal(back.moveAccounts[0].startAside, 776);
  assert.throws(() => A.parseDataExport(JSON.stringify({ entries: [], moveAccounts: "T212" })), /moveAccounts/);
});
