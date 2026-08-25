// Loads the compiled app.js into a sandbox so its internals can be unit-tested.
//
// app.jsx compiles with `--module none`, so app.js is a plain script: every top-level `function`
// and `const` lives in script scope and nothing is exported. Rather than restructure the app to
// suit the tests, this appends an epilogue that hands the names out, and runs the whole thing in
// a vm context with the few globals it touches at load time stubbed.
//
// Testing the COMPILED file is deliberate: it's what the browser actually runs, so a forgotten
// rebuild after an app.jsx edit shows up here as a failing test rather than as a silent no-op.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const EXPORTS = [
  "genId", "fmt", "fmtAbs", "pad2", "dayKey", "dayKeyToDate", "dayKeyLabel", "addDays",
  "lastWorkingDay", "paydayFor", "periodLabelFor", "periodBounds", "buildWeeks",
  "weekIndexForDay", "todayWeekIndex", "groupByWeek", "effOrder",
  "isScheduledPin", "occKeyOf", "makePinEntry", "expandScheduledPins",
  "defaultState", "normalizeState", "reducer", "rawReducer",
  "reconcilePeriods", "reconcileCandidates", "statementFor", "statementLabel",
  "getRebalancedBudgets", "computeBudgetSummary", "remainingDisplay",
  "owedItems", "owedTotals", "OWED_STALE_PERIODS",
  "DEFAULT_METHODS", "DEFAULT_CATEGORIES",
  "computeSummaryTotals", "periodLeftover",
  "csvEscape", "csvMoney", "exportPeriods", "paydayRuleLabel",
  "buildReportText", "buildLedgerCSV", "buildDataExport", "parseDataExport", "dataExportSummary",
  "EXPORT_VERSION",
];

function loadApp() {
  const file = path.join(__dirname, "..", "app.js");
  const src = fs.readFileSync(file, "utf8");

  const noop = () => {};
  const sandbox = {
    // Only the hooks destructured at the top of app.js need to exist for it to load.
    React: { useState: noop, useEffect: noop, useLayoutEffect: noop, useReducer: noop, useRef: noop, createElement: noop, Fragment: "Fragment" },
    window: {},
    document: { documentElement: { dataset: {} }, querySelector: () => null },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    console,
    Intl, Date, Math, JSON, Object, Array, String, Number, Set, Map, isNaN, parseInt, parseFloat,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.localStorage = sandbox.localStorage;

  const epilogue = "\n;globalThis.__appExports = { " + EXPORTS.join(", ") + " };\n";
  vm.createContext(sandbox);
  try {
    new vm.Script(src + epilogue, { filename: "app.js" }).runInContext(sandbox);
  } catch (e) {
    throw new Error(
      "Could not load app.js into the test sandbox: " + e.message +
      "\nIf app.jsx was edited, rebuild app.js first (see README.md).");
  }
  const out = sandbox.__appExports;
  const missing = EXPORTS.filter(k => out[k] === undefined);
  if (missing.length) throw new Error("app.js no longer defines: " + missing.join(", "));
  return out;
}

module.exports = { loadApp, EXPORTS };
