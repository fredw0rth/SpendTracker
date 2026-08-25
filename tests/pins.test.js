const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// August 2026 under the default last-working-day payday rule.
const bounds = A.periodBounds(2026, 7, "last-working");
const weeks = A.buildWeeks(bounds.start, bounds.end);
const monthlyPin = (over) => Object.assign({
  id: "p1", label: "Rent", amount: 900, method: "Amex", type: "personal",
  freq: "monthly", day: 5, note: "",
}, over || {});

const occurrences = (pin) => A.expandScheduledPins([pin], weeks);
const st = () => A.normalizeState(A.defaultState());

test("a pin with no override maps behaves exactly as before", () => {
  const occ = occurrences(monthlyPin());
  assert.ok(occ.length >= 1);
  for (const o of occ) assert.equal(o.amount, 900);
});

test("an occurrence amount override wins over the pin's standing amount", () => {
  const plain = occurrences(monthlyPin());
  const key = plain[0].occKey;
  const occ = occurrences(monthlyPin({ amounts: { [key]: 950 } }));
  assert.equal(occ[0].amount, 950);
});

test("an override changes only its own occurrence", () => {
  // A weekly pin gives several occurrences in one period to check against.
  const weekly = { id: "p2", label: "Gym", amount: 10, method: "Amex", type: "personal", freq: "weekly", day: 3 };
  const plain = A.expandScheduledPins([weekly], weeks);
  assert.ok(plain.length >= 3, "need several occurrences for this to mean anything");
  const key = plain[1].occKey;
  const occ = A.expandScheduledPins([{ ...weekly, amounts: { [key]: 25 } }], weeks);
  assert.equal(occ[1].amount, 25);
  for (let i = 0; i < occ.length; i++) if (i !== 1) assert.equal(occ[i].amount, 10, "occurrence " + i + " should be untouched");
});

test("an override of zero is honoured rather than falling back", () => {
  const key = occurrences(monthlyPin())[0].occKey;
  assert.equal(occurrences(monthlyPin({ amounts: { [key]: 0 } }))[0].amount, 0);
});

test("a missing override falls back cleanly", () => {
  const occ = occurrences(monthlyPin({ amounts: { "not-a-real-key": 1 } }));
  assert.equal(occ[0].amount, 900);
});

test("the occurrence key is stable, so an override survives a move", () => {
  const pin = monthlyPin();
  const key = occurrences(pin)[0].occKey;
  const moved = occurrences({ ...pin, moves: { [key]: 4 }, amounts: { [key]: 950 } });
  const hit = moved.find(o => o.occKey === key);
  assert.equal(hit.weekIndex, 4, "moved to another week");
  assert.equal(hit.amount, 950, "and still carrying its override");
});

test("RECONCILE_APPLY writes an occurrence override without disturbing the others", () => {
  const before = { ...st(), pins: [monthlyPin({ skips: ["old"], moves: { a: 2 }, orders: { b: 7 } })] };
  const after = A.reducer(before, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "pin", op: "amount", pinId: "p1", occKey: "2026-7-5", amount: 950 },
  ] });
  const p = after.pins[0];
  assert.deepEqual(p.amounts, { "2026-7-5": 950 });
  assert.deepEqual(p.skips, ["old"], "skips untouched");
  assert.deepEqual(p.moves, { a: 2 }, "moves untouched");
  assert.deepEqual(p.orders, { b: 7 }, "orders untouched");
  assert.equal(p.amount, 900, "the pin's standing amount is unchanged");
});

test("the 'new price' op moves the pin itself, not one occurrence", () => {
  const after = A.reducer({ ...st(), pins: [monthlyPin()] }, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "pin", op: "rate", pinId: "p1", amount: 950 },
  ] });
  assert.equal(after.pins[0].amount, 950);
  assert.equal(after.pins[0].amounts, undefined, "no per-occurrence override was created");
});

test("an occurrence override outlives a change to the standing amount", () => {
  let s = { ...st(), pins: [monthlyPin()] };
  s = A.reducer(s, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "pin", op: "amount", pinId: "p1", occKey: "k", amount: 950 }] });
  s = A.reducer(s, { type: "RECONCILE_APPLY", ops: [{ archiveIndex: null, kind: "pin", op: "rate", pinId: "p1", amount: 1000 }] });
  assert.equal(s.pins[0].amount, 1000);
  assert.deepEqual(s.pins[0].amounts, { k: 950 }, "the corrected month stays corrected");
});

test("skipping an occurrence drops it and leaves the schedule alone", () => {
  const pin = monthlyPin();
  const key = occurrences(pin)[0].occKey;
  const after = A.reducer({ ...st(), pins: [pin] }, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "pin", op: "skip", pinId: "p1", occKey: key },
  ] });
  assert.deepEqual(after.pins[0].skips, [key]);
  assert.equal(after.pins[0].freq, "monthly", "still recurring");
  assert.equal(occurrences(after.pins[0]).find(o => o.occKey === key), undefined);
});

test("a fingerprint is remembered per occurrence", () => {
  const after = A.reducer({ ...st(), pins: [monthlyPin()] }, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "pin", op: "recon", pinId: "p1", occKey: "k", recon: "abc" },
  ] });
  assert.deepEqual(after.pins[0].recons, { k: "abc" });
});

test("pin ops ignore a pin id that isn't there", () => {
  const after = A.reducer({ ...st(), pins: [monthlyPin()] }, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: null, kind: "pin", op: "amount", pinId: "nope", occKey: "k", amount: 1 },
  ] });
  assert.equal(after.pins[0].amounts, undefined);
});

test("overrides survive a rollover into the archive snapshot", () => {
  // A real occurrence key from inside the period, not a placeholder: a rollover only archives a
  // period something was actually recorded against, and an override is matched by its date.
  const k = occurrences(monthlyPin())[0].occKey;
  const s = { ...st(), pins: [monthlyPin({ amounts: { [k]: 950 }, recons: { [k]: "abc" } })] };
  const rolled = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  assert.deepEqual(rolled.monthHistory[0].pins[0].amounts, { [k]: 950 });
  assert.deepEqual(rolled.monthHistory[0].pins[0].recons, { [k]: "abc" });
  assert.deepEqual(rolled.pins[0].amounts, { [k]: 950 }, "pins are recurring, so they carry forward too");
});

test("a period whose only record is a pin override is still archived", () => {
  // "Rent was £950 that month" is hand-entered fact. Nothing else logged that period must not be
  // enough to throw it away.
  const k = occurrences(monthlyPin())[0].occKey;
  for (const override of [{ amounts: { [k]: 950 } }, { skips: [k] }, { recons: { [k]: "abc" } },
                          { moves: { [k]: 2 } }, { orders: { [k]: 5 } }]) {
    const s = { ...st(), entries: [], credits: [], pins: [monthlyPin(override)] };
    const rolled = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
    assert.equal(rolled.monthHistory.length, 1,
      "a period carrying " + Object.keys(override)[0] + " should be archived");
  }
});

test("an override dated OUTSIDE the period does not make it worth archiving", () => {
  // The override maps ride forward on the pin forever, so a stale key from an earlier period
  // must not keep every later empty period alive — that would restore the eviction bug.
  const s = { ...st(), entries: [], credits: [], pins: [monthlyPin({ amounts: { "2019-0-1": 950 } })] };
  const rolled = A.reducer(s, { type: "MONTH_ROLLOVER", newYear: 2026, newMonth: 8, newLabel: "Sep 2026" });
  assert.equal(rolled.monthHistory.length, 0);
});

test("a pin fix can be applied to an archived period", () => {
  const s = { ...st(), monthHistory: [{ monthLabel: "Jul 2026", payYear: 2026, payMonth: 6, entries: [], credits: [], pins: [monthlyPin()] }] };
  const after = A.reducer(s, { type: "RECONCILE_APPLY", ops: [
    { archiveIndex: 0, kind: "pin", op: "amount", pinId: "p1", occKey: "k", amount: 950 },
  ] });
  assert.deepEqual(after.monthHistory[0].pins[0].amounts, { k: 950 });
  assert.equal(after.pins.length, 0, "the live period's pins are untouched");
});

test("scheduled pins still expand without double-counting", () => {
  const pin = monthlyPin();
  const occ = occurrences(pin);
  for (const o of occ) {
    assert.equal(o.pinned, true, "an expanded occurrence is a virtual entry, not a stored one");
    assert.equal(o.pinId, "p1");
    assert.ok(o.day, "and knows its own calendar day");
  }
  assert.equal(A.isScheduledPin(pin), true);
  assert.equal(A.isScheduledPin({ ...pin, freq: "none" }), false, "unscheduled pins keep the flat model");
});
