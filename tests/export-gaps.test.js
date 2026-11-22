// The spreadsheet export's gaps for a monthly review, closed one at a time. Each block below is one
// change; every one is computed at export time or from an OPTIONAL new field, so nothing already
// logged is rewritten.
const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// August 2026 under the last-working-day rule: the period runs Fri 31 Jul – Thu 27 Aug.
function account() {
  const s = A.normalizeState(A.defaultState());
  Object.assign(s, { payYear: 2026, payMonth: 7, monthLabel: "Aug 2026", paydayKind: "last-working", monthHistory: [] });
  s.entries = [
    { id: "e1", amount: 10, label: "Coffee", method: "Amex", type: "personal", weekIndex: 1, day: "2026-08-01", order: 1 },
  ];
  s.pins = [
    // Rent on the 5th, its August amount confirmed by a statement.
    { id: "rent", label: "Rent", amount: 900, method: "Lloyds", type: "personal", freq: "monthly", day: 5,
      recons: { "2026-7-5": "fp" } },
    // Phone on the 20th at its standing amount.
    { id: "phone", label: "Phone", amount: 30, method: "Amex", type: "personal", freq: "monthly", day: 20 },
    // Gym, hand-corrected for August.
    { id: "gym", label: "Gym", amount: 35, method: "Amex", type: "personal", freq: "monthly", day: 12,
      amounts: { "2026-7-12": 38 } },
  ];
  s.credits = [];
  return s;
}
const byId = (rows) => Object.fromEntries(rows.map(r => [r.id, r]));

// ─── 1. Scheduled payments that haven't happened yet ─────────────────────────

test("a scheduled payment dated after today is left out by default", () => {
  const rows = A.buildLedgerRows(account(), null, { today: "2026-08-15" });
  const pinRows = rows.filter(r => r.source === "pinned").map(r => r.description);
  assert.deepEqual(pinRows.sort(), ["Gym", "Rent"], "Phone on the 20th hasn't happened on the 15th");
});

test("asking for upcoming payments brings them back, marked as upcoming", () => {
  const rows = A.buildLedgerRows(account(), null, { today: "2026-08-15", includeUpcoming: true });
  const phone = rows.find(r => r.description === "Phone");
  assert.ok(phone);
  assert.equal(phone.status, "upcoming");
});

test("past occurrences say whether their amount was ever confirmed", () => {
  const rows = A.buildLedgerRows(account(), null, { today: "2026-08-31" });
  const st = Object.fromEntries(rows.filter(r => r.source === "pinned").map(r => [r.description, [r.status, r.amount]]));
  assert.deepEqual(st.Rent, ["confirmed", "900.00"], "matched to a statement");
  assert.deepEqual(st.Gym, ["confirmed", "38.00"], "amount set by hand for that month");
  assert.deepEqual(st.Phone, ["unconfirmed", "30.00"], "still just the pin's standing amount");
});

test("logged rows are 'logged', or 'reconciled' once a statement matched them", () => {
  const s = account();
  s.entries.push({ id: "e2", amount: 5, label: "Bus", method: "Amex", type: "personal", weekIndex: 1, day: "2026-08-01", order: 2, recon: "fp2" });
  const r = byId(A.buildLedgerRows(s, null, { today: "2026-08-31" }));
  assert.equal(r.e1.status, "logged");
  assert.equal(r.e2.status, "reconciled");
});

test("a flat pin is upcoming only while its whole period is in the future", () => {
  const s = account();
  s.pins = [{ id: "flat", label: "Council tax", amount: 150, method: "Lloyds", type: "personal", freq: "none" }];
  assert.equal(A.buildLedgerRows(s, null, { today: "2026-07-01" }).filter(r => r.id === "flat").length, 0);
  assert.equal(byId(A.buildLedgerRows(s, null, { today: "2026-08-10" })).flat.status, "unconfirmed");
});

test("new columns are appended, so the original 26 keep their positions", () => {
  assert.equal(A.LEDGER_COLS[0], "loggingPeriod");
  assert.equal(A.LEDGER_COLS[25], "id");
  assert.ok(A.LEDGER_COLS.indexOf("status") > 25);
});

// ─── 2. Housing / essentials / discretionary ─────────────────────────────────

test("built-in categories default to a group; ones you made start unset", () => {
  assert.equal(A.categoryGroupOf({ id: "groceries" }), "essentials");
  assert.equal(A.categoryGroupOf({ id: "eatingout" }), "discretionary");
  assert.equal(A.categoryGroupOf({ id: "general" }), "");
  assert.equal(A.categoryGroupOf({ id: "x1", name: "Food & Drink" }), "");
  assert.equal(A.categoryGroupOf(null), "");
});

test("a group you set wins, and clearing it doesn't bring the default back", () => {
  assert.equal(A.categoryGroupOf({ id: "bills", group: "housing" }), "housing");
  assert.equal(A.categoryGroupOf({ id: "groceries", group: "" }), "");
});

test("the ledger carries each personal row's group, and flags the ones without one", () => {
  const s = account();
  s.categories = [...s.categories, { id: "home", name: "Rent & mortgage", icon: "home", color: "#000", group: "housing" }];
  s.pins = [{ id: "rent", label: "Rent", amount: 900, method: "Lloyds", type: "personal", freq: "monthly", day: 5, category: "home" }];
  s.entries = [
    { id: "g", amount: 40, label: "Tesco", method: "Amex", type: "personal", category: "groceries", weekIndex: 1, day: "2026-08-01", order: 1 },
    { id: "o", amount: 20, label: "Pizza", method: "Amex", type: "personal", category: "eatingout", weekIndex: 1, day: "2026-08-01", order: 2 },
    { id: "u", amount: 5, label: "Misc", method: "Amex", type: "personal", weekIndex: 1, day: "2026-08-01", order: 3 },
    { id: "w", amount: 60, label: "Client lunch", method: "Amex", type: "business", weekIndex: 1, day: "2026-08-01", order: 4 },
  ];
  const r = A.buildLedgerRows(s, null, { today: "2026-08-31" });
  const g = Object.fromEntries(r.map(x => [x.description, x.spendGroup]));
  assert.equal(g.Rent, "housing");
  assert.equal(g.Tesco, "essentials");
  assert.equal(g.Pizza, "discretionary");
  assert.equal(g.Misc, "unclassified");
  assert.equal(g["Client lunch"], "", "a work expense isn't part of your own spending");
});

test("setting a group is a settings change only: no logged entry is touched", () => {
  const s = account();
  const before = JSON.stringify(s.entries);
  const cats = s.categories.map(c => c.id === "bills" ? { ...c, group: "housing" } : c);
  const after = A.reducer(s, { type: "SETTINGS", patch: { categories: cats } });
  assert.equal(JSON.stringify(after.entries), before);
});

// ─── 3. Undated older rows ───────────────────────────────────────────────────
// Week 2 of Aug 2026 runs Mon 3 – Sun 9 Aug.

function undated() {
  const s = account();
  s.pins = [];
  s.entries = [
    { id: "d", amount: 1, label: "Dated", method: "Amex", type: "personal", weekIndex: 2, day: "2026-08-04", order: 1, date: "2026-08-04T12:00:00.000Z" },
    { id: "l", amount: 2, label: "Logged in its week", method: "Amex", type: "personal", weekIndex: 2, order: 2, date: "2026-08-06T12:00:00.000Z" },
    { id: "x", amount: 3, label: "Logged later", method: "Amex", type: "personal", weekIndex: 2, order: 3, date: "2026-08-20T12:00:00.000Z" },
    { id: "n", amount: 4, label: "No timestamp", method: "Amex", type: "personal", weekIndex: 2, order: 4 },
  ];
  s.credits = [{ id: "c", amount: 5, label: "Refund", method: "Amex", weekIndex: 2, order: 5, date: "2026-08-07T09:00:00.000Z" }];
  return s;
}

test("an undated row gets a best-guess date, and says how it was reached", () => {
  const r = byId(A.buildLedgerRows(undated(), null, { today: "2026-08-31" }));
  assert.deepEqual([r.d.date, r.d.dateBasis], ["2026-08-04", "exact"]);
  assert.deepEqual([r.l.date, r.l.dateBasis], ["2026-08-06", "estimated-logged"]);
  assert.deepEqual([r.x.date, r.x.dateBasis], ["2026-08-09", "estimated-week"], "logged after its week, so the week's end");
  assert.deepEqual([r.n.date, r.n.dateBasis], ["2026-08-09", "estimated-week"]);
  assert.deepEqual([r.c.date, r.c.dateBasis], ["2026-08-07", "estimated-logged"], "credits too");
});

test("estimating a date never changes what is stored", () => {
  const s = undated();
  const before = JSON.stringify(s);
  A.buildLedgerRows(s, null, { today: "2026-08-31" });
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.entries[1].day, undefined);
});

test("the date range still decides on the week, not on the estimate", () => {
  // "Logged later" estimates to the 9th, but its week overlaps the 4th, so a 4th-only range keeps it.
  const ids = A.buildLedgerRows(undated(), { from: "2026-08-04", to: "2026-08-04" }, { today: "2026-08-31" }).map(r => r.id);
  assert.ok(ids.includes("x"));
});

test("pinned costs: occurrences are 'scheduled', a moved one keeps its real date, a flat one has none", () => {
  const s = account();
  s.entries = [];
  s.pins = [
    { id: "m", label: "Moved", amount: 9, method: "Amex", type: "personal", freq: "monthly", day: 5, moves: { "2026-7-5": 3 } },
    { id: "f", label: "Flat", amount: 9, method: "Amex", type: "personal", freq: "none" },
  ];
  const r = A.buildLedgerRows(s, null, { today: "2026-08-31" });
  const moved = r.find(x => x.description === "Moved");
  assert.equal(moved.week, 3);
  assert.deepEqual([moved.date, moved.dateBasis], ["2026-08-05", "scheduled"]);
  const flat = r.find(x => x.description === "Flat");
  assert.deepEqual([flat.date, flat.dateBasis], ["", "period"]);
});
