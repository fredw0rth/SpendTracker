const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// The rollover effect in App() advances the period by exactly ONE month per dispatch, and
// re-runs while today is still past the current label's payday. So reopening the app after a
// long absence rolls once per elapsed month. These tests drive that same loop directly.
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function catchUp(state, nowDate, cap = 200) {
  let s = state, rolls = 0;
  const now = new Date(nowDate); now.setHours(0, 0, 0, 0);
  while (rolls < cap) {
    const payday = A.paydayFor(s.payYear, s.payMonth, s.paydayKind || "last-working", s.paydayDay);
    if (!(now >= payday)) break;
    const nextMonth = s.payMonth + 1 > 11 ? 0 : s.payMonth + 1;
    const nextYear = s.payMonth + 1 > 11 ? s.payYear + 1 : s.payYear;
    s = A.rawReducer(s, { type: "MONTH_ROLLOVER", newYear: nextYear, newMonth: nextMonth,
                          newLabel: MONTH_NAMES[nextMonth] + " " + nextYear });
    rolls++;
  }
  assert.ok(rolls < cap, "rollover catch-up did not terminate");
  return { state: s, rolls };
}

// A live period at Aug 2026 holding hand-logged data plus a standing pin.
function seeded() {
  const s = A.normalizeState(A.defaultState());
  s.payYear = 2026; s.payMonth = 7; s.monthLabel = "Aug 2026";
  s.entries = [{ id: "e1", amount: 42.5, label: "Real spend", type: "personal",
                 method: "amex", weekIndex: 1, date: "2026-08-05T10:00:00Z", day: "2026-08-05" }];
  s.credits = [{ id: "c1", amount: 20, label: "Refund", method: "amex", weekIndex: 1,
                 date: "2026-08-06T10:00:00Z" }];
  s.pins = [{ id: "p1", label: "Rent", amount: 900, method: "amex", type: "personal" }];
  return s;
}

const realArchive = (s) => (s.monthHistory || []).find(a => a.payYear === 2026 && a.payMonth === 7);

// ─── The reported bug ─────────────────────────────────────────────────────────
// Every month away used to archive an EMPTY period. Twelve of those pushed the one real
// archive past .slice(-12) and destroyed it — a 13-month gap lost everything.

test("a long absence does not evict real history behind empty periods", () => {
  for (const [gapMonths, when] of [[13, [2027, 8, 15]], [18, [2028, 1, 15]], [60, [2031, 7, 15]]]) {
    const { state } = catchUp(seeded(), new Date(...when));
    const arc = realArchive(state);
    assert.ok(arc, `Aug 2026 archive was evicted after a ${gapMonths}-month absence`);
    assert.equal(arc.entries.length, 1, "the archived entry survived");
    assert.equal(arc.credits.length, 1, "the archived credit survived");
  }
});

test("periods nobody logged anything in are never archived", () => {
  const { state } = catchUp(seeded(), new Date(2027, 8, 15)); // 13 months away
  assert.equal(state.monthHistory.length, 1, "only the one period with real activity is kept");
  assert.equal(state.monthHistory[0].monthLabel, "Aug 2026");
});

test("a standing pin does not by itself make an untracked period worth archiving", () => {
  // Pins ride through every rollover untouched, so they are present in an archive whether or
  // not the app was ever opened. If they counted as activity, the eviction bug would be back
  // for anyone using pins at all — which is most people.
  const s = A.normalizeState(A.defaultState());
  s.payYear = 2026; s.payMonth = 7; s.monthLabel = "Aug 2026";
  s.entries = []; s.credits = [];
  s.pins = [{ id: "p1", label: "Rent", amount: 900, method: "amex", type: "personal" }];
  const { state } = catchUp(s, new Date(2027, 8, 15));
  assert.equal(state.monthHistory.length, 0, "nothing was logged, so nothing is archived");
  assert.equal(state.pins.length, 1, "the pin itself still carries forward");
});

test("consecutive tracked periods still archive normally, oldest-first, capped at 12", () => {
  // Roll fourteen months, logging one entry in each, and check the cap trims the OLDEST.
  let s = seeded();
  for (let i = 0; i < 14; i++) {
    const nextMonth = s.payMonth + 1 > 11 ? 0 : s.payMonth + 1;
    const nextYear = s.payMonth + 1 > 11 ? s.payYear + 1 : s.payYear;
    s = A.rawReducer(s, { type: "MONTH_ROLLOVER", newYear: nextYear, newMonth: nextMonth,
                          newLabel: MONTH_NAMES[nextMonth] + " " + nextYear });
    s = A.rawReducer(s, { type: "ADD_ENTRY", entry: { id: "x" + i, amount: 10, type: "personal",
                                                      method: "amex", weekIndex: 1 } });
  }
  assert.equal(s.monthHistory.length, 12, "still capped at twelve");
  assert.ok(!realArchive(s), "the oldest period is correctly trimmed once twelve real ones exist");
  s.monthHistory.forEach(a => assert.ok(a.entries.length > 0, "every kept archive has real data"));
});

test("a rollover carries settings, categories and pins forward untouched", () => {
  const s = seeded();
  s.theme = "light"; s.categoryPrompt = false; s.lastMethod = "amex";
  const { state } = catchUp(s, new Date(2026, 8, 15));
  assert.equal(state.theme, "light");
  assert.equal(state.categoryPrompt, false);
  assert.equal(state.lastMethod, "amex");
  assert.equal(state.pins.length, 1, "pins are recurring by design");
  assert.equal(state.categories.length, s.categories.length);
  assert.equal(state.monthlyBudget, s.monthlyBudget);
  assert.deepEqual(state.entries, [], "the new period starts empty");
  assert.deepEqual(state.credits, []);
});
