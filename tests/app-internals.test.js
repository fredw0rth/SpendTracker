const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

const st = () => A.normalizeState(A.defaultState());
const entry = (over) => Object.assign({ id: "e1", amount: 10, label: "T", note: "T", method: "Amex", type: "personal", weekIndex: 1, day: "2026-08-01", date: "2026-08-01T00:00:00.000Z", order: 1 }, over || {});

// ─── Day keys ─────────────────────────────────────────────────────────────────

test("dayKey zero-pads so keys sort chronologically as strings", () => {
  assert.equal(A.dayKey(new Date(2026, 7, 1)), "2026-08-01");
  assert.equal(A.dayKey(new Date(2026, 11, 25)), "2026-12-25");
  assert.ok(A.dayKey(new Date(2026, 7, 2)) > A.dayKey(new Date(2026, 7, 1)));
  assert.ok(A.dayKey(new Date(2026, 7, 10)) > A.dayKey(new Date(2026, 7, 9)));
});

test("a day key round-trips through local midnight, not UTC", () => {
  const d = A.dayKeyToDate("2026-07-31");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 31, "Date.parse would risk landing on the 30th");
  assert.equal(A.dayKey(d), "2026-07-31");
});

test("reconcile.js emits day keys in exactly the app's format", () => {
  const R = require("../reconcile.js");
  assert.equal(R.parseDate("31/07/2026", "DMY"), A.dayKey(new Date(2026, 6, 31)));
  assert.equal(R.parseDate("01/08/2026", "DMY"), A.dayKey(new Date(2026, 7, 1)));
});

// ─── Pay periods ──────────────────────────────────────────────────────────────

test("a period runs from the previous payday to the day before its own", () => {
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  assert.equal(A.dayKey(start), "2026-07-31");
  assert.equal(A.dayKey(end), "2026-08-30");
});

test("each payday rule lands where it should", () => {
  assert.equal(A.dayKey(A.paydayFor(2026, 7, "last-calendar")), "2026-08-31");
  assert.equal(A.dayKey(A.paydayFor(2026, 7, "fixed", 25)), "2026-08-25");
  const lastFri = A.paydayFor(2026, 7, "last-friday");
  assert.equal(lastFri.getDay(), 5, "must be a Friday");
  assert.equal(A.dayKey(lastFri), "2026-08-28");
  const lastWork = A.paydayFor(2026, 7, "last-working");
  assert.ok(lastWork.getDay() >= 1 && lastWork.getDay() <= 5, "never a weekend");
});

test("a fixed payday falling on a weekend moves to the working day before", () => {
  // 25 Oct 2026 is a Sunday.
  const d = A.paydayFor(2026, 9, "fixed", 25);
  assert.ok(d.getDay() >= 1 && d.getDay() <= 5);
  assert.equal(A.dayKey(d), "2026-10-23");
});

test("weeks tile the period exactly, partial ends included", () => {
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  const weeks = A.buildWeeks(start, end);
  const days = weeks.reduce((n, w) => n + w.days.length, 0);
  assert.equal(days, Math.round((end - start) / 86400000) + 1, "no day is lost or counted twice");
  assert.equal(A.dayKey(weeks[0].start), A.dayKey(start));
  assert.equal(A.dayKey(weeks[weeks.length - 1].end), A.dayKey(end));
  assert.deepEqual(weeks.map(w => w.index), weeks.map((_, i) => i + 1));
  assert.ok(weeks[0].days.length < 7, "the payday week is partial");
  for (let i = 1; i < weeks.length - 1; i++) assert.equal(weeks[i].days.length, 7);
});

test("every week closes on a Sunday except the last", () => {
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  const weeks = A.buildWeeks(start, end);
  for (let i = 0; i < weeks.length - 1; i++) assert.equal(weeks[i].end.getDay(), 0, "week " + (i + 1));
});

// ─── weekIndexForDay ──────────────────────────────────────────────────────────

test("weekIndexForDay places every day of the period and rejects the rest", () => {
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  const weeks = A.buildWeeks(start, end);
  for (const w of weeks) for (const d of w.days) assert.equal(A.weekIndexForDay(weeks, A.dayKey(d)), w.index);
  assert.equal(A.weekIndexForDay(weeks, "2026-07-30"), null, "the day before the period starts");
  assert.equal(A.weekIndexForDay(weeks, "2026-08-31"), null, "the next period's payday");
  assert.equal(A.weekIndexForDay(weeks, null), null);
  assert.equal(A.weekIndexForDay(null, "2026-08-01"), null);
});

test("the day index reconciliation uses agrees with weekIndexForDay on every day", () => {
  // reconcile.js does a plain string lookup rather than call into the app; this is the check
  // that the two can never disagree about which week a date belongs to.
  const R = require("../reconcile.js");
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  const weeks = A.buildWeeks(start, end);
  const index = R.buildDayIndex([{ archiveIndex: null, weeks: weeks.map(w => ({ index: w.index, dayKeys: w.days.map(A.dayKey) })) }]);
  for (const w of weeks) for (const d of w.days) {
    const key = A.dayKey(d);
    assert.deepEqual(R.periodIndexFor(key, index), { archiveIndex: null, weekIndex: A.weekIndexForDay(weeks, key) }, key);
  }
  assert.equal(R.periodIndexFor("2026-08-31", index), null);
});

// ─── normalizeState ───────────────────────────────────────────────────────────

test("normalizeState backfills what an old account is missing", () => {
  const n = A.normalizeState({});
  assert.deepEqual(n.entries, []);
  assert.deepEqual(n.pins, []);
  assert.deepEqual(n.credits, []);
  assert.deepEqual(n.monthHistory, []);
  assert.ok(n.methods.length);
  assert.ok(n.categories.every(c => c.icon), "every category ends up with an icon");
});

test("normalizeState leaves a reconciliation stamp alone", () => {
  const n = A.normalizeState({ entries: [entry({ recon: "abc" })] });
  assert.equal(n.entries[0].recon, "abc");
});

test("a reconciliation stamp survives being written through the reducer", () => {
  let s = A.reducer(st(), { type: "ADD_ENTRY", entry: entry() });
  s = A.reducer(s, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "entry", op: "upd", entry: { ...s.entries[0], recon: "abc" } }] });
  assert.equal(s.entries[0].recon, "abc");
  s = A.reducer(s, { type: "SETTINGS", patch: { theme: "light" } });
  assert.equal(s.entries[0].recon, "abc", "and is not scrubbed by an unrelated dispatch");
});

// ─── The existing entry actions the feature relies on ─────────────────────────

test("ADD_ENTRY / UPD_ENTRY / DEL_ENTRY behave as reconciliation assumes", () => {
  let s = A.reducer(st(), { type: "ADD_ENTRY", entry: entry() });
  assert.equal(s.entries.length, 1);
  s = A.reducer(s, { type: "UPD_ENTRY", entry: entry({ amount: 25 }) });
  assert.equal(s.entries[0].amount, 25);
  s = A.reducer(s, { type: "DEL_ENTRY", id: "e1" });
  assert.equal(s.entries.length, 0);
});

test("EDIT_PAST_ENTRY writes into one archive and leaves live state alone", () => {
  const s0 = { ...st(), monthHistory: [{ monthLabel: "Jul 2026", entries: [], credits: [] }] };
  const s = A.reducer(s0, { type: "EDIT_PAST_ENTRY", op: "add", archiveIndex: 0, entry: entry() });
  assert.equal(s.monthHistory[0].entries.length, 1);
  assert.equal(s.entries.length, 0);
});

// ─── RECONCILE_APPLY ──────────────────────────────────────────────────────────

test("a whole batch of fixes lands in one transition", () => {
  const s0 = { ...st(), entries: [entry({ id: "keep" }), entry({ id: "drop" }), entry({ id: "wrong", amount: 8 })] };
  const s = A.reducer(s0, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "entry", op: "add", entry: entry({ id: "new", amount: 6.4 }) },
    { archiveIndex: null, kind: "entry", op: "del", id: "drop" },
    { archiveIndex: null, kind: "entry", op: "upd", entry: entry({ id: "wrong", amount: 18 }) },
    { archiveIndex: null, kind: "credit", op: "add", credit: { id: "c1", amount: 8, label: "Refund", weekIndex: 1 } },
  ] });
  const ids = s.entries.map(e => e.id).sort();
  assert.deepEqual(ids, ["keep", "new", "wrong"]);
  assert.equal(s.entries.find(e => e.id === "wrong").amount, 18);
  assert.equal(s.credits.length, 1);
});

test("ops are applied in order, so a later one sees the earlier one's result", () => {
  const s = A.reducer(st(), { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "entry", op: "add", entry: entry({ id: "x", amount: 5 }) },
    { archiveIndex: null, kind: "entry", op: "upd", entry: entry({ id: "x", amount: 9 }) },
  ] });
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].amount, 9);
});

test("one batch can span the live period and several archives", () => {
  const s0 = { ...st(), entries: [entry({ id: "live" })], monthHistory: [
    { monthLabel: "Jun 2026", entries: [entry({ id: "a0" })], credits: [], pins: [] },
    { monthLabel: "Jul 2026", entries: [entry({ id: "a1" })], credits: [], pins: [] },
  ] };
  const s = A.reducer(s0, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "entry", op: "add", entry: entry({ id: "liveAdd" }) },
    { archiveIndex: 0, kind: "entry", op: "del", id: "a0" },
    { archiveIndex: 1, kind: "entry", op: "upd", entry: entry({ id: "a1", amount: 99 }) },
  ] });
  assert.equal(s.entries.length, 2);
  assert.equal(s.monthHistory[0].entries.length, 0);
  assert.equal(s.monthHistory[1].entries[0].amount, 99);
});

test("an op aimed at an archive that no longer exists is dropped, not thrown", () => {
  const s0 = { ...st(), monthHistory: [] };
  const s = A.reducer(s0, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: 5, kind: "entry", op: "del", id: "gone" },
    { archiveIndex: null, kind: "entry", op: "add", entry: entry({ id: "ok" }) },
  ] });
  assert.equal(s.entries.length, 1, "the valid op in the same batch still applies");
});

test("an empty batch changes nothing and keeps object identity", () => {
  const s0 = st();
  assert.equal(A.reducer(s0, { type: "RECONCILE_APPLY", ops: [] }), s0, "no needless re-render or re-save");
  assert.equal(A.reducer(s0, { type: "RECONCILE_APPLY" }), s0);
});

test("history is left untouched when no op targets it", () => {
  const history = [{ monthLabel: "Jul 2026", entries: [], credits: [], pins: [] }];
  const s0 = { ...st(), monthHistory: history };
  const s = A.reducer(s0, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "entry", op: "add", entry: entry() }] });
  assert.equal(s.monthHistory, history, "same array, so nothing downstream re-renders on it");
});

test("the result is normalised like every other action's", () => {
  const s = A.reducer({ entries: [] }, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "entry", op: "add", entry: entry() }] });
  assert.deepEqual(s.credits, [], "a state with no credits key cannot reach the render tree");
  assert.ok(s.categories.length);
});

// ─── Grouping ─────────────────────────────────────────────────────────────────

test("groupByWeek keeps every item and sends unweeked ones to fixed costs", () => {
  const { start, end } = A.periodBounds(2026, 7, "last-working");
  const weeks = A.buildWeeks(start, end);
  const items = [entry({ id: "a", weekIndex: 1 }), entry({ id: "b", weekIndex: 2 }), entry({ id: "c", weekIndex: null })];
  const groups = A.groupByWeek(items, weeks);
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), 3);
  assert.ok(groups.some(g => g.key === "fixed"));
});

// ─── Saved statements ─────────────────────────────────────────────────────────

test("an account created before saved statements existed gets an empty list", () => {
  assert.deepEqual(A.normalizeState({}).statements, []);
  assert.deepEqual(A.normalizeState({ entries: [] }).statements, []);
  assert.deepEqual(A.defaultState().statements, []);
});

test("a saved statement survives a dispatch that has nothing to do with it", () => {
  const st = { method: "Amex", rows: [{ d: "2026-08-01", t: "TESCO", a: 5, c: 0 }], from: "2026-08-01", to: "2026-08-01", savedAt: "2026-08-22T00:00:00.000Z" };
  let s = A.normalizeState({ statements: [st] });
  s = A.reducer(s, { type: "ADD_ENTRY", entry: entry() });
  s = A.reducer(s, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "entry", op: "upd", entry: entry({ recon: "abc" }) }] });
  assert.deepEqual(s.statements, [st]);
});

test("saving a card's statement replaces that card's, never stacks copies", () => {
  // The UI holds one statement per payment method; this is the shape it dispatches.
  const older = { method: "Amex", rows: [{ d: "2026-07-01", t: "OLD", a: 1, c: 0 }], to: "2026-07-01" };
  const other = { method: "Lloyds", rows: [{ d: "2026-08-01", t: "X", a: 2, c: 0 }], to: "2026-08-01" };
  const newer = { method: "Amex", rows: [{ d: "2026-08-20", t: "NEW", a: 3, c: 0 }], to: "2026-08-20" };
  const s0 = A.normalizeState({ statements: [older, other] });
  const s = A.reducer(s0, { type: "SETTINGS", patch: { statements: [...s0.statements.filter(x => x.method !== newer.method), newer] } });
  assert.equal(s.statements.length, 2);
  assert.deepEqual(s.statements.map(x => x.method).sort(), ["Amex", "Lloyds"]);
  assert.equal(s.statements.find(x => x.method === "Amex").to, "2026-08-20");
  assert.equal(s.statements.find(x => x.method === "Lloyds").to, "2026-08-01", "the other card is untouched");
});

test("forgetting one card's statement leaves the others alone", () => {
  const s0 = A.normalizeState({ statements: [{ method: "Amex", rows: [] }, { method: "Lloyds", rows: [] }] });
  const s = A.reducer(s0, { type: "SETTINGS", patch: { statements: s0.statements.filter(x => x.method !== "Amex") } });
  assert.deepEqual(s.statements.map(x => x.method), ["Lloyds"]);
});

test("statements carry across a period rollover", () => {
  // They belong to a card, not to a pay period, so a rollover must not clear them.
  const s0 = A.normalizeState({ statements: [{ method: "Amex", rows: [{ d: "2026-08-01", t: "T", a: 5, c: 0 }] }], entries: [entry()] });
  const s = A.reducer(s0, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  assert.equal(s.statements.length, 1);
  assert.equal(s.entries.length, 0, "entries are period-scoped and do clear");
});

test("a statement stored on an old account is not resurrected as undefined", () => {
  const s = A.reducer(A.normalizeState({}), { type: "ADD_ENTRY", entry: entry() });
  assert.ok(Array.isArray(s.statements));
});

// ─── Which logged items a statement is compared against ───────────────────────

const period = (over) => {
  const d = Object.assign({ payYear: 2026, payMonth: 7, paydayKind: "last-working", monthLabel: "Aug 2026",
    entries: [], credits: [], pins: [] }, over || {});
  const { start, end } = A.periodBounds(d.payYear, d.payMonth, d.paydayKind);
  const weeks = A.buildWeeks(start, end);
  return { archiveIndex: null, label: d.monthLabel, data: d, weeks };
};
const spend = (id, method, over) => Object.assign(
  { id, amount: 10, label: id, method, type: "personal", weekIndex: 1, day: "2026-08-01" }, over || {});

test("only the card being reconciled is compared", () => {
  const p = period({ entries: [spend("a", "Amex"), spend("b", "Lloyds"), spend("c", "Amex")] });
  const amex = A.reconcileCandidates(p, "Amex");
  assert.deepEqual(amex.map(c => c.ref.entry.id), ["a", "c"]);
  assert.equal(A.reconcileCandidates(p, "Lloyds").length, 1);
});

test("passing no card compares everything, for the all-cards option", () => {
  const p = period({ entries: [spend("a", "Amex"), spend("b", "Lloyds")] });
  assert.equal(A.reconcileCandidates(p, null).length, 2);
});

test("credits are never filtered out by card", () => {
  // A refund is compared whichever card it landed on — reconcileCandidates has no method filter
  // for credits, and the week log relies on that to keep showing them.
  const p = period({
    entries: [spend("a", "Amex"), spend("b", "Lloyds")],
    credits: [{ id: "cr", amount: 8, label: "Refund", weekIndex: 1, day: "2026-08-01" }],
  });
  const amex = A.reconcileCandidates(p, "Amex");
  assert.deepEqual(amex.map(c => c.kind).sort(), ["credit", "entry"]);
  assert.equal(amex.find(c => c.kind === "credit").direction, "credit");
});

test("a split is one candidate at the card total, and follows the card filter", () => {
  const p = period({ entries: [
    spend("y", "Amex", { amount: 25, splitGroupId: "g" }),
    spend("t", "Amex", { amount: 35, type: "excluded", splitGroupId: "g" }),
  ] });
  const amex = A.reconcileCandidates(p, "Amex");
  assert.equal(amex.length, 1, "two rows, one card transaction");
  assert.equal(amex[0].kind, "split");
  assert.equal(amex[0].amount, 60);
  assert.equal(A.reconcileCandidates(p, "Lloyds").length, 0);
});

test("a scheduled pin on another card is not compared either", () => {
  const pin = { id: "p1", label: "Rent", amount: 900, method: "Lloyds", type: "personal", freq: "monthly", day: 5 };
  const p = period({ pins: [pin], entries: [spend("a", "Amex")] });
  assert.deepEqual(A.reconcileCandidates(p, "Amex").map(c => c.kind), ["entry"]);
  assert.ok(A.reconcileCandidates(p, "Lloyds").some(c => c.kind === "pin"));
});

test("candidates carry the week and type the log needs to render them", () => {
  const p = period({ entries: [spend("a", "Amex", { weekIndex: 2, type: "business", category: "bills" })] });
  const c = A.reconcileCandidates(p, "Amex")[0];
  assert.equal(c.weekIndex, 2);
  assert.equal(c.type, "business");
  assert.equal(c.category, "bills");
  assert.equal(c.direction, "debit");
});
