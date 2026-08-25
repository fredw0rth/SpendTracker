const { test } = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");
const A = loadApp();

// A deliberately awkward account: a split pair, a settled work expense, a scheduled pin carrying
// every kind of per-occurrence override, a flat pin, credits, an archived period, and a
// description containing the three characters CSV cares about.
function seeded() {
  const s = A.normalizeState(A.defaultState());
  s.payYear = 2026; s.payMonth = 7; s.monthLabel = "Aug 2026";
  s.monthlyBudget = 1000; s.weeklyBudget = 250;
  s.paydayKind = "last-working";
  s.entries = [
    { id: "e1", amount: 12.5, label: 'Lunch, "the usual"\nagain', note: "with Sam", method: "Amex",
      type: "personal", category: "eatingout", weekIndex: 1, day: "2026-07-27", order: 1 },
    { id: "e2", amount: 30, label: "Client dinner", method: "Lloyds", type: "business",
      weekIndex: 1, day: "2026-07-28", order: 2, settledOn: "2026-08-03" },
    { id: "e3", amount: 40, label: "Taxi", method: "Amex", type: "personal", category: "transport",
      weekIndex: 2, day: "2026-08-04", order: 3, splitGroupId: "g1" },
    { id: "e4", amount: 60, label: "Taxi", method: "Amex", type: "excluded",
      weekIndex: 2, day: "2026-08-04", order: 4, splitGroupId: "g1" },
    { id: "e5", amount: 20, label: "Undated thing", method: "Cash", type: "personal",
      weekIndex: 2, order: 5 },
  ];
  s.pins = [
    { id: "p1", label: "Gym", amount: 35, method: "Lloyds", type: "personal", category: "personal",
      freq: "monthly", day: 3, skips: ["2026-7-3"], moves: {}, orders: {}, amounts: { "2026-6-3": 40 },
      recons: {} },
    { id: "p2", label: "Rent", amount: 800, method: "HSBC", type: "personal", freq: "none" },
  ];
  s.credits = [
    { id: "c1", amount: 15, label: "Refund", method: "Amex", weekIndex: 2, day: "2026-08-05",
      from: "Argos", order: 6 },
  ];
  s.monthHistory = [
    { monthLabel: "Jul 2026", payYear: 2026, payMonth: 6, monthlyBudget: 1000, weeklyBudget: 250,
      paydayKind: "last-working", paydayDay: 25,
      entries: [{ id: "a1", amount: 55, label: "Old spend", method: "Amex", type: "personal",
                  weekIndex: 1, day: "2026-06-29", order: 1 }],
      pins: [], credits: [] },
  ];
  s.statements = [{ method: "Amex", rows: [{ d: "2026-08-01", n: "TESCO", a: 12.5 }], from: "2026-08-01", to: "2026-08-05", savedAt: "2026-08-06T00:00:00.000Z" }];
  return s;
}

// ─── The data file round trip ────────────────────────────────────────────────

test("a data export parses back to exactly what went in, minus statements", () => {
  const s = seeded();
  const { data } = A.parseDataExport(A.buildDataExport(s, "test"));
  const expected = { ...s };
  delete expected.statements;
  assert.deepEqual(data, expected);
});

test("the envelope names the app, the kind and the version", () => {
  const env = JSON.parse(A.buildDataExport(seeded(), "b1"));
  assert.equal(env.app, "SpendTracker");
  assert.equal(env.kind, "data-export");
  assert.equal(env.version, A.EXPORT_VERSION);
  assert.equal(env.build, "b1");
  assert.ok(env.exportedAt);
  assert.equal(env.data.statements, undefined);
});

test("statements are never carried in the export", () => {
  const env = JSON.parse(A.buildDataExport(seeded(), null));
  assert.equal("statements" in env.data, false);
});

test("REPLACE_STATE installs the import and keeps this device's statements", () => {
  const s = seeded();
  const { data } = A.parseDataExport(A.buildDataExport(s, null));
  // A different device, with its own saved statement and nothing else logged.
  const device = A.normalizeState(A.defaultState());
  device.statements = [{ method: "HSBC", rows: [], savedAt: "2026-08-01T00:00:00.000Z" }];

  const next = A.reducer(device, { type: "REPLACE_STATE", state: data });
  assert.equal(next.entries.length, 5);
  assert.equal(next.pins.length, 2);
  assert.equal(next.monthHistory.length, 1);
  assert.equal(next.monthlyBudget, 1000);
  assert.equal(next.monthLabel, "Aug 2026");
  // The receiving device keeps its own statement cache — it isn't in the export to restore.
  assert.deepEqual(next.statements, device.statements);
});

test("REPLACE_STATE normalises a sparse import rather than trusting it", () => {
  const next = A.reducer(A.normalizeState(A.defaultState()),
    { type: "REPLACE_STATE", state: { monthlyBudget: 500, entries: [{ id: "x", amount: 1, type: "personal", weekIndex: 1 }] } });
  assert.equal(next.monthlyBudget, 500);
  assert.ok(Array.isArray(next.pins));
  assert.ok(Array.isArray(next.credits));
  assert.ok(Array.isArray(next.monthHistory));
  assert.ok(next.methods.length > 0);
  assert.ok(next.categories.length > 0);
});

// ─── parseDataExport's refusals ──────────────────────────────────────────────

test("junk, an account backup and a future version each say what's wrong", () => {
  assert.throws(() => A.parseDataExport("not json at all"), /isn't valid/);
  assert.throws(() => A.parseDataExport("[1,2,3]"), /isn't a SpendTracker export/);
  assert.throws(
    () => A.parseDataExport(JSON.stringify({ app: "SpendTracker", kind: "vault-backup", vault: { wraps: { passphrase: {} }, state: "x" } })),
    /encrypted account backup/);
  assert.throws(
    () => A.parseDataExport(JSON.stringify({ app: "SpendTracker", kind: "data-export", version: 99, data: { entries: [] } })),
    /newer version/);
  assert.throws(
    () => A.parseDataExport(JSON.stringify({ kind: "data-export", version: 1, data: { entries: "nope" } })),
    /"entries" isn't a list/);
  assert.throws(
    () => A.parseDataExport(JSON.stringify({ kind: "data-export", version: 1, data: { entries: [], monthlyBudget: "lots" } })),
    /budget isn't a number/);
  assert.throws(
    () => A.parseDataExport(JSON.stringify({ kind: "data-export", version: 1, data: { theme: "dark" } })),
    /nothing in it to import/);
});

test("a bare state object still imports", () => {
  const s = seeded();
  delete s.statements;
  const { data } = A.parseDataExport(JSON.stringify(s));
  assert.equal(data.entries.length, 5);
});

test("the import preview counts the archives too", () => {
  const info = A.dataExportSummary(seeded());
  assert.equal(info.transactions, 6); // 5 live + 1 archived
  assert.equal(info.credits, 1);
  assert.equal(info.pins, 2);
  assert.equal(info.periods, 1);
  assert.equal(info.monthlyBudget, 1000);
  assert.equal(info.monthLabel, "Aug 2026");
});

// ─── The ledger ──────────────────────────────────────────────────────────────

test("csvEscape quotes only what has to be quoted", () => {
  assert.equal(A.csvEscape("plain"), "plain");
  assert.equal(A.csvEscape("has,comma"), '"has,comma"');
  assert.equal(A.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(A.csvEscape("two\nlines"), '"two\nlines"');
  assert.equal(A.csvEscape(null), "");
  assert.equal(A.csvEscape(0), "0");
});

test("a description with a comma, a quote and a newline survives the CSV round trip", () => {
  const csv = A.buildLedgerCSV(seeded());
  const { rows } = require("../reconcile.js").parseCSV(csv);
  const header = rows[0];
  const descCol = header.indexOf("description");
  const found = rows.slice(1).map(r => r[descCol]);
  assert.ok(found.includes('Lunch, "the usual"\nagain'),
    "the awkward description did not come back intact: " + JSON.stringify(found));
  // Every row must have the same number of fields as the header, or a spreadsheet misaligns.
  rows.forEach((r, i) => assert.equal(r.length, header.length, "row " + i + " has " + r.length + " fields"));
});

test("the ledger covers entries, pin occurrences, flat pins and credits, across every period", () => {
  const s = seeded();
  const { rows } = require("../reconcile.js").parseCSV(A.buildLedgerCSV(s));
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const body = rows.slice(1);

  const bySource = (v) => body.filter(r => r[col("source")] === v);
  assert.equal(bySource("logged").length, 5 + 1 + 1, "5 live entries + 1 archived entry + 1 credit");
  // p1 is monthly with one occurrence skipped; p2 is flat. Archives hold no pins here.
  const pinned = bySource("pinned");
  assert.ok(pinned.length >= 1);
  assert.ok(pinned.some(r => r[col("description")] === "Rent" && r[col("pinFrequency")] === "none"));

  // Both periods are represented, oldest first.
  const periods = [...new Set(body.map(r => r[col("period")]))];
  assert.deepEqual(periods.slice(0, 1), ["Jul 2026"]);
  assert.ok(periods.includes("Aug 2026"));

  // Credits are money in.
  const credit = body.find(r => r[col("type")] === "credit");
  assert.equal(credit[col("direction")], "in");
  assert.equal(credit[col("description")], "Refund");
});

test("a split carries both roles and the full amount the card was charged", () => {
  const { rows } = require("../reconcile.js").parseCSV(A.buildLedgerCSV(seeded()));
  const header = rows[0];
  const col = (n) => header.indexOf(n);
  const halves = rows.slice(1).filter(r => r[col("splitGroupId")] === "g1");
  assert.equal(halves.length, 2);
  const yours = halves.find(r => r[col("splitRole")] === "yours");
  const theirs = halves.find(r => r[col("splitRole")] === "theirs");
  assert.equal(yours[col("amount")], "40.00");
  assert.equal(theirs[col("amount")], "60.00");
  // Neither half knows the real charge on its own — that's the whole reason the column exists.
  assert.equal(yours[col("splitTotal")], "100.00");
  assert.equal(theirs[col("splitTotal")], "100.00");
  assert.equal(yours[col("reimbursable")], "no");
  assert.equal(theirs[col("reimbursable")], "yes");
});

test("reimbursable rows carry whether they've been paid back", () => {
  const { rows } = require("../reconcile.js").parseCSV(A.buildLedgerCSV(seeded()));
  const header = rows[0];
  const col = (n) => header.indexOf(n);
  const work = rows.slice(1).find(r => r[col("id")] === "e2");
  assert.equal(work[col("type")], "business");
  assert.equal(work[col("typeLabel")], "Work");
  assert.equal(work[col("reimbursable")], "yes");
  assert.equal(work[col("settled")], "yes");
  assert.equal(work[col("settledOn")], "2026-08-03");
  // A personal spend is not a claim, so the settled column stays empty rather than saying "no".
  const personal = rows.slice(1).find(r => r[col("id")] === "e1");
  assert.equal(personal[col("settled")], "");
});

test("ids resolve to display names without losing the id", () => {
  const { rows } = require("../reconcile.js").parseCSV(A.buildLedgerCSV(seeded()));
  const header = rows[0];
  const col = (n) => header.indexOf(n);
  const lunch = rows.slice(1).find(r => r[col("id")] === "e1");
  assert.equal(lunch[col("category")], "Eating out");
  assert.equal(lunch[col("categoryId")], "eatingout");
  assert.equal(lunch[col("card")], "Amex");
  assert.equal(lunch[col("cardId")], "Amex");
});

// ─── The waterfall, and the report that prints it ────────────────────────────

test("computeSummaryTotals holds its invariants", () => {
  const s = seeded();
  // The report and the Summary tab are handed data with scheduled pins already expanded, which is
  // what App's effectiveData does; mirror that here.
  const { start, end } = A.periodBounds(s.payYear, s.payMonth, s.paydayKind, s.paydayDay);
  const weeks = A.buildWeeks(start, end);
  const data = {
    ...s,
    entries: [...s.entries, ...A.expandScheduledPins(s.pins, weeks)],
    pins: s.pins.filter(p => !A.isScheduledPin(p)),
  };
  const t = A.computeSummaryTotals(data, s.methods, s.categories);
  assert.equal(Math.round((t.businessTotal + t.splitTotal) * 100), Math.round(t.reimbursableTotal * 100));
  assert.equal(Math.round((t.grossSpend - t.reimbursableTotal) * 100), Math.round(t.netTotal * 100));
  // Credits are reported, but are not a term in the waterfall.
  assert.equal(t.totalCredits, 15);
  // Gross per card must add up to gross.
  const summed = Object.keys(t.grossByMethod).reduce((a, k) => a + t.grossByMethod[k], 0);
  assert.equal(Math.round(summed * 100), Math.round(t.grossSpend * 100));
  // Net per card must add up to net.
  const summedNet = Object.keys(t.netByMethod).reduce((a, k) => a + t.netByMethod[k], 0);
  assert.equal(Math.round(summedNet * 100), Math.round(t.netTotal * 100));
});

test("a category that no longer exists folds into Uncategorised rather than vanishing", () => {
  const s = seeded();
  s.entries = [{ id: "z", amount: 10, label: "Ghost", method: "Amex", type: "personal",
                 category: "deleted-cat", weekIndex: 1, order: 1 }];
  s.pins = [];
  const t = A.computeSummaryTotals(s, s.methods, s.categories);
  assert.equal(t.uncategorisedTotal, 10);
  assert.equal(t.categoryRows.length, 1);
  assert.equal(t.categoryRows[0].cat, null);
  assert.equal(t.netTotal, 10);
});

test("the report prints a waterfall that reconciles, and covers what the old one missed", () => {
  const s = seeded();
  const { start, end } = A.periodBounds(s.payYear, s.payMonth, s.paydayKind, s.paydayDay);
  const weeks = A.buildWeeks(start, end);
  const data = {
    ...s,
    entries: [...s.entries, ...A.expandScheduledPins(s.pins, weeks)],
    pins: s.pins.filter(p => !A.isScheduledPin(p)),
  };
  const budgets = A.getRebalancedBudgets(weeks, data.entries, s.weeklyBudget, data.credits);
  const text = A.buildReportText(data, weeks, budgets, s);

  assert.match(text, /SpendTracker — Aug 2026/);
  assert.match(text, /payday: last working day/);
  assert.match(text, /GROSS VS NET/);
  assert.match(text, /BY CATEGORY \(net personal spend\)/);
  assert.match(text, /BY CARD/);
  assert.match(text, /LARGEST SPENDS/);
  assert.match(text, /OWED BACK TO YOU/);
  assert.match(text, /SAVINGS \(completed periods\)/);
  assert.match(text, /FIXED COSTS/);
  // The things the old report could not say.
  assert.match(text, /Eating out/);          // categories
  assert.match(text, /split — not yours/);   // which half of a split
  assert.match(text, /Undated/);             // entries with no day, rather than silently dropped
  assert.match(text, /paid back/);           // a settled claim

  // The printed waterfall must add up the same way the numbers do.
  const money = (label) => {
    const m = text.match(new RegExp(label + "\\s+£([\\d,]+\\.\\d\\d)"));
    assert.ok(m, "no line for " + label + " in:\n" + text);
    return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
  };
  const gross = money("Gross \\(as charged\\)");
  const work = money("− Work");
  const split = money("− Split \\(not yours\\)");
  const net = money("= Net personal spend");
  assert.equal(gross - work - split, net);
});

test("a period with nothing logged still produces a readable report", () => {
  const s = A.normalizeState(A.defaultState());
  const { start, end } = A.periodBounds(s.payYear, s.payMonth, s.paydayKind, s.paydayDay);
  const weeks = A.buildWeeks(start, end);
  const text = A.buildReportText({ ...s, pins: [] }, weeks, {}, s);
  assert.match(text, /\(nothing logged\)/);
  assert.doesNotMatch(text, /OWED BACK TO YOU/);
  assert.doesNotMatch(text, /SAVINGS/);
});

test("exportPeriods runs oldest first, the reverse of reconcilePeriods", () => {
  const s = seeded();
  const ordered = A.exportPeriods(s);
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0].label, "Jul 2026");
  assert.equal(ordered[0].archiveIndex, 0);
  assert.equal(ordered[1].label, "Aug 2026");
  assert.equal(ordered[1].archiveIndex, null);
});

test("paydayRuleLabel names a fixed date's day", () => {
  assert.equal(A.paydayRuleLabel({ paydayKind: "last-working" }), "last working day");
  assert.equal(A.paydayRuleLabel({ paydayKind: "last-friday" }), "last Friday");
  assert.equal(A.paydayRuleLabel({ paydayKind: "fixed", paydayDay: 25 }), "fixed date (25)");
  assert.equal(A.paydayRuleLabel({}), "last working day");
});

test("periodLeftover matches the header's remaining, on the period's own budget", () => {
  const m = seeded().monthHistory[0];
  // 1000 budget − 55 personal + 0 credits
  assert.equal(A.periodLeftover(m), 945);
});
