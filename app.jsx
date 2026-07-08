const { useState, useEffect, useReducer, useRef } = React;

// ─── Constants ────────────────────────────────────────────────────────────────
const METHODS = ["Amex", "Lloyds", "HSBC", "Cash"];
const METHOD_COLOR = { Amex: "#60a5fa", Lloyds: "#34d399", HSBC: "#f87171", Cash: "#fbbf24" };
const STORAGE_KEY = "spendtracker_v6";

// Persistence goes through the encrypted session in crypto.js (window.SpendVault),
// which holds the decrypted state in memory and writes only ciphertext to disk.
// App is never rendered until crypto.js's Root has unlocked, so getState() is set.
function load() { return (window.SpendVault && window.SpendVault.getState) ? window.SpendVault.getState() : null; }
function save(s) { if (window.SpendVault && window.SpendVault.save) window.SpendVault.save(s); }

const fmt = (n) => "£" + Number(Math.abs(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dayName = (d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
const monthName = (d) => MONTH_NAMES[d.getMonth()];
const dateStr = (d) => `${dayName(d)} ${d.getDate()} ${monthName(d)}`;
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

function londonNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  const hour = p.hour === "24" ? "00" : p.hour;
  return new Date(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`);
}

function lastWorkingDay(year, month) {
  let d = new Date(year, month + 1, 0);
  while (isWeekend(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return d;
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// Given a date, find which period it falls into under the new model: a period labelled X
// starts on (X-1)'s payday and ends the day before X's own payday. Walks forward from the
// date's calendar month until it finds the first month whose payday hasn't happened yet —
// that month is the correct label. Needed because "today's calendar month" is not generally
// the same as "the period label today belongs to" (e.g. payday itself already belongs to
// next month's label, not the current one).
function periodLabelFor(date) {
  let y = date.getFullYear(), m = date.getMonth();
  for (let i = 0; i < 3; i++) {
    const payday = lastWorkingDay(y, m);
    if (date < payday) return { year: y, month: m };
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return { year: y, month: m };
}

function buildWeeks(payStart, payEnd, amexCutoff, lloydsCutoff) {
  // Weeks start from payStart (payday itself — the new period begins the day you're paid), run sun-sun
  const days = [];
  let cur = new Date(payStart);
  while (cur <= payEnd) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  const weeks = [];
  let weekDays = [];
  for (const d of days) {
    weekDays.push(d);
    if (d.getDay() === 0 || d.getTime() === payEnd.getTime()) {
      weeks.push([...weekDays]);
      weekDays = [];
    }
  }
  if (weekDays.length > 0) weeks.push(weekDays);
  return weeks.map((days, i) => ({
    index: i + 1,
    start: days[0],
    end: days[days.length - 1],
    days,
  }));
}

function todayWeekIndex(weeks) {
  const norm = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = norm(new Date());
  for (const w of weeks) {
    if (today >= norm(w.start) && today <= norm(w.end)) return w.index;
  }
  if (today < norm(weeks[0]?.start)) return 1;
  return weeks[weeks.length - 1]?.index || 1;
}

// ─── Default State ────────────────────────────────────────────────────────────
function defaultState() {
  const now = londonNow();
  now.setHours(0,0,0,0);
  const { year: y, month: m } = periodLabelFor(now);
  return {
    monthLabel: `${MONTH_NAMES[m]} ${y}`,
    payYear: y,
    payMonth: m,
    monthlyBudget: 1069.65,
    weeklyBudget: 260,
    amexCutoff: 28,
    lloydsCutoff: 3,
    lastMethod: "Amex",
    helpHintSeen: false, // drives the one-time "take a tour" hint for brand-new accounts only
    entries: [],
    pins: [],
    credits: [],
    monthHistory: [],
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(s, a) {
  switch (a.type) {
    case "ADD_ENTRY": return { ...s, entries: [a.entry, ...s.entries], lastMethod: (a.entry.type !== "credit" && a.entry.type !== "excluded" && a.entry.method) ? a.entry.method : s.lastMethod };
    case "DEL_ENTRY": return { ...s, entries: s.entries.filter(e => e.id !== a.id) };
    case "UPD_ENTRY": return { ...s, entries: s.entries.map(e => e.id === a.entry.id ? a.entry : e) };
    case "ADD_PIN": return { ...s, pins: [...s.pins, a.pin] };
    case "DEL_PIN": return { ...s, pins: s.pins.filter(p => p.id !== a.id) };
    case "UPD_PIN": return { ...s, pins: s.pins.map(p => p.id === a.pin.id ? a.pin : p) };
    case "ADD_CREDIT": return { ...s, credits: [a.credit, ...(s.credits||[])] };
    case "DEL_CREDIT": return { ...s, credits: (s.credits||[]).filter(c => c.id !== a.id) };
    case "UPD_CREDIT": return { ...s, credits: (s.credits||[]).map(c => c.id === a.credit.id ? a.credit : c) };
    case "SETTINGS": return { ...s, ...a.patch };
    case "MONTH_ROLLOVER": {
      // Snapshot budget figures as they stood this period, so looking back later
      // recalculates against what was actually true then, not today's settings.
      const archive = {
        monthLabel: s.monthLabel,
        payYear: s.payYear,
        payMonth: s.payMonth,
        entries: s.entries,
        pins: s.pins,
        credits: s.credits || [],
        monthlyBudget: s.monthlyBudget,
        weeklyBudget: s.weeklyBudget,
        amexCutoff: s.amexCutoff,
        lloydsCutoff: s.lloydsCutoff,
      };
      const newHistory = [...(s.monthHistory||[]), archive].slice(-12);
      return { payYear: a.newYear, payMonth: a.newMonth, monthLabel: a.newLabel,
        monthlyBudget: s.monthlyBudget, weeklyBudget: s.weeklyBudget,
        amexCutoff: s.amexCutoff, lloydsCutoff: s.lloydsCutoff, pins: s.pins, monthHistory: newHistory,
        entries: [], credits: [] };
    }
    case "EDIT_PAST_ENTRY": {
      // Writes an entry change back into the archived period being viewed, not live state
      const newHistory = (s.monthHistory||[]).map((arc, i) => {
        if (i !== a.archiveIndex) return arc;
        if (a.op === "add") return { ...arc, entries: [a.entry, ...arc.entries] };
        if (a.op === "del") return { ...arc, entries: arc.entries.filter(e => e.id !== a.id) };
        if (a.op === "upd") return { ...arc, entries: arc.entries.map(e => e.id === a.entry.id ? a.entry : e) };
        return arc;
      });
      return { ...s, monthHistory: newHistory };
    }
    case "EDIT_PAST_CREDIT": {
      const newHistory = (s.monthHistory||[]).map((arc, i) => {
        if (i !== a.archiveIndex) return arc;
        if (a.op === "add") return { ...arc, credits: [a.credit, ...(arc.credits||[])] };
        if (a.op === "del") return { ...arc, credits: (arc.credits||[]).filter(c => c.id !== a.id) };
        if (a.op === "upd") return { ...arc, credits: (arc.credits||[]).map(c => c.id === a.credit.id ? a.credit : c) };
        return arc;
      });
      return { ...s, monthHistory: newHistory };
    }
    case "RESET": return { ...defaultState(), ...a.keep };
    default: return s;
  }
}

// ─── Help content: plain-English explainers, shown in the Settings "How it works" card ──
const HELP_TOPICS = [
  ["The pay period", "SpendTracker follows your pay cycle, not the calendar month. A period runs from your last payday up to the day before your next one, and switches over automatically the moment payday arrives. The month label at the top names the period you're currently spending in."],
  ["Weekly budgets & rollover", "Your monthly budget is split into weekly allowances. Anything you don't spend in a week rolls forward into the next; if you go over, the difference comes out of later weeks. The final week absorbs whatever's left, so the period always balances out."],
  ["The “per day” figures", "On the current week you'll see two per-day numbers: how much you can spend each remaining day to stay inside this week, and the same across the rest of the whole period. They turn red as they get tight."],
  ["Logging: cards & types", "Tap ＋ (or “Log spend”) to record spending. Pick the card, then a type — Personal counts against your budget, Work is reimbursable and kept separate, Credit is money coming in, and Split is for shared payments. Amounts type in pence: the display fills from the right, so tapping 1-2-5-0 gives £12.50. Tap any logged item to edit it."],
  ["Splitting a payment", "Choose Split, enter the full amount you paid, then enter just the part that isn't yours — a friend's share, or a work expense. Your share counts against your budget; the rest is set aside and doesn't."],
  ["Pinned costs", "Pins are fixed, recurring costs — rent, subscriptions, a gym. They count against the period's budget automatically without logging them each time, and carry across periods. Mark one Work or “Not me” to keep it out of your personal total."],
  ["Savings", "When a period ends, whatever budget you had left is banked on the Savings tab. The current period isn't counted until it finishes — so a brand-new month shows £0 saved until it rolls over — and the list shows each completed period's leftover."],
  ["Summary & export", "The Summary tab breaks the period down: spend vs budget, personal vs reimbursable work spend, a per-card breakdown you can tap into, your biggest spends, and where spending came from. You can export it all as text."],
  ["Going back to a past period", "In Settings, “Go back to…” lets you revisit a finished period. Its figures reflect that period's own budget, and any edits you make there apply only to it — your current period is left untouched."],
  ["Your data & security", "Everything is encrypted on your device with your passphrase and never leaves your phone. Your recovery code is the only way back in if you forget the passphrase, so keep it somewhere safe. Face ID unlocks where supported, the app auto-locks after a couple of minutes in the background, and the 🔒 button locks it instantly."],
  ["Moving to another device", "Each browser keeps its own separate data. Use Export account (below) to get an encrypted backup, then import it in another browser or on a new phone to carry everything across."],
];

// Collapsible "How it works" card: an outer expand reveals a single-open topic accordion.
// `focus` flips true from the new-user hint's "Show me" → open the card + first topic and scroll to it.
function HelpCard({ focus }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(null); // index of the open topic, or null
  const ref = useRef(null);

  useEffect(() => {
    if (focus) {
      setExpanded(true);
      setOpen(0);
      if (ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus]);

  return (
    <div ref={ref} style={S.settingsCard}>
      <button style={{ background:"none", border:"none", width:"100%", padding:0, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize:11, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.04em" }}>How it works</span>
        <span style={{ color:"#64748b", fontSize:12 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div style={{ marginTop:6 }}>
          {HELP_TOPICS.map(([q, a], i) => (
            <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #1e293b" }}>
              <button style={{ background:"none", border:"none", width:"100%", padding:"10px 0", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, cursor:"pointer", textAlign:"left" }} onClick={() => setOpen(open === i ? null : i)}>
                <span style={{ fontSize:13, fontWeight:600, color:"#cbd5e1" }}>{q}</span>
                <span style={{ color:"#475569", fontSize:12, flexShrink:0 }}>{open === i ? "▾" : "▸"}</span>
              </button>
              {open === i && <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.6, padding:"0 0 12px" }}>{a}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [state, dispatch] = useReducer(reducer, null, () => load() || defaultState());
  const [tab, setTab] = useState("week");
  const [activeWeek, setActiveWeek] = useState(1);
  const [showEntryFor, setShowEntryFor] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // { kind:"entry"|"credit", data, weekIndex } being edited, or null
  const [showAddPin, setShowAddPin] = useState(false);
  const [editPin, setEditPin] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showBackup, setShowBackup] = useState(false); // export-account modal
  const [showImportAcct, setShowImportAcct] = useState(false); // import-account modal
  const [confirmWipe, setConfirmWipe] = useState(false); // two-step guard on the "erase all data" button
  const [helpFocus, setHelpFocus] = useState(false); // when true, Settings' "How it works" card auto-opens (from the new-user hint)
  const [viewingPastIndex, setViewingPastIndex] = useState(null); // index into state.monthHistory, or null for live

  // If history trims (caps at 12 months) while a past period is being viewed, the index
  // it pointed at could now be stale — fall back to live rather than show the wrong period.
  useEffect(() => {
    if (viewingPastIndex !== null && (!state.monthHistory || viewingPastIndex >= state.monthHistory.length)) {
      setViewingPastIndex(null);
    }
  }, [state.monthHistory]);

  // When viewing a past period, every figure in the app should reflect that period's
  // own data and budget settings — not today's live state. effectiveData stands in for
  // state everywhere below, so none of the existing derivation logic needs to know
  // whether it's looking at the live month or an archived one.
  const viewingPast = viewingPastIndex !== null && state.monthHistory && state.monthHistory[viewingPastIndex];
  const effectiveData = viewingPast || state;

  // Auto-switch month — a period labelled X starts on (X-1)'s payday and runs up to (not
  // including) X's own payday, since X's payday is what pays you for the work X represents
  // and is the moment you clear last period's card debt. So the switch to X+1 fires the
  // instant today reaches X's payday — payday itself is day one of the next period, not
  // the last day of the current one.
  useEffect(() => {
    const checkMonth = () => {
      const now = londonNow();
      now.setHours(0,0,0,0);
      const thisLabelPayday = lastWorkingDay(state.payYear, state.payMonth);
      if (now >= thisLabelPayday) {
        const nextMonth = state.payMonth + 1 > 11 ? 0 : state.payMonth + 1;
        const nextYear = state.payMonth + 1 > 11 ? state.payYear + 1 : state.payYear;
        const label = MONTH_NAMES[nextMonth] + " " + nextYear;
        dispatch({ type: "MONTH_ROLLOVER", newYear: nextYear, newMonth: nextMonth, newLabel: label });
      }
    };
    checkMonth();
    const interval = setInterval(checkMonth, 60000);
    return () => clearInterval(interval);
  }, [state.payYear, state.payMonth]);

  useEffect(() => { save(state); }, [state]);

  // Build calendar from payday — uses effectiveData so a past period's own pay dates and
  // cutoffs are used when viewing it, not today's live settings.
  //
  // Period labelling: a period is named for the month its payday is paying you for. Since
  // you get paid on the last working day of a month for that month's work, and that payday
  // is when last month's card debt gets cleared and a fresh accounting period begins, the
  // period labelled "July" starts on JUNE's payday and runs up to (not including) JULY's
  // payday. payYear/payMonth store the label (X); periodStart/periodEnd are derived from it.
  const { payYear: y, payMonth: m } = effectiveData;
  const prevMonth = m - 1 < 0 ? 11 : m - 1;
  const prevMonthYear = m - 1 < 0 ? y - 1 : y;
  const periodStart = lastWorkingDay(prevMonthYear, prevMonth);
  const nextPayday = lastWorkingDay(y, m);
  const periodEnd = addDays(nextPayday, -1);
  // Fractional weeks in this pay period, so Settings can convert monthly <-> weekly
  // the same way first-run setup does (crypto.js uses the identical days/7 basis).
  const periodDays = Math.round((periodEnd - periodStart) / 86400000) + 1;
  const weeksInPeriod = periodDays / 7;
  const weeks = buildWeeks(periodStart, periodEnd, effectiveData.amexCutoff, effectiveData.lloydsCutoff);

  useEffect(() => {
    const idx = todayWeekIndex(weeks);
    setActiveWeek(idx);
  }, [state.payMonth, state.payYear, viewingPastIndex]);

  // Weekly budget rebalancing
  function getRebalancedBudgets(weeks, entries, weeklyBudget) {
    const budgets = {};
    let carryOver = 0;
    weeks.forEach((w, i) => {
      const isLast = i === weeks.length - 1;
      const rawBudget = weeklyBudget - carryOver;
      const budget = isLast ? Math.max(rawBudget, 0.01) : Math.floor(rawBudget / 10) * 10;
      budgets[w.index] = Math.max(budget, 0);
      const wSpend = entries.filter(e => e.weekIndex === w.index && e.type === "personal").reduce((s,e)=>s+e.amount,0);
      carryOver = Math.max(wSpend - budget, 0);
    });
    return budgets;
  }

  // Derived figures — all from effectiveData, so these reflect whichever period is being viewed
  const personalEntries = effectiveData.entries.filter(e => e.type === "personal");
  const businessEntries = effectiveData.entries.filter(e => e.type === "business");
  const totalPinned = effectiveData.pins.filter(p => p.type !== "business" && p.type !== "excluded").reduce((s, p) => s + (p.amount || 0), 0);
  const totalEntries = personalEntries.reduce((s, e) => s + e.amount, 0);
  const totalSpent = totalPinned + totalEntries;
  const totalCredits = (effectiveData.credits || []).reduce((s, c) => s + c.amount, 0);
  const remaining = effectiveData.monthlyBudget - totalSpent + totalCredits;

  const byMethod = (entries, pins) => {
    const res = {};
    METHODS.forEach(m => {
      res[m] = entries.filter(e => e.method === m).reduce((s, e) => s + e.amount, 0) +
        pins.filter(p => p.method === m).reduce((s, p) => s + (p.amount || 0), 0);
    });
    return res;
  };
  const methodTotals = byMethod(personalEntries, effectiveData.pins.filter(p => p.type !== "business" && p.type !== "excluded"));

  const rebalancedBudgets = getRebalancedBudgets(weeks, effectiveData.entries, effectiveData.weeklyBudget);

  // Daily budgets — only meaningful for the live period; a past period has no "days left".
  // currentWeekObj is explicitly null while viewing the past so every figure below that
  // depends on it (already all guarded by `currentWeekObj ? ... : ...`) automatically and
  // correctly goes inert, rather than comparing today's real date against an archived
  // period's date range (which would rarely match and would be meaningless if it did).
  const todayDate = (() => { const d = londonNow(); d.setHours(0,0,0,0); return d; })();
  const normDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const currentWeekObj = viewingPast ? null : (weeks.find(w => todayDate >= normDay(w.start) && todayDate <= normDay(w.end)) || weeks[0]);
  const daysLeftInWeek = currentWeekObj ? currentWeekObj.days.filter(d => normDay(d) >= todayDate).length : 1;
  const daysLeftInMonth = viewingPast ? 0 : (() => { let c=new Date(todayDate), count=0; while(normDay(c)<=normDay(periodEnd)){count++;c=addDays(c,1);} return Math.max(count,1); })();
  const currentWeekBudget = currentWeekObj ? (rebalancedBudgets[currentWeekObj.index] ?? effectiveData.weeklyBudget) : effectiveData.weeklyBudget;
  const currentWeekSpent = currentWeekObj ? effectiveData.entries.filter(e=>e.weekIndex===currentWeekObj.index&&e.type==="personal").reduce((s,e)=>s+e.amount,0) : 0;
  const weekRemaining = Math.max(currentWeekBudget - currentWeekSpent, 0);
  const dailyFromWeek = daysLeftInWeek > 0 ? weekRemaining / daysLeftInWeek : 0;
  const dailyFromMonth = daysLeftInMonth > 0 ? remaining / daysLeftInMonth : 0;

  const remainColor = remaining < 0 ? "#ef4444" : remaining < effectiveData.monthlyBudget * 0.15 ? "#f97316" : "#22c55e";

  // Index of the archive currently being viewed (last entry in history is the most recent past period)
  const mostRecentArchiveIndex = (state.monthHistory && state.monthHistory.length > 0) ? state.monthHistory.length - 1 : null;

  // Mutation routers: while viewing a past period, edits write back into that archive slot
  // rather than live state. Everything else in the app calls these instead of dispatch directly,
  // so WeekPanel, PinCard, etc. don't need to know which mode they're in.
  function addEntry(entry) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "add", archiveIndex: viewingPastIndex, entry });
    else dispatch({ type: "ADD_ENTRY", entry });
  }
  function delEntry(id) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "del", archiveIndex: viewingPastIndex, id });
    else dispatch({ type: "DEL_ENTRY", id });
  }
  function addCredit(credit) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "add", archiveIndex: viewingPastIndex, credit });
    else dispatch({ type: "ADD_CREDIT", credit });
  }
  function delCredit(id) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "del", archiveIndex: viewingPastIndex, id });
    else dispatch({ type: "DEL_CREDIT", id });
  }
  function updEntry(entry) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "upd", archiveIndex: viewingPastIndex, entry });
    else dispatch({ type: "UPD_ENTRY", entry });
  }
  function updCredit(credit) {
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "upd", archiveIndex: viewingPastIndex, credit });
    else dispatch({ type: "UPD_CREDIT", credit });
  }
  // Pins are shared across periods (they're recurring fixed costs), so pin edits always
  // apply live regardless of which period is being viewed.

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.appTitle}>SpendTracker</div>
          <div style={S.appSub}>{effectiveData.monthLabel}{viewingPast ? " · past period" : ""}</div>
        </div>
        <div style={S.headerRight}>
          <div style={{ ...S.remaining, color: remainColor }}>{fmt(remaining)}</div>
          <div style={S.remainLabel}>left</div>
        </div>
      </div>

      {/* Past-period banner */}
      {viewingPast && (
        <div style={S.pastBanner}>
          <span>Viewing {effectiveData.monthLabel} — changes here apply to that period only</span>
          <button style={S.pastBannerBtn} onClick={() => setViewingPastIndex(null)}>Return to current</button>
        </div>
      )}

      {/* First-run hint — shown once, only to brand-new accounts (helpHintSeen === false) */}
      {!viewingPast && state.helpHintSeen === false && (
        <div style={S.hintBanner}>
          <span>👋 New here? Take a quick tour of how it all works.</span>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            <button style={S.hintBtn} onClick={() => { dispatch({ type:"SETTINGS", patch:{ helpHintSeen: true } }); setTab("settings"); setHelpFocus(true); }}>Show me</button>
            <button style={S.hintDismiss} aria-label="Dismiss" onClick={() => dispatch({ type:"SETTINGS", patch:{ helpHintSeen: true } })}>✕</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {[["week","Week"],["pins","Pinned"],["savings","Savings"],["summary","Summary"],["settings","⚙"]].map(([k,l]) => (
          <button key={k} style={{ ...S.tab, ...(tab===k ? S.tabActive : {}) }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* WEEK VIEW */}
      {tab === "week" && (
        <div style={{ padding:"12px 16px 80px" }}>
          <div style={S.weekNav}>
            {weeks.map(w => (
              <button key={w.index} style={{ ...S.weekPill, ...(activeWeek===w.index ? S.weekPillActive : {}) }} onClick={() => setActiveWeek(w.index)}>W{w.index}</button>
            ))}
          </div>

          {!viewingPast && currentWeekObj && activeWeek === currentWeekObj.index && !isNaN(dailyFromWeek) && (
            <div style={{ display:"flex", gap:10, marginBottom:14 }}>
              <div style={S.dailyCard}>
                <div style={S.dailyLabel}>Per day · week</div>
                <div style={{ fontSize:20, fontWeight:700, color: dailyFromWeek < 20 ? "#ef4444" : "#22c55e" }}>{fmt(dailyFromWeek)}</div>
                <div style={S.dailySub}>{daysLeftInWeek}d left</div>
              </div>
              <div style={S.dailyCard}>
                <div style={S.dailyLabel}>Per day · month</div>
                <div style={{ fontSize:20, fontWeight:700, color: dailyFromMonth < 20 ? "#ef4444" : "#94a3b8" }}>{fmt(dailyFromMonth)}</div>
                <div style={S.dailySub}>{daysLeftInMonth}d left</div>
              </div>
            </div>
          )}

          {weeks.filter(w => w.index === activeWeek).map(week => (
            <WeekPanel key={week.index} week={week} entries={effectiveData.entries.filter(e => e.weekIndex === week.index)} credits={effectiveData.credits.filter(c => c.weekIndex === week.index) || []} weeklyBudget={rebalancedBudgets[week.index] ?? effectiveData.weeklyBudget} isLastWeek={week.index === weeks.length} onAddEntry={() => setShowEntryFor(week.index)} onDelEntry={delEntry} onDelCredit={delCredit} onEditEntry={(entry) => setEditTarget({ kind: "entry", data: entry, weekIndex: entry.weekIndex })} onEditCredit={(credit) => setEditTarget({ kind: "credit", data: credit, weekIndex: credit.weekIndex })} onUpdEntry={updEntry} onUpdCredit={updCredit} />
          ))}
        </div>
      )}

      {/* PINS */}
      {tab === "pins" && (
        <div style={{ padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={S.sectionTitle}>Fixed costs</div>
            <button style={S.addBtn} onClick={() => setShowAddPin(true)}>+ Pin</button>
          </div>
          <div style={S.pinGrid}>
            {state.pins.length === 0 ? <div style={S.empty}>No pinned costs</div> : state.pins.map(p => <PinCard key={p.id} pin={p} onEdit={() => setEditPin(p)} onDelete={() => dispatch({ type: "DEL_PIN", id: p.id })} />)}
          </div>
        </div>
      )}

      {/* SAVINGS */}
      {tab === "savings" && (() => {
        // Savings = accumulated leftover budget from COMPLETED months only (i.e. the
        // months archived into monthHistory). The current live month is not counted
        // until it rolls over, which is why a brand-new user sees £0 all through their
        // first month. A month's leftover is computed exactly like the header's
        // "remaining": its own monthlyBudget − personal spend (entries + pins) + credits.
        const monthSaved = (m) => {
          const spentEntries = m.entries.filter(e => e.type === "personal").reduce((s,e)=>s+e.amount,0);
          const spentPins = m.pins.filter(p => p.type !== "business" && p.type !== "excluded").reduce((s,p)=>s+(p.amount||0),0);
          const credits = (m.credits||[]).reduce((s,c)=>s+c.amount,0);
          return m.monthlyBudget - (spentEntries + spentPins) + credits;
        };
        const rows = (state.monthHistory || [])
          .map(m => { const saved = monthSaved(m); return { label: m.monthLabel, saved, budget: m.monthlyBudget, spent: m.monthlyBudget - saved }; })
          .reverse(); // most recent completed month first
        const totalSaved = rows.reduce((s,r)=>s+r.saved, 0);
        const signed = (n) => (n < 0 ? "-" : "+") + fmt(n);
        return (
        <div style={{ padding:"12px 16px" }}>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"20px", marginBottom:12 }}>
            <div style={{ fontSize:11, color:"#64748b", marginBottom:4, textTransform:"uppercase" }}>Total saved</div>
            <div style={{ fontSize:36, fontWeight:800, color: totalSaved >= 0 ? "#4ade80" : "#f87171", marginBottom:8 }}>{totalSaved < 0 ? "-" : ""}{fmt(totalSaved)}</div>
            <div style={{ fontSize:12, color:"#64748b", lineHeight:1.5 }}>Leftover budget carried over from completed months. {state.monthLabel}'s leftover is added to this once the month ends.</div>
          </div>

          {/* Current month, in progress — deliberately NOT part of the total yet */}
          {!viewingPast && (
            <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:12, padding:"12px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, color:"#cbd5e1", fontWeight:600 }}>{state.monthLabel} <span style={{ color:"#64748b", fontWeight:400 }}>· in progress</span></div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Adds to savings when {state.monthLabel} ends</div>
              </div>
              <div style={{ fontSize:18, fontWeight:700, color: remaining >= 0 ? "#94a3b8" : "#f87171" }}>{signed(remaining)}</div>
            </div>
          )}

          {/* Month-by-month history */}
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Month by month</div>
            {rows.length === 0 ? (
              <div style={{ color:"#475569", fontSize:13, padding:"4px 0", lineHeight:1.5 }}>No completed months yet. Your first month's leftover shows up here once {state.monthLabel} ends.</div>
            ) : rows.map((r,i) => (
              <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom: i < rows.length-1 ? "1px solid #1e293b" : "none" }}>
                <div>
                  <div style={{ fontSize:13, color:"#e2e8f0", fontWeight:600 }}>{r.label}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{fmt(r.spent)} spent of {fmt(r.budget)}</div>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color: r.saved >= 0 ? "#4ade80" : "#f87171" }}>{signed(r.saved)}</div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* SUMMARY */}
      {tab === "summary" && (
        <SummaryView
          state={effectiveData}
          weeks={weeks}
          rebalancedBudgets={rebalancedBudgets}
          totalSpent={totalSpent}
          totalEntries={totalEntries}
          totalPinned={totalPinned}
          totalCredits={totalCredits}
          remaining={remaining}
          methodTotals={methodTotals}
          businessEntries={businessEntries}
          onExport={() => setShowExport(true)}
        />
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div style={{ padding:"12px 16px" }}>
          <HelpCard focus={helpFocus} />

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Budget</div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, color:"#64748b", display:"block", marginBottom:4 }}>Monthly budget (£)</label>
              <input key={`monthlyBudget-${state.monthlyBudget}`} style={S.input} type="number" defaultValue={state.monthlyBudget} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) dispatch({ type:"SETTINGS", patch:{ monthlyBudget: v, weeklyBudget: Math.round((v / weeksInPeriod) * 100) / 100 } }); }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, color:"#64748b", display:"block", marginBottom:4 }}>Weekly budget (£)</label>
              <input key={`weeklyBudget-${state.weeklyBudget}`} style={S.input} type="number" defaultValue={state.weeklyBudget} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) dispatch({ type:"SETTINGS", patch:{ weeklyBudget: v, monthlyBudget: Math.round((v * weeksInPeriod) * 100) / 100 } }); }} />
            </div>
            <div style={{ fontSize:11, color:"#475569" }}>Monthly and weekly are linked across this {periodDays}-day period — changing one recalculates the other.</div>
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Card cutoff dates</div>
            {[["Amex statement date","amexCutoff"],["Lloyds statement date","lloydsCutoff"]].map(([lbl,k])=>(
              <div key={k} style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, color:"#64748b", display:"block", marginBottom:4 }}>{lbl}</label>
                <input key={`${k}-${state[k]}`} style={S.input} type="number" min={1} max={31} defaultValue={state[k]} onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 31) dispatch({ type:"SETTINGS", patch:{ [k]: v } }); }} />
              </div>
            ))}
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Pay period</div>
            <div style={{ fontSize:13, color:"#cbd5e1", marginBottom:10 }}>
              Currently tracking <strong style={{ color:"#f1f5f9" }}>{state.monthLabel}</strong>. A period starts on the previous month's payday and runs until this period's own payday — the tracker switches automatically the moment that payday arrives.
            </div>
            {mostRecentArchiveIndex !== null ? (
              viewingPast ? (
                <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", width:"100%" }} onClick={() => setViewingPastIndex(null)}>
                  ← Return to current period ({state.monthLabel})
                </button>
              ) : (
                <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", width:"100%" }} onClick={() => setViewingPastIndex(mostRecentArchiveIndex)}>
                  ← Go back to {state.monthHistory[mostRecentArchiveIndex].monthLabel}
                </button>
              )
            ) : (
              <div style={{ fontSize:12, color:"#475569" }}>No previous period to go back to yet.</div>
            )}
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Move to another device</div>
            <div style={{ fontSize:13, color:"#cbd5e1", marginBottom:10, lineHeight:1.5 }}>Each browser keeps its own separate data — so Safari, Chrome and the home-screen app each start fresh. Export your account here, then import it in the other browser or on a new phone to carry everything across.</div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...S.btn, background:"#0369a1", flex:1 }} onClick={() => setShowBackup(true)}>Export account</button>
              <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", flex:1 }} onClick={() => setShowImportAcct(true)}>Import account</button>
            </div>
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#f87171", marginBottom:10, textTransform:"uppercase" }}>Reset</div>
            <div style={{ fontSize:13, color:"#cbd5e1", marginBottom:10, lineHeight:1.5 }}>Erase everything on this device — budget, transactions, history and your passphrase — and start over from setup. This can't be undone.</div>
            {!confirmWipe ? (
              <button style={{ ...S.btn, background:"#7f1d1d", border:"1px solid #b91c1c", width:"100%" }} onClick={() => setConfirmWipe(true)}>Reset app &amp; erase all data</button>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", flex:1 }} onClick={() => setConfirmWipe(false)}>Cancel</button>
                <button style={{ ...S.btn, background:"#dc2626", flex:1 }} onClick={() => { if (window.SpendVault && window.SpendVault.wipe) window.SpendVault.wipe(); }}>Erase everything</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick-add — floating button that logs to today's week from any tab (live period only) */}
      {!viewingPast && (
        <button aria-label="Quick add spend" onClick={() => setShowEntryFor(todayWeekIndex(weeks))} style={S.quickAdd}>+</button>
      )}

      {/* Modals */}
      {(showEntryFor !== null || editTarget) && <EntryModal weekIndex={editTarget ? editTarget.weekIndex : showEntryFor} weeks={weeks} edit={editTarget} defaultMethod={state.lastMethod || "Amex"} onSave={addEntry} onSaveCredit={addCredit} onUpdate={updEntry} onUpdateCredit={updCredit} onClose={() => { setShowEntryFor(null); setEditTarget(null); }} />}
      {(showAddPin || editPin) && <PinModal pin={editPin} onSave={pin => { if (editPin) dispatch({ type: "UPD_PIN", pin }); else dispatch({ type: "ADD_PIN", pin }); setShowAddPin(false); setEditPin(null); }} onClose={() => { setShowAddPin(false); setEditPin(null); }} />}
      {showExport && <ExportModal state={effectiveData} weeks={weeks} rebalancedBudgets={rebalancedBudgets} totalSpent={totalSpent} remaining={remaining} totalCredits={totalCredits} methodTotals={methodTotals} onClose={() => setShowExport(false)} />}
      {showBackup && <BackupModal onClose={() => setShowBackup(false)} />}
      {showImportAcct && <ImportBackupModal onClose={() => setShowImportAcct(false)} />}
    </div>
  );
}

// ─── Week Panel ───────────────────────────────────────────────────────────────
function WeekPanel({ week, entries, credits, weeklyBudget, isLastWeek, onAddEntry, onDelEntry, onDelCredit, onEditEntry, onEditCredit, onUpdEntry, onUpdCredit }) {
  const personal = entries.filter(e => e.type === "personal");
  const spent = personal.reduce((s, e) => s + e.amount, 0);
  const over = spent - weeklyBudget;
  const pct = weeklyBudget > 0 ? Math.min((spent / weeklyBudget) * 100, 100) : 0;

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [dragId, setDragId] = useState(null);         // id of the unit being dragged, or null
  const [dragList, setDragList] = useState(null);     // working unit order during a drag, else null
  const dragIdRef = useRef(null);
  const dragListRef = useRef(null);
  const rowRefs = useRef({});                          // unit.id -> row DOM node, for hit-testing during drag

  // Effective ordering key: prefer the explicit `order`, falling back to the creation timestamp so
  // items logged before `order` existed still sort chronologically without any migration.
  const effOrder = (item) => item.order != null ? item.order : (Date.parse(item.date) || 0);

  // One "unit" per rendered row: a solo entry, a whole split pair, or a credit. Entries and credits
  // are merged into a single list sorted by effective order (newest first), so credits interleave
  // with spend chronologically instead of being pinned to the bottom. A manual drag overrides this
  // by rewriting `order`. A split's two halves share one order value, so the pair sorts as a unit.
  const units = [];
  const seenSplits = new Set();
  for (const e of entries) {
    if (e.splitGroupId) {
      if (seenSplits.has(e.splitGroupId)) continue;
      seenSplits.add(e.splitGroupId);
      units.push({ kind: "split", id: e.splitGroupId, order: effOrder(e), group: entries.filter(x => x.splitGroupId === e.splitGroupId) });
    } else {
      units.push({ kind: "single", id: e.id, order: effOrder(e), entry: e });
    }
  }
  for (const c of credits) units.push({ kind: "credit", id: c.id, order: effOrder(c), credit: c });
  units.sort((a, b) => b.order - a.order);

  // During a drag, render the live working order; otherwise the sorted order.
  const renderUnits = dragList || units;

  // Deleting one half of a split removes both halves, since a lone remainder is meaningless
  function handleDelete(entry) {
    if (entry.splitGroupId) {
      entries.filter(e => e.splitGroupId === entry.splitGroupId).forEach(e => onDelEntry(e.id));
    } else {
      onDelEntry(entry.id);
    }
  }

  function toggleSelect(id) {
    setConfirmBulk(false);
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function exitEdit() { setEditMode(false); setSelected(new Set()); setConfirmBulk(false); }

  // Bulk delete every selected unit, expanding split groups to both halves (like handleDelete).
  function bulkDelete() {
    units.forEach(u => {
      if (!selected.has(u.id)) return;
      if (u.kind === "credit") onDelCredit(u.credit.id);
      else if (u.kind === "single") onDelEntry(u.entry.id);
      else u.group.forEach(half => onDelEntry(half.id));
    });
    exitEdit();
  }

  // Persist a hand-reordered list: redistribute the units' existing order values to their new
  // positions (highest value = top). Reusing the existing value set keeps future-logged items —
  // which get a fresh, larger Date.now() — naturally on top. Split halves both take the group's value.
  function commitReorder(finalUnits) {
    if (!finalUnits) return;
    const values = finalUnits.map(u => u.order).sort((a, b) => b - a);
    finalUnits.forEach((u, i) => {
      const newOrder = values[i];
      if (u.order === newOrder) return;
      if (u.kind === "credit") onUpdCredit({ ...u.credit, order: newOrder });
      else if (u.kind === "single") onUpdEntry({ ...u.entry, order: newOrder });
      else u.group.forEach(half => onUpdEntry({ ...half, order: newOrder }));
    });
  }

  // Hand-rolled drag reorder (no DnD library available). Works for touch and mouse; on each move we
  // hit-test the pointer against the other rows' midpoints to find the drop index.
  function beginDrag(clientY, unit, isTouch) {
    dragIdRef.current = unit.id;
    dragListRef.current = units;
    setDragId(unit.id);
    setDragList(units);

    const move = (y) => {
      const prev = dragListRef.current;
      const id = dragIdRef.current;
      const without = prev.filter(u => u.id !== id);
      let to = without.length;
      for (let i = 0; i < without.length; i++) {
        const el = rowRefs.current[without[i].id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { to = i; break; }
      }
      const moved = prev.find(u => u.id === id);
      const next = without.slice();
      next.splice(to, 0, moved);
      if (next.some((u, i) => u.id !== prev[i].id)) { dragListRef.current = next; setDragList(next); }
    };
    const onTouchMove = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
    const onMouseMove = (e) => move(e.clientY);
    const end = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
      commitReorder(dragListRef.current);
      dragIdRef.current = null; dragListRef.current = null;
      setDragId(null); setDragList(null);
    };
    if (isTouch) {
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", end);
    } else {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", end);
    }
  }

  function renderUnitContent(unit) {
    if (unit.kind === "split") return (
      <div style={S.splitGroup}>
        {unit.group.map((e, i) => <EntryLine key={e.id} entry={e} onDel={() => handleDelete(e)} onEdit={() => onEditEntry(e)} grouped last={i === unit.group.length - 1} hideDelete={editMode} />)}
      </div>
    );
    if (unit.kind === "credit") return <CreditLine credit={unit.credit} onDel={() => onDelCredit(unit.credit.id)} onEdit={() => onEditCredit(unit.credit)} hideDelete={editMode} />;
    return <EntryLine entry={unit.entry} onDel={() => handleDelete(unit.entry)} onEdit={() => onEditEntry(unit.entry)} hideDelete={editMode} />;
  }

  return (
    <div>
      <div style={S.weekHeader}>
        <span style={{ fontWeight:600, color:"#f1f5f9", fontSize:14 }}>{dateStr(week.start)} — {dateStr(week.end)}</span>
      </div>
      <div style={S.budgetCard}>
        <div style={S.bar}><div style={{ ...S.barFill, width: pct + "%", background: over > 0 ? "#ef4444" : "#06b6d4" }} /></div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginTop:6, color:"#94a3b8" }}>
          <span>{fmt(spent)}</span>
          <span>{fmt(Math.max(weeklyBudget - spent, 0))} left of {fmt(weeklyBudget)}{isLastWeek ? " (final)" : ""}</span>
        </div>
        {over > 0 && <div style={{ color:"#ef4444", fontSize:11, marginTop:4, fontWeight:500 }}>↓ {fmt(over)} over</div>}
      </div>
      <div style={{ marginTop:12 }}>
        {renderUnits.map(unit => (
          <div key={unit.id} ref={el => { if (el) rowRefs.current[unit.id] = el; else delete rowRefs.current[unit.id]; }}
               style={{ display:"flex", alignItems:"center", gap:6, ...(dragId === unit.id ? S.rowDragging : {}) }}>
            {editMode && (
              <button style={{ ...S.checkbox, ...(selected.has(unit.id) ? S.checkboxOn : {}) }} onClick={() => toggleSelect(unit.id)}>{selected.has(unit.id) ? "✓" : ""}</button>
            )}
            <div style={{ flex:1, minWidth:0 }}>{renderUnitContent(unit)}</div>
            {editMode && (
              <button style={S.dragHandle} aria-label="Drag to reorder"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e.clientY, unit, false); }}
                      onTouchStart={(e) => { e.stopPropagation(); beginDrag(e.touches[0].clientY, unit, true); }}>≡</button>
            )}
          </div>
        ))}
        {units.length === 0 && <div style={{ color:"#64748b", fontSize:13, padding:"12px 0" }}>Nothing logged</div>}
      </div>
      {!editMode ? (
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button style={{ ...S.actionBtn, flex:1 }} onClick={onAddEntry}>Log spend</button>
          {units.length > 0 && <button style={S.editToggle} onClick={() => setEditMode(true)}>Edit</button>}
        </div>
      ) : (
        <div style={S.bulkDelBar}>
          <button style={S.editToggle} onClick={exitEdit}>Done</button>
          <div style={{ flex:1, fontSize:12, color:"#64748b", textAlign:"center" }}>Drag ≡ to reorder</div>
          {selected.size > 0 && (confirmBulk
            ? <button style={{ ...S.btn, background:"#dc2626", padding:"10px 14px", fontSize:13 }} onClick={bulkDelete}>Delete {selected.size}?</button>
            : <button style={{ ...S.btn, background:"#7f1d1d", border:"1px solid #b91c1c", padding:"10px 14px", fontSize:13 }} onClick={() => setConfirmBulk(true)}>Delete {selected.size}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Confirm Delete Button ────────────────────────────────────────────────────
// Tapping × turns it into a red "confirm?" for ~3s; a second tap deletes.
// Tapping anywhere else, or letting it time out, resets back to ×.
function ConfirmDeleteButton({ onConfirm, style }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleClick(e) {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      onConfirm();
    }
  }

  return (
    <button
      style={{
        ...style,
        ...(confirming ? { color:"#ef4444", fontSize:11, fontWeight:700, background:"#450a0a", borderRadius:5, padding:"2px 7px", whiteSpace:"nowrap" } : {}),
      }}
      onClick={handleClick}
      onBlur={() => setConfirming(false)}
    >
      {confirming ? "confirm?" : "×"}
    </button>
  );
}

// ─── Entry Line ───────────────────────────────────────────────────────────────
function EntryLine({ entry, onDel, onEdit, grouped, last, hideDelete }) {
  const col = entry.type === "business" ? "#f59e0b" : entry.type === "excluded" ? "#a78bfa" : "#e2e8f0";
  return (
    <div onClick={onEdit} style={{ ...S.entryRow, ...(grouped ? S.entryRowGrouped : {}), ...(grouped && last ? { borderBottom:"none" } : {}), cursor: onEdit ? "pointer" : "default" }}>
      <span style={{ ...S.dot, background: METHOD_COLOR[entry.method] || "#64748b" }} />
      <span style={{ flex:1, color:col, fontSize:13 }}>
        {entry.label || entry.method}
        {entry.type === "business" && <span style={S.badge}> work</span>}
        {entry.type === "excluded" && <span style={{ ...S.badge, background:"#3b0764", color:"#d8b4fe" }}> not yours</span>}
        {entry.splitGroupId && entry.type === "personal" && <span style={{ ...S.badge, background:"#1e293b", color:"#94a3b8" }}> split</span>}
      </span>
      <span style={{ color:col, fontWeight:600, fontSize:13 }}>{fmt(entry.amount)}</span>
      {!hideDelete && <ConfirmDeleteButton onConfirm={onDel} style={S.delBtn} />}
    </div>
  );
}

// ─── Credit Line ───────────────────────────────────────────────────────────────
function CreditLine({ credit, onDel, onEdit, hideDelete }) {
  return (
    <div onClick={onEdit} style={{ ...S.entryRow, cursor: onEdit ? "pointer" : "default" }}>
      <span style={{ ...S.dot, background:"#22c55e" }} />
      <span style={{ flex:1, color:"#22c55e", fontSize:13 }}>{credit.label || "Credit"}{credit.from && <span style={{ color:"#64748b" }}> from {credit.from}</span>}</span>
      <span style={{ color:"#22c55e", fontWeight:600, fontSize:13 }}>+{fmt(credit.amount)}</span>
      {!hideDelete && <ConfirmDeleteButton onConfirm={onDel} style={S.delBtn} />}
    </div>
  );
}

// ─── Pin Card ─────────────────────────────────────────────────────────────────
function PinCard({ pin, onEdit, onDelete }) {
  const isB = pin.type === "business";
  const isX = pin.type === "excluded";
  const col = isB ? "#f59e0b" : isX ? "#a78bfa" : "#f1f5f9";
  return (
    <div style={S.pinCard}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <span style={{ ...S.dot, background: METHOD_COLOR[pin.method] || "#64748b" }} />
        <span style={{ flex:1, fontWeight:600, fontSize:14, color:col }}>
          {pin.label}
          {isB && <span style={S.badge}> work</span>}
          {isX && <span style={{ ...S.badge, background:"#3b0764", color:"#d8b4fe" }}> not me</span>}
        </span>
        <button style={S.iconBtn} onClick={onEdit}>✎</button>
        <ConfirmDeleteButton onConfirm={onDelete} style={{ ...S.iconBtn, color:"#ef4444" }} />
      </div>
      <div style={{ fontSize:22, fontWeight:800, letterSpacing:"-1px", color: isB ? "#f59e0b" : isX ? "#a78bfa" : METHOD_COLOR[pin.method] || "#e2e8f0", marginBottom:4 }}>{pin.amount ? fmt(pin.amount) : "—"}</div>
      {pin.note && <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>{pin.note}</div>}
    </div>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ weekIndex, weeks, edit, defaultMethod, onSave, onSaveCredit, onUpdate, onUpdateCredit, onClose }) {
  const editEntry = edit && edit.kind === "entry" ? edit.data : null;
  const editCredit = edit && edit.kind === "credit" ? edit.data : null;
  const editData = editEntry || editCredit;
  const isEdit = !!editData;
  // A split's two halves must keep summing to the original total, so editing one can't change
  // its amount — the card/note stay editable, the amount is locked.
  const isSplitEdit = !!(editEntry && editEntry.splitGroupId);

  // The amount is an integer number of pence, filled in from the right (calculator style), so the
  // decimal never has to be typed: tap 1-2-5-0 → £12.50. Starts at £0.00. Prefilled when editing.
  const [cents, setCents] = useState(() => editData ? Math.round(editData.amount * 100) : 0);
  // Which week a new entry is logged to. Seeds from the weekIndex prop every time the modal opens
  // (the modal is remounted per open), so the quick-add ＋ always defaults back to the current
  // calendar week — the chosen week is never persisted across opens.
  const [selectedWeek, setSelectedWeek] = useState(weekIndex);
  const [method, setMethod] = useState(() => editEntry ? editEntry.method : (defaultMethod || "Amex"));
  const [type, setType] = useState(() => editCredit ? "credit" : (editEntry ? editEntry.type : "personal"));
  const [note, setNote] = useState(() => editData ? (editData.label || "") : "");
  const [showNote, setShowNote] = useState(() => !!(editData && editData.label));
  const [flash, setFlash] = useState(null);

  // Split flow: null (not splitting) → "total" (entering the full amount) → "theirs" (entering the portion that isn't yours)
  const [splitStage, setSplitStage] = useState(null);
  const [splitTotal, setSplitTotal] = useState(0);

  const amount = cents / 100;
  const displayStr = amount.toFixed(2);
  const creditColors = { bg: "#14532d", border: "#22c55e", text: "#4ade80" };
  const splitColors = { bg: "#3b0764", border: "#a855f7", text: "#d8b4fe" };
  const methodColors = { Amex: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" }, Lloyds: { bg: "#064e3b", border: "#10b981", text: "#34d399" }, HSBC: { bg: "#450a0a", border: "#dc2626", text: "#fca5a5" }, Cash: { bg: "#451a03", border: "#d97706", text: "#fbbf24" } };
  const mc = type === "credit" ? creditColors : type === "split" ? splitColors : methodColors[method];

  function pressDigit(d) {
    if (isSplitEdit) return; // amount locked while editing a split half
    setCents(prev => {
      const next = d === "00" ? prev * 100 : prev * 10 + Number(d);
      return next > 99999999 ? prev : next; // cap at £999,999.99
    });
  }

  function pressDelete() {
    if (isSplitEdit) return;
    setCents(prev => Math.floor(prev / 10));
  }

  function resetAfterSave() {
    setCents(0);
    setNote("");
    setSplitStage(null);
    setSplitTotal(0);
  }

  function selectType(v) {
    setType(v);
    // Changing type away from split mid-flow cancels the split
    if (v !== "split") { setSplitStage(null); setSplitTotal(0); }
    else { setSplitStage("total"); setCents(0); }
  }

  function pressEnter() {
    if (amount <= 0) return;

    // Editing an existing item: write the change back in place, keeping id/date/week/split.
    if (isEdit) {
      if (editCredit) {
        onUpdateCredit({ ...editCredit, amount, label: note.trim() });
      } else {
        onUpdate({ ...editEntry, amount: isSplitEdit ? editEntry.amount : amount, label: note.trim(), note: note.trim(), method, type });
      }
      onClose();
      return;
    }

    if (type === "split") {
      if (splitStage === "total") {
        // Move to step 2: capture the portion that isn't yours
        setSplitTotal(amount);
        setCents(0);
        setSplitStage("theirs");
        return;
      }
      if (splitStage === "theirs") {
        const theirPortion = Math.min(amount, splitTotal);
        const yourPortion = +(splitTotal - theirPortion).toFixed(2);
        const groupId = Math.random().toString(36).slice(2);
        const baseDate = new Date().toISOString();
        // Both halves share one `order` (as they share `baseDate`) so the pair stays adjacent
        // and moves as a single unit when the list is sorted or hand-reordered.
        const baseOrder = Date.now();
        if (yourPortion > 0) {
          onSave({ id: Math.random().toString(36).slice(2), amount: yourPortion, label: note.trim(), note: note.trim(), method, type: "personal", weekIndex: selectedWeek, date: baseDate, order: baseOrder, splitGroupId: groupId });
        }
        // The "not yours" portion is excluded from your spend total — same bucket as shared/not-me pins.
        // This covers both work reimbursement and splitting a tab with friends; neither should
        // touch your remaining budget, and neither should be conflated with actual work expenses.
        onSave({ id: Math.random().toString(36).slice(2), amount: theirPortion, label: note.trim(), note: note.trim(), method, type: "excluded", weekIndex: selectedWeek, date: baseDate, order: baseOrder, splitGroupId: groupId });
        setFlash({ amount: splitTotal, split: true });
        setTimeout(() => setFlash(null), 900);
        resetAfterSave();
        return;
      }
    }

    if (type === "credit") {
      onSaveCredit({ id: Math.random().toString(36).slice(2), amount, label: note.trim(), weekIndex: selectedWeek, from: "", date: new Date().toISOString(), order: Date.now() });
      setFlash({ amount, credit: true });
    } else {
      onSave({ id: Math.random().toString(36).slice(2), amount, label: note.trim(), note: note.trim(), method, type, weekIndex: selectedWeek, date: new Date().toISOString(), order: Date.now() });
      setFlash({ amount, method });
    }
    setTimeout(() => setFlash(null), 900);
    resetAfterSave();
  }

  const digits = [[7,8,9],[4,5,6],[1,2,3],["00",0,"⌫"]];
  const subheading = { fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 };

  // In edit mode, only offer the classifications it makes sense to switch between: a normal entry
  // can flip personal↔work; a split half or a credit keeps its kind (so its bucket stays coherent).
  const classOptions = isEdit
    ? (editCredit || isSplitEdit ? [] : [["personal","Personal"],["business","Work"]])
    : [["personal","Personal"],["business","Work"],["credit","Credit"],["split","Split"]];

  // What to show above the number display: the split steps, or a locked hint when editing a split.
  let displayCaption = null;
  if (type === "split" && splitStage === "total") displayCaption = "Total amount";
  if (type === "split" && splitStage === "theirs") displayCaption = `Not yours, of ${fmt(splitTotal)}`;
  if (isSplitEdit) displayCaption = "Split amount — locked";

  // Enter-key glyph changes on the first split step since it advances rather than saves
  const enterGlyph = type === "split" && splitStage === "total" ? "→" : "↵";
  // When logging (not editing), the title carries a week picker so a cost can be dropped into any
  // week of the period — not just today's. Editing keeps a plain title (a row's week can't change).
  const title = isEdit ? (editCredit ? "Edit credit" : "Edit spend") : (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
      Log ·
      <select value={selectedWeek} onChange={e => setSelectedWeek(Number(e.target.value))} style={S.weekSelect}>
        {(weeks || []).map(w => <option key={w.index} value={w.index}>Week {w.index} · {dateStr(w.start)}–{dateStr(w.end)}</option>)}
      </select>
    </span>
  );

  return (
    <Modal onClose={onClose} title={title}>
      <div style={{ background:"#1e293b", borderRadius:12, padding:"14px 20px", marginBottom:12, textAlign:"center", border:`1px solid ${flash ? mc.border : "#334155"}`, opacity: isSplitEdit ? 0.7 : 1 }}>
        {displayCaption && <div style={{ fontSize:11, color:"#a78bfa", fontWeight:600, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>{displayCaption}</div>}
        <div style={{ fontSize: displayStr.length > 7 ? 30 : 42, fontWeight:800, color: flash ? "#4ade80" : "#f1f5f9" }}>
          {flash ? (flash.split ? `✓ ${fmt(flash.amount)} split` : `✓ ${fmt(flash.amount)}`) : `£${displayStr}`}
        </div>
      </div>

      {!editCredit && <>
        <div style={subheading}>Payment type</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:12, opacity: type==="credit" ? 0.4 : 1 }}>
          {METHODS.map(m => <button key={m} style={{ background: method===m ? methodColors[m].bg : "#0f172a", border: `1px solid ${method===m ? methodColors[m].border : "#1e293b"}`, borderRadius:8, color: method===m ? methodColors[m].text : "#475569", padding:"10px 2px", fontSize:12, fontWeight: method===m?700:500, cursor:"pointer" }} onClick={() => setMethod(m)}>{m}</button>)}
        </div>
      </>}

      {classOptions.length > 0 && <>
        <div style={subheading}>Classification</div>
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {classOptions.map(([v,l]) => <button key={v} style={{ flex:1, background: type===v ? "#1e293b":"#0f172a", border:`1px solid ${type===v?"#334155":"#1e293b"}`, borderRadius:8, color: type===v ? (v==="business"?"#f59e0b":v==="credit"?"#4ade80":v==="split"?"#d8b4fe":"#f1f5f9") : "#475569", padding:"8px 4px", fontSize:12, fontWeight:type===v?600:400, cursor:"pointer" }} onClick={() => selectType(v)}>{l}</button>)}
        </div>
      </>}

      {type === "split" && !isEdit && (
        <div style={{ fontSize:11, color:"#a78bfa", marginBottom:10, lineHeight:1.5 }}>
          {splitStage === "total"
            ? "Enter the full amount you paid, then continue."
            : "Enter just the portion that isn't yours — work reimbursement, a friend's share of the bill, etc. The rest stays personal."}
        </div>
      )}

      <button style={{ background:"none", border:"none", color: showNote?"#60a5fa":"#64748b", fontSize:12, cursor:"pointer", padding:"0 0 8px", textAlign:"left", width:"100%" }} onClick={() => setShowNote(p=>!p)}>{showNote ? "▾ Hide note" : "▸ Add a note"}</button>
      {showNote && <input style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color:"#f1f5f9", padding:"8px 12px", marginBottom:10, fontSize:13, width:"100%", boxSizing:"border-box", outline:"none" }} placeholder="e.g. golf, birthday" value={note} onChange={e=>setNote(e.target.value)} autoFocus />}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
        {digits.map((row, ri) => (<>{row.map((d, i) => <button key={`${ri}-${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color: d==="⌫" ? "#ef4444" : "#cbd5e1", fontSize: d==="⌫" ? 18 : 20, fontWeight:600, padding:"14px 0", cursor:"pointer", opacity: isSplitEdit ? 0.4 : 1 }} onClick={() => d === "⌫" ? pressDelete() : pressDigit(d)}>{d}</button>)}{ri === 0 && <button style={{ gridRow: "span 4", background: amount>0 ? mc.bg : "#0f172a", border:`1px solid ${amount>0 ? mc.border : "#1e293b"}`, borderRadius:8, color: amount>0 ? mc.text : "#475569", fontSize:18, fontWeight:800, cursor: amount>0?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={pressEnter}>{enterGlyph}</button>}</> ))}
      </div>
    </Modal>
  );
}

// ─── Pin Modal ────────────────────────────────────────────────────────────────
function PinModal({ pin, onSave, onClose }) {
  const [label, setLabel] = useState(pin?.label || "");
  const [amount, setAmount] = useState(pin?.amount?.toString() || "");
  const [method, setMethod] = useState(pin?.method || "Amex");
  const [type, setType] = useState(pin?.type || "personal");
  const [note, setNote] = useState(pin?.note || "");

  return (
    <Modal onClose={onClose} title={pin ? "Edit" : "New pin"}>
      <input style={S.input} placeholder="Label e.g. Gym" value={label} onChange={e => setLabel(e.target.value)} />
      <input style={{ ...S.input, marginBottom:10 }} type="number" inputMode="decimal" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        {METHODS.map(m => <button key={m} style={{ flex:1, background: method===m ? "#1e293b":"#0f172a", border:`1px solid ${method===m?"#334155":"#1e293b"}`, borderRadius:8, color: method===m ? METHOD_COLOR[m] : "#475569", padding:"8px 4px", fontSize:12, fontWeight:600, cursor:"pointer" }} onClick={() => setMethod(m)}>{m}</button>)}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        {[["personal","Personal"],["business","Work"],["excluded","Not me"]].map(([v,l]) => <button key={v} style={{ flex:1, background: type===v ? "#1e293b":"#0f172a", border:`1px solid ${type===v?"#334155":"#1e293b"}`, borderRadius:8, color: type===v ? (v==="business"?"#f59e0b":v==="excluded"?"#a78bfa":"#f1f5f9") : "#475569", padding:"8px 4px", fontSize:12, fontWeight:600, cursor:"pointer" }} onClick={() => setType(v)}>{l}</button>)}
      </div>
      <textarea style={{ ...S.input, height:60, resize:"none" }} placeholder="Note" value={note} onChange={e => setNote(e.target.value)} />
      <button style={{ ...S.btn, background:"#0369a1", marginTop:12 }} onClick={() => onSave({ id: pin?.id || Math.random().toString(36).slice(2), label: label.trim(), amount: parseFloat(amount) || 0, method, type, note: note.trim() })}>Save</button>
    </Modal>
  );
}

// ─── Summary View ─────────────────────────────────────────────────────────────
function SummaryView({ state, weeks, rebalancedBudgets, totalSpent, totalEntries, totalPinned, totalCredits, remaining, methodTotals, businessEntries, onExport }) {
  const [methodDetail, setMethodDetail] = useState(null); // method name or null

  // Gross figure: personal spend + business spend, before business is excluded
  const businessTotal = businessEntries.reduce((s, e) => s + e.amount, 0)
    + state.pins.filter(p => p.type === "business").reduce((s, p) => s + (p.amount || 0), 0);
  const grossSpend = totalSpent + businessTotal;

  // Per-week, per-method breakdown
  const weekRows = weeks.map(w => {
    const wEntries = state.entries.filter(e => e.weekIndex === w.index && e.type === "personal");
    const wTotal = wEntries.reduce((s, e) => s + e.amount, 0);
    const wByMethod = {};
    METHODS.forEach(m => { wByMethod[m] = wEntries.filter(e => e.method === m).reduce((s, e) => s + e.amount, 0); });
    const wBudget = rebalancedBudgets[w.index] ?? state.weeklyBudget;
    return { week: w, total: wTotal, byMethod: wByMethod, budget: wBudget };
  });

  // All transactions for a given method (entries + pins), for drill-down
  function transactionsFor(method) {
    const fromEntries = state.entries
      .filter(e => e.method === method)
      .map(e => ({ date: e.date, amount: e.amount, desc: e.label || e.method, type: e.type }));
    const fromPins = state.pins
      .filter(p => p.method === method)
      .map(p => ({ date: null, amount: p.amount || 0, desc: p.label + " (pinned)", type: p.type === "business" ? "business" : "personal" }));
    return [...fromEntries, ...fromPins].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  }

  // Largest individual spends this month (entries + pins, personal + business — excludes credits and the "not yours" portion of splits)
  const allSpendItems = [
    ...state.entries.filter(e => e.type !== "credit" && e.type !== "excluded").map(e => ({ desc: e.label || e.method, amount: e.amount, method: e.method, type: e.type })),
    ...state.pins.filter(p => p.type !== "excluded").map(p => ({ desc: p.label, amount: p.amount || 0, method: p.method, type: p.type })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 5);

  // Source split: how much of personal spend came from pins vs quick-logged entries
  const sourcePct = totalSpent > 0 ? Math.round((totalPinned / totalSpent) * 100) : 0;

  return (
    <div style={{ padding:"12px 16px" }}>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
        <button style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:8, color:"#94a3b8", padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:500 }} onClick={onExport}>↗ Export</button>
      </div>

      {/* Hero: remaining */}
      <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"18px", marginBottom:12 }}>
        <div style={{ fontSize:11, color:"#64748b", marginBottom:6, textTransform:"uppercase" }}>Month overview</div>
        <div style={{ fontSize:32, fontWeight:800, color: remaining<0?"#ef4444":remaining<state.monthlyBudget*0.15?"#f97316":"#22c55e", marginBottom:12 }}>{fmt(remaining)}</div>
        <div style={{ fontSize:12, color:"#cbd5e1" }}>{fmt(totalSpent)} spent of {fmt(state.monthlyBudget)}</div>
      </div>

      {/* Gross vs net — only show if there's business spend to make the distinction meaningful */}
      {businessTotal > 0 && (
        <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Gross vs net</div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:13 }}>
            <span style={{ color:"#94a3b8" }}>Personal spend (deducted)</span>
            <span style={{ color:"#e2e8f0", fontWeight:600 }}>{fmt(totalSpent)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:13 }}>
            <span style={{ color:"#f59e0b" }}>Business spend (reimbursable)</span>
            <span style={{ color:"#f59e0b", fontWeight:600 }}>{fmt(businessTotal)}</span>
          </div>
          <div style={{ borderTop:"1px solid #1e293b", marginTop:6, paddingTop:6, display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"#cbd5e1", fontSize:13, fontWeight:600 }}>Gross spend across all cards</span>
            <span style={{ color:"#f1f5f9", fontWeight:800, fontSize:14 }}>{fmt(grossSpend)}</span>
          </div>
        </div>
      )}

      {/* Weekly breakdown */}
      <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Weekly breakdown</div>
        {weekRows.map(({ week, total, byMethod, budget }) => (
          <div key={week.index} style={{ marginBottom: week.index < weeks.length ? 12 : 0, paddingBottom: week.index < weeks.length ? 12 : 0, borderBottom: week.index < weeks.length ? "1px solid #1e293b" : "none" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#f1f5f9" }}>Week {week.index}</span>
              <span style={{ fontSize:13, fontWeight:700, color: total > budget ? "#ef4444" : "#cbd5e1" }}>{fmt(total)} <span style={{ color:"#64748b", fontWeight:400 }}>/ {fmt(budget)}</span></span>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {METHODS.filter(m => byMethod[m] > 0).map(m => (
                <div key={m} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#94a3b8" }}>
                  <span style={{ ...S.dot, background: METHOD_COLOR[m] }} />
                  {m} {fmt(byMethod[m])}
                </div>
              ))}
              {METHODS.every(m => byMethod[m] === 0) && <span style={{ fontSize:11, color:"#475569" }}>Nothing logged</span>}
            </div>
          </div>
        ))}
      </div>

      {/* By payment method — tappable for transaction detail */}
      <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>By payment method</div>
        {METHODS.filter(m => methodTotals[m] > 0).map(m => (
          <button key={m} onClick={() => setMethodDetail(m)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 0", background:"none", border:"none", borderBottom:"1px solid #1e293b", cursor:"pointer", textAlign:"left" }}>
            <span style={{ ...S.dot, background: METHOD_COLOR[m] }} />
            <span style={{ flex:1, fontSize:13, color:"#cbd5e1" }}>{m}</span>
            <span style={{ fontWeight:600, color: METHOD_COLOR[m], fontSize:13 }}>{fmt(methodTotals[m])}</span>
            <span style={{ color:"#475569", fontSize:14 }}>›</span>
          </button>
        ))}
        {METHODS.every(m => methodTotals[m] === 0) && <div style={{ color:"#475569", fontSize:13, padding:"4px 0" }}>No spend logged yet</div>}
      </div>

      {/* Largest spends */}
      {allSpendItems.length > 0 && (
        <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Largest spends</div>
          {allSpendItems.map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom: i < allSpendItems.length - 1 ? "1px solid #1e293b" : "none" }}>
              <span style={{ ...S.dot, background: METHOD_COLOR[item.method] || "#64748b" }} />
              <span style={{ flex:1, fontSize:13, color: item.type === "business" ? "#f59e0b" : "#cbd5e1" }}>{item.desc}{item.type === "business" && <span style={S.badge}> work</span>}</span>
              <span style={{ fontWeight:600, fontSize:13, color: item.type === "business" ? "#f59e0b" : "#e2e8f0" }}>{fmt(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Source split */}
      {totalSpent > 0 && totalPinned > 0 && totalEntries > 0 && (
        <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#64748b", marginBottom:10, textTransform:"uppercase" }}>Spend source</div>
          <div style={{ height:6, background:"#1e293b", borderRadius:3, overflow:"hidden", marginBottom:8, display:"flex" }}>
            <div style={{ height:"100%", width: sourcePct+"%", background:"#0369a1" }} />
            <div style={{ height:"100%", width: (100-sourcePct)+"%", background:"#06b6d4" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
            <span style={{ color:"#0369a1" }}>● Pinned costs {fmt(totalPinned)}</span>
            <span style={{ color:"#06b6d4" }}>Quick-logged {fmt(totalEntries)} ●</span>
          </div>
        </div>
      )}

      {/* Credits */}
      {totalCredits > 0 && (
        <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#22c55e", marginBottom:8, textTransform:"uppercase" }}>Credits</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#4ade80" }}>+{fmt(totalCredits)}</div>
        </div>
      )}

      {methodDetail && (
        <MethodDetailModal method={methodDetail} transactions={transactionsFor(methodDetail)} total={methodTotals[methodDetail]} onClose={() => setMethodDetail(null)} />
      )}
    </div>
  );
}

// ─── Method Detail Modal ──────────────────────────────────────────────────────
function MethodDetailModal({ method, transactions, total, onClose }) {
  const col = METHOD_COLOR[method];
  return (
    <Modal onClose={onClose} title={`${method} transactions`}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14, padding:"0 2px" }}>
        <span style={{ fontSize:12, color:"#64748b" }}>{transactions.length} transaction{transactions.length === 1 ? "" : "s"}</span>
        <span style={{ fontSize:18, fontWeight:800, color: col }}>{fmt(total)}</span>
      </div>
      <div style={{ maxHeight:360, overflowY:"auto" }}>
        {transactions.length === 0 && <div style={{ color:"#475569", fontSize:13, padding:"12px 0", textAlign:"center" }}>No transactions yet</div>}
        {transactions.map((t, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: i < transactions.length - 1 ? "1px solid #1e293b" : "none" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a78bfa" : "#e2e8f0" }}>
                {t.desc}
                {t.type === "business" && <span style={S.badge}> work</span>}
                {t.type === "excluded" && <span style={{ ...S.badge, background:"#3b0764", color:"#d8b4fe" }}> not yours</span>}
              </div>
              {t.date && <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{dateStr(new Date(t.date))}</div>}
            </div>
            <span style={{ fontWeight:600, fontSize:13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a78bfa" : col }}>{fmt(t.amount)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ state, weeks, rebalancedBudgets, totalSpent, remaining, totalCredits, methodTotals, onClose }) {
  const [copied, setCopied] = useState(false);

  function buildText() {
    const lines = [];
    lines.push(`SpendTracker — ${state.monthLabel}`);
    lines.push(`${fmt(totalSpent)} spent · ${fmt(remaining)} left of ${fmt(state.monthlyBudget)}`);
    if (totalCredits > 0) lines.push(`Credits: +${fmt(totalCredits)}`);
    lines.push("");

    weeks.forEach(w => {
      const wEntries = state.entries.filter(e => e.weekIndex === w.index);
      const wPersonal = wEntries.filter(e => e.type === "personal");
      const wBusiness = wEntries.filter(e => e.type === "business");
      const wExcluded = wEntries.filter(e => e.type === "excluded");
      const wCredits = (state.credits || []).filter(c => c.weekIndex === w.index);
      const wSpend = wPersonal.reduce((s, e) => s + e.amount, 0);
      const wBudget = rebalancedBudgets[w.index] ?? state.weeklyBudget;

      lines.push(`Week ${w.index} (${dateStr(w.start)} – ${dateStr(w.end)}) — ${fmt(wSpend)} of ${fmt(wBudget)}`);
      if (wEntries.length === 0 && wCredits.length === 0) {
        lines.push(`  (nothing logged)`);
      } else {
        wPersonal.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || e.method}  [${e.method}]${e.splitGroupId ? " (split)" : ""}`));
        wBusiness.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || e.method}  [${e.method}, work]`));
        wExcluded.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || e.method}  [${e.method}, not yours]`));
        wCredits.forEach(c => lines.push(`  +£${c.amount.toFixed(2)}  ${c.label || "Credit"}${c.from ? " from " + c.from : ""}`));
      }
      lines.push("");
    });

    const personalPins = state.pins.filter(p => p.type !== "business" && p.type !== "excluded");
    const businessPins = state.pins.filter(p => p.type === "business");
    const excludedPins = state.pins.filter(p => p.type === "excluded");
    if (state.pins.length > 0) {
      lines.push("Pinned costs:");
      personalPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${p.method}]`));
      businessPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${p.method}, work]`));
      excludedPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${p.method}, not me]`));
      lines.push("");
    }

    const methodLines = METHODS.filter(m => methodTotals[m] > 0);
    if (methodLines.length > 0) {
      lines.push("By payment method:");
      methodLines.forEach(m => lines.push(`  ${m}: ${fmt(methodTotals[m])}`));
    }

    return lines.join("\n");
  }

  const text = buildText();

  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <Modal onClose={onClose} title="Export">
      <div style={{ background:"#030712", border:"1px solid #1e293b", borderRadius:8, padding:"12px", fontFamily:"monospace", fontSize:11, color:"#94a3b8", whiteSpace:"pre-wrap", maxHeight:360, overflowY:"auto", marginBottom:12, lineHeight:1.6 }}>
        {text}
      </div>
      <button style={{ ...S.btn, background:copied?"#16a34a":"#0369a1", width:"100%" }} onClick={copy}>{copied ? "✓ Copied" : "Copy to clipboard"}</button>
    </Modal>
  );
}

// ─── Account backup: export (encrypted, portable) ─────────────────────────────
// The backup is the encrypted vault from crypto.js — ciphertext only, safe to copy or
// save as a file. Import it in another browser/device (Settings or the welcome screen).
function BackupModal({ onClose }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (window.SpendVault && window.SpendVault.exportBackup) {
      window.SpendVault.exportBackup()
        .then(t => { if (!cancelled) setText(t); })
        .catch(e => { if (!cancelled) setErr(e.message || "Couldn't build the backup."); });
    } else setErr("Backup isn't available.");
    return () => { cancelled = true; };
  }, []);

  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }
  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "spendtracker-backup.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Modal onClose={onClose} title="Export account">
      <div style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.5, marginBottom:12 }}>This is your <strong>encrypted</strong> account — it can only be opened with your passphrase or recovery code, so it's safe to save or send to yourself. Import it in another browser or on a new phone to carry everything across.</div>
      {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
      <div style={{ background:"#030712", border:"1px solid #1e293b", borderRadius:8, padding:"12px", fontFamily:"monospace", fontSize:10, color:"#64748b", whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:150, overflowY:"auto", marginBottom:12, lineHeight:1.5 }}>{text ? (text.length > 500 ? text.slice(0, 500) + "\n…" : text) : "Preparing…"}</div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={{ ...S.btn, background:copied?"#16a34a":"#0369a1", flex:1, ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={copy}>{copied ? "✓ Copied" : "Copy backup"}</button>
        <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", flex:1, ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={download}>Download file</button>
      </div>
    </Modal>
  );
}

// ─── Account backup: import (wipes current, installs the imported account) ────
function ImportBackupModal({ onClose }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then(t => { setText(t); setErr(""); }).catch(() => setErr("Couldn't read that file."));
  }
  async function doImport() {
    setBusy(true); setErr("");
    try { await window.SpendVault.importBackup(text); } // reloads on success
    catch (e) { setErr(e.message || "That import didn't work."); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} title="Import account">
      <div style={{ background:"#1c1207", border:"1px solid #92400e", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#fcd34d", lineHeight:1.6, marginBottom:12 }}>
        Importing <strong>replaces everything on this device</strong> with the imported account — the data here is wiped. Export your current account first if you might want it back.
      </div>
      <textarea style={{ ...S.input, height:90, resize:"none", fontFamily:"monospace", fontSize:11 }} placeholder="Paste a backup here…" value={text} onChange={e => setText(e.target.value)} />
      <input type="file" accept=".json,application/json" onChange={onFile} style={{ fontSize:12, color:"#64748b", marginBottom:12, width:"100%" }} />
      {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
      {!confirm ? (
        <button style={{ ...S.btn, background: text?"#b45309":"#1e293b", width:"100%", ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={() => setConfirm(true)}>Continue…</button>
      ) : (
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.btn, background:"#1e293b", border:"1px solid #334155", flex:1 }} onClick={() => setConfirm(false)}>Cancel</button>
          <button style={{ ...S.btn, background:"#dc2626", flex:1 }} disabled={busy} onClick={doImport}>{busy ? "Importing…" : "Wipe & import"}</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title }) {
  return <div style={S.modalOverlay} onClick={onClose}><div style={S.modalSheet} onClick={e => e.stopPropagation()}><div style={S.modalHeader}><span style={S.modalTitle}>{title}</span><button style={S.delBtn} onClick={onClose}>✕</button></div>{children}</div></div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background:"#030712", minHeight:"100vh", color:"#e2e8f0", maxWidth:480, margin:"0 auto", paddingBottom:40 },
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"20px 16px 12px", borderBottom:"1px solid #1e293b" },
  appTitle: { fontSize:24, fontWeight:800, letterSpacing:"-1px", color:"#f1f5f9" },
  appSub: { fontSize:12, color:"#64748b", marginTop:2 },
  headerRight: { textAlign:"right" },
  remaining: { fontSize:28, fontWeight:800, letterSpacing:"-1px", lineHeight:1 },
  remainLabel: { fontSize:10, color:"#64748b", textTransform:"uppercase" },
  pastBanner: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, background:"#451a03", borderBottom:"1px solid #92400e", padding:"8px 16px", fontSize:11, color:"#fcd34d" },
  pastBannerBtn: { background:"#78350f", border:"1px solid #b45309", borderRadius:6, color:"#fde68a", padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" },
  tabs: { display:"flex", borderBottom:"1px solid #1e293b", padding:"0 16px" },
  tab: { flex:1, background:"none", border:"none", borderBottom:"2px solid transparent", color:"#64748b", padding:"10px 4px", fontSize:13, fontWeight:500, cursor:"pointer" },
  tabActive: { color:"#f1f5f9", borderBottomColor:"#0369a1" },
  weekNav: { display:"flex", gap:6, marginBottom:12, overflowX:"auto" },
  weekPill: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:20, color:"#64748b", padding:"6px 12px", fontSize:13, fontWeight:500, cursor:"pointer", flexShrink:0 },
  weekPillActive: { background:"#0369a1", borderColor:"#0369a1", color:"#f1f5f9" },
  dailyCard: { flex:1, background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"10px 12px" },
  dailyLabel: { fontSize:10, color:"#64748b", textTransform:"uppercase", marginBottom:3 },
  dailySub: { fontSize:10, color:"#64748b", marginTop:2 },
  weekHeader: { padding:"10px 0 8px", borderBottom:"1px solid #1e293b", marginBottom:10 },
  budgetCard: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"12px" },
  bar: { height:6, background:"#1e293b", borderRadius:3, overflow:"hidden" },
  barFill: { height:"100%", borderRadius:3 },
  entryRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:"1px solid #0f172a" },
  splitGroup: { background:"#0c0a1a", border:"1px solid #2e1065", borderRadius:8, padding:"2px 10px", marginBottom:8 },
  entryRowGrouped: { borderBottom:"1px solid #1e1338" },
  dot: { width:7, height:7, borderRadius:"50%", flexShrink:0 },
  badge: { fontSize:10, background:"#451a03", color:"#f59e0b", borderRadius:3, padding:"1px 4px", marginLeft:4 },
  delBtn: { background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:16, padding:"0 2px" },
  actionBtn: { background:"#0f172a", border:"1px dashed #334155", borderRadius:8, color:"#94a3b8", padding:"10px", fontSize:13, fontWeight:500, cursor:"pointer" },
  editToggle: { background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#94a3b8", padding:"10px 16px", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 },
  bulkDelBar: { display:"flex", alignItems:"center", gap:8, marginTop:12 },
  checkbox: { width:22, height:22, flexShrink:0, borderRadius:6, border:"1px solid #334155", background:"#0f172a", color:"#4ade80", fontSize:13, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 },
  checkboxOn: { background:"#064e3b", borderColor:"#22c55e" },
  dragHandle: { flexShrink:0, background:"none", border:"none", color:"#475569", fontSize:20, lineHeight:1, cursor:"grab", padding:"6px 4px", touchAction:"none", userSelect:"none" },
  rowDragging: { opacity:0.55, background:"#0f172a", borderRadius:8 },
  sectionTitle: { fontSize:13, fontWeight:700, color:"#cbd5e1", textTransform:"uppercase", letterSpacing:"0.08em" },
  addBtn: { background:"#0369a1", border:"none", borderRadius:6, color:"#f1f5f9", padding:"5px 12px", fontSize:12, fontWeight:600, cursor:"pointer" },
  pinGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  pinCard: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"12px" },
  empty: { color:"#475569", fontSize:13, padding:"12px 0" },
  iconBtn: { background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:13, padding:"0 2px" },
  input: { width:"100%", background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color:"#f1f5f9", padding:"10px 12px", marginBottom:10, fontSize:14, outline:"none", boxSizing:"border-box" },
  btn: { border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", color:"#f1f5f9" },
  settingsCard: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"14px", marginBottom:12 },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"flex-end", zIndex:100 },
  modalSheet: { background:"#0f172a", borderRadius:"16px 16px 0 0", padding:"20px 16px 32px", width:"100%", maxWidth:480, margin:"0 auto", border:"1px solid #1e293b" },
  modalHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  modalTitle: { fontSize:15, fontWeight:700, color:"#f1f5f9" },
  weekSelect: { background:"#1e293b", border:"1px solid #334155", borderRadius:6, color:"#f1f5f9", fontSize:14, fontWeight:700, padding:"3px 6px", cursor:"pointer", outline:"none", fontFamily:"inherit" },
  quickAdd: { position:"fixed", left:"calc(14px + env(safe-area-inset-left))", bottom:"calc(14px + env(safe-area-inset-bottom))", width:52, height:52, borderRadius:"50%", background:"#0369a1", border:"none", color:"#f1f5f9", fontSize:30, fontWeight:400, lineHeight:1, cursor:"pointer", zIndex:50, boxShadow:"0 4px 14px rgba(3,105,161,0.5)", display:"flex", alignItems:"center", justifyContent:"center", paddingBottom:4 },
  hintBanner: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, background:"#0c2a4a", borderBottom:"1px solid #0369a1", padding:"8px 16px", fontSize:12, color:"#bfdbfe", lineHeight:1.4 },
  hintBtn: { background:"#0369a1", border:"none", borderRadius:6, color:"#f1f5f9", padding:"4px 10px", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" },
  hintDismiss: { background:"none", border:"none", color:"#7dd3fc", fontSize:14, cursor:"pointer", padding:"2px 4px", lineHeight:1 },
};
