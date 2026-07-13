"use strict";
const { useState, useEffect, useLayoutEffect, useReducer, useRef } = React;
// ─── Constants ────────────────────────────────────────────────────────────────
// Payment types are user-editable (name + colour, add/remove) and live in state.methods.
// Each method's `id` is stable and is what entries/pins store in `.method`; the defaults use
// their old names AS ids so pre-existing data keeps resolving with zero migration.
const DEFAULT_METHODS = [
    { id: "Amex", name: "Amex", color: "#60a5fa" },
    { id: "Lloyds", name: "Lloyds", color: "#34d399" },
    { id: "HSBC", name: "HSBC", color: "#f87171" },
    { id: "Cash", name: "Cash", color: "#fbbf24" },
];
const MAX_METHODS = 12;
const genId = () => Math.random().toString(36).slice(2);
// Spending categories: what a spend was *for* (Groceries, Transport, …). Like methods, these are
// a user-editable list of {id, name, emoji, color} living in state.categories. Entries store the
// chosen category's id in `.category`; an absent/null `.category` means uncategorised ("None"),
// which is never stored as a category row.
const DEFAULT_CATEGORIES = [
    { id: "groceries", name: "Groceries", icon: "cart", color: "#f59e0b" },
    { id: "eatingout", name: "Eating out", icon: "utensils", color: "#84cc16" },
    { id: "transport", name: "Transport", icon: "train", color: "#14b8a6" },
    { id: "shopping", name: "Shopping", icon: "bag", color: "#d946ef" },
    { id: "bills", name: "Bills", icon: "bulb", color: "#3b82f6" },
    { id: "entertain", name: "Entertainment", icon: "film", color: "#10b981" },
    { id: "personal", name: "Personal care", icon: "heart", color: "#ef4444" },
    { id: "general", name: "General", icon: "shapes", color: "#6b7280" },
];
// Map default ids → icons, used to upgrade accounts saved with the earlier emoji-based defaults.
const DEFAULT_CATEGORY_ICON = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c.icon]));
const MAX_CATEGORIES = 24;
// Monochrome line icons (Lucide, ISC) inlined as SVG inner-markup, keyed by a short name.
// Rendered white on a category's coloured circle (Monzo-style) via <CategoryIcon>.
const ICONS = { "cart": "<circle cx=\"8\" cy=\"21\" r=\"1\" /><circle cx=\"19\" cy=\"21\" r=\"1\" /><path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\" />", "utensils": "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" /><path d=\"M7 2v20\" /><path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />", "train": "<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\" /><path d=\"m9 15-1-1\" /><path d=\"m15 15 1-1\" /><path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\" /><path d=\"m8 19-2 3\" /><path d=\"m16 19 2 3\" />", "bag": "<path d=\"M16 10a4 4 0 0 1-8 0\" /><path d=\"M3.103 6.034h17.794\" /><path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\" />", "bulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" /><path d=\"M9 18h6\" /><path d=\"M10 22h4\" />", "film": "<path d=\"m12.296 3.464 3.02 3.956\" /><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\" /><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" /><path d=\"m6.18 5.276 3.1 3.899\" />", "heart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />", "shapes": "<path d=\"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z\" /><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" /><circle cx=\"17.5\" cy=\"17.5\" r=\"3.5\" />", "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />", "dumbbell": "<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\" /><path d=\"m2.5 21.5 1.4-1.4\" /><path d=\"m20.1 3.9 1.4-1.4\" /><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\" /><path d=\"m9.6 14.4 4.8-4.8\" />", "coffee": "<path d=\"M10 2v2\" /><path d=\"M14 2v2\" /><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" /><path d=\"M6 2v2\" />", "car": "<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\" /><circle cx=\"7\" cy=\"17\" r=\"2\" /><path d=\"M9 17h6\" /><circle cx=\"17\" cy=\"17\" r=\"2\" />", "gift": "<path d=\"M12 7v14\" /><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\" /><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\" /><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\" />", "plane": "<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\" />", "health": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" /><path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />", "piggy": "<path d=\"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z\" /><path d=\"M16 10h.01\" /><path d=\"M2 8v1a2 2 0 0 0 2 2h1\" />", "sprout": "<path d=\"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3\" /><path d=\"M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4\" /><path d=\"M5 21h14\" />", "phone": "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /><path d=\"M12 18h.01\" />", "book": "<path d=\"M12 7v14\" /><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" />", "pet": "<path d=\"M11.25 16.25h1.5L12 17z\" /><path d=\"M16 14v.5\" /><path d=\"M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309\" /><path d=\"M8 14v.5\" /><path d=\"M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5\" />", "fuel": "<path d=\"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5\" /><path d=\"M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16\" /><path d=\"M2 21h13\" /><path d=\"M3 9h11\" />", "work": "<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\" /><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />", "edu": "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /><path d=\"M22 10v6\" /><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />", "music": "<path d=\"M9 18V5l12-2v13\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><circle cx=\"18\" cy=\"16\" r=\"3\" />", "wine": "<path d=\"M8 22h8\" /><path d=\"M7 10h10\" /><path d=\"M12 15v7\" /><path d=\"M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z\" />", "shirt": "<path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" />", "baby": "<path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" /><path d=\"M15 12h.01\" /><path d=\"M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" /><path d=\"M9 12h.01\" />", "tools": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />", "card": "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\" /><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\" />", "cash": "<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\" /><circle cx=\"12\" cy=\"12\" r=\"2\" /><path d=\"M6 12h.01M18 12h.01\" />", "ticket": "<path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\" /><path d=\"M13 5v2\" /><path d=\"M13 17v2\" /><path d=\"M13 11v2\" />", "game": "<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" /><line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" /><line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" /><line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" /><path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />", "pizza": "<path d=\"m12 14-1 1\" /><path d=\"m13.75 18.25-1.25 1.42\" /><path d=\"M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12\" /><path d=\"M18.8 9.3a1 1 0 0 0 2.1 7.7\" /><path d=\"M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z\" />", "bus": "<path d=\"M8 6v6\" /><path d=\"M15 6v6\" /><path d=\"M2 12h19.6\" /><path d=\"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3\" /><circle cx=\"7\" cy=\"18\" r=\"2\" /><path d=\"M9 18h5\" /><circle cx=\"16\" cy=\"18\" r=\"2\" />", "bike": "<circle cx=\"18.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"5.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"15\" cy=\"5\" r=\"1\" /><path d=\"M12 17.5V14l-3-3 4-3 2 3h2\" />", "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />", "tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />" };
const ICON_KEYS = Object.keys(ICONS);
// These module-level views are refreshed from state.methods at the top of App() each render, so
// the ~30 existing `METHODS` / `METHOD_COLOR[id]` call-sites keep working without prop-threading.
// (Single synchronous root render, no StrictMode → children read the fresh values in the same pass.)
let METHODS = DEFAULT_METHODS; // [{id,name,color}]
let METHOD_COLOR = Object.fromEntries(DEFAULT_METHODS.map(m => [m.id, m.color])); // id -> colour
let METHOD_NAME = Object.fromEntries(DEFAULT_METHODS.map(m => [m.id, m.name])); // id -> display name
// Category views, refreshed from state.categories in App() the same way (see App()).
let CATEGORIES = DEFAULT_CATEGORIES; // [{id,name,emoji,color}]
let CATEGORY_BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c])); // id -> {name,emoji,color}
// Derive a coherent chip palette (used by the selectors) from a single method colour.
const chipColors = (c) => ({ bg: c + "22", border: c, text: c });
const STORAGE_KEY = "spendtracker_v6";
// Persistence goes through the encrypted session in crypto.js (window.SpendVault),
// which holds the decrypted state in memory and writes only ciphertext to disk.
// App is never rendered until crypto.js's Root has unlocked, so getState() is set.
function load() { return (window.SpendVault && window.SpendVault.getState) ? window.SpendVault.getState() : null; }
function save(s) { if (window.SpendVault && window.SpendVault.save)
    window.SpendVault.save(s); }
const fmt = (n) => "£" + Number(Math.abs(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayName = (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
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
    while (isWeekend(d))
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    return d;
}
// Payday for a given month under the user's configured rule. Defaults keep every existing
// caller (including crypto.js, which runs pre-unlock with no access to settings) on the
// original last-working-day behaviour, so vaults without the setting need no migration.
// "fixed" follows payroll convention: a payday landing on a weekend moves to the previous
// working day; a day past the month's end (e.g. 31st in February) clamps to the last day.
function paydayFor(year, month, kind = "last-working", day) {
    if (kind === "last-calendar")
        return new Date(year, month + 1, 0);
    if (kind === "last-friday") {
        let d = new Date(year, month + 1, 0);
        while (d.getDay() !== 5)
            d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
        return d;
    }
    if (kind === "fixed") {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let d = new Date(year, month, Math.min(Math.max(day || 1, 1), daysInMonth));
        while (isWeekend(d))
            d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
        return d;
    }
    return lastWorkingDay(year, month);
}
function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}
// Given a date, find which period it falls into under the new model: a period labelled X
// starts on (X-1)'s payday and ends the day before X's own payday. Walks forward from the
// date's calendar month until it finds the first month whose payday hasn't happened yet —
// that month is the correct label. Needed because "today's calendar month" is not generally
// the same as "the period label today belongs to" (e.g. payday itself already belongs to
// next month's label, not the current one).
function periodLabelFor(date, kind, day) {
    let y = date.getFullYear(), m = date.getMonth();
    for (let i = 0; i < 3; i++) {
        const payday = paydayFor(y, m, kind, day);
        if (date < payday)
            return { year: y, month: m };
        m++;
        if (m > 11) {
            m = 0;
            y++;
        }
    }
    return { year: y, month: m };
}
function buildWeeks(payStart, payEnd) {
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
    if (weekDays.length > 0)
        weeks.push(weekDays);
    return weeks.map((days, i) => ({
        index: i + 1,
        start: days[0],
        end: days[days.length - 1],
        days,
    }));
}
// Period bounds for a labelled period (payYear/payMonth). A period labelled X starts on
// (X-1)'s payday and ends the day before X's own payday. Extracted so archived months can
// rebuild their own weeks (savings) with the same logic the live view uses. kind/day select
// the payday rule; omitted they fall back to the original last-working-day behaviour.
function periodBounds(payYear, payMonth, kind, day) {
    const prevMonth = payMonth - 1 < 0 ? 11 : payMonth - 1;
    const prevMonthYear = payMonth - 1 < 0 ? payYear - 1 : payYear;
    const start = paydayFor(prevMonthYear, prevMonth, kind, day);
    const end = addDays(paydayFor(payYear, payMonth, kind, day), -1);
    return { start, end };
}
// A scheduled pin (freq monthly/weekly) is populated into the Week log as read-only "virtual"
// entries, one per occurrence in the period, so it counts against the week it lands in — instead
// of the flat whole-period pin total. `day` is the day-of-month (1-31) for monthly, or the
// day-of-week (0=Sun..6=Sat) for weekly. Pins with no freq (or "none") are left to the flat model.
function isScheduledPin(p) {
    return !!(p.freq && p.freq !== "none");
}
function makePinEntry(pin, weekIndex, date) {
    return {
        id: "pin-" + pin.id + "-" + weekIndex,
        amount: pin.amount || 0,
        label: pin.label,
        note: pin.note || "",
        method: pin.method,
        type: pin.type,
        weekIndex,
        date: date.toISOString(),
        order: date.getTime(),
        pinned: true,
        pinId: pin.id,
    };
}
function expandScheduledPins(pins, weeks) {
    const out = [];
    for (const p of pins) {
        if (!isScheduledPin(p))
            continue;
        if (p.freq === "weekly") {
            // One occurrence per week that contains the chosen weekday (partial first/last weeks
            // that don't include it are simply skipped).
            for (const w of weeks) {
                const match = w.days.find(d => d.getDay() === p.day);
                if (match)
                    out.push(makePinEntry(p, w.index, match));
            }
        }
        else if (p.freq === "monthly") {
            // First day in the period matching the chosen day-of-month (a pay period can span two
            // calendar months, so a boundary date can occur twice — first occurrence wins). If the
            // day never occurs (e.g. the 31st in a shorter window), clamp to the period's last day
            // so the charge isn't silently dropped.
            let target = null, targetWeek = null;
            for (const w of weeks) {
                const match = w.days.find(d => d.getDate() === p.day);
                if (match) {
                    target = match;
                    targetWeek = w.index;
                    break;
                }
            }
            if (!target) {
                const lastWeek = weeks[weeks.length - 1];
                if (lastWeek) {
                    target = lastWeek.days[lastWeek.days.length - 1];
                    targetWeek = lastWeek.index;
                }
            }
            if (target)
                out.push(makePinEntry(p, targetWeek, target));
        }
    }
    return out;
}
function todayWeekIndex(weeks) {
    var _a, _b;
    const norm = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const today = norm(new Date());
    for (const w of weeks) {
        if (today >= norm(w.start) && today <= norm(w.end))
            return w.index;
    }
    if (today < norm((_a = weeks[0]) === null || _a === void 0 ? void 0 : _a.start))
        return 1;
    return ((_b = weeks[weeks.length - 1]) === null || _b === void 0 ? void 0 : _b.index) || 1;
}
// ─── Default State ────────────────────────────────────────────────────────────
function defaultState() {
    const now = londonNow();
    now.setHours(0, 0, 0, 0);
    const { year: y, month: m } = periodLabelFor(now);
    return {
        monthLabel: `${MONTH_NAMES[m]} ${y}`,
        payYear: y,
        payMonth: m,
        monthlyBudget: 1069.65,
        weeklyBudget: 260,
        paydayKind: "last-working",
        paydayDay: 25,
        theme: "dark",
        lastMethod: "Amex",
        methods: DEFAULT_METHODS,
        categories: DEFAULT_CATEGORIES,
        categoryPrompt: true,
        descriptionPrompt: true,
        helpHintSeen: false,
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
        case "ADD_CREDIT": return { ...s, credits: [a.credit, ...(s.credits || [])] };
        case "DEL_CREDIT": return { ...s, credits: (s.credits || []).filter(c => c.id !== a.id) };
        case "UPD_CREDIT": return { ...s, credits: (s.credits || []).map(c => c.id === a.credit.id ? a.credit : c) };
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
                paydayKind: s.paydayKind,
                paydayDay: s.paydayDay,
            };
            const newHistory = [...(s.monthHistory || []), archive].slice(-12);
            return { payYear: a.newYear, payMonth: a.newMonth, monthLabel: a.newLabel,
                monthlyBudget: s.monthlyBudget, weeklyBudget: s.weeklyBudget,
                paydayKind: s.paydayKind, paydayDay: s.paydayDay, theme: s.theme, pins: s.pins, methods: s.methods,
                lastMethod: s.lastMethod, monthHistory: newHistory,
                entries: [], credits: [] };
        }
        case "EDIT_PAST_ENTRY": {
            // Writes an entry change back into the archived period being viewed, not live state
            const newHistory = (s.monthHistory || []).map((arc, i) => {
                if (i !== a.archiveIndex)
                    return arc;
                if (a.op === "add")
                    return { ...arc, entries: [a.entry, ...arc.entries] };
                if (a.op === "del")
                    return { ...arc, entries: arc.entries.filter(e => e.id !== a.id) };
                if (a.op === "upd")
                    return { ...arc, entries: arc.entries.map(e => e.id === a.entry.id ? a.entry : e) };
                return arc;
            });
            return { ...s, monthHistory: newHistory };
        }
        case "EDIT_PAST_CREDIT": {
            const newHistory = (s.monthHistory || []).map((arc, i) => {
                if (i !== a.archiveIndex)
                    return arc;
                if (a.op === "add")
                    return { ...arc, credits: [a.credit, ...(arc.credits || [])] };
                if (a.op === "del")
                    return { ...arc, credits: (arc.credits || []).filter(c => c.id !== a.id) };
                if (a.op === "upd")
                    return { ...arc, credits: (arc.credits || []).map(c => c.id === a.credit.id ? a.credit : c) };
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
    ["The pay period", "SpendTracker follows your pay cycle, not the calendar month. A period runs from your last payday up to the day before your next one, and switches over automatically the moment payday arrives. Set your payday rule in Settings — last working day, last Friday, last calendar day, or a fixed date. The month label at the top names the period you're currently spending in."],
    ["Weekly budgets & rollover", "Your monthly budget is split into weekly allowances. If you go over in a week, the difference is shared evenly across the weeks you have left, so a single big week doesn't all land on the next one. Overspend in the final week has nowhere left to spread, so it just shows as over."],
    ["The “per day” figures", "On the current week you'll see two per-day numbers: how much you can spend each remaining day to stay inside this week, and the same across the rest of the whole period. They turn red as they get tight."],
    ["Logging: cards & types", "Tap ＋ (or “Log spend”) to record spending. Pick the card, then a type — Personal counts against your budget, Work is reimbursable and kept separate, Credit is money coming in, and Split is for shared payments. Amounts type in pence: the display fills from the right, so tapping 1-2-5-0 gives £12.50. Tap any logged item to edit it."],
    ["Splitting a payment", "Choose Split, enter the full amount you paid, then enter just the part that isn't yours — a friend's share, or a work expense. Your share counts against your budget; the rest is set aside and doesn't."],
    ["Pinned costs", "Pins are fixed, recurring costs — rent, subscriptions, a gym. They count against the period's budget automatically without logging them each time, and carry across periods. Give a pin a Monthly or Weekly frequency and it's dropped straight into the right week of the log, counting against that week. Mark one Work or “Split” to keep it out of your personal total."],
    ["Savings", "When a period ends, whatever budget you had left is banked on the Savings tab. The current period isn't counted until it finishes — so a brand-new month shows £0 saved until it rolls over — and the list shows each completed period's leftover."],
    ["Summary & export", "The Summary tab breaks the period down: spend vs budget, personal vs reimbursable work spend, a per-card breakdown you can tap into, your biggest spends, and where spending came from. You can export it all as text."],
    ["Going back to a past period", "In Settings, “Go back to…” lets you revisit a finished period. Its figures reflect that period's own budget, and any edits you make there apply only to it — your current period is left untouched."],
    ["Your data & security", "Everything is encrypted on your device with your passphrase and never leaves your phone. Your recovery code is the only way back in if you forget the passphrase, so keep it somewhere safe. Face ID unlocks where supported, the app auto-locks after a couple of minutes in the background, and Lock now (at the bottom of Settings) locks it instantly."],
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
            if (ref.current && ref.current.scrollIntoView)
                ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [focus]);
    return (React.createElement("div", { ref: ref, style: S.settingsCard },
        React.createElement("button", { style: { background: "none", border: "none", width: "100%", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }, onClick: () => setExpanded(e => !e) },
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" } }, "How it works"),
            React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: 12 } }, expanded ? "▾" : "▸")),
        expanded && (React.createElement("div", { style: { marginTop: 6 } }, HELP_TOPICS.map(([q, a], i) => (React.createElement("div", { key: i, style: { borderTop: i === 0 ? "none" : "1px solid var(--border)" } },
            React.createElement("button", { style: { background: "none", border: "none", width: "100%", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }, onClick: () => setOpen(open === i ? null : i) },
                React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--text-body)" } }, q),
                React.createElement("span", { style: { color: "var(--text-muted)", fontSize: 12, flexShrink: 0 } }, open === i ? "▾" : "▸")),
            open === i && React.createElement("div", { style: { fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, padding: "0 0 12px" } }, a))))))));
}
// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
    var _a;
    const [state, dispatch] = useReducer(reducer, null, () => {
        const s = load() || defaultState();
        // Backfill fields for accounts created before they existed: methods (customisable payment
        // types), categories, and the category-prompt toggle. Spread once so all backfills apply.
        return {
            ...s,
            methods: (s.methods && s.methods.length) ? s.methods : DEFAULT_METHODS,
            // Ensure every category has an `icon` (accounts from the emoji-based build won't): reuse the
            // default id→icon map, else fall back to a generic tag.
            categories: (s.categories && s.categories.length)
                ? s.categories.map(c => c.icon ? c : { ...c, icon: DEFAULT_CATEGORY_ICON[c.id] || "tag" })
                : DEFAULT_CATEGORIES,
            categoryPrompt: s.categoryPrompt === undefined ? true : s.categoryPrompt,
            descriptionPrompt: s.descriptionPrompt === undefined ? true : s.descriptionPrompt,
        };
    });
    // Refresh the module-level method views from state before any child renders (see Constants).
    METHODS = state.methods;
    METHOD_COLOR = Object.fromEntries(state.methods.map(m => [m.id, m.color]));
    METHOD_NAME = Object.fromEntries(state.methods.map(m => [m.id, m.name]));
    CATEGORIES = state.categories;
    CATEGORY_BY_ID = Object.fromEntries(state.categories.map(c => [c.id, c]));
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
    const [showCustomise, setShowCustomise] = useState(false); // appearance / payment types / categories modal
    // The most recently deleted entry/credit (or split pair), kept verbatim so Undo can restore it
    // exactly. Global (not per-week/tab) and not persisted — survives navigation, clears on reload.
    const [lastDeleted, setLastDeleted] = useState(null); // {kind:"entry",entry} | {kind:"credit",credit} | {kind:"split",your,their}
    const [helpNonce, setHelpNonce] = useState(0); // bumped by the help button / new-user hint; each bump re-opens & scrolls to Settings' "How it works" card
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
    const periodData = viewingPast || state;
    // Auto-switch month — a period labelled X starts on (X-1)'s payday and runs up to (not
    // including) X's own payday, since X's payday is what pays you for the work X represents
    // and is the moment you clear last period's card debt. So the switch to X+1 fires the
    // instant today reaches X's payday — payday itself is day one of the next period, not
    // the last day of the current one.
    useEffect(() => {
        const checkMonth = () => {
            const now = londonNow();
            now.setHours(0, 0, 0, 0);
            const thisLabelPayday = paydayFor(state.payYear, state.payMonth, state.paydayKind || "last-working", state.paydayDay);
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
    }, [state.payYear, state.payMonth, state.paydayKind, state.paydayDay]);
    useEffect(() => { save(state); }, [state]);
    // Applies the chosen theme to the whole document (the CSS variables driving every neutral
    // colour live on :root, so this is the only DOM touch light mode needs) and tints the
    // browser chrome to match. Runs post-unlock only — the lock screen and onboarding, which
    // can't read encrypted state, stay on the dark theme they've always used.
    useEffect(() => {
        const theme = state.theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta)
            meta.content = theme === "light" ? "#f5efdf" : "#030712";
    }, [state.theme]);
    // Build calendar from payday — uses the viewed period's own pay dates and payday rule
    // when looking at the past, not today's live settings.
    //
    // Period labelling: a period is named for the month its payday is paying you for. Since
    // you get paid near the end of a month for that month's work (per the payday rule), and that payday
    // is when last month's card debt gets cleared and a fresh accounting period begins, the
    // period labelled "July" starts on JUNE's payday and runs up to (not including) JULY's
    // payday. payYear/payMonth store the label (X); periodStart/periodEnd are derived from it.
    const { payYear: y, payMonth: m } = periodData;
    const { start: periodStart, end: periodEnd } = periodBounds(y, m, periodData.paydayKind || "last-working", periodData.paydayDay);
    // Fractional weeks in this pay period, so Settings can convert monthly <-> weekly
    // the same way first-run setup does (crypto.js uses the identical days/7 basis).
    const periodDays = Math.round((periodEnd - periodStart) / 86400000) + 1;
    const weeksInPeriod = periodDays / 7;
    const weeks = buildWeeks(periodStart, periodEnd);
    // Scheduled pins are expanded into read-only virtual entries and folded into the derived data
    // layer, so every downstream figure (week panels, totals, summary, export) treats them as
    // entries — counting against the week they land in — while they're dropped from the flat pin
    // total to avoid double-counting. Non-scheduled pins keep the flat whole-period behaviour.
    // effectiveData keeps its name so all derivations below read the augmented data unchanged.
    const pinEntries = expandScheduledPins(periodData.pins, weeks);
    const effectiveData = {
        ...periodData,
        entries: [...periodData.entries, ...pinEntries],
        pins: periodData.pins.filter(p => !isScheduledPin(p)),
    };
    useEffect(() => {
        const idx = todayWeekIndex(weeks);
        setActiveWeek(idx);
    }, [state.payMonth, state.payYear, viewingPastIndex]);
    // Weekly budget rebalancing. weeklyBudget is a per-7-day RATE (monthlyBudget / (periodDays/7)),
    // so each week's base budget is that rate scaled by the week's own day count — the payday week
    // and the final stub week are partial, and pro-rating this way makes the per-week budgets sum to
    // the monthly budget instead of over-allocating the short weeks. A week's overspend — measured
    // against its own (already-reduced) budget — is then spread across the DAYS of every week that
    // comes after it, so every later week keeps the same reduced daily allowance (a short week gives
    // up proportionally less than a full one) and going over isn't a cliff on the next week alone.
    // This cascades: a later week's overspend spreads across the days still after it. The final week
    // has nowhere left to spread to, so an overspend there just shows as "over" (the period's last
    // absorber). Lapsed earlier weeks are never touched. Underspend does not roll forward (month-level
    // "remaining" and the per-day-of-month figure already reflect it).
    function getRebalancedBudgets(weeks, entries, weeklyBudget) {
        const N = weeks.length;
        const dailyRate = weeklyBudget / 7;
        const spend = weeks.map(w => entries.filter(e => e.weekIndex === w.index && e.type === "personal").reduce((s, e) => s + e.amount, 0));
        const reduction = new Array(N).fill(0); // budget cut carried into each week from earlier overspends
        const budgets = {};
        weeks.forEach((w, i) => {
            const eff = Math.max(dailyRate * w.days.length - reduction[i], 0);
            budgets[w.index] = eff;
            const over = Math.max(spend[i] - eff, 0);
            const daysLeft = weeks.slice(i + 1).reduce((s, x) => s + x.days.length, 0);
            if (over > 0 && daysLeft > 0) {
                for (let j = i + 1; j < N; j++)
                    reduction[j] += over * (weeks[j].days.length / daysLeft);
            }
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
            res[m.id] = entries.filter(e => e.method === m.id).reduce((s, e) => s + e.amount, 0) +
                pins.filter(p => p.method === m.id).reduce((s, p) => s + (p.amount || 0), 0);
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
    const todayDate = (() => { const d = londonNow(); d.setHours(0, 0, 0, 0); return d; })();
    const normDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const currentWeekObj = viewingPast ? null : (weeks.find(w => todayDate >= normDay(w.start) && todayDate <= normDay(w.end)) || weeks[0]);
    const daysLeftInWeek = currentWeekObj ? currentWeekObj.days.filter(d => normDay(d) >= todayDate).length : 1;
    const daysLeftInMonth = viewingPast ? 0 : (() => { let c = new Date(todayDate), count = 0; while (normDay(c) <= normDay(periodEnd)) {
        count++;
        c = addDays(c, 1);
    } return Math.max(count, 1); })();
    const currentWeekBudget = currentWeekObj ? ((_a = rebalancedBudgets[currentWeekObj.index]) !== null && _a !== void 0 ? _a : effectiveData.weeklyBudget) : effectiveData.weeklyBudget;
    const currentWeekSpent = currentWeekObj ? effectiveData.entries.filter(e => e.weekIndex === currentWeekObj.index && e.type === "personal").reduce((s, e) => s + e.amount, 0) : 0;
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
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_ENTRY", op: "add", archiveIndex: viewingPastIndex, entry });
        else
            dispatch({ type: "ADD_ENTRY", entry });
    }
    function delEntry(id) {
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_ENTRY", op: "del", archiveIndex: viewingPastIndex, id });
        else
            dispatch({ type: "DEL_ENTRY", id });
    }
    function addCredit(credit) {
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_CREDIT", op: "add", archiveIndex: viewingPastIndex, credit });
        else
            dispatch({ type: "ADD_CREDIT", credit });
    }
    function delCredit(id) {
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_CREDIT", op: "del", archiveIndex: viewingPastIndex, id });
        else
            dispatch({ type: "DEL_CREDIT", id });
    }
    function updEntry(entry) {
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_ENTRY", op: "upd", archiveIndex: viewingPastIndex, entry });
        else
            dispatch({ type: "UPD_ENTRY", entry });
    }
    function updCredit(credit) {
        if (viewingPast)
            dispatch({ type: "EDIT_PAST_CREDIT", op: "upd", archiveIndex: viewingPastIndex, credit });
        else
            dispatch({ type: "UPD_CREDIT", credit });
    }
    // Restores the most recently deleted entry/credit (or split pair) verbatim — same id/order/
    // weekIndex, so it reappears in its original week and position. Global, not per-week, so it
    // survives switching tabs/weeks; plain useState (not persisted `state`) so it clears on reload.
    function undoLastDeleted() {
        if (!lastDeleted)
            return;
        if (lastDeleted.kind === "entry")
            addEntry(lastDeleted.entry);
        else if (lastDeleted.kind === "credit")
            addCredit(lastDeleted.credit);
        else {
            if (lastDeleted.your)
                addEntry(lastDeleted.your);
            if (lastDeleted.their)
                addEntry(lastDeleted.their);
        }
        setLastDeleted(null);
    }
    // Pins are shared across periods (they're recurring fixed costs), so pin edits always
    // apply live regardless of which period is being viewed.
    return (React.createElement("div", { style: S.root },
        React.createElement("div", { style: S.header },
            React.createElement("div", null,
                React.createElement("div", { style: S.appTitle }, "SpendTracker"),
                React.createElement("div", { style: S.appSub },
                    effectiveData.monthLabel,
                    viewingPast ? " · past period" : "")),
            React.createElement("div", { style: S.headerRight },
                React.createElement("div", { style: { ...S.remaining, color: remainColor } }, fmt(remaining)),
                React.createElement("div", { style: S.remainLabel }, "left"))),
        React.createElement("button", { style: S.helpFab, "aria-label": "Help", onClick: () => { setTab("settings"); setHelpNonce(n => n + 1); } }, "?"),
        viewingPast && (React.createElement("div", { style: S.pastBanner },
            React.createElement("span", null,
                "Viewing ",
                effectiveData.monthLabel,
                " \u2014 changes here apply to that period only"),
            React.createElement("button", { style: S.pastBannerBtn, onClick: () => setViewingPastIndex(null) }, "Return to current"))),
        !viewingPast && state.helpHintSeen === false && (React.createElement("div", { style: S.hintBanner },
            React.createElement("span", null, "\uD83D\uDC4B New here? Take a quick tour of how it all works."),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } },
                React.createElement("button", { style: S.hintBtn, onClick: () => { dispatch({ type: "SETTINGS", patch: { helpHintSeen: true } }); setTab("settings"); setHelpNonce(n => n + 1); } }, "Show me"),
                React.createElement("button", { style: S.hintDismiss, "aria-label": "Dismiss", onClick: () => dispatch({ type: "SETTINGS", patch: { helpHintSeen: true } }) }, "\u2715")))),
        React.createElement("div", { style: S.tabs }, [["week", "Week"], ["pins", "Pinned"], ["savings", "Savings"], ["summary", "Summary"], ["settings", "⚙"]].map(([k, l]) => (React.createElement("button", { key: k, style: { ...S.tab, ...(tab === k ? S.tabActive : {}) }, onClick: () => { setTab(k); if (k === "settings")
                setHelpNonce(0); } }, l)))),
        tab === "week" && (React.createElement("div", { style: { padding: "12px 16px 80px" } },
            React.createElement("div", { style: S.weekNav }, weeks.map(w => (React.createElement("button", { key: w.index, style: { ...S.weekPill, ...(currentWeekObj && w.index === currentWeekObj.index ? S.weekPillCurrent : {}), ...(activeWeek === w.index ? S.weekPillActive : {}) }, onClick: () => setActiveWeek(w.index) },
                "W",
                w.index)))),
            !viewingPast && currentWeekObj && activeWeek === currentWeekObj.index && !isNaN(dailyFromWeek) && (React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 14 } },
                React.createElement("div", { style: S.dailyCard },
                    React.createElement("div", { style: S.dailyLabel }, "Per day \u00B7 week"),
                    React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: dailyFromWeek < 20 ? "#ef4444" : "#22c55e" } }, fmt(dailyFromWeek)),
                    React.createElement("div", { style: S.dailySub },
                        daysLeftInWeek,
                        "d left")),
                React.createElement("div", { style: S.dailyCard },
                    React.createElement("div", { style: S.dailyLabel }, "Per day \u00B7 month"),
                    React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: dailyFromMonth < 20 ? "#ef4444" : "var(--text-tertiary)" } }, fmt(dailyFromMonth)),
                    React.createElement("div", { style: S.dailySub },
                        daysLeftInMonth,
                        "d left")))),
            weeks.filter(w => w.index === activeWeek).map(week => {
                var _a;
                return (React.createElement(WeekPanel, { key: week.index, week: week, weeks: weeks, entries: effectiveData.entries.filter(e => e.weekIndex === week.index), credits: effectiveData.credits.filter(c => c.weekIndex === week.index) || [], weeklyBudget: (_a = rebalancedBudgets[week.index]) !== null && _a !== void 0 ? _a : effectiveData.weeklyBudget, isLastWeek: week.index === weeks.length, categories: state.categories, onAddCategory: cat => dispatch({ type: "SETTINGS", patch: { categories: [...state.categories, cat] } }), onAddEntry: () => setShowEntryFor(week.index), onDelEntry: delEntry, onDelCredit: delCredit, onEditEntry: (entry) => setEditTarget({ kind: "entry", data: entry, weekIndex: entry.weekIndex }), onEditCredit: (credit) => setEditTarget({ kind: "credit", data: credit, weekIndex: credit.weekIndex }), onUpdEntry: updEntry, onUpdCredit: updCredit, onCapture: setLastDeleted, lastDeleted: lastDeleted, onUndo: undoLastDeleted }));
            }))),
        tab === "pins" && (React.createElement("div", { style: { padding: "12px 16px" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
                React.createElement("div", { style: S.sectionTitle }, "Fixed costs"),
                React.createElement("button", { style: S.addBtn, onClick: () => setShowAddPin(true) }, "+ Pin")),
            React.createElement("div", { style: S.pinGrid }, state.pins.length === 0 ? React.createElement("div", { style: S.empty }, "No pinned costs") : state.pins.map(p => React.createElement(PinCard, { key: p.id, pin: p, onEdit: () => setEditPin(p), onDelete: () => dispatch({ type: "DEL_PIN", id: p.id }) }))))),
        tab === "savings" && (() => {
            // Savings = accumulated leftover budget from COMPLETED months only (i.e. the
            // months archived into monthHistory). The current live month is not counted
            // until it rolls over, which is why a brand-new user sees £0 all through their
            // first month. A month's leftover is computed exactly like the header's
            // "remaining": its own monthlyBudget − personal spend (entries + pins) + credits.
            const monthSaved = (m) => {
                // Scheduled pins are counted as their per-occurrence week entries (so a weekly pin
                // counts once per week), matching how the live period and week log count them.
                // Bounds use the payday rule the month was archived under, not today's setting.
                const { start, end } = periodBounds(m.payYear, m.payMonth, m.paydayKind || "last-working", m.paydayDay);
                const mWeeks = buildWeeks(start, end);
                const pinEntries = expandScheduledPins(m.pins, mWeeks);
                const spentEntries = [...m.entries, ...pinEntries].filter(e => e.type === "personal").reduce((s, e) => s + e.amount, 0);
                const spentPins = m.pins.filter(p => !isScheduledPin(p) && p.type !== "business" && p.type !== "excluded").reduce((s, p) => s + (p.amount || 0), 0);
                const credits = (m.credits || []).reduce((s, c) => s + c.amount, 0);
                return m.monthlyBudget - (spentEntries + spentPins) + credits;
            };
            const rows = (state.monthHistory || [])
                .map(m => { const saved = monthSaved(m); return { label: m.monthLabel, saved, budget: m.monthlyBudget, spent: m.monthlyBudget - saved }; })
                .reverse(); // most recent completed month first
            const totalSaved = rows.reduce((s, r) => s + r.saved, 0);
            const signed = (n) => (n < 0 ? "-" : "+") + fmt(n);
            return (React.createElement("div", { style: { padding: "12px 16px" } },
                React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px", marginBottom: 12 } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase" } }, "Total saved"),
                    React.createElement("div", { style: { fontSize: 36, fontWeight: 800, color: totalSaved >= 0 ? "#22c55e" : "#f87171", marginBottom: 8 } },
                        totalSaved < 0 ? "-" : "",
                        fmt(totalSaved)),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 } },
                        "Leftover budget carried over from completed months. ",
                        state.monthLabel,
                        "'s leftover is added to this once the month ends.")),
                !viewingPast && (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", fontWeight: 600 } },
                            state.monthLabel,
                            " ",
                            React.createElement("span", { style: { color: "var(--text-secondary)", fontWeight: 400 } }, "\u00B7 in progress")),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginTop: 2 } },
                            "Adds to savings when ",
                            state.monthLabel,
                            " ends")),
                    React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: remaining >= 0 ? "var(--text-tertiary)" : "#f87171" } }, signed(remaining)))),
                React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px" } },
                    React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Month by month"),
                    rows.length === 0 ? (React.createElement("div", { style: { color: "var(--text-muted)", fontSize: 13, padding: "4px 0", lineHeight: 1.5 } },
                        "No completed months yet. Your first month's leftover shows up here once ",
                        state.monthLabel,
                        " ends.")) : rows.map((r, i) => (React.createElement("div", { key: r.label, style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" } },
                        React.createElement("div", null,
                            React.createElement("div", { style: { fontSize: 13, color: "var(--text-primary)", fontWeight: 600 } }, r.label),
                            React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginTop: 1 } },
                                fmt(r.spent),
                                " spent of ",
                                fmt(r.budget))),
                        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: r.saved >= 0 ? "#22c55e" : "#f87171" } }, signed(r.saved))))))));
        })(),
        tab === "summary" && (React.createElement(SummaryView, { state: effectiveData, weeks: weeks, rebalancedBudgets: rebalancedBudgets, totalSpent: totalSpent, totalEntries: totalEntries, totalPinned: totalPinned, totalCredits: totalCredits, remaining: remaining, methodTotals: methodTotals, businessEntries: businessEntries, onExport: () => setShowExport(true) })),
        tab === "settings" && (React.createElement("div", { style: { padding: "12px 16px" } },
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2, textTransform: "uppercase" } }, "Customisation"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: 10 } }, "Appearance, payment types & spending categories"),
                React.createElement("button", { onClick: () => setShowCustomise(true), style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%" } }, "\uD83C\uDFA8 Open customisation")),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Budget"),
                React.createElement("div", { style: { marginBottom: 10 } },
                    React.createElement("label", { style: { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 } }, "Monthly budget (\u00A3)"),
                    React.createElement("input", { key: `monthlyBudget-${state.monthlyBudget}`, style: S.input, type: "number", defaultValue: state.monthlyBudget, onBlur: e => { const v = parseFloat(e.target.value); if (!isNaN(v))
                            dispatch({ type: "SETTINGS", patch: { monthlyBudget: v, weeklyBudget: Math.round((v / weeksInPeriod) * 100) / 100 } }); } })),
                React.createElement("div", { style: { marginBottom: 10 } },
                    React.createElement("label", { style: { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 } }, "Weekly budget (\u00A3)"),
                    React.createElement("input", { key: `weeklyBudget-${state.weeklyBudget}`, style: S.input, type: "number", defaultValue: state.weeklyBudget, onBlur: e => { const v = parseFloat(e.target.value); if (!isNaN(v))
                            dispatch({ type: "SETTINGS", patch: { weeklyBudget: v, monthlyBudget: Math.round((v * weeksInPeriod) * 100) / 100 } }); } })),
                React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)" } },
                    "Monthly and weekly are linked across this ",
                    periodDays,
                    "-day period \u2014 changing one recalculates the other.")),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Pay period"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", marginBottom: 10 } },
                    "Currently tracking ",
                    React.createElement("strong", { style: { color: "var(--text-heading)" } }, state.monthLabel),
                    ". A period starts on the previous month's payday and runs until this period's own payday \u2014 the tracker switches automatically the moment that payday arrives."),
                (() => {
                    const kind = state.paydayKind || "last-working";
                    const kindBtn = (on) => ({ background: on ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${on ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 8, color: on ? "var(--text-heading)" : "var(--text-muted)", padding: "9px 4px", fontSize: 12, fontWeight: 600, cursor: "pointer" });
                    return (React.createElement("div", { style: { marginBottom: 12 } },
                        React.createElement("label", { style: { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 } }, "Payday"),
                        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 } }, [["last-working", "Last working day"], ["last-friday", "Last Friday"], ["last-calendar", "Last calendar day"], ["fixed", "Fixed date"]].map(([v, l]) => (React.createElement("button", { key: v, style: kindBtn(kind === v), onClick: () => dispatch({ type: "SETTINGS", patch: { paydayKind: v } }) }, l)))),
                        kind === "fixed" && (React.createElement("div", { style: { marginBottom: 8 } },
                            React.createElement("label", { style: { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 } }, "Day of the month"),
                            React.createElement("input", { key: `payday-${state.paydayDay}`, style: { ...S.input, marginBottom: 0 }, type: "number", inputMode: "numeric", min: 1, max: 31, defaultValue: state.paydayDay || 25, onBlur: e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 31)
                                    dispatch({ type: "SETTINGS", patch: { paydayDay: v } }); } }))),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 } }, "Payday defines when a period starts and ends. Fixed dates falling on a weekend move to the working day before. Changing this redraws the current period's weeks \u2014 and if it moves the payday into the past, the tracker rolls into the next period, as it would on any payday.")));
                })(),
                mostRecentArchiveIndex !== null ? (viewingPast ? (React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%" }, onClick: () => setViewingPastIndex(null) },
                    "\u2190 Return to current period (",
                    state.monthLabel,
                    ")")) : (React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%" }, onClick: () => setViewingPastIndex(mostRecentArchiveIndex) },
                    "\u2190 Go back to ",
                    state.monthHistory[mostRecentArchiveIndex].monthLabel))) : (React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)" } }, "No previous period to go back to yet."))),
            React.createElement(HelpCard, { focus: helpNonce }),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Move to another device"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", marginBottom: 10, lineHeight: 1.5 } }, "Each browser keeps its own separate data \u2014 so Safari, Chrome and the home-screen app each start fresh. Export your account here, then import it in the other browser or on a new phone to carry everything across."),
                React.createElement("div", { style: { display: "flex", gap: 8 } },
                    React.createElement("button", { style: { ...S.btn, background: "#0369a1", flex: 1 }, onClick: () => setShowBackup(true) }, "Export account"),
                    React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", flex: 1 }, onClick: () => setShowImportAcct(true) }, "Import account"))),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Security"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", marginBottom: 10, lineHeight: 1.5 } }, "Lock the app now and return to the passphrase screen. It also auto-locks after a couple of minutes in the background."),
                React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%" }, onClick: () => { if (window.SpendVault && window.SpendVault.requestLock)
                        window.SpendVault.requestLock(); } }, "\uD83D\uDD12 Lock now")),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#f87171", marginBottom: 10, textTransform: "uppercase" } }, "Reset"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", marginBottom: 10, lineHeight: 1.5 } }, "Erase everything on this device \u2014 budget, transactions, history and your passphrase \u2014 and start over from setup. This can't be undone."),
                !confirmWipe ? (React.createElement("button", { style: { ...S.btn, background: "#7f1d1d", border: "1px solid #b91c1c", width: "100%" }, onClick: () => setConfirmWipe(true) }, "Reset app & erase all data")) : (React.createElement("div", { style: { display: "flex", gap: 8 } },
                    React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", flex: 1 }, onClick: () => setConfirmWipe(false) }, "Cancel"),
                    React.createElement("button", { style: { ...S.btn, background: "#dc2626", flex: 1 }, onClick: () => { if (window.SpendVault && window.SpendVault.wipe)
                            window.SpendVault.wipe(); } }, "Erase everything")))))),
        !viewingPast && (React.createElement("button", { "aria-label": "Quick add spend", onClick: () => setShowEntryFor(todayWeekIndex(weeks)), style: S.quickAdd }, "+")),
        (showEntryFor !== null || editTarget) && React.createElement(EntryModal, { weekIndex: editTarget ? editTarget.weekIndex : showEntryFor, weeks: weeks, edit: editTarget, defaultMethod: state.lastMethod || state.methods[0].id, categories: state.categories, categoryPrompt: state.categoryPrompt, descriptionPrompt: state.descriptionPrompt, onAddCategory: cat => dispatch({ type: "SETTINGS", patch: { categories: [...state.categories, cat] } }), onSave: addEntry, onSaveCredit: addCredit, onUpdate: updEntry, onUpdateCredit: updCredit, onClose: () => { setShowEntryFor(null); setEditTarget(null); } }),
        (showAddPin || editPin) && React.createElement(PinModal, { pin: editPin, onSave: pin => { if (editPin)
                dispatch({ type: "UPD_PIN", pin });
            else
                dispatch({ type: "ADD_PIN", pin }); setShowAddPin(false); setEditPin(null); }, onClose: () => { setShowAddPin(false); setEditPin(null); } }),
        showExport && React.createElement(ExportModal, { state: effectiveData, weeks: weeks, rebalancedBudgets: rebalancedBudgets, totalSpent: totalSpent, remaining: remaining, totalCredits: totalCredits, methodTotals: methodTotals, onClose: () => setShowExport(false) }),
        showBackup && React.createElement(BackupModal, { onClose: () => setShowBackup(false) }),
        showImportAcct && React.createElement(ImportBackupModal, { onClose: () => setShowImportAcct(false) }),
        showCustomise && React.createElement(CustomiseModal, { state: state, dispatch: dispatch, onClose: () => setShowCustomise(false) })));
}
// ─── Week Panel ───────────────────────────────────────────────────────────────
function WeekPanel({ week, weeks, entries, credits, weeklyBudget, isLastWeek, categories, onAddCategory, onAddEntry, onDelEntry, onDelCredit, onEditEntry, onEditCredit, onUpdEntry, onUpdCredit, onCapture, lastDeleted, onUndo }) {
    const personal = entries.filter(e => e.type === "personal");
    const spent = personal.reduce((s, e) => s + e.amount, 0);
    const over = spent - weeklyBudget;
    const pct = weeklyBudget > 0 ? Math.min((spent / weeklyBudget) * 100, 100) : 0;
    const [editMode, setEditMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [showMove, setShowMove] = useState(false);
    const [showCategorize, setShowCategorize] = useState(false);
    const [dragId, setDragId] = useState(null); // id of the unit being dragged, or null
    const [dragList, setDragList] = useState(null); // working unit order during a drag, else null
    const dragIdRef = useRef(null);
    const dragListRef = useRef(null);
    const rowRefs = useRef({}); // unit.id -> row DOM node, for hit-testing during drag
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
            if (seenSplits.has(e.splitGroupId))
                continue;
            seenSplits.add(e.splitGroupId);
            units.push({ kind: "split", id: e.splitGroupId, order: effOrder(e), group: entries.filter(x => x.splitGroupId === e.splitGroupId) });
        }
        else {
            units.push({ kind: "single", id: e.id, order: effOrder(e), entry: e, pinned: !!e.pinned });
        }
    }
    for (const c of credits)
        units.push({ kind: "credit", id: c.id, order: effOrder(c), credit: c });
    units.sort((a, b) => b.order - a.order);
    // During a drag, render the live working order; otherwise the sorted order.
    const renderUnits = dragList || units;
    // Deleting one half of a split removes both halves, since a lone remainder is meaningless.
    // Captures the full object(s) via onCapture before deleting, so Undo can restore them —
    // DEL_ENTRY/DEL_CREDIT only take an id and the object is gone from state once deleted.
    function handleDelete(entry) {
        if (entry.splitGroupId) {
            const group = entries.filter(e => e.splitGroupId === entry.splitGroupId);
            onCapture({ kind: "split", your: group.find(e => e.type === "personal") || null, their: group.find(e => e.type === "excluded") || null });
            group.forEach(e => onDelEntry(e.id));
        }
        else {
            onCapture({ kind: "entry", entry });
            onDelEntry(entry.id);
        }
    }
    function toggleSelect(id) {
        setConfirmBulk(false);
        setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    }
    function exitEdit() { setEditMode(false); setSelected(new Set()); setConfirmBulk(false); setShowMove(false); setShowCategorize(false); }
    // Bulk delete every selected unit, expanding split groups to both halves (like handleDelete).
    // Only captures for Undo when exactly one unit was selected — a bulk delete of many has no
    // single sensible "last deleted" for one Undo button to restore.
    function bulkDelete() {
        const toDelete = units.filter(u => selected.has(u.id));
        if (toDelete.length === 1) {
            const u = toDelete[0];
            if (u.kind === "credit")
                onCapture({ kind: "credit", credit: u.credit });
            else if (u.kind === "single")
                onCapture({ kind: "entry", entry: u.entry });
            else
                onCapture({ kind: "split", your: u.group.find(e => e.type === "personal") || null, their: u.group.find(e => e.type === "excluded") || null });
        }
        toDelete.forEach(u => {
            if (u.kind === "credit")
                onDelCredit(u.credit.id);
            else if (u.kind === "single")
                onDelEntry(u.entry.id);
            else
                u.group.forEach(half => onDelEntry(half.id));
        });
        exitEdit();
    }
    // Bulk move every selected unit to a different week (reusing UPD_ENTRY/UPD_CREDIT, same as drag reorder).
    function bulkMove(newWeek) {
        units.forEach(u => {
            if (!selected.has(u.id))
                return;
            if (u.kind === "credit")
                onUpdCredit({ ...u.credit, weekIndex: newWeek });
            else if (u.kind === "single")
                onUpdEntry({ ...u.entry, weekIndex: newWeek });
            else
                u.group.forEach(half => onUpdEntry({ ...half, weekIndex: newWeek }));
        });
        setShowMove(false);
        exitEdit();
    }
    // Bulk-assign a category to every selected personal entry (and a split's personal half).
    // Credits and non-personal entries are silently skipped, matching EntryModal's own rule that
    // only personal spends can carry a category.
    function bulkCategorize(catId) {
        units.forEach(u => {
            if (!selected.has(u.id))
                return;
            if (u.kind === "single" && u.entry.type === "personal")
                onUpdEntry({ ...u.entry, category: catId || undefined });
            else if (u.kind === "split") {
                const your = u.group.find(e => e.type === "personal");
                if (your)
                    onUpdEntry({ ...your, category: catId || undefined });
            }
        });
        setShowCategorize(false);
        exitEdit();
    }
    // Persist a hand-reordered list: redistribute the units' existing order values to their new
    // positions (highest value = top). Reusing the existing value set keeps future-logged items —
    // which get a fresh, larger Date.now() — naturally on top. Split halves both take the group's value.
    function commitReorder(finalUnits) {
        if (!finalUnits)
            return;
        // Pinned (scheduled-pin) rows are read-only and derived — never reorder or persist them,
        // and keep their order values out of the redistribution pool.
        const movable = finalUnits.filter(u => !u.pinned);
        const values = movable.map(u => u.order).sort((a, b) => b - a);
        movable.forEach((u, i) => {
            const newOrder = values[i];
            if (u.order === newOrder)
                return;
            if (u.kind === "credit")
                onUpdCredit({ ...u.credit, order: newOrder });
            else if (u.kind === "single")
                onUpdEntry({ ...u.entry, order: newOrder });
            else
                u.group.forEach(half => onUpdEntry({ ...half, order: newOrder }));
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
                if (!el)
                    continue;
                const r = el.getBoundingClientRect();
                if (y < r.top + r.height / 2) {
                    to = i;
                    break;
                }
            }
            const moved = prev.find(u => u.id === id);
            const next = without.slice();
            next.splice(to, 0, moved);
            if (next.some((u, i) => u.id !== prev[i].id)) {
                dragListRef.current = next;
                setDragList(next);
            }
        };
        const onTouchMove = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
        const onMouseMove = (e) => move(e.clientY);
        const end = () => {
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", end);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", end);
            commitReorder(dragListRef.current);
            dragIdRef.current = null;
            dragListRef.current = null;
            setDragId(null);
            setDragList(null);
        };
        if (isTouch) {
            window.addEventListener("touchmove", onTouchMove, { passive: false });
            window.addEventListener("touchend", end);
        }
        else {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", end);
        }
    }
    function renderUnitContent(unit) {
        if (unit.kind === "split")
            return (React.createElement("div", { style: S.splitGroup }, unit.group.map((e, i) => React.createElement(EntryLine, { key: e.id, entry: e, onDel: () => handleDelete(e), onEdit: () => onEditEntry(e), grouped: true, last: i === unit.group.length - 1, hideDelete: editMode }))));
        if (unit.kind === "credit")
            return React.createElement(CreditLine, { credit: unit.credit, onDel: () => onDelCredit(unit.credit.id), onEdit: () => onEditCredit(unit.credit), hideDelete: editMode });
        // Scheduled-pin rows are read-only here (managed from the Pinned tab): no edit tap, no delete.
        if (unit.pinned)
            return React.createElement(EntryLine, { entry: unit.entry, hideDelete: true });
        return React.createElement(EntryLine, { entry: unit.entry, onDel: () => handleDelete(unit.entry), onEdit: () => onEditEntry(unit.entry), hideDelete: editMode });
    }
    return (React.createElement("div", null,
        React.createElement("div", { style: S.weekHeader },
            React.createElement("span", { style: { fontWeight: 600, color: "var(--text-heading)", fontSize: 14 } },
                dateStr(week.start),
                " \u2014 ",
                dateStr(week.end)),
            (units.length > 0 || lastDeleted) && (React.createElement("div", { style: { display: "flex", gap: 6 } },
                lastDeleted && React.createElement("button", { style: { ...S.editToggle, padding: "5px 10px", fontSize: 12 }, onClick: onUndo }, "Undo"),
                units.length > 0 && React.createElement("button", { style: { ...S.editToggle, padding: "5px 10px", fontSize: 12 }, onClick: () => setEditMode(true) }, "Edit")))),
        React.createElement("div", { style: S.budgetCard },
            React.createElement("div", { style: S.bar },
                React.createElement("div", { style: { ...S.barFill, width: pct + "%", background: over > 0 ? "#ef4444" : "#06b6d4" } })),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, color: "var(--text-tertiary)" } },
                React.createElement("span", null, fmt(spent)),
                React.createElement("span", null,
                    fmt(Math.max(weeklyBudget - spent, 0)),
                    " left of ",
                    fmt(weeklyBudget),
                    isLastWeek ? " (final)" : "")),
            over > 0 && React.createElement("div", { style: { color: "#ef4444", fontSize: 11, marginTop: 4, fontWeight: 500 } },
                "\u2193 ",
                fmt(over),
                " over")),
        React.createElement("div", { style: { marginTop: 12 } },
            renderUnits.map(unit => (React.createElement("div", { key: unit.id, ref: el => { if (el)
                    rowRefs.current[unit.id] = el;
                else
                    delete rowRefs.current[unit.id]; }, style: { display: "flex", alignItems: "center", gap: 6, ...(dragId === unit.id ? S.rowDragging : {}) } },
                editMode && (unit.pinned
                    ? React.createElement("span", { style: { ...S.checkbox, opacity: 0.25, cursor: "default" } })
                    : React.createElement("button", { style: { ...S.checkbox, ...(selected.has(unit.id) ? S.checkboxOn : {}) }, onClick: () => toggleSelect(unit.id) }, selected.has(unit.id) ? "✓" : "")),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } }, renderUnitContent(unit)),
                editMode && !unit.pinned && (React.createElement("button", { style: S.dragHandle, "aria-label": "Drag to reorder", onMouseDown: (e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e.clientY, unit, false); }, onTouchStart: (e) => { e.stopPropagation(); beginDrag(e.touches[0].clientY, unit, true); } }, "\u2261"))))),
            units.length === 0 && React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: 13, padding: "12px 0" } }, "Nothing logged")),
        !editMode ? (React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
            React.createElement("button", { style: { ...S.actionBtn, flex: 1 }, onClick: onAddEntry }, "Log spend"),
            lastDeleted && React.createElement("button", { style: S.editToggle, onClick: onUndo }, "Undo"),
            units.length > 0 && React.createElement("button", { style: S.editToggle, onClick: () => setEditMode(true) }, "Edit"))) : (React.createElement(React.Fragment, null,
            React.createElement("div", { style: S.bulkDelBar },
                React.createElement("button", { style: S.editToggle, onClick: exitEdit }, "Done"),
                selected.size === 0 ? (React.createElement("div", { style: { flex: 1, fontSize: 12, color: "var(--text-secondary)", textAlign: "center" } }, "Drag \u2261 to reorder")) : (React.createElement("div", { style: { flex: 1, display: "flex", gap: 6, justifyContent: "center" } },
                    React.createElement("button", { style: { ...S.editToggle, padding: "8px 10px", fontSize: 12 }, onClick: () => { setShowCategorize(false); setShowMove(m => !m); } }, "Move"),
                    React.createElement("button", { style: { ...S.editToggle, padding: "8px 10px", fontSize: 12 }, onClick: () => { setShowMove(false); setShowCategorize(c => !c); } }, "Categorize"))),
                selected.size > 0 && (confirmBulk
                    ? React.createElement("button", { style: { ...S.btn, background: "#dc2626", padding: "10px 14px", fontSize: 13 }, onClick: bulkDelete },
                        "Delete ",
                        selected.size,
                        "?")
                    : React.createElement("button", { style: { ...S.btn, background: "#7f1d1d", border: "1px solid #b91c1c", padding: "10px 14px", fontSize: 13 }, onClick: () => setConfirmBulk(true) },
                        "Delete ",
                        selected.size))),
            showMove && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, justifyContent: "center" } },
                React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } },
                    "Move ",
                    selected.size,
                    " to"),
                React.createElement("select", { style: S.weekSelect, defaultValue: "", onChange: e => { if (e.target.value !== "")
                        bulkMove(Number(e.target.value)); } },
                    React.createElement("option", { value: "", disabled: true }, "Week\u2026"),
                    (weeks || []).filter(w => w.index !== week.index).map(w => React.createElement("option", { key: w.index, value: w.index },
                        "Week ",
                        w.index))))),
            showCategorize && (React.createElement("div", { style: { marginTop: 8 } },
                React.createElement(CategoryPicker, { categories: categories, value: null, onPick: id => bulkCategorize(id), onCreate: onAddCategory, onBack: () => setShowCategorize(false) })))))));
}
// ─── Theme Toggle ─────────────────────────────────────────────────────────────
// A classic sun/moon switch: a single thumb carries whichever glyph is active and slides
// between the two ends of the track (moon/dark on the left, sun/light on the right).
function ThemeToggle({ theme, onToggle }) {
    const isLight = theme === "light";
    return (React.createElement("button", { role: "switch", "aria-checked": isLight, "aria-label": isLight ? "Switch to dark mode" : "Switch to light mode", onClick: onToggle, style: { position: "relative", width: 56, height: 30, borderRadius: 15, border: "1px solid var(--border-strong)", background: "var(--surface-2)", cursor: "pointer", padding: 0, flexShrink: 0 } },
        React.createElement("span", { "aria-hidden": "true", style: { position: "absolute", top: 2, left: isLight ? 28 : 2, width: 24, height: 24, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1, transition: "left 0.2s ease" } }, isLight ? "☀️" : "🌙")));
}
// Generic on/off switch, same visual language as ThemeToggle (used for the category prompt).
function ToggleSwitch({ on, onToggle, ariaLabel, thumbOn = "", thumbOff = "" }) {
    return (React.createElement("button", { role: "switch", "aria-checked": !!on, "aria-label": ariaLabel, onClick: onToggle, style: { position: "relative", width: 56, height: 30, borderRadius: 15, border: "1px solid var(--border-strong)", background: on ? "#0369a1" : "var(--surface-2)", cursor: "pointer", padding: 0, flexShrink: 0, transition: "background 0.2s ease" } },
        React.createElement("span", { "aria-hidden": "true", style: { position: "absolute", top: 2, left: on ? 28 : 2, width: 24, height: 24, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, lineHeight: 1, transition: "left 0.2s ease" } }, on ? thumbOn : thumbOff)));
}
// ─── Confirm Delete Button ────────────────────────────────────────────────────
// Tapping × turns it into a red "confirm?" for ~3s; a second tap deletes.
// Tapping anywhere else, or letting it time out, resets back to ×.
function ConfirmDeleteButton({ onConfirm, style }) {
    const [confirming, setConfirming] = useState(false);
    const timerRef = useRef(null);
    useEffect(() => () => { if (timerRef.current)
        clearTimeout(timerRef.current); }, []);
    function handleClick(e) {
        e.stopPropagation();
        if (!confirming) {
            setConfirming(true);
            timerRef.current = setTimeout(() => setConfirming(false), 3000);
        }
        else {
            if (timerRef.current)
                clearTimeout(timerRef.current);
            onConfirm();
        }
    }
    return (React.createElement("button", { style: {
            ...style,
            ...(confirming ? { color: "#ef4444", fontSize: 11, fontWeight: 700, background: chipColors("#ef4444").bg, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" } : {}),
        }, onClick: handleClick, onBlur: () => setConfirming(false) }, confirming ? "confirm?" : "×"));
}
// ─── Entry Line ───────────────────────────────────────────────────────────────
function EntryLine({ entry, onDel, onEdit, grouped, last, hideDelete }) {
    const col = entry.type === "business" ? "#f59e0b" : entry.type === "excluded" ? "#a855f7" : "var(--text-primary)";
    const cat = entry.category && CATEGORY_BY_ID[entry.category];
    return (React.createElement("div", { onClick: onEdit, style: { ...S.entryRow, ...(grouped ? S.entryRowGrouped : {}), ...(grouped && last ? { borderBottom: "none" } : {}), cursor: onEdit ? "pointer" : "default" } },
        React.createElement("span", { style: { ...S.dot, background: METHOD_COLOR[entry.method] || "var(--text-secondary)" } }),
        React.createElement("span", { style: { flex: 1, color: col, fontSize: 13 } },
            cat && React.createElement("span", { title: cat.name, style: { display: "inline-flex", verticalAlign: "-2px", marginRight: 5, width: 16, height: 16, borderRadius: "50%", background: cat.color, alignItems: "center", justifyContent: "center" } },
                React.createElement(CategoryIcon, { icon: cat.icon, size: 10, color: "#fff" })),
            entry.label || METHOD_NAME[entry.method] || entry.method,
            entry.pinned && React.createElement("span", { style: { ...S.badge, background: chipColors("#38bdf8").bg, color: "#38bdf8" } }, " \uD83D\uDCCC fixed"),
            entry.type === "business" && React.createElement("span", { style: S.badge }, " work"),
            entry.type === "excluded" && React.createElement("span", { style: { ...S.badge, background: chipColors("#a855f7").bg, color: "#a855f7" } }, " reimbursable"),
            entry.splitGroupId && entry.type === "personal" && React.createElement("span", { style: { ...S.badge, background: "var(--surface-2)", color: "var(--text-tertiary)" } }, " split")),
        React.createElement("span", { style: { color: col, fontWeight: 600, fontSize: 13 } }, fmt(entry.amount)),
        !hideDelete && React.createElement(ConfirmDeleteButton, { onConfirm: onDel, style: S.delBtn })));
}
// ─── Credit Line ───────────────────────────────────────────────────────────────
function CreditLine({ credit, onDel, onEdit, hideDelete }) {
    return (React.createElement("div", { onClick: onEdit, style: { ...S.entryRow, cursor: onEdit ? "pointer" : "default" } },
        React.createElement("span", { style: { ...S.dot, background: "#22c55e" } }),
        React.createElement("span", { style: { flex: 1, color: "#22c55e", fontSize: 13 } },
            credit.label || "Credit",
            credit.from && React.createElement("span", { style: { color: "var(--text-secondary)" } },
                " from ",
                credit.from)),
        React.createElement("span", { style: { color: "#22c55e", fontWeight: 600, fontSize: 13 } },
            "+",
            fmt(credit.amount)),
        !hideDelete && React.createElement(ConfirmDeleteButton, { onConfirm: onDel, style: S.delBtn })));
}
// ─── Pin Card ─────────────────────────────────────────────────────────────────
function PinCard({ pin, onEdit, onDelete }) {
    const isB = pin.type === "business";
    const isX = pin.type === "excluded";
    const col = isB ? "#f59e0b" : isX ? "#a855f7" : "var(--text-heading)";
    return (React.createElement("div", { style: S.pinCard },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
            React.createElement("span", { style: { ...S.dot, background: METHOD_COLOR[pin.method] || "var(--text-secondary)" } }),
            React.createElement("span", { style: { flex: 1, fontWeight: 600, fontSize: 14, color: col } },
                pin.label,
                isB && React.createElement("span", { style: S.badge }, " work"),
                isX && React.createElement("span", { style: { ...S.badge, background: chipColors("#a855f7").bg, color: "#a855f7" } }, " split")),
            React.createElement("button", { style: S.iconBtn, onClick: onEdit }, "\u270E"),
            React.createElement(ConfirmDeleteButton, { onConfirm: onDelete, style: { ...S.iconBtn, color: "#ef4444" } })),
        React.createElement("div", { style: { fontSize: 22, fontWeight: 800, letterSpacing: "-1px", color: isB ? "#f59e0b" : isX ? "#a855f7" : METHOD_COLOR[pin.method] || "var(--text-primary)", marginBottom: 4 } }, pin.amount ? fmt(pin.amount) : "—"),
        isScheduledPin(pin) && React.createElement("div", { style: { fontSize: 11, color: "#38bdf8", marginTop: 2 } },
            "\uD83D\uDCCC ",
            pin.freq === "weekly" ? `Every ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][pin.day]}` : `Monthly · day ${pin.day}`,
            " \u00B7 in week log"),
        pin.note && React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginTop: 4 } }, pin.note)));
}
// ─── Method Selector ──────────────────────────────────────────────────────────
// The payment-type chooser used by both the log and pin modals. Renders the user's payment
// types (state.methods, via the module METHODS view) as a wrapping 4-col grid that scrolls when
// there are many, with a ▾ hint shown while more sit below the fold. Selected chip colours are
// derived from each type's single colour.
function MethodSelector({ value, onChange, dimmed }) {
    const ref = useRef(null);
    const [moreRight, setMoreRight] = useState(false);
    const check = () => { const el = ref.current; if (el)
        setMoreRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4); };
    useLayoutEffect(() => { check(); }, []); // measure before paint so the ▸ hint shows on first open
    return (React.createElement("div", { style: { position: "relative", marginBottom: 12, opacity: dimmed ? 0.4 : 1 } },
        React.createElement("div", { ref: ref, onScroll: check, style: { display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" } }, METHODS.map(m => {
            const on = value === m.id;
            const c = chipColors(m.color);
            return React.createElement("button", { key: m.id, onClick: () => onChange(m.id), title: m.name, style: { flex: "0 0 calc((100% - 18px) / 4)", background: on ? c.bg : "var(--surface)", border: `1px solid ${on ? c.border : "var(--border)"}`, borderRadius: 8, color: on ? c.text : "var(--text-muted)", padding: "10px 2px", fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.name);
        })),
        moreRight && React.createElement("div", { "aria-hidden": "true", style: { position: "absolute", top: 0, bottom: 0, right: 0, width: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 2, pointerEvents: "none", color: "var(--text-tertiary)", fontSize: 12, background: "linear-gradient(to right, rgba(15,23,42,0), var(--surface) 70%)" } }, "\u25B8")));
}
// ─── Category Icon ────────────────────────────────────────────────────────────
// Renders a monochrome line icon from ICONS. `color` sets both stroke and fill (for the few
// icons with filled bits) via currentColor, so it reads white on a coloured circle or tinted
// inline. Falls back to the generic "tag" glyph for an unknown key.
function CategoryIcon({ icon, size = 24, color = "#fff", strokeWidth = 2 }) {
    const markup = ICONS[icon] || ICONS.tag;
    return React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round",
        style: { color, display: "block" }, "aria-hidden": "true",
        dangerouslySetInnerHTML: { __html: markup },
    });
}
// A scrollable grid of every available icon; `value` is the selected key, `onPick(key)` selects.
function IconPicker({ value, onPick }) {
    return (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, maxHeight: 160, overflowY: "auto", padding: "2px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 } }, ICON_KEYS.map(k => {
        const on = value === k;
        return (React.createElement("button", { key: k, onClick: () => onPick(k), title: k, style: { display: "flex", alignItems: "center", justifyContent: "center", padding: "9px 0", borderRadius: 8, cursor: "pointer", background: on ? "var(--surface-2)" : "transparent", border: `1px solid ${on ? "var(--border-strong)" : "transparent"}` } },
            React.createElement(CategoryIcon, { icon: k, size: 20, color: on ? "var(--text-heading)" : "var(--text-muted)" })));
    })));
}
// One editable row in the Settings categories list: colour swatch, an icon button that reveals
// an inline IconPicker, a name field, a remove button, and (when `onDragMouseDown`/`onDragTouchStart`
// are given) a drag handle. The handle sits in the same flex row as the ✕ button — rather than
// beside this whole component — so the two align on one baseline instead of drifting when the
// icon picker below expands. Owns its own icon-picker open state via the controlled `open`/`onToggle`
// props (only one row's icon picker is open at a time, coordinated by the parent).
function CategoryEditorRow({ cat, canDelete, lockReason, open, onToggle, onUpdate, onRemove, dragLabel, onDragMouseDown, onDragTouchStart }) {
    return (React.createElement("div", { style: { marginBottom: 8 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("input", { type: "color", value: cat.color, onChange: e => onUpdate({ color: e.target.value }), "aria-label": `${cat.name} colour`, style: { width: 34, height: 34, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", flexShrink: 0 } }),
            React.createElement("button", { onClick: onToggle, title: "Choose icon", "aria-label": `${cat.name} icon`, style: { width: 34, height: 34, borderRadius: "50%", background: cat.color, border: open ? "2px solid var(--text-heading)" : "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 } },
                React.createElement(CategoryIcon, { icon: cat.icon, size: 18, color: "#fff" })),
            React.createElement("input", { key: `cname-${cat.id}-${cat.name}`, defaultValue: cat.name, placeholder: "Name", onBlur: e => { const v = e.target.value.trim(); if (v && v !== cat.name)
                    onUpdate({ name: v });
                else if (!v)
                    e.target.value = cat.name; }, style: { ...S.input, marginBottom: 0, flex: 1 } }),
            React.createElement("button", { onClick: () => { if (canDelete)
                    onRemove(); }, disabled: !canDelete, title: lockReason, style: { ...S.iconBtn, color: canDelete ? "#ef4444" : "var(--border-strong)", cursor: canDelete ? "pointer" : "default", fontSize: 16, flexShrink: 0 } }, "\u2715"),
            onDragMouseDown && React.createElement("button", { style: S.dragHandle, "aria-label": dragLabel, onMouseDown: onDragMouseDown, onTouchStart: onDragTouchStart }, "\u2261")),
        open && React.createElement("div", { style: { marginTop: 6 } },
            React.createElement(IconPicker, { value: cat.icon, onPick: k => { onUpdate({ icon: k }); onToggle(); } }))));
}
// ─── Payment Methods Settings Card ────────────────────────────────────────────
// The Settings card that lists, edits, adds, and removes payment types (state.methods).
function PaymentMethodsSettingsCard({ state, dispatch }) {
    // Every method id referenced by a live or archived transaction/pin — such types can't be removed.
    const used = new Set();
    [state, ...(state.monthHistory || [])].forEach(src => {
        (src.entries || []).forEach(e => used.add(e.method));
        (src.pins || []).forEach(p => used.add(p.method));
    });
    const setMethods = (ms) => dispatch({ type: "SETTINGS", patch: { methods: ms } });
    const update = (id, patch) => setMethods(state.methods.map(m => m.id === id ? { ...m, ...patch } : m));
    const remove = (id) => setMethods(state.methods.filter(m => m.id !== id));
    const add = () => setMethods([...state.methods, { id: genId(), name: "New card", color: "#60a5fa" }]);
    const anyInUse = state.methods.some(m => used.has(m.id));
    return (React.createElement("div", { style: S.settingsCard },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Payment methods"),
        state.methods.map(m => {
            const canDelete = !used.has(m.id) && state.methods.length > 1;
            return (React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
                React.createElement("input", { type: "color", value: m.color, onChange: e => update(m.id, { color: e.target.value }), "aria-label": `${m.name} colour`, style: { width: 34, height: 34, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", flexShrink: 0 } }),
                React.createElement("input", { key: `mname-${m.id}-${m.name}`, defaultValue: m.name, placeholder: "Name", onBlur: e => { const v = e.target.value.trim(); if (v && v !== m.name)
                        update(m.id, { name: v });
                    else if (!v)
                        e.target.value = m.name; }, style: { ...S.input, marginBottom: 0, flex: 1 } }),
                React.createElement("button", { onClick: () => { if (canDelete)
                        remove(m.id); }, disabled: !canDelete, title: used.has(m.id) ? "In use — can't remove" : (state.methods.length <= 1 ? "Keep at least one" : "Remove"), style: { ...S.iconBtn, color: canDelete ? "#ef4444" : "var(--border-strong)", cursor: canDelete ? "pointer" : "default", fontSize: 16, flexShrink: 0 } }, "\u2715")));
        }),
        anyInUse && React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 2, marginBottom: 8 } }, "Types with logged transactions can't be removed."),
        React.createElement("button", { onClick: add, disabled: state.methods.length >= MAX_METHODS, style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%", marginTop: 4, opacity: state.methods.length >= MAX_METHODS ? 0.5 : 1, cursor: state.methods.length >= MAX_METHODS ? "default" : "pointer" } }, state.methods.length >= MAX_METHODS ? `Maximum ${MAX_METHODS} types` : "+ Add payment type")));
}
// ─── Categories Settings Card ─────────────────────────────────────────────────
// The Settings card that lists, edits, adds/removes, and reorders spending categories, plus the
// category-prompt toggle. Categories have no separate `order` field — a category's position in
// state.categories IS its order (used by both this list and the CategoryPicker grid) — so a
// completed drag just persists the reordered array directly.
function CategoriesSettingsCard({ state, dispatch }) {
    const categories = state.categories;
    // Every category id referenced by a live or archived entry — such categories can't be removed.
    const used = new Set();
    [state, ...(state.monthHistory || [])].forEach(src => {
        (src.entries || []).forEach(e => { if (e.category)
            used.add(e.category); });
    });
    const setCats = (cs) => dispatch({ type: "SETTINGS", patch: { categories: cs } });
    const update = (id, patch) => setCats(categories.map(c => c.id === id ? { ...c, ...patch } : c));
    const remove = (id) => { setOpenIconCat(null); setCats(categories.filter(c => c.id !== id)); };
    const add = () => setCats([...categories, { id: genId(), name: "New category", icon: "tag", color: "#60a5fa" }]);
    const anyInUse = categories.some(c => used.has(c.id));
    const [openIconCat, setOpenIconCat] = useState(null); // id of the category whose icon picker is open (only one at a time)
    const [dragId, setDragId] = useState(null); // id of the category being dragged, or null
    const [dragList, setDragList] = useState(null); // working category order during a drag, else null
    const dragIdRef = useRef(null);
    const dragListRef = useRef(null);
    const rowRefs = useRef({}); // category id -> row DOM node, for hit-testing during drag
    // During a drag, render the live working order; otherwise the stored order.
    const renderCats = dragList || categories;
    // Hand-rolled drag reorder — same mechanic as the Week page's transaction list (WeekPanel):
    // on each move, hit-test the pointer against the other rows' midpoints to find the drop index.
    function beginDrag(clientY, cat, isTouch) {
        dragIdRef.current = cat.id;
        dragListRef.current = categories;
        setDragId(cat.id);
        setDragList(categories);
        const move = (y) => {
            const prev = dragListRef.current;
            const id = dragIdRef.current;
            const without = prev.filter(c => c.id !== id);
            let to = without.length;
            for (let i = 0; i < without.length; i++) {
                const el = rowRefs.current[without[i].id];
                if (!el)
                    continue;
                const r = el.getBoundingClientRect();
                if (y < r.top + r.height / 2) {
                    to = i;
                    break;
                }
            }
            const moved = prev.find(c => c.id === id);
            const next = without.slice();
            next.splice(to, 0, moved);
            if (next.some((c, i) => c.id !== prev[i].id)) {
                dragListRef.current = next;
                setDragList(next);
            }
        };
        const onTouchMove = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
        const onMouseMove = (e) => move(e.clientY);
        const end = () => {
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", end);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", end);
            if (dragListRef.current)
                setCats(dragListRef.current);
            dragIdRef.current = null;
            dragListRef.current = null;
            setDragId(null);
            setDragList(null);
        };
        if (isTouch) {
            window.addEventListener("touchmove", onTouchMove, { passive: false });
            window.addEventListener("touchend", end);
        }
        else {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", end);
        }
    }
    return (React.createElement("div", { style: S.settingsCard },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 } },
            React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" } }, "Spending categories"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, "Ask for a category after logging a spend")),
            React.createElement(ToggleSwitch, { on: state.categoryPrompt, onToggle: () => dispatch({ type: "SETTINGS", patch: { categoryPrompt: !state.categoryPrompt } }), ariaLabel: "Toggle category prompt", thumbOn: "\uD83C\uDFF7\uFE0F", thumbOff: "\u2715" })),
        renderCats.map(c => (React.createElement("div", { key: c.id, ref: el => { if (el)
                rowRefs.current[c.id] = el;
            else
                delete rowRefs.current[c.id]; }, style: dragId === c.id ? S.rowDragging : undefined },
            React.createElement(CategoryEditorRow, { cat: c, canDelete: !used.has(c.id) && categories.length > 1, lockReason: used.has(c.id) ? "In use — can't remove" : (categories.length <= 1 ? "Keep at least one" : "Remove"), open: openIconCat === c.id, onToggle: () => setOpenIconCat(prev => prev === c.id ? null : c.id), onUpdate: patch => update(c.id, patch), onRemove: () => remove(c.id), dragLabel: `Drag ${c.name} to reorder`, onDragMouseDown: (e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e.clientY, c, false); }, onDragTouchStart: (e) => { e.stopPropagation(); beginDrag(e.touches[0].clientY, c, true); } })))),
        anyInUse && React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 2, marginBottom: 8 } }, "Categories used by a logged spend can't be removed."),
        React.createElement("button", { onClick: add, disabled: categories.length >= MAX_CATEGORIES, style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", width: "100%", marginTop: 4, opacity: categories.length >= MAX_CATEGORIES ? 0.5 : 1, cursor: categories.length >= MAX_CATEGORIES ? "default" : "pointer" } }, categories.length >= MAX_CATEGORIES ? `Maximum ${MAX_CATEGORIES} categories` : "+ Add category")));
}
// ─── Customise Modal ──────────────────────────────────────────────────────────
// Groups the settings that shape how the app *looks* — theme, payment types, and spending
// categories — behind one "Customisation" entry point in Settings, so the main Settings list
// stays short. Content scrolls internally (capped below the viewport) so the modal sheet never
// grows taller than the screen, however many payment types or categories are added.
function CustomiseModal({ state, dispatch, onClose }) {
    return (React.createElement(Modal, { onClose: onClose, title: "Customisation" },
        React.createElement("div", { style: { maxHeight: "70vh", overflowY: "auto" } },
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2, textTransform: "uppercase" } }, "Appearance"),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)" } },
                            state.theme === "light" ? "Light" : "Dark",
                            " mode")),
                    React.createElement(ThemeToggle, { theme: state.theme || "dark", onToggle: () => {
                            const next = state.theme === "light" ? "dark" : "light";
                            dispatch({ type: "SETTINGS", patch: { theme: next } });
                            // Mirror the choice into the unencrypted pre-unlock preference (crypto.js reads this
                            // for the lock/setup screens, which can't see the encrypted state.theme) so the lock
                            // screen doesn't show a stale theme after this change.
                            try {
                                localStorage.setItem("spendtracker_pretheme", next);
                            }
                            catch { }
                        } }))),
            React.createElement(PaymentMethodsSettingsCard, { state: state, dispatch: dispatch }),
            React.createElement(CategoriesSettingsCard, { state: state, dispatch: dispatch }),
            React.createElement("div", { style: S.settingsCard },
                React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" } }, "Descriptions"),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, "Show a description field when logging or editing a spend")),
                    React.createElement(ToggleSwitch, { on: state.descriptionPrompt, onToggle: () => dispatch({ type: "SETTINGS", patch: { descriptionPrompt: !state.descriptionPrompt } }), ariaLabel: "Toggle description field", thumbOn: "\uD83D\uDCDD", thumbOff: "\u2715" }))))));
}
// ─── Category Picker ──────────────────────────────────────────────────────────
// A Monzo-style grid of round category tiles (a white line-icon on a coloured circle). Shown in
// place of the keypad after logging a spend, and inline in the edit view. `value` is a category
// id or null (None). Selecting calls `onPick(id | null)`. `onCreate(cat)` appends a new custom
// category. `onBack`, when given, renders a back affordance that returns without picking.
function CategoryPicker({ categories, value, onPick, onCreate, onBack }) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [icon, setIcon] = useState("tag");
    const [color, setColor] = useState("#60a5fa");
    const full = categories.length >= MAX_CATEGORIES;
    const tile = (bg, border, content, label, on, onClick, key) => (React.createElement("button", { key: key, onClick: onClick, title: label, style: { background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } },
        React.createElement("span", { style: { position: "relative", width: 58, height: 58, borderRadius: "50%", background: bg, border: `2px solid ${on ? "var(--text-heading)" : border}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: on ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text-heading)" : "none" } },
            content,
            on && React.createElement("span", { style: { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "var(--text-heading)", color: "var(--surface)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" } }, "\u2713")),
        React.createElement("span", { style: { fontSize: 11, color: on ? "var(--text-heading)" : "var(--text-muted)", fontWeight: on ? 700 : 500, textAlign: "center", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, label)));
    if (creating) {
        const createCategory = () => {
            if (!name.trim())
                return;
            const cat = { id: genId(), name: name.trim(), icon, color };
            onCreate(cat);
            onPick(cat.id);
        };
        return (React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 10 } }, "New category"),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } },
                React.createElement("span", { style: { width: 40, height: 40, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } },
                    React.createElement(CategoryIcon, { icon: icon, size: 22, color: "#fff" })),
                React.createElement("input", { type: "color", value: color, onChange: e => setColor(e.target.value), "aria-label": "Category colour", style: { width: 34, height: 34, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", flexShrink: 0 } }),
                React.createElement("input", { value: name, onChange: e => setName(e.target.value), onKeyDown: e => { if (e.key === "Enter")
                        createCategory(); }, placeholder: "Name e.g. Coffee", autoFocus: true, style: { ...S.input, marginBottom: 0, flex: 1 } })),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 } }, "Icon"),
            React.createElement("div", { style: { marginBottom: 10 } },
                React.createElement(IconPicker, { value: icon, onPick: setIcon })),
            React.createElement("div", { style: { display: "flex", gap: 8 } },
                React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", flex: 1 }, onClick: () => setCreating(false) }, "Cancel"),
                React.createElement("button", { style: { ...S.btn, background: "#0369a1", flex: 1, opacity: name.trim() ? 1 : 0.5 }, disabled: !name.trim(), onClick: createCategory }, "Create"))));
    }
    return (React.createElement("div", null,
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, justifyItems: "center", maxHeight: 300, overflowY: "auto" } },
            tile("var(--surface)", "var(--border-strong)", React.createElement("span", { style: { color: "var(--text-muted)", fontSize: 20 } }, "\u2205"), "None", value == null, () => onPick(null), "none"),
            categories.map(c => tile(c.color, c.color, React.createElement(CategoryIcon, { icon: c.icon, size: 26, color: "#fff" }), c.name, value === c.id, () => onPick(c.id), c.id)),
            !full && tile("var(--surface)", "var(--border-strong)", React.createElement("span", { style: { color: "var(--text-secondary)", fontSize: 26, fontWeight: 300 } }, "+"), "Create", false, () => setCreating(true), "create")),
        onBack && React.createElement("button", { style: { background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: "12px 0 0", width: "100%" }, onClick: onBack }, "\u2190 Back")));
}
// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ weekIndex, weeks, edit, defaultMethod, categories, categoryPrompt, descriptionPrompt, onAddCategory, onSave, onSaveCredit, onUpdate, onUpdateCredit, onClose }) {
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
    // Fall back to the first method if the seeded id no longer exists (e.g. its type was removed).
    const [method, setMethod] = useState(() => {
        const seed = editEntry ? editEntry.method : defaultMethod;
        return METHOD_NAME[seed] ? seed : METHODS[0].id;
    });
    const [type, setType] = useState(() => editCredit ? "credit" : (editEntry ? editEntry.type : "personal"));
    const [note, setNote] = useState(() => editData ? (editData.label || "") : "");
    const [flash, setFlash] = useState(null);
    // The chosen category id (or null = None). Seeds from the edited entry when editing.
    const [category, setCategory] = useState(() => (editEntry && editEntry.category) || null);
    // After ↵ on a categorisable spend, we stash the built entry here and swap the keypad for the
    // category grid; selecting a category commits the save. Null the rest of the time.
    const [pendingSave, setPendingSave] = useState(null);
    // In edit mode, an inline category picker toggled from the Category row.
    const [editPickCat, setEditPickCat] = useState(false);
    // Split flow: null (not splitting) → "total" (entering the full amount) → "theirs" (entering the portion that isn't yours)
    const [splitStage, setSplitStage] = useState(null);
    const [splitTotal, setSplitTotal] = useState(0);
    const amount = cents / 100;
    const displayStr = amount.toFixed(2);
    const creditColors = chipColors("#22c55e");
    const splitColors = chipColors("#a855f7");
    const mc = type === "credit" ? creditColors : type === "split" ? splitColors : chipColors(METHOD_COLOR[method] || "#60a5fa");
    function pressDigit(d) {
        if (isSplitEdit)
            return; // amount locked while editing a split half
        setCents(prev => {
            const next = d === "00" ? prev * 100 : prev * 10 + Number(d);
            return next > 99999999 ? prev : next; // cap at £999,999.99
        });
    }
    function pressDelete() {
        if (isSplitEdit)
            return;
        setCents(prev => Math.floor(prev / 10));
    }
    function resetAfterSave() {
        setCents(0);
        setNote("");
        setSplitStage(null);
        setSplitTotal(0);
        setCategory(null);
    }
    function selectType(v) {
        setType(v);
        // Changing type away from split mid-flow cancels the split
        if (v !== "split") {
            setSplitStage(null);
            setSplitTotal(0);
        }
        else {
            setSplitStage("total");
            setCents(0);
        }
    }
    // Commit a stashed save once its category is chosen (or None). A pending save is either a
    // single entry (`{kind:"entry", entry, flash}`) or a split pair (`{kind:"split", your, their,
    // flash}`) — the category lands only on the *personal* portion; the excluded half isn't yours.
    function commitPending(save, catId) {
        if (save.kind === "split") {
            if (save.your)
                onSave(catId ? { ...save.your, category: catId } : save.your);
            onSave(save.their);
        }
        else {
            onSave(catId ? { ...save.entry, category: catId } : save.entry);
        }
        setPendingSave(null);
        setFlash(save.flash);
        setTimeout(() => setFlash(null), 900);
        resetAfterSave();
    }
    function pressEnter() {
        if (amount <= 0)
            return;
        // Editing an existing item: write the change back in place, keeping id/date/week/split.
        if (isEdit) {
            if (editCredit) {
                onUpdateCredit({ ...editCredit, amount, label: note.trim() });
            }
            else {
                // Personal entries carry the (possibly changed) category; other kinds keep none.
                onUpdate({ ...editEntry, amount: isSplitEdit ? editEntry.amount : amount, label: note.trim(), note: note.trim(), method, type, category: (type === "personal" && !isSplitEdit) ? (category || undefined) : undefined });
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
                // The "not yours" portion is excluded from your spend total — same bucket as shared/split pins.
                // This covers both work reimbursement and splitting a tab with friends; neither should
                // touch your remaining budget, and neither should be conflated with actual work expenses.
                const your = yourPortion > 0 ? { id: Math.random().toString(36).slice(2), amount: yourPortion, label: note.trim(), note: note.trim(), method, type: "personal", weekIndex: selectedWeek, date: baseDate, order: baseOrder, splitGroupId: groupId } : null;
                const their = { id: Math.random().toString(36).slice(2), amount: theirPortion, label: note.trim(), note: note.trim(), method, type: "excluded", weekIndex: selectedWeek, date: baseDate, order: baseOrder, splitGroupId: groupId };
                const save = { kind: "split", your, their, flash: { amount: splitTotal, split: true } };
                // Offer categorisation of the personal portion when there is one and the prompt is on.
                if (categoryPrompt && your) {
                    setPendingSave(save);
                    return;
                }
                commitPending(save, null);
                return;
            }
        }
        if (type === "credit") {
            onSaveCredit({ id: Math.random().toString(36).slice(2), amount, label: note.trim(), weekIndex: selectedWeek, from: "", date: new Date().toISOString(), order: Date.now() });
            setFlash({ amount, credit: true });
            setTimeout(() => setFlash(null), 900);
            resetAfterSave();
            return;
        }
        const entry = { id: Math.random().toString(36).slice(2), amount, label: note.trim(), note: note.trim(), method, type, weekIndex: selectedWeek, date: new Date().toISOString(), order: Date.now() };
        // Personal spends get the category prompt (when enabled); work expenses skip it.
        if (categoryPrompt && type === "personal") {
            setPendingSave({ kind: "entry", entry, flash: { amount, method } });
            return;
        }
        commitPending({ kind: "entry", entry, flash: { amount, method } }, null);
    }
    const digits = [[7, 8, 9], [4, 5, 6], [1, 2, 3], ["00", 0, "⌫"]];
    const subheading = { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, fontWeight: 500 };
    // In edit mode, only offer the classifications it makes sense to switch between: a normal entry
    // can flip personal↔work; a split half or a credit keeps its kind (so its bucket stays coherent).
    const classOptions = isEdit
        ? (editCredit || isSplitEdit ? [] : [["personal", "Personal"], ["business", "Work"]])
        : [["personal", "Personal"], ["business", "Work"], ["credit", "Credit"], ["split", "Split"]];
    // What to show above the number display: the split steps, or a locked hint when editing a split.
    let displayCaption = null;
    if (type === "split" && splitStage === "total")
        displayCaption = "Total amount";
    if (type === "split" && splitStage === "theirs")
        displayCaption = `Not yours, of ${fmt(splitTotal)}`;
    if (isSplitEdit)
        displayCaption = "Split amount — locked";
    // Enter-key glyph changes on the first split step since it advances rather than saves
    const enterGlyph = type === "split" && splitStage === "total" ? "→" : "↵";
    // When logging (not editing), the title carries a week picker so a cost can be dropped into any
    // week of the period — not just today's. Editing keeps a plain title (a row's week can't change).
    const title = isEdit ? (editCredit ? "Edit credit" : "Edit spend") : (React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
        "Log \u00B7",
        React.createElement("select", { value: selectedWeek, onChange: e => setSelectedWeek(Number(e.target.value)), style: S.weekSelect }, (weeks || []).map(w => React.createElement("option", { key: w.index, value: w.index },
            "Week ",
            w.index,
            " \u00B7 ",
            dateStr(w.start),
            "\u2013",
            dateStr(w.end))))));
    // After ↵ on a categorisable spend, the keypad is swapped for the category grid (Monzo-style).
    if (pendingSave) {
        const pendAmt = pendingSave.kind === "split" ? pendingSave.flash.amount : pendingSave.entry.amount;
        return (React.createElement(Modal, { onClose: onClose, title: "Category" },
            React.createElement("div", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, textAlign: "center" } },
                "What was this ",
                React.createElement("strong", { style: { color: "var(--text-heading)" } }, fmt(pendAmt)),
                " for?"),
            React.createElement(CategoryPicker, { categories: categories, value: null, onPick: (id) => commitPending(pendingSave, id), onCreate: onAddCategory, onBack: () => setPendingSave(null) })));
    }
    const catRow = category && CATEGORY_BY_ID[category];
    return (React.createElement(Modal, { onClose: onClose, title: title },
        React.createElement("div", { style: { background: "var(--surface-2)", borderRadius: 12, padding: "14px 20px", marginBottom: 12, textAlign: "center", border: `1px solid ${flash ? mc.border : "var(--border-strong)"}`, opacity: isSplitEdit ? 0.7 : 1 } },
            displayCaption && React.createElement("div", { style: { fontSize: 11, color: "#a855f7", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" } }, displayCaption),
            React.createElement("div", { style: { fontSize: displayStr.length > 7 ? 30 : 42, fontWeight: 800, color: flash ? "#22c55e" : "var(--text-heading)" } }, flash ? (flash.split ? `✓ ${fmt(flash.amount)} split` : `✓ ${fmt(flash.amount)}`) : `£${displayStr}`)),
        !editCredit && React.createElement(React.Fragment, null,
            React.createElement("div", { style: subheading }, "Payment type"),
            React.createElement(MethodSelector, { value: method, onChange: setMethod, dimmed: type === "credit" })),
        classOptions.length > 0 && React.createElement(React.Fragment, null,
            React.createElement("div", { style: subheading }, "Classification"),
            React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 10 } }, classOptions.map(([v, l]) => React.createElement("button", { key: v, style: { flex: 1, background: type === v ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${type === v ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 8, color: type === v ? (v === "business" ? "#f59e0b" : v === "credit" ? "#22c55e" : v === "split" ? "#a855f7" : "var(--text-heading)") : "var(--text-muted)", padding: "8px 4px", fontSize: 12, fontWeight: type === v ? 600 : 400, cursor: "pointer" }, onClick: () => selectType(v) }, l)))),
        isEdit && !editCredit && !isSplitEdit && type === "personal" && (React.createElement(React.Fragment, null,
            React.createElement("div", { style: subheading }, "Category"),
            editPickCat ? (React.createElement("div", { style: { marginBottom: 10 } },
                React.createElement(CategoryPicker, { categories: categories, value: category, onPick: (id) => { setCategory(id); setEditPickCat(false); }, onCreate: onAddCategory, onBack: () => setEditPickCat(false) }))) : (React.createElement("button", { onClick: () => setEditPickCat(true), style: { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", marginBottom: 10, cursor: "pointer", color: "var(--text-heading)", fontSize: 13 } },
                catRow
                    ? React.createElement(React.Fragment, null,
                        React.createElement("span", { style: { width: 20, height: 20, borderRadius: "50%", background: catRow.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } },
                            React.createElement(CategoryIcon, { icon: catRow.icon, size: 12, color: "#fff" })),
                        catRow.name)
                    : React.createElement("span", { style: { color: "var(--text-muted)" } }, "None"),
                React.createElement("span", { style: { marginLeft: "auto", color: "var(--text-tertiary)" } }, "Change \u25B8"))))),
        type === "split" && !isEdit && (React.createElement("div", { style: { fontSize: 11, color: "#a855f7", marginBottom: 10, lineHeight: 1.5 } }, splitStage === "total"
            ? "Enter the full amount you paid, then continue."
            : "Enter just the portion that isn't yours — work reimbursement, a friend's share of the bill, etc. The rest stays personal.")),
        descriptionPrompt && (React.createElement(React.Fragment, null,
            React.createElement("div", { style: subheading }, "Description"),
            React.createElement("input", { style: { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-heading)", padding: "9px 12px", marginBottom: 10, fontSize: 13, boxSizing: "border-box", outline: "none" }, placeholder: "Tap to add a description", value: note, onChange: e => setNote(e.target.value) }))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 } }, digits.map((row, ri) => (React.createElement(React.Fragment, null,
            row.map((d, i) => React.createElement("button", { key: `${ri}-${i}`, style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: d === "⌫" ? "#ef4444" : "var(--text-body)", fontSize: d === "⌫" ? 18 : 20, fontWeight: 600, padding: "14px 0", cursor: "pointer", opacity: isSplitEdit ? 0.4 : 1 }, onClick: () => d === "⌫" ? pressDelete() : pressDigit(d) }, d)),
            ri === 0 && React.createElement("button", { style: { gridRow: "span 4", background: amount > 0 ? mc.bg : "var(--surface)", border: `1px solid ${amount > 0 ? mc.border : "var(--border)"}`, borderRadius: 8, color: amount > 0 ? mc.text : "var(--text-muted)", fontSize: 18, fontWeight: 800, cursor: amount > 0 ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }, onClick: pressEnter }, enterGlyph)))))));
}
// ─── Pin Modal ────────────────────────────────────────────────────────────────
function PinModal({ pin, onSave, onClose }) {
    var _a, _b, _c;
    const [label, setLabel] = useState((pin === null || pin === void 0 ? void 0 : pin.label) || "");
    const [amount, setAmount] = useState(((_a = pin === null || pin === void 0 ? void 0 : pin.amount) === null || _a === void 0 ? void 0 : _a.toString()) || "");
    const [method, setMethod] = useState(() => (pin && METHOD_NAME[pin.method]) ? pin.method : METHODS[0].id);
    const [type, setType] = useState((pin === null || pin === void 0 ? void 0 : pin.type) || "personal");
    const [note, setNote] = useState((pin === null || pin === void 0 ? void 0 : pin.note) || "");
    // Scheduling. Keep the month-day and week-day choices in separate state so switching
    // frequency back and forth doesn't lose the other selection. `day` on the saved pin is
    // the day-of-month for monthly and the day-of-week (0=Sun) for weekly.
    const [freq, setFreq] = useState((pin === null || pin === void 0 ? void 0 : pin.freq) || "none");
    const [dom, setDom] = useState((pin === null || pin === void 0 ? void 0 : pin.freq) === "monthly" ? ((_b = pin === null || pin === void 0 ? void 0 : pin.day) !== null && _b !== void 0 ? _b : 1) : 1);
    const [dow, setDow] = useState((pin === null || pin === void 0 ? void 0 : pin.freq) === "weekly" ? ((_c = pin === null || pin === void 0 ? void 0 : pin.day) !== null && _c !== void 0 ? _c : 1) : 1);
    const segBtn = (on) => ({ flex: 1, background: on ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${on ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 8, color: on ? "var(--text-heading)" : "var(--text-muted)", padding: "8px 4px", fontSize: 12, fontWeight: 600, cursor: "pointer" });
    const dayBtn = (on) => ({ flex: 1, background: on ? chipColors("#38bdf8").bg : "var(--surface)", border: `1px solid ${on ? "#0369a1" : "var(--border)"}`, borderRadius: 8, color: on ? "#38bdf8" : "var(--text-muted)", padding: "7px 2px", fontSize: 11, fontWeight: 600, cursor: "pointer" });
    const hint = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 };
    return (React.createElement(Modal, { onClose: onClose, title: pin ? "Edit" : "New pin" },
        React.createElement("input", { style: S.input, placeholder: "Label e.g. Gym", value: label, onChange: e => setLabel(e.target.value) }),
        React.createElement("input", { style: { ...S.input, marginBottom: 10 }, type: "number", inputMode: "decimal", placeholder: "Amount", value: amount, onChange: e => setAmount(e.target.value) }),
        React.createElement(MethodSelector, { value: method, onChange: setMethod }),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, [["personal", "Personal"], ["business", "Work"], ["excluded", "Split"]].map(([v, l]) => React.createElement("button", { key: v, style: { flex: 1, background: type === v ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${type === v ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 8, color: type === v ? (v === "business" ? "#f59e0b" : v === "excluded" ? "#a855f7" : "var(--text-heading)") : "var(--text-muted)", padding: "8px 4px", fontSize: 12, fontWeight: 600, cursor: "pointer" }, onClick: () => setType(v) }, l))),
        React.createElement("div", { style: hint }, "Populate into the week log"),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, [["none", "One-off"], ["monthly", "Monthly"], ["weekly", "Weekly"]].map(([v, l]) => React.createElement("button", { key: v, style: segBtn(freq === v), onClick: () => setFreq(v) }, l))),
        freq === "monthly" && (React.createElement("div", { style: { marginBottom: 10 } },
            React.createElement("div", { style: hint }, "On day of the month it falls"),
            React.createElement("input", { style: { ...S.input, marginBottom: 0 }, type: "number", inputMode: "numeric", min: "1", max: "31", value: dom, onChange: e => setDom(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1))) }))),
        freq === "weekly" && (React.createElement("div", { style: { marginBottom: 10 } },
            React.createElement("div", { style: hint }, "On this day, every week"),
            React.createElement("div", { style: { display: "flex", gap: 4 } }, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => React.createElement("button", { key: i, style: dayBtn(dow === i), onClick: () => setDow(i) }, d))))),
        React.createElement("textarea", { style: { ...S.input, height: 60, resize: "none" }, placeholder: "Note", value: note, onChange: e => setNote(e.target.value) }),
        React.createElement("button", { style: { ...S.btn, background: "#0369a1", marginTop: 12 }, onClick: () => {
                const base = { id: (pin === null || pin === void 0 ? void 0 : pin.id) || Math.random().toString(36).slice(2), label: label.trim(), amount: parseFloat(amount) || 0, method, type, note: note.trim(), freq };
                if (freq === "monthly")
                    base.day = dom;
                else if (freq === "weekly")
                    base.day = dow;
                onSave(base);
            } }, "Save")));
}
// ─── Summary View ─────────────────────────────────────────────────────────────
function SummaryView({ state, weeks, rebalancedBudgets, totalSpent, totalEntries, totalPinned, totalCredits, remaining, methodTotals, businessEntries, onExport }) {
    const [methodDetail, setMethodDetail] = useState(null); // method name or null
    // Gross (as charged) per card = everything that hit each card — all entries + all pins.
    // This matches the card's own statement (Amex app etc.), since work and full split amounts
    // are charged in full and reimbursed separately. Credits are income, not card charges, and
    // live in a separate array, so they're naturally excluded.
    const grossByMethod = {};
    METHODS.forEach(m => {
        grossByMethod[m.id] = state.entries.filter(e => e.method === m.id).reduce((s, e) => s + e.amount, 0)
            + state.pins.filter(p => p.method === m.id).reduce((s, p) => s + (p.amount || 0), 0);
    });
    const grossSpend = METHODS.reduce((s, m) => s + grossByMethod[m.id], 0);
    // Waterfall totals, all derived so they reconcile exactly (incl. pins):
    //   Business + Split = Reimbursable, and Gross − Reimbursable = Net.
    const businessTotal = businessEntries.reduce((s, e) => s + e.amount, 0)
        + state.pins.filter(p => p.type === "business").reduce((s, p) => s + (p.amount || 0), 0);
    const netTotal = totalSpent; // personal (entries + personal pins)
    const reimbursableTotal = grossSpend - netTotal; // business + split (entries + pins)
    const splitTotal = reimbursableTotal - businessTotal; // excluded entries + any "split" pins
    // Per-week, per-method breakdown
    const weekRows = weeks.map(w => {
        var _a;
        const wEntries = state.entries.filter(e => e.weekIndex === w.index && e.type === "personal");
        const wTotal = wEntries.reduce((s, e) => s + e.amount, 0);
        const wByMethod = {};
        METHODS.forEach(m => { wByMethod[m.id] = wEntries.filter(e => e.method === m.id).reduce((s, e) => s + e.amount, 0); });
        const wBudget = (_a = rebalancedBudgets[w.index]) !== null && _a !== void 0 ? _a : state.weeklyBudget;
        return { week: w, total: wTotal, byMethod: wByMethod, budget: wBudget };
    });
    // All transactions for a given method (entries + pins), for drill-down
    function transactionsFor(method) {
        const fromEntries = state.entries
            .filter(e => e.method === method)
            .map(e => ({ date: e.date, amount: e.amount, desc: e.label || METHOD_NAME[e.method] || e.method, type: e.type }));
        const fromPins = state.pins
            .filter(p => p.method === method)
            .map(p => ({ date: null, amount: p.amount || 0, desc: p.label + " (pinned)", type: p.type === "business" ? "business" : p.type === "excluded" ? "excluded" : "personal" }));
        return [...fromEntries, ...fromPins].sort((a, b) => {
            if (!a.date)
                return 1;
            if (!b.date)
                return -1;
            return new Date(b.date) - new Date(a.date);
        });
    }
    // Largest individual spends this month (entries + pins, personal + business — excludes credits and the "not yours" portion of splits)
    const allSpendItems = [
        ...state.entries.filter(e => e.type !== "credit" && e.type !== "excluded").map(e => ({ desc: e.label || METHOD_NAME[e.method] || e.method, amount: e.amount, method: e.method, type: e.type })),
        ...state.pins.filter(p => p.type !== "excluded").map(p => ({ desc: p.label, amount: p.amount || 0, method: p.method, type: p.type })),
    ].sort((a, b) => b.amount - a.amount).slice(0, 5);
    // Source split: how much of personal spend came from pins vs quick-logged entries
    const sourcePct = totalSpent > 0 ? Math.round((totalPinned / totalSpent) * 100) : 0;
    return (React.createElement("div", { style: { padding: "12px 16px" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 10 } },
            React.createElement("button", { style: { background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-tertiary)", padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 500 }, onClick: onExport }, "\u2197 Export")),
        React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase" } }, "Month overview"),
            React.createElement("div", { style: { fontSize: 32, fontWeight: 800, color: remaining < 0 ? "#ef4444" : remaining < state.monthlyBudget * 0.15 ? "#f97316" : "#22c55e", marginBottom: 12 } }, fmt(remaining)),
            React.createElement("div", { style: { fontSize: 12, color: "var(--text-body)" } },
                fmt(totalSpent),
                " spent of ",
                fmt(state.monthlyBudget))),
        reimbursableTotal > 0 && (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Gross vs net"),
            businessTotal > 0 && (React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 } },
                React.createElement("span", { style: { color: "#f59e0b" } }, "Business spend"),
                React.createElement("span", { style: { color: "#f59e0b", fontWeight: 600 } }, fmt(businessTotal)))),
            splitTotal > 0 && (React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 } },
                React.createElement("span", { style: { color: "#a855f7" } }, "Split spend"),
                React.createElement("span", { style: { color: "#a855f7", fontWeight: 600 } }, fmt(splitTotal)))),
            React.createElement("div", { style: { borderTop: "1px solid var(--border)", marginTop: 6, display: "flex", justifyContent: "space-between", padding: "6px 0 5px" } },
                React.createElement("span", { style: { color: "var(--text-body)", fontSize: 13, fontWeight: 600 } }, "Gross spend across all cards"),
                React.createElement("span", { style: { color: "var(--text-heading)", fontWeight: 700, fontSize: 13 } }, fmt(grossSpend))),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 } },
                React.createElement("span", { style: { color: "var(--text-tertiary)" } }, "Reimbursable spend"),
                React.createElement("span", { style: { color: "var(--text-tertiary)", fontWeight: 600 } },
                    "\u2212 ",
                    fmt(reimbursableTotal))),
            React.createElement("div", { style: { borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
                React.createElement("span", { style: { color: "var(--text-heading)", fontSize: 13, fontWeight: 700 } }, "Net spend"),
                React.createElement("span", { style: { color: "var(--text-heading)", fontWeight: 800, fontSize: 15 } }, fmt(netTotal))))),
        React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2, textTransform: "uppercase" } }, "By card \u00B7 as charged"),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginBottom: 10 } }, "Matches your card statement"),
            METHODS.filter(m => grossByMethod[m.id] > 0).map(m => (React.createElement("button", { key: m.id, onClick: () => setMethodDetail(m.id), style: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 0", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left" } },
                React.createElement("span", { style: { ...S.dot, background: m.color } }),
                React.createElement("span", { style: { flex: 1, fontSize: 13, color: "var(--text-body)" } }, m.name),
                React.createElement("span", { style: { fontWeight: 600, color: m.color, fontSize: 13 } }, fmt(grossByMethod[m.id])),
                React.createElement("span", { style: { color: "var(--text-tertiary)", fontSize: 20, fontWeight: 700, lineHeight: 1 } }, "\u203A")))),
            METHODS.every(m => grossByMethod[m.id] === 0) && React.createElement("div", { style: { color: "var(--text-muted)", fontSize: 13, padding: "4px 0" } }, "No spend logged yet")),
        React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Weekly breakdown"),
            weekRows.map(({ week, total, byMethod, budget }) => (React.createElement("div", { key: week.index, style: { marginBottom: week.index < weeks.length ? 12 : 0, paddingBottom: week.index < weeks.length ? 12 : 0, borderBottom: week.index < weeks.length ? "1px solid var(--border)" : "none" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 } },
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text-heading)" } },
                        "Week ",
                        week.index),
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: total > budget ? "#ef4444" : "var(--text-body)" } },
                        fmt(total),
                        " ",
                        React.createElement("span", { style: { color: "var(--text-secondary)", fontWeight: 400 } },
                            "/ ",
                            fmt(budget)))),
                React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } },
                    METHODS.filter(m => byMethod[m.id] > 0).map(m => (React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-tertiary)" } },
                        React.createElement("span", { style: { ...S.dot, background: m.color } }),
                        m.name,
                        " ",
                        fmt(byMethod[m.id])))),
                    METHODS.every(m => byMethod[m.id] === 0) && React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "Nothing logged")))))),
        allSpendItems.length > 0 && (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Largest spends"),
            allSpendItems.map((item, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < allSpendItems.length - 1 ? "1px solid var(--border)" : "none" } },
                React.createElement("span", { style: { ...S.dot, background: METHOD_COLOR[item.method] || "var(--text-secondary)" } }),
                React.createElement("span", { style: { flex: 1, fontSize: 13, color: item.type === "business" ? "#f59e0b" : "var(--text-body)" } },
                    item.desc,
                    item.type === "business" && React.createElement("span", { style: S.badge }, " work")),
                React.createElement("span", { style: { fontWeight: 600, fontSize: 13, color: item.type === "business" ? "#f59e0b" : "var(--text-primary)" } }, fmt(item.amount))))))),
        totalSpent > 0 && totalPinned > 0 && totalEntries > 0 && (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", marginBottom: 12 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase" } }, "Spend source"),
            React.createElement("div", { style: { height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden", marginBottom: 8, display: "flex" } },
                React.createElement("div", { style: { height: "100%", width: sourcePct + "%", background: "#0369a1" } }),
                React.createElement("div", { style: { height: "100%", width: (100 - sourcePct) + "%", background: "#06b6d4" } })),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11 } },
                React.createElement("span", { style: { color: "#0369a1" } },
                    "\u25CF Pinned costs ",
                    fmt(totalPinned)),
                React.createElement("span", { style: { color: "#06b6d4" } },
                    "Quick-logged ",
                    fmt(totalEntries),
                    " \u25CF")))),
        totalCredits > 0 && (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px" } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#22c55e", marginBottom: 8, textTransform: "uppercase" } }, "Credits"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: "#22c55e" } },
                "+",
                fmt(totalCredits)))),
        methodDetail && (React.createElement(MethodDetailModal, { method: methodDetail, transactions: transactionsFor(methodDetail), gross: grossByMethod[methodDetail], net: methodTotals[methodDetail], onClose: () => setMethodDetail(null) }))));
}
// ─── Method Detail Modal ──────────────────────────────────────────────────────
function MethodDetailModal({ method, transactions, gross, net, onClose }) {
    const col = METHOD_COLOR[method];
    const reimbursable = gross - net;
    return (React.createElement(Modal, { onClose: onClose, title: `${METHOD_NAME[method] || method} transactions` },
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
            React.createElement("div", { style: { flex: 1, background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" } }, "Gross \u00B7 as charged"),
                React.createElement("div", { style: { fontSize: 17, fontWeight: 800, color: col } }, fmt(gross))),
            React.createElement("div", { style: { flex: 1, background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" } }, "Net \u00B7 your share"),
                React.createElement("div", { style: { fontSize: 17, fontWeight: 800, color: "var(--text-heading)" } }, fmt(net)))),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, padding: "0 2px" } },
            React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } },
                transactions.length,
                " transaction",
                transactions.length === 1 ? "" : "s"),
            reimbursable > 0.005 && React.createElement("span", { style: { fontSize: 11, color: "var(--text-tertiary)" } },
                fmt(reimbursable),
                " reimbursable")),
        React.createElement("div", { style: { maxHeight: 360, overflowY: "auto" } },
            transactions.length === 0 && React.createElement("div", { style: { color: "var(--text-muted)", fontSize: 13, padding: "12px 0", textAlign: "center" } }, "No transactions yet"),
            transactions.map((t, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < transactions.length - 1 ? "1px solid var(--border)" : "none" } },
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a855f7" : "var(--text-primary)" } },
                        t.desc,
                        t.type === "business" && React.createElement("span", { style: S.badge }, " work"),
                        t.type === "excluded" && React.createElement("span", { style: { ...S.badge, background: chipColors("#a855f7").bg, color: "#a855f7" } }, " reimbursable")),
                    t.date && React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)", marginTop: 1 } }, dateStr(new Date(t.date)))),
                React.createElement("span", { style: { fontWeight: 600, fontSize: 13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a855f7" : col } }, fmt(t.amount))))))));
}
// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ state, weeks, rebalancedBudgets, totalSpent, remaining, totalCredits, methodTotals, onClose }) {
    const [copied, setCopied] = useState(false);
    function buildText() {
        const mn = (id) => METHOD_NAME[id] || id; // resolve a stored method id to its display name
        const lines = [];
        lines.push(`SpendTracker — ${state.monthLabel}`);
        lines.push(`${fmt(totalSpent)} spent · ${fmt(remaining)} left of ${fmt(state.monthlyBudget)}`);
        if (totalCredits > 0)
            lines.push(`Credits: +${fmt(totalCredits)}`);
        lines.push("");
        weeks.forEach(w => {
            var _a;
            const wEntries = state.entries.filter(e => e.weekIndex === w.index);
            const wPersonal = wEntries.filter(e => e.type === "personal");
            const wBusiness = wEntries.filter(e => e.type === "business");
            const wExcluded = wEntries.filter(e => e.type === "excluded");
            const wCredits = (state.credits || []).filter(c => c.weekIndex === w.index);
            const wSpend = wPersonal.reduce((s, e) => s + e.amount, 0);
            const wBudget = (_a = rebalancedBudgets[w.index]) !== null && _a !== void 0 ? _a : state.weeklyBudget;
            lines.push(`Week ${w.index} (${dateStr(w.start)} – ${dateStr(w.end)}) — ${fmt(wSpend)} of ${fmt(wBudget)}`);
            if (wEntries.length === 0 && wCredits.length === 0) {
                lines.push(`  (nothing logged)`);
            }
            else {
                wPersonal.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || mn(e.method)}  [${mn(e.method)}]${e.splitGroupId ? " (split)" : ""}`));
                wBusiness.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || mn(e.method)}  [${mn(e.method)}, work]`));
                wExcluded.forEach(e => lines.push(`  £${e.amount.toFixed(2)}  ${e.label || mn(e.method)}  [${mn(e.method)}, reimbursable]`));
                wCredits.forEach(c => lines.push(`  +£${c.amount.toFixed(2)}  ${c.label || "Credit"}${c.from ? " from " + c.from : ""}`));
            }
            lines.push("");
        });
        const personalPins = state.pins.filter(p => p.type !== "business" && p.type !== "excluded");
        const businessPins = state.pins.filter(p => p.type === "business");
        const excludedPins = state.pins.filter(p => p.type === "excluded");
        if (state.pins.length > 0) {
            lines.push("Pinned costs:");
            personalPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${mn(p.method)}]`));
            businessPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${mn(p.method)}, work]`));
            excludedPins.forEach(p => lines.push(`  £${(p.amount || 0).toFixed(2)}  ${p.label}  [${mn(p.method)}, split]`));
            lines.push("");
        }
        const methodLines = METHODS.filter(m => methodTotals[m.id] > 0);
        if (methodLines.length > 0) {
            lines.push("By payment method:");
            methodLines.forEach(m => lines.push(`  ${m.name}: ${fmt(methodTotals[m.id])}`));
        }
        return lines.join("\n");
    }
    const text = buildText();
    function copy() {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
    return (React.createElement(Modal, { onClose: onClose, title: "Export" },
        React.createElement("div", { style: { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px", fontFamily: "monospace", fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto", marginBottom: 12, lineHeight: 1.6 } }, text),
        React.createElement("button", { style: { ...S.btn, background: copied ? "#16a34a" : "#0369a1", width: "100%" }, onClick: copy }, copied ? "✓ Copied" : "Copy to clipboard")));
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
                .then(t => { if (!cancelled)
                setText(t); })
                .catch(e => { if (!cancelled)
                setErr(e.message || "Couldn't build the backup."); });
        }
        else
            setErr("Backup isn't available.");
        return () => { cancelled = true; };
    }, []);
    function copy() {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { });
    }
    function download() {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "spendtracker-backup.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return (React.createElement(Modal, { onClose: onClose, title: "Export account" },
        React.createElement("div", { style: { fontSize: 13, color: "var(--text-body)", lineHeight: 1.5, marginBottom: 12 } },
            "This is your ",
            React.createElement("strong", null, "encrypted"),
            " account \u2014 it can only be opened with your passphrase or recovery code, so it's safe to save or send to yourself. Import it in another browser or on a new phone to carry everything across."),
        err && React.createElement("div", { style: { color: "#f87171", fontSize: 13, marginBottom: 10 } }, err),
        React.createElement("div", { style: { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px", fontFamily: "monospace", fontSize: 10, color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 150, overflowY: "auto", marginBottom: 12, lineHeight: 1.5 } }, text ? (text.length > 500 ? text.slice(0, 500) + "\n…" : text) : "Preparing…"),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", { style: { ...S.btn, background: copied ? "#16a34a" : "#0369a1", flex: 1, ...(text ? {} : { opacity: 0.5 }) }, disabled: !text, onClick: copy }, copied ? "✓ Copied" : "Copy backup"),
            React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", flex: 1, ...(text ? {} : { opacity: 0.5 }) }, disabled: !text, onClick: download }, "Download file"))));
}
// ─── Account backup: import (wipes current, installs the imported account) ────
function ImportBackupModal({ onClose }) {
    const [text, setText] = useState("");
    const [err, setErr] = useState("");
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    function onFile(e) {
        const f = e.target.files && e.target.files[0];
        if (!f)
            return;
        f.text().then(t => { setText(t); setErr(""); }).catch(() => setErr("Couldn't read that file."));
    }
    async function doImport() {
        setBusy(true);
        setErr("");
        try {
            await window.SpendVault.importBackup(text);
        } // reloads on success
        catch (e) {
            setErr(e.message || "That import didn't work.");
            setBusy(false);
        }
    }
    return (React.createElement(Modal, { onClose: onClose, title: "Import account" },
        React.createElement("div", { style: { background: chipColors("#f59e0b").bg, border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#f59e0b", lineHeight: 1.6, marginBottom: 12 } },
            "Importing ",
            React.createElement("strong", null, "replaces everything on this device"),
            " with the imported account \u2014 the data here is wiped. Export your current account first if you might want it back."),
        React.createElement("textarea", { style: { ...S.input, height: 90, resize: "none", fontFamily: "monospace", fontSize: 11 }, placeholder: "Paste a backup here\u2026", value: text, onChange: e => setText(e.target.value) }),
        React.createElement("input", { type: "file", accept: ".json,application/json", onChange: onFile, style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, width: "100%" } }),
        err && React.createElement("div", { style: { color: "#f87171", fontSize: 13, marginBottom: 10 } }, err),
        !confirm ? (React.createElement("button", { style: { ...S.btn, background: text ? "#f59e0b" : "var(--surface-2)", color: text ? "var(--on-accent)" : "var(--text-heading)", width: "100%", ...(text ? {} : { opacity: 0.5 }) }, disabled: !text, onClick: () => setConfirm(true) }, "Continue\u2026")) : (React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", { style: { ...S.btn, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-heading)", flex: 1 }, onClick: () => setConfirm(false) }, "Cancel"),
            React.createElement("button", { style: { ...S.btn, background: "#dc2626", flex: 1 }, disabled: busy, onClick: doImport }, busy ? "Importing…" : "Wipe & import")))));
}
// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title }) {
    return React.createElement("div", { style: S.modalOverlay, onClick: onClose },
        React.createElement("div", { style: S.modalSheet, onClick: e => e.stopPropagation() },
            React.createElement("div", { style: S.modalHeader },
                React.createElement("span", { style: S.modalTitle }, title),
                React.createElement("button", { style: S.delBtn, onClick: onClose }, "\u2715")),
            children));
}
// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
    root: { fontFamily: "'Inter', system-ui, sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text-primary)", maxWidth: 480, margin: "0 auto", paddingBottom: 40 },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" },
    appTitle: { fontSize: 24, fontWeight: 800, letterSpacing: "-1px", color: "var(--text-heading)" },
    appSub: { fontSize: 12, color: "var(--text-secondary)", marginTop: 2 },
    headerRight: { textAlign: "right" },
    remaining: { fontSize: 28, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1 },
    remainLabel: { fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" },
    pastBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--surface-2)", borderBottom: "1px solid #f59e0b", padding: "8px 16px", fontSize: 11, color: "var(--text-body)" },
    pastBannerBtn: { background: "#f59e0b", border: "none", borderRadius: 6, color: "var(--on-accent)", padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
    tabs: { display: "flex", borderBottom: "1px solid var(--border)", padding: "0 16px" },
    tab: { flex: 1, background: "none", border: "none", borderBottom: "2px solid transparent", color: "var(--text-secondary)", padding: "10px 4px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
    tabActive: { color: "var(--text-heading)", borderBottom: "2px solid #0369a1" },
    weekNav: { display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" },
    weekPill: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, color: "var(--text-secondary)", padding: "6px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0 },
    // Both variants set the full `border` shorthand: mixing shorthand + borderColor longhand
    // makes React clear the colour to currentColor when a pill deactivates (white rings).
    weekPillActive: { background: "#0369a1", border: "1px solid #0369a1", color: "var(--on-accent)" },
    weekPillCurrent: { border: "1px solid var(--text-heading)" },
    dailyCard: { flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" },
    dailyLabel: { fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 3 },
    dailySub: { fontSize: 10, color: "var(--text-secondary)", marginTop: 2 },
    weekHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 0 8px", borderBottom: "1px solid var(--border)", marginBottom: 10 },
    budgetCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px" },
    bar: { height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" },
    barFill: { height: "100%", borderRadius: 3 },
    entryRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--surface)" },
    splitGroup: { background: "#a855f714", border: "1px solid #a855f733", borderRadius: 8, padding: "2px 10px", marginBottom: 8 },
    entryRowGrouped: { borderBottom: "1px solid #a855f722" },
    dot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
    badge: { fontSize: 10, background: chipColors("#f59e0b").bg, color: "#f59e0b", borderRadius: 3, padding: "1px 4px", marginLeft: 4 },
    delBtn: { background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 16, padding: "0 2px" },
    actionBtn: { background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: 8, color: "var(--text-tertiary)", padding: "10px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
    editToggle: { background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text-tertiary)", padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
    bulkDelBar: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 },
    checkbox: { width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "#22c55e", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
    checkboxOn: { background: chipColors("#22c55e").bg, borderColor: "#22c55e" },
    dragHandle: { flexShrink: 0, background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, cursor: "grab", padding: "6px 4px", touchAction: "none", userSelect: "none" },
    rowDragging: { opacity: 0.55, background: "var(--surface)", borderRadius: 8 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-body)", textTransform: "uppercase", letterSpacing: "0.08em" },
    addBtn: { background: "#0369a1", border: "none", borderRadius: 6, color: "var(--on-accent)", padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
    pinGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    pinCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px" },
    empty: { color: "var(--text-muted)", fontSize: 13, padding: "12px 0" },
    iconBtn: { background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "0 2px" },
    input: { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-heading)", padding: "10px 12px", marginBottom: 10, fontSize: 14, outline: "none", boxSizing: "border-box" },
    btn: { border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--on-accent)" },
    settingsCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px", marginBottom: 12 },
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 100 },
    modalSheet: { background: "var(--surface)", borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", width: "100%", maxWidth: 480, margin: "0 auto", border: "1px solid var(--border)" },
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    modalTitle: { fontSize: 15, fontWeight: 700, color: "var(--text-heading)" },
    weekSelect: { background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-heading)", fontSize: 14, fontWeight: 700, padding: "3px 6px", cursor: "pointer", outline: "none", fontFamily: "inherit" },
    quickAdd: { position: "fixed", left: "calc(14px + env(safe-area-inset-left))", bottom: "calc(14px + env(safe-area-inset-bottom))", width: 52, height: 52, borderRadius: "50%", background: "#0369a1", border: "none", color: "var(--on-accent)", fontSize: 30, fontWeight: 400, lineHeight: 1, cursor: "pointer", zIndex: 50, boxShadow: "0 4px 14px rgba(3,105,161,0.5)", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 },
    hintBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--surface-2)", borderBottom: "1px solid #0369a1", padding: "8px 16px", fontSize: 12, color: "var(--text-body)", lineHeight: 1.4 },
    hintBtn: { background: "#0369a1", border: "none", borderRadius: 6, color: "var(--on-accent)", padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
    hintDismiss: { background: "none", border: "none", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
    // Floating help button — same footprint as the old lock button, themed so it reads in light + dark.
    helpFab: { position: "fixed", right: "calc(14px + env(safe-area-inset-right))", bottom: "calc(14px + env(safe-area-inset-bottom))", width: 44, height: 44, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", fontSize: 20, fontWeight: 700, cursor: "pointer", zIndex: 50, boxShadow: "0 2px 10px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0 },
};
