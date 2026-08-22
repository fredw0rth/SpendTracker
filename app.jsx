const { useState, useEffect, useLayoutEffect, useReducer, useRef } = React;

// ─── Constants ────────────────────────────────────────────────────────────────
// Payment types are user-editable (name + colour, add/remove) and live in state.methods.
// Each method's `id` is stable and is what entries/pins store in `.method`; the defaults use
// their old names AS ids so pre-existing data keeps resolving with zero migration.
const DEFAULT_METHODS = [
  { id: "Amex",   name: "Amex",   color: "#60a5fa" },
  { id: "Lloyds", name: "Lloyds", color: "#34d399" },
  { id: "HSBC",   name: "HSBC",   color: "#f87171" },
  { id: "Cash",   name: "Cash",   color: "#fbbf24" },
];
const MAX_METHODS = 12;
const genId = () => Math.random().toString(36).slice(2);

// Spending categories: what a spend was *for* (Groceries, Transport, …). Like methods, these are
// a user-editable list of {id, name, emoji, color} living in state.categories. Entries store the
// chosen category's id in `.category`; an absent/null `.category` means uncategorised ("None"),
// which is never stored as a category row.
const DEFAULT_CATEGORIES = [
  { id: "groceries",  name: "Groceries",     icon: "cart",     color: "#f59e0b" },
  { id: "eatingout",  name: "Eating out",    icon: "utensils", color: "#84cc16" },
  { id: "transport",  name: "Transport",     icon: "train",    color: "#14b8a6" },
  { id: "shopping",   name: "Shopping",      icon: "bag",      color: "#d946ef" },
  { id: "bills",      name: "Bills",         icon: "bulb",     color: "#3b82f6" },
  { id: "entertain",  name: "Entertainment", icon: "film",     color: "#10b981" },
  { id: "personal",   name: "Personal care", icon: "heart",    color: "#ef4444" },
  { id: "general",    name: "General",       icon: "shapes",   color: "#6b7280" },
];
// Map default ids → icons, used to upgrade accounts saved with the earlier emoji-based defaults.
const DEFAULT_CATEGORY_ICON = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c.icon]));
const MAX_CATEGORIES = 24;
// Monochrome line icons (Lucide, ISC) inlined as SVG inner-markup, keyed by a short name.
// Rendered white on a category's coloured circle (Monzo-style) via <CategoryIcon>.
const ICONS = {"cart":"<circle cx=\"8\" cy=\"21\" r=\"1\" /><circle cx=\"19\" cy=\"21\" r=\"1\" /><path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\" />","utensils":"<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" /><path d=\"M7 2v20\" /><path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />","train":"<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\" /><path d=\"m9 15-1-1\" /><path d=\"m15 15 1-1\" /><path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\" /><path d=\"m8 19-2 3\" /><path d=\"m16 19 2 3\" />","bag":"<path d=\"M16 10a4 4 0 0 1-8 0\" /><path d=\"M3.103 6.034h17.794\" /><path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\" />","bulb":"<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" /><path d=\"M9 18h6\" /><path d=\"M10 22h4\" />","film":"<path d=\"m12.296 3.464 3.02 3.956\" /><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\" /><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" /><path d=\"m6.18 5.276 3.1 3.899\" />","heart":"<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />","shapes":"<path d=\"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z\" /><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" /><circle cx=\"17.5\" cy=\"17.5\" r=\"3.5\" />","home":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />","dumbbell":"<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\" /><path d=\"m2.5 21.5 1.4-1.4\" /><path d=\"m20.1 3.9 1.4-1.4\" /><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\" /><path d=\"m9.6 14.4 4.8-4.8\" />","coffee":"<path d=\"M10 2v2\" /><path d=\"M14 2v2\" /><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" /><path d=\"M6 2v2\" />","car":"<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\" /><circle cx=\"7\" cy=\"17\" r=\"2\" /><path d=\"M9 17h6\" /><circle cx=\"17\" cy=\"17\" r=\"2\" />","gift":"<path d=\"M12 7v14\" /><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\" /><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\" /><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\" />","plane":"<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\" />","health":"<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" /><path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />","piggy":"<path d=\"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z\" /><path d=\"M16 10h.01\" /><path d=\"M2 8v1a2 2 0 0 0 2 2h1\" />","sprout":"<path d=\"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3\" /><path d=\"M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4\" /><path d=\"M5 21h14\" />","phone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /><path d=\"M12 18h.01\" />","book":"<path d=\"M12 7v14\" /><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" />","pet":"<path d=\"M11.25 16.25h1.5L12 17z\" /><path d=\"M16 14v.5\" /><path d=\"M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309\" /><path d=\"M8 14v.5\" /><path d=\"M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5\" />","fuel":"<path d=\"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5\" /><path d=\"M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16\" /><path d=\"M2 21h13\" /><path d=\"M3 9h11\" />","work":"<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\" /><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />","edu":"<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /><path d=\"M22 10v6\" /><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />","music":"<path d=\"M9 18V5l12-2v13\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><circle cx=\"18\" cy=\"16\" r=\"3\" />","wine":"<path d=\"M8 22h8\" /><path d=\"M7 10h10\" /><path d=\"M12 15v7\" /><path d=\"M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z\" />","shirt":"<path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" />","baby":"<path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" /><path d=\"M15 12h.01\" /><path d=\"M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" /><path d=\"M9 12h.01\" />","tools":"<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />","card":"<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\" /><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\" />","cash":"<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\" /><circle cx=\"12\" cy=\"12\" r=\"2\" /><path d=\"M6 12h.01M18 12h.01\" />","ticket":"<path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\" /><path d=\"M13 5v2\" /><path d=\"M13 17v2\" /><path d=\"M13 11v2\" />","game":"<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" /><line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" /><line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" /><line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" /><path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />","pizza":"<path d=\"m12 14-1 1\" /><path d=\"m13.75 18.25-1.25 1.42\" /><path d=\"M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12\" /><path d=\"M18.8 9.3a1 1 0 0 0 2.1 7.7\" /><path d=\"M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z\" />","bus":"<path d=\"M8 6v6\" /><path d=\"M15 6v6\" /><path d=\"M2 12h19.6\" /><path d=\"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3\" /><circle cx=\"7\" cy=\"18\" r=\"2\" /><path d=\"M9 18h5\" /><circle cx=\"16\" cy=\"18\" r=\"2\" />","bike":"<circle cx=\"18.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"5.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"15\" cy=\"5\" r=\"1\" /><path d=\"M12 17.5V14l-3-3 4-3 2 3h2\" />","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />"};
const ICON_KEYS = Object.keys(ICONS);
// These module-level views are refreshed from state.methods at the top of App() each render, so
// the ~30 existing `METHODS` / `METHOD_COLOR[id]` call-sites keep working without prop-threading.
// (Single synchronous root render, no StrictMode → children read the fresh values in the same pass.)
let METHODS = DEFAULT_METHODS;                                    // [{id,name,color}]
let METHOD_COLOR = Object.fromEntries(DEFAULT_METHODS.map(m => [m.id, m.color])); // id -> colour
let METHOD_NAME = Object.fromEntries(DEFAULT_METHODS.map(m => [m.id, m.name]));   // id -> display name
// Category views, refreshed from state.categories in App() the same way (see App()).
let CATEGORIES = DEFAULT_CATEGORIES;                               // [{id,name,emoji,color}]
let CATEGORY_BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c])); // id -> {name,emoji,color}

// ─── Colour contrast helpers ───────────────────────────────────────────────────
// Categories and payment methods let the user pick any colour via a bare <input type="color">,
// with nothing stopping them picking white/near-white (or black/near-black) — which then breaks
// wherever that colour is rendered as a hardcoded-white icon's background, or echoed raw as text.
// These helpers derive a *readable* variant of a user colour instead of trusting it outright.
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
// Black-or-white swap for an icon/glyph sat on a solid, arbitrary background colour — the
// standard "which text reads better on this swatch" contrast check.
function readableIconColor(bgHex) {
  return relativeLuminance(bgHex) > 0.55 ? "#111827" : "#fff";
}
function hexToHsl(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
// Clamps a colour's lightness into a band that reads on both light and dark surfaces, keeping
// its hue/saturation intact — mirrors where the app's own hand-picked semantic colours
// (business amber, split purple, credit green, etc.) already naturally sit.
function readableChipColor(hex) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(65, Math.max(30, l)));
}
// Make an accent colour readable AS TEXT against the current theme's surface. readableChipColor
// above only rescues colours that are near-white or near-black; a mid-lightness accent like amber
// (#f59e0b, L≈50%) passes through it untouched and then renders at 2.1:1 on the light theme's
// cream — illegible. This walks the lightness down (light theme) or up (dark) until the colour
// clears 4.5:1 against the surface it sits on.
//
// Only TEXT goes through this. Fills, borders and tints keep the raw accent, so amber still looks
// amber; it's the same hue, darkened just enough to read. In dark mode the accents already clear
// 4.5:1, so this returns them unchanged and nothing shifts.
const SURFACE_LUM = { light: relativeLuminance("#fffcf3"), dark: relativeLuminance("#0f172a") };
function readableAccentText(hex) {
  const light = document.documentElement.dataset.theme === "light";
  const bg = light ? SURFACE_LUM.light : SURFACE_LUM.dark;
  const ratio = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  const { h, s } = hexToHsl(hex);
  let l = hexToHsl(hex).l;
  const step = light ? -3 : 3;
  for (let i = 0; i < 40 && l >= 0 && l <= 100; i++) {
    const candidate = hslToHex(h, s, l);
    if (ratio(relativeLuminance(candidate), bg) >= 4.5) return candidate;
    l += step;
  }
  return hslToHex(h, s, Math.max(0, Math.min(100, l)));
}

// Derive a coherent chip palette (used by the selectors) from a single method colour. Reads the
// live theme at call time (not cached) so every caller — inline in a component's render, never
// baked into the static S style object below, which only evaluates once — stays correct across
// an in-app theme toggle. Light mode uses a lower alpha for a properly pastel tint; dark mode
// keeps the original strength. text/border are clamped to a readable lightness band so a
// near-white or near-black user colour can't collapse into invisible text (see readableChipColor).
const chipColors = (c) => {
  const light = document.documentElement.dataset.theme === "light";
  const safe = readableChipColor(c);
  return { bg: c + (light ? "14" : "22"), border: safe, text: safe };
};
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

// The spend day an entry is filed under: a zero-padded "YYYY-MM-DD" calendar date, absent when
// the day isn't known. Deliberately date-only and deliberately not `date`:
//   - `date` is when the entry was LOGGED, not when the money was spent, and a cross-week move
//     rewrites weekIndex while leaving it alone — so it can fall outside its own week.
//   - A full timestamp would drift: toISOString() at 23:00 on a device at UTC+13 yields tomorrow.
//   - Zero-padding is what makes the string sortable, which is the whole sort for day grouping.
// Absent means undated, so every pre-existing entry stays valid with no migration.
// Distinct from occKeyOf below, which is un-padded and only ever a map key for pin overrides.
const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Column 0-6 for a day in the day picker's grid. buildWeeks closes a week on SUNDAY, so weeks run
// Mon→Sun and Monday is column 0 — not the Sun=0 that getDay() hands back. Partial weeks (the first
// week of a period starts on payday, mid-week) rely on this to sit under the right columns.
const weekCol = (d) => (d.getDay() + 6) % 7;
// Parsed back as LOCAL midnight — `new Date("2026-07-31")` would parse as UTC and can land on
// the previous day once rendered in a negative-offset timezone.
const dayKeyToDate = (key) => { const [y, m, d] = String(key).split("-").map(Number); return new Date(y, m - 1, d); };
// Long form for day headings: "Fri 31 Jul". Reuses dateStr so headings match the week ranges.
const dayKeyLabel = (key) => dateStr(dayKeyToDate(key));

// Unencrypted timestamp of the last successful account export (crypto.js writes it once
// exportBackup succeeds). Key name must stay in sync with crypto.js's LAST_BACKUP_KEY.
const LAST_BACKUP_KEY = "spendtracker_last_backup";
// Coarse "X ago" phrasing for the Settings backup-freshness line — deliberately imprecise
// (steps down in granularity) since only rough recency matters, not the exact minute.
function relativeTime(iso) {
  if (!iso) return null; // new Date(null) is epoch-zero, not Invalid Date, so guard explicitly
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

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

// Payday for a given month under the user's configured rule. Defaults keep every existing
// caller (including crypto.js, which runs pre-unlock with no access to settings) on the
// original last-working-day behaviour, so vaults without the setting need no migration.
// "fixed" follows payroll convention: a payday landing on a weekend moves to the previous
// working day; a day past the month's end (e.g. 31st in February) clamps to the last day.
function paydayFor(year, month, kind = "last-working", day) {
  if (kind === "last-calendar") return new Date(year, month + 1, 0);
  if (kind === "last-friday") {
    let d = new Date(year, month + 1, 0);
    while (d.getDay() !== 5) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    return d;
  }
  if (kind === "fixed") {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let d = new Date(year, month, Math.min(Math.max(day || 1, 1), daysInMonth));
    while (isWeekend(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    return d;
  }
  return lastWorkingDay(year, month);
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
function periodLabelFor(date, kind, day) {
  let y = date.getFullYear(), m = date.getMonth();
  for (let i = 0; i < 3; i++) {
    const payday = paydayFor(y, m, kind, day);
    if (date < payday) return { year: y, month: m };
    m++;
    if (m > 11) { m = 0; y++; }
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
  if (weekDays.length > 0) weeks.push(weekDays);
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

// A stable, week-independent key for one dated occurrence of a scheduled pin. Used to hang
// per-occurrence overrides (skip/move/reorder) off the pin so a move never changes the key.
const occKeyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function makePinEntry(pin, weekIndex, date) {
  const occKey = occKeyOf(date);
  // `amounts` is the fourth per-occurrence override map, alongside skips/moves/orders: it lets a
  // single occurrence differ from the pin's standing amount without rewriting the others. That's
  // what reconciliation needs when a statement shows one month's rent charged at a new price.
  const override = (pin.amounts || {})[occKey];
  return {
    id: "pin-" + pin.id + "-" + weekIndex + "-" + date.getDate() + "-" + date.getMonth(),
    amount: override != null ? override : (pin.amount || 0),
    label: pin.label,
    note: pin.note || "",
    method: pin.method,
    type: pin.type,            // personal / business / excluded — mapped straight through
    category: pin.category,    // carried so week-log rows and the category summary see it
    weekIndex,
    date: date.toISOString(),
    day: dayKey(date),         // a scheduled occurrence knows its real calendar day, so day grouping gets it free
    order: date.getTime(),
    pinned: true,              // read-only marker: managed from the Pinned tab, not the week log
    pinId: pin.id,
    occKey,                    // identity for this occurrence's skip/move/order/amount overrides
  };
}

function expandScheduledPins(pins, weeks) {
  const out = [];
  // Emit one occurrence, applying the pin's per-occurrence overrides: skip drops it entirely; a
  // move sends it to another week (its date is unchanged); a reorder replaces its sort order. None
  // of these touch the recurring schedule itself — they live keyed by occKey on the pin.
  const pushOcc = (p, naturalWeek, date) => {
    const k = occKeyOf(date);
    if ((p.skips || []).includes(k)) return;
    const moved = !!(p.moves && p.moves[k] != null);
    const weekIndex = moved ? p.moves[k] : naturalWeek;
    const entry = makePinEntry(p, weekIndex, date);
    // A moved occurrence keeps its original date (that's its identity — occKey is derived from it)
    // but is now filed under a different week, so its day would sit outside that week. Drop the day
    // rather than show a heading the week doesn't contain; the same rule a cross-week move follows.
    if (moved) delete entry.day;
    if (p.orders && p.orders[k] != null) entry.order = p.orders[k];
    out.push(entry);
  };
  for (const p of pins) {
    if (!isScheduledPin(p)) continue;
    if (p.freq === "weekly") {
      // One occurrence per week that contains the chosen weekday (partial first/last weeks
      // that don't include it are simply skipped).
      for (const w of weeks) {
        const match = w.days.find(d => d.getDay() === p.day);
        if (match) pushOcc(p, w.index, match);
      }
    } else if (p.freq === "monthly") {
      // First day in the period matching the chosen day-of-month (a pay period can span two
      // calendar months, so a boundary date can occur twice — first occurrence wins). If the
      // day never occurs (e.g. the 31st in a shorter window), clamp to the period's last day
      // so the charge isn't silently dropped.
      let target = null, targetWeek = null;
      for (const w of weeks) {
        const match = w.days.find(d => d.getDate() === p.day);
        if (match) { target = match; targetWeek = w.index; break; }
      }
      if (!target) {
        const lastWeek = weeks[weeks.length - 1];
        if (lastWeek) { target = lastWeek.days[lastWeek.days.length - 1]; targetWeek = lastWeek.index; }
      }
      if (target) pushOcc(p, targetWeek, target);
    } else if (p.freq === "daily") {
      // One occurrence per calendar day in the period, in every week.
      for (const w of weeks) {
        for (const d of w.days) pushOcc(p, w.index, d);
      }
    }
  }
  return out;
}

// Effective ordering key: prefer the explicit `order`, falling back to the creation timestamp so
// items logged before `order` existed still sort chronologically without any migration. Shared by
// the week log and the Summary drill-downs so the two can never drift apart.
const effOrder = (item) => item.order != null ? item.order : (Date.parse(item.date) || 0);

// Group transactions by the week they're filed under, for the Summary drill-downs.
//
// Ordering reads like a card statement: most recent at the top, oldest at the bottom, so scrolling
// down always moves backwards in time and never doubles back. That means weeks run DESCENDING
// (latest week first) to match the descending effOrder sort within each week — pairing the two the
// other way round makes time run backwards inside a week but jump forwards at every header, which
// puts each week's newest row directly beneath the previous week's oldest.
//
// Grouping (rather than one flat sort) is what makes the within-week part correct: `order` values
// are only ever comparable against siblings from the SAME week. commitReorder redistributes a single
// week's own existing values, and a cross-week move rewrites `weekIndex` while leaving `order`
// untouched — so `order` is never compared across weeks here.
//
// Flat (unscheduled) pins are whole-period costs that never appear in the week log at all (WeekPanel
// is only passed entries and credits), so they have no week and no hand-arranged position to carry
// through. They collect in a trailing group, below the oldest week, keeping the dated run
// uninterrupted — in state.pins order, so the section matches the Pinned tab. Anything whose
// weekIndex matches no known week lands there too, rather than silently vanishing from the list.
// Scheduled-pin occurrences are unaffected: they carry a real weekIndex and order, so they sit
// inside their own week exactly where they were dragged.
function groupByWeek(items, weeks) {
  const buckets = new Map();
  const trailing = [];
  for (const it of items) {
    if (it.weekIndex == null || !weeks.some(w => w.index === it.weekIndex)) { trailing.push(it); continue; }
    if (!buckets.has(it.weekIndex)) buckets.set(it.weekIndex, []);
    buckets.get(it.weekIndex).push(it);
  }
  const groups = [];
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const rows = buckets.get(w.index);
    if (rows && rows.length) groups.push({ key: "w" + w.index, label: "Week " + w.index, items: rows.sort((a, b) => effOrder(b) - effOrder(a)) });
  }
  if (trailing.length) groups.push({ key: "fixed", label: "Fixed costs", items: trailing });
  return groups;
}

// Total row count across grouped output, for the "N transactions" counts in the drill-downs.
const groupCount = (groups) => groups.reduce((s, g) => s + g.items.length, 0);

function todayWeekIndex(weeks) {
  const norm = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = norm(new Date());
  for (const w of weeks) {
    if (today >= norm(w.start) && today <= norm(w.end)) return w.index;
  }
  if (today < norm(weeks[0]?.start)) return 1;
  return weeks[weeks.length - 1]?.index || 1;
}

// The week a given spend day is filed under. weeks already carries every day it contains
// (buildWeeks), so this is a lookup rather than fresh date maths — and it's the only thing that
// sets weekIndex for a dated entry, which is what keeps day and week from ever disagreeing.
// Returns null for a day outside the period, so callers can fall back rather than guess.
function weekIndexForDay(weeks, key) {
  if (!key) return null;
  const w = (weeks || []).find(w => w.days.some(d => dayKey(d) === key));
  return w ? w.index : null;
}

// Today as a spend day, or null when today falls outside the period being viewed (an archived
// month, or a period being previewed). londonNow rather than new Date so "today" agrees with the
// rollover check and the current-week highlight instead of drifting on a travelling device.
function todayDayKey(weeks) {
  const key = dayKey(londonNow());
  return weekIndexForDay(weeks, key) ? key : null;
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
    paydayKind: "last-working",
    paydayDay: 25,
    theme: "dark",
    lastMethod: "Amex",
    methods: DEFAULT_METHODS,
    categories: DEFAULT_CATEGORIES,
    categoryPrompt: true, // ask for a category after logging a personal/split spend
    descriptionPrompt: true, // show a description field when logging/editing a spend

    helpHintSeen: false, // drives the one-time "take a tour" hint for brand-new accounts only
    entries: [],
    pins: [],
    credits: [],
    monthHistory: [],
    // One saved bank statement per payment method, so a card is uploaded once and re-reconciled
    // from a button rather than re-uploaded every time. See reconcile.js's packStatement.
    statements: [],
  };
}

// ─── State normalisation ──────────────────────────────────────────────────────
// Single source of truth for "a state object the render tree can safely consume". Two jobs:
//
//  1. Backfill fields for accounts created before those fields existed. Older accounts have no
//     `credits` key at all (not even an empty array), pre-icon accounts have categories without
//     an `icon`, and so on.
//  2. Act as a safety net against a reducer that forgets to carry a field forward. MONTH_ROLLOVER
//     did exactly that and dropped `categories`, which crashed the whole app on the first payday
//     after categories shipped — a render-phase throw with no error boundary takes down the tree.
//
// Applied on load AND to every reducer result, so a missing required field cannot survive a
// dispatch. Keep it cheap: it runs once per state-changing action.
function normalizeState(s) {
  const src = s || {};
  return {
    ...src,
    methods: (src.methods && src.methods.length) ? src.methods : DEFAULT_METHODS,
    // Ensure every category has an `icon` (accounts from the emoji-based build won't): reuse the
    // default id→icon map, else fall back to a generic tag.
    categories: (src.categories && src.categories.length)
      ? src.categories.map(c => c.icon ? c : { ...c, icon: DEFAULT_CATEGORY_ICON[c.id] || "tag" })
      : DEFAULT_CATEGORIES,
    categoryPrompt: src.categoryPrompt === undefined ? true : src.categoryPrompt,
    descriptionPrompt: src.descriptionPrompt === undefined ? true : src.descriptionPrompt,
    // `true` is the right default for a MISSING value here: defaultState() writes an explicit
    // `false` for genuinely new accounts, so undefined means an existing account — never re-show
    // the first-run tour to someone who has already dismissed it.
    helpHintSeen: src.helpHintSeen === undefined ? true : src.helpHintSeen,
    entries: src.entries || [],
    pins: src.pins || [],
    credits: src.credits || [],
    monthHistory: src.monthHistory || [],
    statements: src.statements || [],
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
// rawReducer holds the actual transitions; `reducer` wraps it so every result is normalised.
// The identity check matters: rawReducer's `default` returns the same object for an unknown
// action, and normalising it would mint a new one, re-rendering and re-firing the save effect.
function reducer(s, a) {
  const next = rawReducer(s, a);
  return next === s ? s : normalizeState(next);
}

// ─── Saved statements ─────────────────────────────────────────────────────────
// Keyed by payment method: a card has one current statement, and re-uploading updates it rather
// than accumulating copies. Stored packed (see reconcile.js) because the whole vault is
// re-encrypted on every state change.
const statementFor = (state, methodId) => (state.statements || []).find(st => st.method === methodId) || null;

// "26 Jul – 25 Aug" — what the statement covers, which is more use on a button than when it was
// uploaded. Falls back to the upload date for a statement with no readable rows.
function statementLabel(st) {
  if (!st) return "";
  const short = (key) => { const d = dayKeyToDate(key); return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`; };
  if (st.from && st.to) return st.from === st.to ? short(st.to) : `${short(st.from)} – ${short(st.to)}`;
  return st.savedAt ? relativeTime(st.savedAt) : "";
}

// ─── Reconciliation: adapting app data to reconcile.js ────────────────────────
// reconcile.js is deliberately ignorant of the app's object shapes. These two helpers are the
// whole seam: one flattens what's logged into the small `candidate` shape the matcher compares
// against, the other turns a period into the plain day→week lookup it uses to place a date.
const REC = () => window.SpendReconcile;

// Every period the statement could touch: the live one first (so it wins any overlap), then each
// archived period, each rebuilt from its OWN payday rule and budget snapshot.
function reconcilePeriods(state) {
  const mk = (archiveIndex, d) => {
    const { start, end } = periodBounds(d.payYear, d.payMonth, d.paydayKind || "last-working", d.paydayDay);
    const weeks = buildWeeks(start, end);
    return {
      archiveIndex,
      label: d.monthLabel,
      data: d,
      weeks,
      // dayKeys mirrors exactly what weekIndexForDay reads (week.days), just serialised, so the
      // matcher and the app can never disagree about which week a day belongs to.
      weekKeys: weeks.map(w => ({ index: w.index, dayKeys: w.days.map(dayKey) })),
    };
  };
  const out = [mk(null, state)];
  (state.monthHistory || []).forEach((arc, i) => out.push(mk(i, arc)));
  return out;
}

// Flattens one period's logged items into candidates. Three shapes collapse here:
//   • a split becomes ONE candidate at the group total — it is one card transaction, and matching
//     either half against the statement would flag every split you have ever logged;
//   • a scheduled pin occurrence becomes a "pin" candidate carrying pinId + occKey, so its fixes
//     can route to the pin's override maps rather than to a row that doesn't exist in `entries`;
//   • a credit becomes a "credit" candidate, which only ever matches an incoming statement row.
function reconcileCandidates(period, methodId) {
  const d = period.data;
  const entries = d.entries || [];
  const pinEntries = expandScheduledPins(d.pins || [], period.weeks);
  const all = [...entries, ...pinEntries];
  const wanted = (m) => !methodId || m === methodId;
  const out = [];
  const seenSplit = new Set();
  const kp = "a" + (period.archiveIndex == null ? "live" : period.archiveIndex);

  for (const e of all) {
    if (!wanted(e.method)) continue;
    if (e.pinned) {
      const recons = ((d.pins || []).find(p => p.id === e.pinId) || {}).recons || {};
      out.push({
        key: kp + ":pin:" + e.pinId + ":" + e.occKey, kind: "pin", direction: "debit",
        amount: e.amount, day: e.day || null, label: e.label || "", method: e.method,
        weekIndex: e.weekIndex, type: e.type, category: e.category,
        recon: recons[e.occKey] || null,
        ref: { archiveIndex: period.archiveIndex, pinId: e.pinId, occKey: e.occKey, entry: e },
      });
      continue;
    }
    if (e.splitGroupId) {
      if (seenSplit.has(e.splitGroupId)) continue;
      seenSplit.add(e.splitGroupId);
      const group = all.filter(x => x.splitGroupId === e.splitGroupId);
      const your = group.find(x => x.type === "personal") || null;
      const their = group.find(x => x.type === "excluded") || null;
      out.push({
        key: kp + ":split:" + e.splitGroupId, kind: "split", direction: "debit",
        amount: Math.round(group.reduce((t, x) => t + (x.amount || 0), 0) * 100) / 100,
        // The fingerprint is kept on the personal half, which is the one every fix rewrites.
        day: e.day || null, label: e.label || "", method: e.method,
        weekIndex: e.weekIndex, type: "split", category: your ? your.category : undefined,
        recon: (your && your.recon) || (their && their.recon) || null,
        ref: { archiveIndex: period.archiveIndex, groupId: e.splitGroupId, your, their },
      });
      continue;
    }
    out.push({
      key: kp + ":entry:" + e.id, kind: "entry", direction: "debit",
      amount: e.amount, day: e.day || null, label: e.label || "", method: e.method,
      weekIndex: e.weekIndex, type: e.type, category: e.category,
      recon: e.recon || null, ref: { archiveIndex: period.archiveIndex, entry: e },
    });
  }
  for (const c of (d.credits || [])) {
    // Filtered by card exactly like a spend. A credit logged before credits carried a card has no
    // method, so it only appears under "All cards" — assigning it one from the editor brings it
    // back into that card's reconciliation.
    if (!wanted(c.method)) continue;
    out.push({
      key: kp + ":credit:" + c.id, kind: "credit", direction: "credit",
      amount: c.amount, day: c.day || null, label: c.label || "", method: c.method || null,
      weekIndex: c.weekIndex, type: "credit",
      recon: c.recon || null, ref: { archiveIndex: period.archiveIndex, credit: c },
    });
  }
  return out;
}

// ─── Reconciliation ops ───────────────────────────────────────────────────────
// One reconciliation can produce dozens of fixes spread across the live period and several
// archived ones. These apply a single op to one collection; RECONCILE_APPLY below folds a whole
// batch of them into ONE state transition, because the save effect re-encrypts and rewrites the
// entire vault on every dispatch — thirty fixes applied one at a time is thirty encrypt cycles.
function applyReconEntryOp(list, op) {
  if (op.op === "add") return [op.entry, ...list];
  if (op.op === "del") return list.filter(e => e.id !== op.id);
  if (op.op === "upd") return list.map(e => e.id === op.entry.id ? op.entry : e);
  return list;
}
function applyReconCreditOp(list, op) {
  if (op.op === "add") return [op.credit, ...list];
  if (op.op === "del") return list.filter(c => c.id !== op.id);
  if (op.op === "upd") return list.map(c => c.id === op.credit.id ? op.credit : c);
  return list;
}
// Pin fixes never touch the recurring schedule — they write the same per-occurrence override maps
// the Week tab's skip/move already use, keyed by the week-independent occKey. "rate" is the one
// exception: it changes the pin's standing amount, which is what a genuine price rise means.
function applyReconPinOp(list, op) {
  return list.map(p => {
    if (p.id !== op.pinId) return p;
    if (op.op === "skip") return { ...p, skips: [...(p.skips || []), op.occKey] };
    if (op.op === "amount") return { ...p, amounts: { ...(p.amounts || {}), [op.occKey]: op.amount } };
    if (op.op === "rate") return { ...p, amount: op.amount };
    if (op.op === "recon") return { ...p, recons: { ...(p.recons || {}), [op.occKey]: op.recon } };
    return p;
  });
}

function rawReducer(s, a) {
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
        paydayKind: s.paydayKind,
        paydayDay: s.paydayDay,
      };
      const newHistory = [...(s.monthHistory||[]), archive].slice(-12);
      // Spread `s` — do NOT hand-list the fields to carry over. This case previously built a
      // fresh object naming each passthrough, and silently dropped every field added to state
      // afterwards (categories, categoryPrompt, descriptionPrompt, helpHintSeen), which crashed
      // the app on the first payday after categories shipped. Anything not named below is meant
      // to survive a rollover untouched: budgets, payday rule, theme, methods, categories, the
      // prompt toggles, lastMethod, and pins (recurring by design). Entries and credits are
      // period-scoped, so the new period starts empty.
      return { ...s,
        payYear: a.newYear, payMonth: a.newMonth, monthLabel: a.newLabel,
        monthHistory: newHistory,
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
    case "RECONCILE_APPLY": {
      // ops: [{ archiveIndex: null|number, kind: "entry"|"credit"|"pin", op, ...payload }]
      // archiveIndex null targets the live period; a number targets that monthHistory slot, the
      // same way EDIT_PAST_ENTRY does — the reconcile screen spans periods, so it can't rely on
      // App's viewingPast routers, which only ever know about one.
      const ops = a.ops || [];
      if (!ops.length) return s;
      let entries = s.entries, credits = s.credits || [], pins = s.pins || [];
      const history = s.monthHistory || [];
      const nextHistory = history.slice();
      let historyTouched = false;
      for (const op of ops) {
        if (op.archiveIndex == null) {
          if (op.kind === "credit") credits = applyReconCreditOp(credits, op);
          else if (op.kind === "pin") pins = applyReconPinOp(pins, op);
          else entries = applyReconEntryOp(entries, op);
          continue;
        }
        const arc = nextHistory[op.archiveIndex];
        if (!arc) continue; // history trimmed under us — drop the op rather than crash
        historyTouched = true;
        if (op.kind === "credit") nextHistory[op.archiveIndex] = { ...arc, credits: applyReconCreditOp(arc.credits || [], op) };
        else if (op.kind === "pin") nextHistory[op.archiveIndex] = { ...arc, pins: applyReconPinOp(arc.pins || [], op) };
        else nextHistory[op.archiveIndex] = { ...arc, entries: applyReconEntryOp(arc.entries || [], op) };
      }
      return { ...s, entries, credits, pins, monthHistory: historyTouched ? nextHistory : history };
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
      if (ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus]);

  return (
    <div ref={ref} style={S.settingsCard}>
      <button style={{ background:"none", border:"none", width:"100%", padding:0, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.04em" }}>How it works</span>
        <span style={{ color:"var(--text-secondary)", fontSize:12 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div style={{ marginTop:6 }}>
          {HELP_TOPICS.map(([q, a], i) => (
            <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <button style={{ background:"none", border:"none", width:"100%", padding:"10px 0", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, cursor:"pointer", textAlign:"left" }} onClick={() => setOpen(open === i ? null : i)}>
                <span style={{ fontSize:13, fontWeight:600, color:"var(--text-body)" }}>{q}</span>
                <span style={{ color:"var(--text-muted)", fontSize:12, flexShrink:0 }}>{open === i ? "▾" : "▸"}</span>
              </button>
              {open === i && <div style={{ fontSize:12, color:"var(--text-tertiary)", lineHeight:1.6, padding:"0 0 12px" }}>{a}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [state, dispatch] = useReducer(reducer, null, () => normalizeState(load() || defaultState()));

  // Refresh the module-level method views from state before any child renders (see Constants).
  // Fall back rather than dereference state directly: this block runs on every render before any
  // child, so a throw here unmounts the entire tree. normalizeState should already guarantee both
  // arrays, but this is the last line of defence for anything that bypasses the reducer — a
  // hand-patched vault, a malformed imported backup, or a future code path that sets state directly.
  METHODS = (state.methods && state.methods.length) ? state.methods : DEFAULT_METHODS;
  CATEGORIES = (state.categories && state.categories.length) ? state.categories : DEFAULT_CATEGORIES;
  METHOD_COLOR = Object.fromEntries(METHODS.map(m => [m.id, m.color]));
  METHOD_NAME = Object.fromEntries(METHODS.map(m => [m.id, m.name]));
  CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  const [tab, setTab] = useState("week");
  const [activeWeek, setActiveWeek] = useState(1);
  const [showEntryFor, setShowEntryFor] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // { kind:"entry"|"credit", data, weekIndex } being edited, or null
  const [showAddPin, setShowAddPin] = useState(false);
  const [editPin, setEditPin] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showBackup, setShowBackup] = useState(false); // export-account modal
  const [showImportAcct, setShowImportAcct] = useState(false); // import-account modal
  // "Last backed up" readout for Settings — refreshed when the export modal closes, since
  // crypto.js has already written LAST_BACKUP_KEY by then (it happens as part of the export).
  const [lastBackup, setLastBackup] = useState(() => { try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; } });
  const [confirmWipe, setConfirmWipe] = useState(false); // two-step guard on the "erase all data" button
  const [showCustomise, setShowCustomise] = useState(false); // appearance / payment types / categories modal
  const [showReconcile, setShowReconcile] = useState(false); // bank-statement reconciliation modal
  const [reconcileWith, setReconcileWith] = useState(null);  // a saved statement's method id, to open straight into it
  // When the spend sheet is opened FROM reconciliation it may be editing something in a finished
  // period, which the viewingPast routers below can't express — they only know about the one
  // period being viewed. This carries that period explicitly; undefined means "not from there".
  const [reconTarget, setReconTarget] = useState(undefined);
  const [entryPrefill, setEntryPrefill] = useState(null);
  // The most recently deleted entry/credit (or split pair), kept verbatim so Undo can restore it
  // exactly. Global (not per-week/tab) and not persisted — survives navigation, clears on reload.
  const [lastDeleted, setLastDeleted] = useState(null); // {kind:"entry",entry} | {kind:"credit",credit} | {kind:"split",your,their} | {kind:"pin",pin} | {kind:"pinSkip",pinId,occKey}
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
      now.setHours(0,0,0,0);
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
    if (meta) meta.content = theme === "light" ? "#f5efdf" : "#030712";
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
  // periodData is either live state (normalised) or an archived month, which stores a smaller
  // shape and never gets normalizeState applied. Guard all three collections here so every
  // downstream consumer of effectiveData — including SummaryView, which is handed it wholesale —
  // can treat them as always present regardless of how old the archive is.
  const periodEntries = periodData.entries || [];
  const periodPins = periodData.pins || [];
  const pinEntries = expandScheduledPins(periodPins, weeks);
  const effectiveData = {
    ...periodData,
    entries: [...periodEntries, ...pinEntries],
    pins: periodPins.filter(p => !isScheduledPin(p)),
    credits: periodData.credits || [],
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
  function getRebalancedBudgets(weeks, entries, weeklyBudget, credits) {
    const N = weeks.length;
    const dailyRate = weeklyBudget / 7;
    const spend = weeks.map(w => {
      const gross = entries.filter(e => e.weekIndex === w.index && e.type === "personal").reduce((s,e)=>s+e.amount,0);
      const wCredits = (credits || []).filter(c => c.weekIndex === w.index).reduce((s,c)=>s+c.amount,0);
      return gross - wCredits;
    });
    const reduction = new Array(N).fill(0); // budget cut carried into each week from earlier overspends
    const budgets = {};
    weeks.forEach((w, i) => {
      const eff = Math.max(dailyRate * w.days.length - reduction[i], 0);
      budgets[w.index] = eff;
      const over = Math.max(spend[i] - eff, 0);
      const daysLeft = weeks.slice(i + 1).reduce((s, x) => s + x.days.length, 0);
      if (over > 0 && daysLeft > 0) {
        for (let j = i + 1; j < N; j++) reduction[j] += over * (weeks[j].days.length / daysLeft);
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

  const rebalancedBudgets = getRebalancedBudgets(weeks, effectiveData.entries, effectiveData.weeklyBudget, effectiveData.credits);

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
  const currentWeekCredits = currentWeekObj ? (effectiveData.credits || []).filter(c=>c.weekIndex===currentWeekObj.index).reduce((s,c)=>s+c.amount,0) : 0;
  const weekRemaining = Math.max(currentWeekBudget - currentWeekSpent + currentWeekCredits, 0);
  const dailyFromWeek = daysLeftInWeek > 0 ? weekRemaining / daysLeftInWeek : 0;
  const dailyFromMonth = daysLeftInMonth > 0 ? remaining / daysLeftInMonth : 0;

  const remainColor = remaining < 0 ? "#ef4444" : remaining < effectiveData.monthlyBudget * 0.15 ? "#f97316" : "#22c55e";

  // Index of the archive currently being viewed (last entry in history is the most recent past period)
  const mostRecentArchiveIndex = (state.monthHistory && state.monthHistory.length > 0) ? state.monthHistory.length - 1 : null;

  // Mutation routers: while viewing a past period, edits write back into that archive slot
  // rather than live state. Everything else in the app calls these instead of dispatch directly,
  // so WeekPanel, PinCard, etc. don't need to know which mode they're in.
  const reconOp = (kind, op, payload) => dispatch({ type:"RECONCILE_APPLY", ops:[{ archiveIndex: reconTarget, kind, op, ...payload }] });

  function addEntry(entry) {
    if (reconTarget !== undefined) return reconOp("entry", "add", { entry });
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "add", archiveIndex: viewingPastIndex, entry });
    else dispatch({ type: "ADD_ENTRY", entry });
  }
  function delEntry(id) {
    if (reconTarget !== undefined) return reconOp("entry", "del", { id });
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "del", archiveIndex: viewingPastIndex, id });
    else dispatch({ type: "DEL_ENTRY", id });
  }
  function addCredit(credit) {
    if (reconTarget !== undefined) return reconOp("credit", "add", { credit });
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "add", archiveIndex: viewingPastIndex, credit });
    else dispatch({ type: "ADD_CREDIT", credit });
  }
  function delCredit(id) {
    if (reconTarget !== undefined) return reconOp("credit", "del", { id });
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "del", archiveIndex: viewingPastIndex, id });
    else dispatch({ type: "DEL_CREDIT", id });
  }
  function updEntry(entry) {
    if (reconTarget !== undefined) return reconOp("entry", "upd", { entry });
    if (viewingPast) dispatch({ type: "EDIT_PAST_ENTRY", op: "upd", archiveIndex: viewingPastIndex, entry });
    else dispatch({ type: "UPD_ENTRY", entry });
  }
  function updCredit(credit) {
    if (reconTarget !== undefined) return reconOp("credit", "upd", { credit });
    if (viewingPast) dispatch({ type: "EDIT_PAST_CREDIT", op: "upd", archiveIndex: viewingPastIndex, credit });
    else dispatch({ type: "UPD_CREDIT", credit });
  }

  // Opens the edit sheet for a tapped entry. A split (any half) opens the *whole* group in one
  // unified editor — collecting both halves by splitGroupId — so its description, category, payment
  // type and amounts are edited in a single place. Non-split entries edit as themselves. Used by
  // both the week list and the Summary → By Category drill-down.
  function openEditEntry(entry) {
    if (entry.splitGroupId) {
      const group = effectiveData.entries.filter(e => e.splitGroupId === entry.splitGroupId);
      setEditTarget({ kind: "split", weekIndex: entry.weekIndex, data: {
        groupId: entry.splitGroupId,
        your: group.find(e => e.type === "personal") || null,
        their: group.find(e => e.type === "excluded") || null,
      } });
    } else {
      setEditTarget({ kind: "entry", data: entry, weekIndex: entry.weekIndex });
    }
  }

  // Opens the edit sheet for a tapped credit. Used by both the week list and the Summary →
  // Gross vs net → Credits drill-down.
  function openEditCredit(credit) {
    setEditTarget({ kind: "credit", data: credit, weekIndex: credit.weekIndex });
  }

  // Per-occurrence overrides for a scheduled pin, stored on the pin itself so the recurring pattern
  // is untouched: `skips` (occurrences to omit), `moves` (occKey → week), `orders` (occKey → order).
  // Keyed by a week-independent occKey (see occKeyOf/expandScheduledPins), so a move/skip only ever
  // affects this cycle's dated occurrence. Live period only — pins are read-only while viewing past.
  const patchPin = (pinId, fn) => {
    const p = state.pins.find(x => x.id === pinId);
    if (p) dispatch({ type: "UPD_PIN", pin: fn(p) });
  };
  const skipPinOccurrence = (pinId, occKey) => patchPin(pinId, p => ({ ...p, skips: [...(p.skips || []), occKey] }));
  const unskipPinOccurrence = (pinId, occKey) => patchPin(pinId, p => ({ ...p, skips: (p.skips || []).filter(k => k !== occKey) }));
  const movePinOccurrence = (pinId, occKey, weekIndex) => patchPin(pinId, p => ({ ...p, moves: { ...(p.moves || {}), [occKey]: weekIndex } }));
  const reorderPinOccurrence = (pinId, occKey, order) => patchPin(pinId, p => ({ ...p, orders: { ...(p.orders || {}), [occKey]: order } }));

  // Restores the most recently deleted entry/credit/pin (or split pair, or a skipped pin occurrence)
  // verbatim — same id/order/weekIndex, so it reappears where it was. Global, not per-week, so it
  // survives switching tabs/weeks; plain useState (not persisted `state`) so it clears on reload.
  function undoLastDeleted() {
    if (!lastDeleted) return;
    if (lastDeleted.kind === "entry") addEntry(lastDeleted.entry);
    else if (lastDeleted.kind === "credit") addCredit(lastDeleted.credit);
    else if (lastDeleted.kind === "pin") dispatch({ type: "ADD_PIN", pin: lastDeleted.pin });
    else if (lastDeleted.kind === "pinSkip") unskipPinOccurrence(lastDeleted.pinId, lastDeleted.occKey);
    else { if (lastDeleted.your) addEntry(lastDeleted.your); if (lastDeleted.their) addEntry(lastDeleted.their); }
    setLastDeleted(null);
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
        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
          <div style={S.headerRight}>
            <div style={{ ...S.remaining, color: remainColor }}>{fmt(remaining)}</div>
            <div style={S.remainLabel}>left</div>
          </div>
          <button style={S.headerGearBtn} aria-label="Settings" onClick={() => { setTab("settings"); setHelpNonce(0); }}>⚙</button>
        </div>
      </div>

      {/* Floating help button — jumps to Settings' "How it works" and opens it. Bumping the
          nonce re-fires HelpCard's focus effect even when Settings is already showing. */}
      <button style={S.helpFab} aria-label="Help" onClick={() => { setTab("settings"); setHelpNonce(n => n + 1); }}>?</button>

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
            <button style={S.hintBtn} onClick={() => { dispatch({ type:"SETTINGS", patch:{ helpHintSeen: true } }); setTab("settings"); setHelpNonce(n => n + 1); }}>Show me</button>
            <button style={S.hintDismiss} aria-label="Dismiss" onClick={() => dispatch({ type:"SETTINGS", patch:{ helpHintSeen: true } })}>✕</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {[["week","Week"],["pins","Pinned"],["savings","Savings"],["summary","Summary"]].map(([k,l]) => (
          <button key={k} style={{ ...S.tab, ...(tab===k ? S.tabActive : {}) }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* WEEK VIEW */}
      {tab === "week" && (
        <div style={{ padding:"12px 16px 80px" }}>
          {/* Period navigator. The whole app already renders an archived period correctly — periodData
              swaps the data layer and each period rebuilds its own weeks and budget — so this only
              changes WHICH period is on screen. Budgeting stays per-period throughout. The sequence
              runs oldest archive → newest archive → live (viewingPastIndex null). */}
          {(state.monthHistory || []).length > 0 && (() => {
            const n = state.monthHistory.length;
            const canOlder = viewingPastIndex === null ? n > 0 : viewingPastIndex > 0;
            const canNewer = viewingPastIndex !== null;
            const goOlder = () => setViewingPastIndex(viewingPastIndex === null ? n - 1 : viewingPastIndex - 1);
            const goNewer = () => setViewingPastIndex(viewingPastIndex === n - 1 ? null : viewingPastIndex + 1);
            return (
              <div style={S.periodNav}>
                <button style={{ ...S.periodNavBtn, ...(canOlder ? {} : S.periodNavBtnOff) }} disabled={!canOlder}
                  aria-label="Earlier period" onClick={goOlder}>◀</button>
                <div style={{ textAlign:"center", lineHeight:1.2 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--text-heading)" }}>{periodData.monthLabel}</div>
                  <div style={{ fontSize:10, color:"var(--text-muted)" }}>{viewingPast ? "finished period" : "current period"}</div>
                </div>
                <button style={{ ...S.periodNavBtn, ...(canNewer ? {} : S.periodNavBtnOff) }} disabled={!canNewer}
                  aria-label="Later period" onClick={goNewer}>▶</button>
              </div>
            );
          })()}
          <div style={S.weekNav}>
            {/* The current calendar week keeps a light outline so it's identifiable even when
                another week is selected; the selected pill's solid fill takes precedence. */}
            {weeks.map(w => (
              <button key={w.index} style={{ ...S.weekPill, ...(currentWeekObj && w.index === currentWeekObj.index ? S.weekPillCurrent : {}), ...(activeWeek===w.index ? S.weekPillActive : {}) }} onClick={() => setActiveWeek(w.index)}>W{w.index}</button>
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
                <div style={{ fontSize:20, fontWeight:700, color: dailyFromMonth < 20 ? "#ef4444" : "var(--text-tertiary)" }}>{fmt(dailyFromMonth)}</div>
                <div style={S.dailySub}>{daysLeftInMonth}d left</div>
              </div>
            </div>
          )}

          {weeks.filter(w => w.index === activeWeek).map(week => (
            <WeekPanel key={week.index} week={week} weeks={weeks} entries={effectiveData.entries.filter(e => e.weekIndex === week.index)} credits={(effectiveData.credits || []).filter(c => c.weekIndex === week.index)} weeklyBudget={rebalancedBudgets[week.index] ?? effectiveData.weeklyBudget} isLastWeek={week.index === weeks.length} categories={state.categories} onAddCategory={cat => dispatch({ type:"SETTINGS", patch:{ categories: [...state.categories, cat] } })} onAddEntry={() => setShowEntryFor(week.index)} onDelEntry={delEntry} onDelCredit={delCredit} onEditEntry={openEditEntry} onEditCredit={openEditCredit} onUpdEntry={updEntry} onUpdCredit={updCredit} onCapture={setLastDeleted} lastDeleted={lastDeleted} onUndo={undoLastDeleted} onSkipPin={viewingPast ? null : skipPinOccurrence} onMovePin={viewingPast ? null : movePinOccurrence} onReorderPin={viewingPast ? null : reorderPinOccurrence} />
          ))}
        </div>
      )}

      {/* PINS */}
      {tab === "pins" && (
        <div style={{ padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={S.sectionTitle}>Fixed costs</div>
            <div style={{ display:"flex", gap:6 }}>
              {lastDeleted && lastDeleted.kind === "pin" && <button style={S.editToggle} onClick={undoLastDeleted}>Undo</button>}
              <button style={S.addBtn} onClick={() => setShowAddPin(true)}>+ Pin</button>
            </div>
          </div>
          <div style={S.pinGrid}>
            {state.pins.length === 0 ? <div style={S.empty}>No pinned costs</div> : state.pins.map(p => <PinCard key={p.id} pin={p} onEdit={() => setEditPin(p)} onDelete={() => { setLastDeleted({ kind: "pin", pin: p }); dispatch({ type: "DEL_PIN", id: p.id }); }} />)}
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
          // Scheduled pins are counted as their per-occurrence week entries (so a weekly pin
          // counts once per week), matching how the live period and week log count them.
          // Bounds use the payday rule the month was archived under, not today's setting.
          const { start, end } = periodBounds(m.payYear, m.payMonth, m.paydayKind || "last-working", m.paydayDay);
          const mWeeks = buildWeeks(start, end);
          // Archives are never run through normalizeState, so guard their collections the same
          // way `credits` already is below — an older or imported archive may omit them entirely.
          const mEntries = m.entries || [];
          const mPins = m.pins || [];
          const pinEntries = expandScheduledPins(mPins, mWeeks);
          const spentEntries = [...mEntries, ...pinEntries].filter(e => e.type === "personal").reduce((s,e)=>s+e.amount,0);
          const spentPins = mPins.filter(p => !isScheduledPin(p) && p.type !== "business" && p.type !== "excluded").reduce((s,p)=>s+(p.amount||0),0);
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
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"20px", marginBottom:12 }}>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:4, textTransform:"uppercase" }}>Total saved</div>
            <div style={{ fontSize:36, fontWeight:800, color: totalSaved >= 0 ? "#22c55e" : "#f87171", marginBottom:8 }}>{totalSaved < 0 ? "-" : ""}{fmt(totalSaved)}</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.5 }}>Leftover budget carried over from completed months. {state.monthLabel}'s leftover is added to this once the month ends.</div>
          </div>

          {/* Current month, in progress — deliberately NOT part of the total yet */}
          {!viewingPast && (
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"12px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, color:"var(--text-body)", fontWeight:600 }}>{state.monthLabel} <span style={{ color:"var(--text-secondary)", fontWeight:400 }}>· in progress</span></div>
                <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>Adds to savings when {state.monthLabel} ends</div>
              </div>
              <div style={{ fontSize:18, fontWeight:700, color: remaining >= 0 ? "var(--text-tertiary)" : "#f87171" }}>{signed(remaining)}</div>
            </div>
          )}

          {/* Month-by-month history */}
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Month by month</div>
            {rows.length === 0 ? (
              <div style={{ color:"var(--text-muted)", fontSize:13, padding:"4px 0", lineHeight:1.5 }}>No completed months yet. Your first month's leftover shows up here once {state.monthLabel} ends.</div>
            ) : rows.map((r,i) => (
              <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom: i < rows.length-1 ? "1px solid var(--border)" : "none" }}>
                <div>
                  <div style={{ fontSize:13, color:"var(--text-primary)", fontWeight:600 }}>{r.label}</div>
                  <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:1 }}>{fmt(r.spent)} spent of {fmt(r.budget)}</div>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color: r.saved >= 0 ? "#22c55e" : "#f87171" }}>{signed(r.saved)}</div>
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
          onReconcile={(methodId) => { setReconcileWith(methodId || null); setShowReconcile(true); }}
          statements={state.statements || []}
          onEditEntry={openEditEntry}
          onEditCredit={openEditCredit}
          onGoToWeek={(idx) => { setActiveWeek(idx); setTab("week"); }}
        />
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div style={{ padding:"12px 16px" }}>
          <HelpCard focus={helpNonce} />

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:2, textTransform:"uppercase" }}>Customisation</div>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:10 }}>Appearance, payment types &amp; spending categories</div>
            <button onClick={() => setShowCustomise(true)}
              style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%" }}>
              🎨 Open customisation
            </button>
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Budget</div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>Monthly budget (£)</label>
              <input key={`monthlyBudget-${state.monthlyBudget}`} style={S.input} type="number" defaultValue={state.monthlyBudget} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) dispatch({ type:"SETTINGS", patch:{ monthlyBudget: v, weeklyBudget: Math.round((v / weeksInPeriod) * 100) / 100 } }); }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>Weekly budget (£)</label>
              <input key={`weeklyBudget-${state.weeklyBudget}`} style={S.input} type="number" defaultValue={state.weeklyBudget} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) dispatch({ type:"SETTINGS", patch:{ weeklyBudget: v, monthlyBudget: Math.round((v * weeksInPeriod) * 100) / 100 } }); }} />
            </div>
            <div style={{ fontSize:11, color:"var(--text-muted)" }}>Monthly and weekly are linked across this {periodDays}-day period — changing one recalculates the other.</div>
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Pay period</div>
            <div style={{ fontSize:13, color:"var(--text-body)", marginBottom:10 }}>
              Currently tracking <strong style={{ color:"var(--text-heading)" }}>{state.monthLabel}</strong>. A period starts on the previous month's payday and runs until this period's own payday — the tracker switches automatically the moment that payday arrives.
            </div>
            {(() => {
              const kind = state.paydayKind || "last-working";
              const kindBtn = (on) => ({ background: on ? "var(--surface-2)":"var(--surface)", border:`1px solid ${on?"var(--border-strong)":"var(--border)"}`, borderRadius:8, color: on ? "var(--text-heading)" : "var(--text-muted)", padding:"9px 4px", fontSize:12, fontWeight:600, cursor:"pointer" });
              return (
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>Payday</label>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                    {[["last-working","Last working day"],["last-friday","Last Friday"],["last-calendar","Last calendar day"],["fixed","Fixed date"]].map(([v,l]) => (
                      <button key={v} style={kindBtn(kind === v)} onClick={() => dispatch({ type:"SETTINGS", patch:{ paydayKind: v } })}>{l}</button>
                    ))}
                  </div>
                  {kind === "fixed" && (
                    <div style={{ marginBottom:8 }}>
                      <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>Day of the month</label>
                      <input key={`payday-${state.paydayDay}`} style={{ ...S.input, marginBottom:0 }} type="number" inputMode="numeric" min={1} max={31} defaultValue={state.paydayDay || 25} onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 31) dispatch({ type:"SETTINGS", patch:{ paydayDay: v } }); }} />
                    </div>
                  )}
                  <div style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.5 }}>Payday defines when a period starts and ends. Fixed dates falling on a weekend move to the working day before. Changing this redraws the current period's weeks — and if it moves the payday into the past, the tracker rolls into the next period, as it would on any payday.</div>
                </div>
              );
            })()}
            {mostRecentArchiveIndex !== null ? (
              viewingPast ? (
                <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%" }} onClick={() => setViewingPastIndex(null)}>
                  ← Return to current period ({state.monthLabel})
                </button>
              ) : (
                <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%" }} onClick={() => setViewingPastIndex(mostRecentArchiveIndex)}>
                  ← Go back to {state.monthHistory[mostRecentArchiveIndex].monthLabel}
                </button>
              )
            ) : (
              <div style={{ fontSize:12, color:"var(--text-muted)" }}>No previous period to go back to yet.</div>
            )}
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Move to another device</div>
            <div style={{ fontSize:13, color:"var(--text-body)", marginBottom:10, lineHeight:1.5 }}>Each browser keeps its own separate data — so Safari, Chrome and the home-screen app each start fresh. Export your account here, then import it in the other browser or on a new phone to carry everything across.</div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={{ ...S.btn, background:"#0369a1", flex:1 }} onClick={() => setShowBackup(true)}>Export account</button>
              <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }} onClick={() => setShowImportAcct(true)}>Import account</button>
            </div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:8 }}>{lastBackup ? `Last backed up: ${relativeTime(lastBackup)}` : "Never backed up"}</div>
          </div>

          <div style={S.settingsCard}>
            <div style={{ fontSize:11, fontWeight:600, color:"#f87171", marginBottom:10, textTransform:"uppercase" }}>Reset</div>
            <div style={{ fontSize:13, color:"var(--text-body)", marginBottom:10, lineHeight:1.5 }}>Erase everything on this device — budget, transactions, history and your passphrase — and start over from setup. This can't be undone.</div>
            {!confirmWipe ? (
              <button style={{ ...S.btn, background:"var(--danger-soft-bg)", border:"1px solid var(--danger-soft-border)", color:"var(--danger-soft-text)", width:"100%" }} onClick={() => setConfirmWipe(true)}>Reset app &amp; erase all data</button>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }} onClick={() => setConfirmWipe(false)}>Cancel</button>
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
      {/* Reconciliation spans every period at once, so it gets the whole state and routes its
          edits through reconTarget rather than the viewingPast routers above. Mounted BEFORE the
          spend sheet so that sheet paints on top when a row here opens it. */}
      {showReconcile && <ReconcileModal state={state} periods={reconcilePeriods(state)} openWith={reconcileWith}
        onEditItem={(c) => {
          const ref = c.ref;
          if (c.kind === "pin") { const pin = state.pins.find(x => x.id === ref.pinId); if (pin) setEditPin(pin); return; }
          setReconTarget(ref.archiveIndex);
          if (c.kind === "split") setEditTarget({ kind:"split", weekIndex: c.weekIndex, data: { groupId: ref.groupId, your: ref.your, their: ref.their } });
          else if (c.kind === "credit") setEditTarget({ kind:"credit", data: ref.credit, weekIndex: ref.credit.weekIndex });
          else setEditTarget({ kind:"entry", data: ref.entry, weekIndex: ref.entry.weekIndex });
        }}
        onDeleteItem={(c) => {
          // The op carries its own period, so this needs no reconTarget. Captured for Undo first,
          // exactly as a delete from the week log is.
          const ref = c.ref, ai = ref.archiveIndex;
          if (c.kind === "pin") {
            // Skips this month's charge and leaves the recurring cost alone — the same action,
            // and the same undo, as skipping it from the week log.
            setLastDeleted({ kind:"pinSkip", pinId: ref.pinId, occKey: ref.occKey });
            dispatch({ type:"RECONCILE_APPLY", ops:[{ archiveIndex: ai, kind:"pin", op:"skip", pinId: ref.pinId, occKey: ref.occKey }] });
            return;
          }
          if (c.kind === "split") {
            setLastDeleted({ kind:"split", your: ref.your, their: ref.their });
            dispatch({ type:"RECONCILE_APPLY", ops: [ref.your, ref.their].filter(Boolean).map(e => ({ archiveIndex: ai, kind:"entry", op:"del", id: e.id })) });
          } else if (c.kind === "credit") {
            setLastDeleted({ kind:"credit", credit: ref.credit });
            dispatch({ type:"RECONCILE_APPLY", ops:[{ archiveIndex: ai, kind:"credit", op:"del", id: ref.credit.id }] });
          } else {
            setLastDeleted({ kind:"entry", entry: ref.entry });
            dispatch({ type:"RECONCILE_APPLY", ops:[{ archiveIndex: ai, kind:"entry", op:"del", id: ref.entry.id }] });
          }
        }}
        onAddFromRow={(row, at, methodId) => {
          setReconTarget(at.archiveIndex);
          setEntryPrefill({ amount: row.amount, label: row.description, day: row.date, method: methodId,
                            type: row.direction === "credit" ? "credit" : "personal" });
          setShowEntryFor(at.weekIndex);
        }}
        onSaveStatement={st => dispatch({ type:"SETTINGS", patch:{ statements: [
          // One statement per card: uploading again updates that card's rather than stacking copies.
          ...(state.statements || []).filter(x => x.method !== st.method),
          { method: st.method, rows: st.rows, from: st.span ? st.span.from : null, to: st.span ? st.span.to : null, savedAt: new Date().toISOString() },
        ] } })}
        onForgetStatement={methodId => dispatch({ type:"SETTINGS", patch:{ statements: (state.statements || []).filter(x => x.method !== methodId) } })}
        onClose={() => { setShowReconcile(false); setReconcileWith(null); setReconTarget(undefined); }} />}

      {(showEntryFor !== null || editTarget) && <EntryModal weekIndex={editTarget ? editTarget.weekIndex : showEntryFor} weeks={weeks} edit={editTarget} defaultMethod={state.lastMethod || state.methods[0].id} categories={state.categories} categoryPrompt={state.categoryPrompt} descriptionPrompt={state.descriptionPrompt} onAddCategory={cat => dispatch({ type:"SETTINGS", patch:{ categories: [...state.categories, cat] } })} prefill={entryPrefill} onSave={addEntry} onSaveCredit={addCredit} onUpdate={updEntry} onUpdateCredit={updCredit} onDeleteEntry={delEntry} onClose={() => { setShowEntryFor(null); setEditTarget(null); setEntryPrefill(null); setReconTarget(undefined); }} />}
      {(showAddPin || editPin) && <PinModal pin={editPin} categories={state.categories} onAddCategory={cat => dispatch({ type:"SETTINGS", patch:{ categories: [...state.categories, cat] } })} onSave={pin => { if (editPin) dispatch({ type: "UPD_PIN", pin }); else dispatch({ type: "ADD_PIN", pin }); setShowAddPin(false); setEditPin(null); }} onClose={() => { setShowAddPin(false); setEditPin(null); }} />}
      {showExport && <ExportModal state={effectiveData} weeks={weeks} rebalancedBudgets={rebalancedBudgets} totalSpent={totalSpent} remaining={remaining} totalCredits={totalCredits} methodTotals={methodTotals} onClose={() => setShowExport(false)} />}
      {showBackup && <BackupModal onClose={() => { setShowBackup(false); try { setLastBackup(localStorage.getItem(LAST_BACKUP_KEY)); } catch (e) { /* ignore */ } }} />}
      {showImportAcct && <ImportBackupModal onClose={() => setShowImportAcct(false)} />}
      {showCustomise && <CustomiseModal state={state} dispatch={dispatch} onClose={() => setShowCustomise(false)} />}
    </div>
  );
}

// ─── Week Panel ───────────────────────────────────────────────────────────────
function WeekPanel({ week, weeks, entries, credits, weeklyBudget, isLastWeek, categories, onAddCategory, onAddEntry, onDelEntry, onDelCredit, onEditEntry, onEditCredit, onUpdEntry, onUpdCredit, onCapture, lastDeleted, onUndo, onSkipPin, onMovePin, onReorderPin }) {
  // Scheduled-pin occurrences can be skipped/moved/reordered per-occurrence only in the live period
  // (these handlers are null while viewing a past period, keeping archived pins read-only).
  const pinEditable = !!onSkipPin;
  const personal = entries.filter(e => e.type === "personal");
  const spent = personal.reduce((s, e) => s + e.amount, 0);
  const creditsTotal = credits.reduce((s, c) => s + c.amount, 0);
  const netSpent = spent - creditsTotal;
  const over = netSpent - weeklyBudget;
  const pct = weeklyBudget > 0 ? Math.min((netSpent / weeklyBudget) * 100, 100) : 0;

  const [editMode, setEditMode] = useState(false);
  const [methodFilter, setMethodFilter] = useState(null); // payment-type id to show only, or null for all
  const [selected, setSelected] = useState(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showCategorize, setShowCategorize] = useState(false);
  const [dragId, setDragId] = useState(null);         // id of the unit being dragged, or null
  const [dragList, setDragList] = useState(null);     // working unit order during a drag, else null
  const dragIdRef = useRef(null);
  const dragListRef = useRef(null);
  const rowRefs = useRef({});                          // unit.id -> row DOM node, for hit-testing during drag

  // One "unit" per rendered row: a solo entry, a whole split pair, or a credit. Entries and credits
  // are merged into a single list, so credits interleave with spend chronologically instead of being
  // pinned to the bottom. A split's two halves share one order value (and one day), so the pair
  // sorts as a unit.
  const units = [];
  const seenSplits = new Set();
  for (const e of entries) {
    if (e.splitGroupId) {
      if (seenSplits.has(e.splitGroupId)) continue;
      seenSplits.add(e.splitGroupId);
      units.push({ kind: "split", id: e.splitGroupId, order: effOrder(e), day: e.day || null, group: entries.filter(x => x.splitGroupId === e.splitGroupId) });
    } else {
      units.push({ kind: "single", id: e.id, order: effOrder(e), day: e.day || null, entry: e, pinned: !!e.pinned });
    }
  }
  for (const c of credits) units.push({ kind: "credit", id: c.id, order: effOrder(c), day: c.day || null, credit: c });
  // Newest first, as before — but the spend day is now the primary key, so the list reads as a run
  // of days rather than one undifferentiated column. Undated rows (everything logged before days
  // existed, and anything whose day was dropped by a cross-week move) sink to a trailing block:
  // they can't be slotted between two dated rows without inventing a day they never had.
  // Within a day, `order` still decides, so hand-arranged positions survive untouched.
  units.sort((a, b) => {
    if (a.day && b.day) { if (a.day !== b.day) return a.day < b.day ? 1 : -1; }
    else if (a.day || b.day) return a.day ? -1 : 1;
    return b.order - a.order;
  });

  // Payment types actually used by this week's entries (any classification). The filter is only
  // worth offering when there's more than one — otherwise it's noise. Kept in state.methods order.
  const usedMethods = METHODS.filter(m => entries.some(e => e.method === m.id));
  // If the active filter's payment type is no longer present this week (e.g. its last txn was
  // moved/deleted, or the week was switched), drop back to showing everything.
  useEffect(() => {
    if (methodFilter && !usedMethods.some(m => m.id === methodFilter)) setMethodFilter(null);
  }, [methodFilter, usedMethods.map(m => m.id).join(",")]);

  // A filter keeps every charge on the chosen card — personal, work and both halves of a split
  // (all of which hit the statement) — and hides credits (income, not a card charge). This mirrors
  // the Summary's "gross · as charged" view, so the running total below reconciles with a statement.
  const matchesFilter = (u) => {
    if (u.kind === "credit") return false;
    if (u.kind === "split") return u.group.some(e => e.method === methodFilter);
    return u.entry.method === methodFilter;
  };
  const filteredUnits = methodFilter ? units.filter(matchesFilter) : units;
  // Gross total of the visible charges (both split halves count, as both appear on the statement).
  const filterTotal = methodFilter
    ? filteredUnits.reduce((s, u) => s + (u.kind === "split" ? u.group.reduce((g, e) => g + e.amount, 0) : u.entry.amount), 0)
    : 0;

  // Credits (and any non-personal entry) can't carry a category — matches bulkCategorize's own
  // skip rule below — so the Categorise button should only appear when the selection actually has
  // something categorisable, otherwise picking a category silently does nothing.
  const categorisableSelectedCount = units.filter(u => selected.has(u.id) && (
    (u.kind === "single" && !u.pinned && u.entry.type === "personal") || u.kind === "split"
  )).length;

  // During a drag, render the live working order; otherwise the (optionally filtered) sorted order.
  // Dragging only happens in edit mode, which clears any filter, so the two never overlap.
  const renderUnits = dragList || filteredUnits;

  // Deleting one half of a split removes both halves, since a lone remainder is meaningless.
  // Captures the full object(s) via onCapture before deleting, so Undo can restore them —
  // DEL_ENTRY/DEL_CREDIT only take an id and the object is gone from state once deleted.
  function handleDelete(entry) {
    if (entry.splitGroupId) {
      const group = entries.filter(e => e.splitGroupId === entry.splitGroupId);
      onCapture({ kind: "split", your: group.find(e => e.type === "personal") || null, their: group.find(e => e.type === "excluded") || null });
      group.forEach(e => onDelEntry(e.id));
    } else {
      onCapture({ kind: "entry", entry });
      onDelEntry(entry.id);
    }
  }

  function toggleSelect(id) {
    setConfirmBulk(false);
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function exitEdit() { setEditMode(false); setSelected(new Set()); setConfirmBulk(false); setShowMove(false); setShowCategorize(false); }
  // Entering edit mode clears any active filter — reorder redistributes order values across the
  // rendered rows, which a partial (filtered) list would corrupt, so the two are kept exclusive.
  function enterEdit() { setMethodFilter(null); setEditMode(true); }

  // Bulk delete every selected unit, expanding split groups to both halves (like handleDelete).
  // Only captures for Undo when exactly one unit was selected — a bulk delete of many has no
  // single sensible "last deleted" for one Undo button to restore.
  function bulkDelete() {
    const toDelete = units.filter(u => selected.has(u.id));
    if (toDelete.length === 1) {
      const u = toDelete[0];
      if (u.pinned) onCapture({ kind: "pinSkip", pinId: u.entry.pinId, occKey: u.entry.occKey });
      else if (u.kind === "credit") onCapture({ kind: "credit", credit: u.credit });
      else if (u.kind === "single") onCapture({ kind: "entry", entry: u.entry });
      else onCapture({ kind: "split", your: u.group.find(e => e.type === "personal") || null, their: u.group.find(e => e.type === "excluded") || null });
    }
    toDelete.forEach(u => {
      // A pinned occurrence isn't a real entry — "deleting" it skips just this occurrence.
      if (u.pinned) onSkipPin(u.entry.pinId, u.entry.occKey);
      else if (u.kind === "credit") onDelCredit(u.credit.id);
      else if (u.kind === "single") onDelEntry(u.entry.id);
      else u.group.forEach(half => onDelEntry(half.id));
    });
    exitEdit();
  }

  // Bulk move every selected unit to a different week (reusing UPD_ENTRY/UPD_CREDIT, same as drag reorder).
  // The day is DROPPED on the way: a row's day has to sit inside the week it's filed under, and a
  // day from the old week never does. Moving a spend to another week is a statement that you no
  // longer know which day it happened, so it lands undated rather than under a fabricated heading.
  // (This is exactly the drift that makes the older `date` field useless as a spend date — it was
  // left alone by moves, so it can point outside its own week. Clearing is what stops it recurring.)
  function bulkMove(newWeek) {
    units.forEach(u => {
      if (!selected.has(u.id)) return;
      // A pinned occurrence moves via a per-occurrence week override, not by mutating a real entry.
      if (u.pinned) onMovePin(u.entry.pinId, u.entry.occKey, newWeek);
      else if (u.kind === "credit") onUpdCredit({ ...u.credit, weekIndex: newWeek, day: undefined });
      else if (u.kind === "single") onUpdEntry({ ...u.entry, weekIndex: newWeek, day: undefined });
      else u.group.forEach(half => onUpdEntry({ ...half, weekIndex: newWeek, day: undefined }));
    });
    setShowMove(false);
    exitEdit();
  }

  // Bulk-assign a category to every selected personal entry (and a split's personal half).
  // Credits and non-personal entries are silently skipped, matching EntryModal's own rule that
  // only personal spends can carry a category.
  function bulkCategorize(catId) {
    units.forEach(u => {
      if (!selected.has(u.id)) return;
      // Pins keep their category on the Pinned tab — not editable via the week-log bulk action.
      if (u.kind === "single" && !u.pinned && u.entry.type === "personal") onUpdEntry({ ...u.entry, category: catId || undefined });
      else if (u.kind === "split") {
        const your = u.group.find(e => e.type === "personal");
        if (your) onUpdEntry({ ...your, category: catId || undefined });
      }
    });
    setShowCategorize(false);
    exitEdit();
  }

  // Persist a hand-reordered list: redistribute the units' existing order values to their new
  // positions (highest value = top). Reusing the existing value set keeps future-logged items —
  // which get a fresh, larger Date.now() — naturally on top. Split halves both take the group's value.
  function commitReorder(finalUnits, draggedId) {
    if (!finalUnits) return;
    // A row dropped into another day's block has to ADOPT that day, or the day-first sort simply
    // snaps it back where it came from the moment we re-render and the drag looks like it failed.
    // The day comes from the row above (you dropped it beneath that heading); at the very top there
    // is no row above, so the row below decides. Landing in the undated block clears the day.
    // Only the dragged row changes — every other row keeps the day it already had.
    const di = draggedId != null ? finalUnits.findIndex(u => u.id === draggedId) : -1;
    const dragged = di >= 0 ? finalUnits[di] : null;
    const adoptedDay = dragged ? (di > 0 ? finalUnits[di - 1].day : (finalUnits[1] ? finalUnits[1].day : dragged.day)) : null;
    const dayChanged = dragged && !dragged.pinned && (adoptedDay || null) !== (dragged.day || null);

    // Pinned occurrences reorder too (live period only) via a per-occurrence order override; they
    // share the same redistribution pool as entries/credits so positions interleave correctly.
    const movable = pinEditable ? finalUnits : finalUnits.filter(u => !u.pinned);
    const values = movable.map(u => u.order).sort((a, b) => b - a);
    movable.forEach((u, i) => {
      const newOrder = values[i];
      const isDragged = dayChanged && u.id === draggedId;
      if (u.order === newOrder && !isDragged) return;
      // A pin occurrence has no editable day (it's derived from the schedule), so only its order moves.
      if (u.pinned) onReorderPin(u.entry.pinId, u.entry.occKey, newOrder);
      else {
        const dayPatch = isDragged ? { day: adoptedDay || undefined } : {};
        if (u.kind === "credit") onUpdCredit({ ...u.credit, order: newOrder, ...dayPatch });
        else if (u.kind === "single") onUpdEntry({ ...u.entry, order: newOrder, ...dayPatch });
        else u.group.forEach(half => onUpdEntry({ ...half, order: newOrder, ...dayPatch }));
      }
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
      commitReorder(dragListRef.current, dragIdRef.current);
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

  // True when the unit at `i` opens a new day block — i.e. it's the first row, or its day differs
  // from the row above. Comparing against the rendered list (not the sorted one) means the headings
  // follow the live working order mid-drag, so a row dragged into another day shows the change as
  // it happens rather than only after the drop.
  function dayHeadingFor(list, i) {
    if (i === 0) return true;
    return (list[i].day || null) !== (list[i - 1].day || null);
  }

  // A day's spend: personal only, matching the gross figure the week header shows (work is
  // reimbursed, the "not yours" half of a split isn't yours, and credits are money in). Deliberately
  // NOT netted against credits — fmt() prints absolute values, so a day whose credits outweighed its
  // spend would render its negative total as a positive one. Days with no personal spend total zero
  // and the heading simply omits the figure rather than showing £0.00 against a lone credit row.
  function dayTotal(list, day) {
    return list.filter(u => (u.day || null) === (day || null)).reduce((s, u) => {
      if (u.kind === "credit") return s;
      if (u.kind === "split") return s + u.group.filter(e => e.type === "personal").reduce((g, e) => g + e.amount, 0);
      return s + (u.entry.type === "personal" ? u.entry.amount : 0);
    }, 0);
  }

  function renderUnitContent(unit) {
    if (unit.kind === "split") return (
      <SplitLine group={unit.group} onEdit={() => onEditEntry(unit.group[0])} onDel={() => handleDelete(unit.group[0])} hideDelete={editMode} />
    );
    if (unit.kind === "credit") return <CreditLine credit={unit.credit} onDel={() => onDelCredit(unit.credit.id)} onEdit={() => onEditCredit(unit.credit)} hideDelete={editMode} />;
    // Scheduled-pin rows are read-only here (managed from the Pinned tab): no edit tap, no delete.
    if (unit.pinned) return <EntryLine entry={unit.entry} hideDelete />;
    return <EntryLine entry={unit.entry} onDel={() => handleDelete(unit.entry)} onEdit={() => onEditEntry(unit.entry)} hideDelete={editMode} />;
  }

  return (
    <div>
      <div style={S.weekHeader}>
        <span style={{ fontWeight:600, color:"var(--text-heading)", fontSize:14 }}>{dateStr(week.start)} — {dateStr(week.end)}</span>
        {(units.length > 0 || lastDeleted) && (
          <div style={{ display:"flex", gap:6 }}>
            {lastDeleted && <button style={{ ...S.editToggle, padding:"5px 10px", fontSize:12 }} onClick={onUndo}>Undo</button>}
            {units.length > 0 && <button style={{ ...S.editToggle, padding:"5px 10px", fontSize:12 }} onClick={() => editMode ? exitEdit() : enterEdit()}>{editMode ? "Done" : "Edit"}</button>}
          </div>
        )}
      </div>
      <div style={S.budgetCard}>
        <div style={S.bar}><div style={{ ...S.barFill, width: pct + "%", background: over > 0 ? "#ef4444" : "#06b6d4" }} /></div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginTop:6, color:"var(--text-tertiary)" }}>
          <span>{fmt(spent)}</span>
          <span>{fmt(Math.max(weeklyBudget - netSpent, 0))} left of {fmt(weeklyBudget)}{isLastWeek ? " (final)" : ""}</span>
        </div>
        {over > 0 && <div style={{ color:"#ef4444", fontSize:11, marginTop:4, fontWeight:500 }}>↓ {fmt(over)} over</div>}
      </div>
      {/* Payment-type filter: narrow the list to one card to cross-check against its statement.
          Only offered when more than one payment type is in use, and hidden in edit mode (reorder
          needs the full list). Shows all charges on the card (personal, work, split), not credits. */}
      {!editMode && usedMethods.length >= 2 && (
        <div style={{ marginTop:12 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            <button style={{ ...S.weekPill, ...(methodFilter === null ? S.weekPillActive : {}) }} onClick={() => setMethodFilter(null)}>All</button>
            {usedMethods.map(m => (
              <button key={m.id} style={{ ...S.weekPill, display:"inline-flex", alignItems:"center", gap:6, ...(methodFilter === m.id ? S.weekPillActive : {}) }} onClick={() => setMethodFilter(m.id)}>
                <span style={{ ...S.dot, background: m.color }} />{m.name}
              </button>
            ))}
          </div>
          {methodFilter && (
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:8 }}>
              {filteredUnits.length} transaction{filteredUnits.length === 1 ? "" : "s"} · {fmt(filterTotal)} <span style={{ color:"var(--text-muted)" }}>as charged</span>
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop:12 }}>
        {renderUnits.map((unit, i) => (
          <React.Fragment key={unit.id}>
          {/* Day heading, emitted whenever the day changes going down the list. Rendered as a sibling
              of the rows rather than wrapping them, so the drag hit-test — which walks rowRefs — never
              sees it and keeps measuring only real rows. Subtotal is that day's personal spend. */}
          {dayHeadingFor(renderUnits, i) && (
            <div style={S.dayHead}>
              <span style={S.dayHeadLabel}>{unit.day ? dayKeyLabel(unit.day) : "Undated"}</span>
              {dayTotal(renderUnits, unit.day) > 0 && <span style={S.dayHeadTotal}>{fmt(dayTotal(renderUnits, unit.day))}</span>}
            </div>
          )}
          <div ref={el => { if (el) rowRefs.current[unit.id] = el; else delete rowRefs.current[unit.id]; }}
               style={{ display:"flex", alignItems:"center", gap:6, ...(dragId === unit.id ? S.rowDragging : {}) }}>
            {editMode && (unit.pinned && !pinEditable
              ? <span style={{ ...S.checkbox, opacity:0.25, cursor:"default" }} />
              : <button style={{ ...S.checkbox, ...(selected.has(unit.id) ? { background:chipColors("#22c55e").bg, borderColor:"#22c55e" } : {}) }} onClick={() => toggleSelect(unit.id)}>{selected.has(unit.id) ? "✓" : ""}</button>
            )}
            <div style={{ flex:1, minWidth:0 }}>{renderUnitContent(unit)}</div>
            {editMode && (!unit.pinned || pinEditable) && (
              <button style={S.dragHandle} aria-label="Drag to reorder"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e.clientY, unit, false); }}
                      onTouchStart={(e) => { e.stopPropagation(); beginDrag(e.touches[0].clientY, unit, true); }}>≡</button>
            )}
          </div>
          </React.Fragment>
        ))}
        {units.length === 0 && <div style={{ color:"var(--text-secondary)", fontSize:13, padding:"12px 0" }}>Nothing logged</div>}
        {units.length > 0 && renderUnits.length === 0 && <div style={{ color:"var(--text-secondary)", fontSize:13, padding:"12px 0" }}>No transactions on this payment type</div>}
      </div>
      {!editMode ? (
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button style={{ ...S.actionBtn, flex:1 }} onClick={onAddEntry}>Log spend</button>
          {lastDeleted && <button style={S.editToggle} onClick={onUndo}>Undo</button>}
          {units.length > 0 && <button style={S.editToggle} onClick={enterEdit}>Edit</button>}
        </div>
      ) : (
        <>
          <div style={S.bulkDelBar}>
            <button style={S.editToggle} onClick={exitEdit}>Done</button>
            {selected.size === 0 ? (
              <div style={{ flex:1, fontSize:12, color:"var(--text-secondary)", textAlign:"center" }}>Drag ≡ to reorder</div>
            ) : (
              <div style={{ flex:1, display:"flex", gap:6, justifyContent:"center" }}>
                {showMove ? (
                  // Controlled, defaulting to the current week — that's the natural "no real
                  // choice made yet" resting state, so no disabled placeholder option is needed.
                  <select style={S.weekSelect} value={week.index}
                    onChange={e => bulkMove(Number(e.target.value))}
                    onBlur={() => setShowMove(false)}
                    autoFocus>
                    {(weeks || []).map(w => <option key={w.index} value={w.index}>Week {w.index}</option>)}
                  </select>
                ) : (
                  <button style={{ ...S.editToggle, padding:"8px 10px", fontSize:12 }} onClick={() => { setShowCategorize(false); setShowMove(true); }}>Move</button>
                )}
                {categorisableSelectedCount > 0 && (
                  <button style={{ ...S.editToggle, padding:"8px 10px", fontSize:12 }} onClick={() => { setShowMove(false); setShowCategorize(c => !c); }}>Categorise</button>
                )}
              </div>
            )}
            {selected.size > 0 && (confirmBulk
              ? <button style={{ ...S.btn, background:"#dc2626", padding:"10px 14px", fontSize:13 }} onClick={bulkDelete}>Delete {selected.size}?</button>
              : <button style={{ ...S.btn, background:"var(--danger-soft-bg)", border:"1px solid var(--danger-soft-border)", color:"var(--danger-soft-text)", padding:"10px 14px", fontSize:13 }} onClick={() => setConfirmBulk(true)}>Delete {selected.size}</button>
            )}
          </div>
          {showCategorize && (
            <div style={{ marginTop:8 }}>
              <CategoryPicker categories={categories} value={null} onPick={id => bulkCategorize(id)} onCreate={onAddCategory} onBack={() => setShowCategorize(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
// A classic sun/moon switch: a single thumb carries whichever glyph is active and slides
// between the two ends of the track (moon/dark on the left, sun/light on the right).
function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === "light";
  return (
    <button role="switch" aria-checked={isLight} aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"} onClick={onToggle}
      style={{ position:"relative", width:56, height:30, borderRadius:15, border:"1px solid var(--border-strong)", background:"var(--surface-2)", cursor:"pointer", padding:0, flexShrink:0 }}>
      <span aria-hidden="true" style={{ position:"absolute", top:2, left: isLight ? 28 : 2, width:24, height:24, borderRadius:"50%", background:"var(--surface)", border:"1px solid var(--border-strong)", boxShadow:"0 1px 3px rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, lineHeight:1, transition:"left 0.2s ease" }}>{isLight ? "☀️" : "🌙"}</span>
    </button>
  );
}

// Generic on/off switch, same visual language as ThemeToggle (used for the category prompt).
function ToggleSwitch({ on, onToggle, ariaLabel, thumbOn = "", thumbOff = "" }) {
  return (
    <button role="switch" aria-checked={!!on} aria-label={ariaLabel} onClick={onToggle}
      style={{ position:"relative", width:56, height:30, borderRadius:15, border:"1px solid var(--border-strong)", background: on ? "#0369a1" : "var(--surface-2)", cursor:"pointer", padding:0, flexShrink:0, transition:"background 0.2s ease" }}>
      <span aria-hidden="true" style={{ position:"absolute", top:2, left: on ? 28 : 2, width:24, height:24, borderRadius:"50%", background:"var(--surface)", border:"1px solid var(--border-strong)", boxShadow:"0 1px 3px rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, lineHeight:1, transition:"left 0.2s ease" }}>{on ? thumbOn : thumbOff}</span>
    </button>
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
        // Tapping × is the confirmation click itself, so this transient state goes bold/dark
        // (not pastel) — there's no "idle red" state here to keep soft, since the resting × is neutral.
        ...(confirming ? { background:"#dc2626", color:"var(--on-accent)", fontSize:11, fontWeight:700, borderRadius:5, padding:"2px 7px", whiteSpace:"nowrap" } : {}),
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
  const col = entry.type === "business" ? "#f59e0b" : entry.type === "excluded" ? "#a855f7" : "var(--text-primary)";
  const cat = entry.category && CATEGORY_BY_ID[entry.category];
  return (
    <div onClick={onEdit} style={{ ...S.entryRow, ...(grouped ? S.entryRowGrouped : {}), ...(grouped && last ? { borderBottom:"none" } : {}), cursor: onEdit ? "pointer" : "default" }}>
      <span style={{ ...S.dot, background: METHOD_COLOR[entry.method] || "var(--text-secondary)" }} />
      <span style={{ flex:1, color:col, fontSize:13 }}>
        {cat && <span title={cat.name} style={{ display:"inline-flex", verticalAlign:"-2px", marginRight:5 }}><CategoryIcon icon={cat.icon} size={13} color="var(--text-tertiary)" /></span>}
        {entry.label || METHOD_NAME[entry.method] || entry.method}
        {entry.pinned && <span style={{ ...S.badge, background:chipColors("#38bdf8").bg, color:"#38bdf8" }}>📌 fixed</span>}
        {entry.type === "business" && <span style={{ ...S.badge, background:chipColors("#f59e0b").bg, color:"#f59e0b" }}>work</span>}
        {entry.type === "excluded" && <span style={{ ...S.badge, background:chipColors("#a855f7").bg, color:"#a855f7" }}>reimbursable</span>}
        {entry.splitGroupId && entry.type === "personal" && <span style={{ ...S.badge, background:"var(--surface-2)", color:"var(--text-tertiary)" }}>split</span>}
      </span>
      <span style={{ color:col, fontWeight:600, fontSize:13 }}>{fmt(entry.amount)}</span>
      {!hideDelete && <ConfirmDeleteButton onConfirm={onDel} style={S.delBtn} />}
    </div>
  );
}

// ─── Split Line ───────────────────────────────────────────────────────────────
// A split is one purchase stored as two entries (your personal share + the excluded "not yours"
// portion). It renders as a single row: the shared name once, your share as the headline amount
// (that's what hits the budget), with the not-yours/total split beneath. Tapping opens the unified
// split editor; one delete removes the whole group.
function SplitLine({ group, onEdit, onDel, hideDelete }) {
  const your = group.find(e => e.type === "personal") || null;
  const their = group.find(e => e.type === "excluded") || null;
  const ref = your || their;
  const yourShare = your ? your.amount : 0;
  const theirShare = their ? their.amount : 0;
  const total = yourShare + theirShare;
  const cat = your && your.category && CATEGORY_BY_ID[your.category];
  return (
    <div style={S.splitGroup}>
      <div onClick={onEdit} style={{ ...S.entryRow, borderBottom:"none", cursor: onEdit ? "pointer" : "default" }}>
        <span style={{ ...S.dot, background: METHOD_COLOR[ref.method] || "var(--text-secondary)" }} />
        <span style={{ flex:1, minWidth:0, color:"var(--text-primary)", fontSize:13 }}>
          {cat && <span title={cat.name} style={{ display:"inline-flex", verticalAlign:"-2px", marginRight:5 }}><CategoryIcon icon={cat.icon} size={13} color="var(--text-tertiary)" /></span>}
          {ref.label || METHOD_NAME[ref.method] || ref.method}
          <span style={{ ...S.badge, background:"var(--surface-2)", color:"var(--text-tertiary)" }}>split</span>
        </span>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ color:"var(--text-primary)", fontWeight:600, fontSize:13 }}>{fmt(yourShare)}</div>
          <div style={{ color:"var(--text-muted)", fontSize:10, marginTop:1 }}>{fmt(theirShare)} not yours · {fmt(total)} total</div>
        </div>
        {!hideDelete && <ConfirmDeleteButton onConfirm={onDel} style={S.delBtn} />}
      </div>
    </div>
  );
}

// ─── Credit Line ───────────────────────────────────────────────────────────────
function CreditLine({ credit, onDel, onEdit, hideDelete }) {
  return (
    <div onClick={onEdit} style={{ ...S.entryRow, cursor: onEdit ? "pointer" : "default" }}>
      {/* The card dot, as on every other row — a credit lands on a card like anything else.
          Credits logged before they carried one fall back to the old plain green. */}
      <span style={{ ...S.dot, background: METHOD_COLOR[credit.method] || "#22c55e" }} />
      <span style={{ flex:1, color:"#22c55e", fontSize:13 }}>{credit.label || "Credit"}{credit.from && <span style={{ color:"var(--text-secondary)" }}> from {credit.from}</span>}</span>
      <span style={{ color:"#22c55e", fontWeight:600, fontSize:13 }}>+{fmt(credit.amount)}</span>
      {!hideDelete && <ConfirmDeleteButton onConfirm={onDel} style={S.delBtn} />}
    </div>
  );
}

// ─── Pin Card ─────────────────────────────────────────────────────────────────
function PinCard({ pin, onEdit, onDelete }) {
  const isB = pin.type === "business";
  const isX = pin.type === "excluded";
  const col = isB ? "#f59e0b" : isX ? "#a855f7" : "var(--text-heading)";
  const cat = pin.category && CATEGORY_BY_ID[pin.category];
  return (
    <div style={S.pinCard}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <span style={{ ...S.dot, background: METHOD_COLOR[pin.method] || "var(--text-secondary)" }} />
        <span style={{ flex:1, fontWeight:600, fontSize:14, color:col }}>
          {pin.label}
          {isB && <span style={{ ...S.badge, background:chipColors("#f59e0b").bg, color:"#f59e0b" }}>work</span>}
          {isX && <span style={{ ...S.badge, background:chipColors("#a855f7").bg, color:"#a855f7" }}>split</span>}
          {cat && <span title={cat.name} style={{ display:"inline-flex", verticalAlign:"-2px", marginLeft:6 }}><CategoryIcon icon={cat.icon} size={13} color="var(--text-tertiary)" /></span>}
        </span>
        <button style={{ ...S.iconBtn, fontSize:20, padding:"4px 6px" }} onClick={onEdit}>✎</button>
        <ConfirmDeleteButton onConfirm={onDelete} style={{ ...S.iconBtn, color:"#ef4444", fontSize:20, padding:"4px 6px" }} />
      </div>
      <div style={{ fontSize:22, fontWeight:800, letterSpacing:"-1px", color: isB ? "#f59e0b" : isX ? "#a855f7" : METHOD_COLOR[pin.method] || "var(--text-primary)", marginBottom:4 }}>{pin.amount ? fmt(pin.amount) : "—"}</div>
      {isScheduledPin(pin) && <div style={{ fontSize:11, color:"#38bdf8", marginTop:2 }}>📌 {pin.freq === "weekly" ? `Every ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][pin.day]}` : pin.freq === "daily" ? "Every day" : `Monthly · day ${pin.day}`} · in week log</div>}
      {pin.note && <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>{pin.note}</div>}
    </div>
  );
}

// ─── Method Selector ──────────────────────────────────────────────────────────
// The payment-type chooser used by both the log and pin modals. Renders the user's payment
// types (state.methods, via the module METHODS view) as a wrapping 4-col grid that scrolls when
// there are many, with a ▾ hint shown while more sit below the fold. Selected chip colours are
// derived from each type's single colour.
function MethodSelector({ value, onChange, dimmed }) {
  const ref = useRef(null);
  const [moreRight, setMoreRight] = useState(false);
  const check = () => { const el = ref.current; if (el) setMoreRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4); };
  useLayoutEffect(() => { check(); }, []); // measure before paint so the ▸ hint shows on first open
  return (
    <div style={{ position:"relative", marginBottom:12, opacity: dimmed ? 0.4 : 1 }}>
      {/* Single row: 4 chips fit the width; extra types scroll horizontally. */}
      <div ref={ref} onScroll={check} style={{ display:"flex", gap:6, overflowX:"auto", scrollbarWidth:"none" }}>
        {METHODS.map(m => {
          const on = value === m.id;
          const c = chipColors(m.color);
          return <button key={m.id} onClick={() => onChange(m.id)} title={m.name}
            style={{ flex:"0 0 calc((100% - 18px) / 4)", background: on ? c.bg : "var(--surface)", border:`1px solid ${on ? c.border : "var(--border)"}`, borderRadius:8, color: on ? c.text : "var(--text-muted)", padding:"10px 2px", fontSize:12, fontWeight: on?700:500, cursor:"pointer", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</button>;
        })}
      </div>
      {moreRight && <div aria-hidden="true" style={{ position:"absolute", top:0, bottom:0, right:0, width:24, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:2, pointerEvents:"none", color:"var(--text-tertiary)", fontSize:12, background:"linear-gradient(to right, rgba(15,23,42,0), var(--surface) 70%)" }}>▸</div>}
    </div>
  );
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
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6, maxHeight:160, overflowY:"auto", padding:"2px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8 }}>
      {ICON_KEYS.map(k => {
        const on = value === k;
        return (
          <button key={k} onClick={() => onPick(k)} title={k}
            style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"9px 0", borderRadius:8, cursor:"pointer", background: on ? "var(--surface-2)" : "transparent", border:`1px solid ${on ? "var(--border-strong)" : "transparent"}` }}>
            <CategoryIcon icon={k} size={20} color={on ? "var(--text-heading)" : "var(--text-muted)"} />
          </button>
        );
      })}
    </div>
  );
}

// One editable row in the Settings categories list: colour swatch, an icon button that reveals
// an inline IconPicker, a name field, a remove button, and (when `onDragMouseDown`/`onDragTouchStart`
// are given) a drag handle. The handle sits in the same flex row as the ✕ button — rather than
// beside this whole component — so the two align on one baseline instead of drifting when the
// icon picker below expands. Owns its own icon-picker open state via the controlled `open`/`onToggle`
// props (only one row's icon picker is open at a time, coordinated by the parent).
function CategoryEditorRow({ cat, canDelete, lockReason, open, onToggle, onUpdate, onRemove, dragLabel, onDragMouseDown, onDragTouchStart }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input type="color" value={cat.color} onChange={e => onUpdate({ color: e.target.value })} aria-label={`${cat.name} colour`}
          style={{ width:34, height:34, padding:2, border:"1px solid var(--border)", borderRadius:8, background:"var(--surface)", cursor:"pointer", flexShrink:0 }} />
        <button onClick={onToggle} title="Choose icon" aria-label={`${cat.name} icon`}
          style={{ width:34, height:34, borderRadius:"50%", background:cat.color, border:open?"2px solid var(--text-heading)":"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, padding:0 }}>
          <CategoryIcon icon={cat.icon} size={18} color={readableIconColor(cat.color)} />
        </button>
        <input key={`cname-${cat.id}-${cat.name}`} defaultValue={cat.name} placeholder="Name"
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== cat.name) onUpdate({ name: v }); else if (!v) e.target.value = cat.name; }}
          style={{ ...S.input, marginBottom:0, flex:1 }} />
        <button onClick={() => { if (canDelete) onRemove(); }} disabled={!canDelete} title={lockReason}
          style={{ ...S.iconBtn, color: canDelete ? "#ef4444" : "var(--border-strong)", cursor: canDelete ? "pointer" : "default", fontSize:16, flexShrink:0 }}>✕</button>
        {onDragMouseDown && <button style={S.dragHandle} aria-label={dragLabel} onMouseDown={onDragMouseDown} onTouchStart={onDragTouchStart}>≡</button>}
      </div>
      {open && <div style={{ marginTop:6 }}><IconPicker value={cat.icon} onPick={k => { onUpdate({ icon: k }); onToggle(); }} /></div>}
    </div>
  );
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
  return (
    <div style={S.settingsCard}>
      <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Payment methods</div>
      {state.methods.map(m => {
        const canDelete = !used.has(m.id) && state.methods.length > 1;
        return (
          <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <input type="color" value={m.color} onChange={e => update(m.id, { color: e.target.value })} aria-label={`${m.name} colour`}
              style={{ width:34, height:34, padding:2, border:"1px solid var(--border)", borderRadius:8, background:"var(--surface)", cursor:"pointer", flexShrink:0 }} />
            <input key={`mname-${m.id}-${m.name}`} defaultValue={m.name} placeholder="Name"
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== m.name) update(m.id, { name: v }); else if (!v) e.target.value = m.name; }}
              style={{ ...S.input, marginBottom:0, flex:1 }} />
            <button onClick={() => { if (canDelete) remove(m.id); }} disabled={!canDelete}
              title={used.has(m.id) ? "In use — can't remove" : (state.methods.length <= 1 ? "Keep at least one" : "Remove")}
              style={{ ...S.iconBtn, color: canDelete ? "#ef4444" : "var(--border-strong)", cursor: canDelete ? "pointer" : "default", fontSize:16, flexShrink:0 }}>✕</button>
          </div>
        );
      })}
      {anyInUse && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2, marginBottom:8 }}>Types with logged transactions can't be removed.</div>}
      <button onClick={add} disabled={state.methods.length >= MAX_METHODS}
        style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%", marginTop:4, opacity: state.methods.length >= MAX_METHODS ? 0.5 : 1, cursor: state.methods.length >= MAX_METHODS ? "default" : "pointer" }}>
        {state.methods.length >= MAX_METHODS ? `Maximum ${MAX_METHODS} types` : "+ Add payment type"}
      </button>
    </div>
  );
}

// ─── Categories Settings Card ─────────────────────────────────────────────────
// The Settings card that lists, edits, adds/removes, and reorders spending categories, plus the
// category-prompt toggle. Categories have no separate `order` field — a category's position in
// state.categories IS its order (used by both this list and the CategoryPicker grid) — so a
// completed drag just persists the reordered array directly.
function CategoriesSettingsCard({ state, dispatch }) {
  const categories = state.categories;
  // Every category id referenced by a live or archived entry OR pin — such categories can't be
  // removed (pins carry a category too, so a pin-only category must lock just like an entry does).
  const used = new Set();
  [state, ...(state.monthHistory || [])].forEach(src => {
    (src.entries || []).forEach(e => { if (e.category) used.add(e.category); });
    (src.pins || []).forEach(p => { if (p.category) used.add(p.category); });
  });
  const setCats = (cs) => dispatch({ type: "SETTINGS", patch: { categories: cs } });
  const update = (id, patch) => setCats(categories.map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id) => { setOpenIconCat(null); setCats(categories.filter(c => c.id !== id)); };
  const add = () => setCats([...categories, { id: genId(), name: "New category", icon: "tag", color: "#60a5fa" }]);
  const anyInUse = categories.some(c => used.has(c.id));

  const [openIconCat, setOpenIconCat] = useState(null); // id of the category whose icon picker is open (only one at a time)
  const [dragId, setDragId] = useState(null);           // id of the category being dragged, or null
  const [dragList, setDragList] = useState(null);       // working category order during a drag, else null
  const dragIdRef = useRef(null);
  const dragListRef = useRef(null);
  const rowRefs = useRef({});                            // category id -> row DOM node, for hit-testing during drag

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
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { to = i; break; }
      }
      const moved = prev.find(c => c.id === id);
      const next = without.slice();
      next.splice(to, 0, moved);
      if (next.some((c, i) => c.id !== prev[i].id)) { dragListRef.current = next; setDragList(next); }
    };
    const onTouchMove = (e) => { e.preventDefault(); move(e.touches[0].clientY); };
    const onMouseMove = (e) => move(e.clientY);
    const end = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
      if (dragListRef.current) setCats(dragListRef.current);
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

  return (
    <div style={S.settingsCard}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase" }}>Spending categories</div>
          <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>Ask for a category after logging a spend</div>
        </div>
        <ToggleSwitch on={state.categoryPrompt} onToggle={() => dispatch({ type:"SETTINGS", patch:{ categoryPrompt: !state.categoryPrompt } })} ariaLabel="Toggle category prompt" thumbOn="🏷️" thumbOff="✕" />
      </div>
      {renderCats.map(c => (
        <div key={c.id} ref={el => { if (el) rowRefs.current[c.id] = el; else delete rowRefs.current[c.id]; }}
             style={dragId === c.id ? S.rowDragging : undefined}>
          <CategoryEditorRow cat={c}
            canDelete={!used.has(c.id) && categories.length > 1}
            lockReason={used.has(c.id) ? "In use — can't remove" : (categories.length <= 1 ? "Keep at least one" : "Remove")}
            open={openIconCat === c.id}
            onToggle={() => setOpenIconCat(prev => prev === c.id ? null : c.id)}
            onUpdate={patch => update(c.id, patch)} onRemove={() => remove(c.id)}
            dragLabel={`Drag ${c.name} to reorder`}
            onDragMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e.clientY, c, false); }}
            onDragTouchStart={(e) => { e.stopPropagation(); beginDrag(e.touches[0].clientY, c, true); }} />
        </div>
      ))}
      {anyInUse && <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2, marginBottom:8 }}>Categories used by a logged spend can't be removed.</div>}
      <button onClick={add} disabled={categories.length >= MAX_CATEGORIES}
        style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%", marginTop:4, opacity: categories.length >= MAX_CATEGORIES ? 0.5 : 1, cursor: categories.length >= MAX_CATEGORIES ? "default" : "pointer" }}>
        {categories.length >= MAX_CATEGORIES ? `Maximum ${MAX_CATEGORIES} categories` : "+ Add category"}
      </button>
    </div>
  );
}

// ─── Customise Modal ──────────────────────────────────────────────────────────
// Groups the settings that shape how the app *looks* — theme, payment types, and spending
// categories — behind one "Customisation" entry point in Settings, so the main Settings list
// stays short. Content scrolls internally (capped below the viewport) so the modal sheet never
// grows taller than the screen, however many payment types or categories are added.
function CustomiseModal({ state, dispatch, onClose }) {
  return (
    <Modal onClose={onClose} title="Customisation">
      <div style={{ maxHeight:"70vh", overflowY:"auto" }}>
        <div style={S.settingsCard}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:2, textTransform:"uppercase" }}>Appearance</div>
              <div style={{ fontSize:12, color:"var(--text-muted)" }}>{state.theme === "light" ? "Light" : "Dark"} mode</div>
            </div>
            <ThemeToggle theme={state.theme || "dark"} onToggle={() => {
              const next = state.theme === "light" ? "dark" : "light";
              dispatch({ type:"SETTINGS", patch:{ theme: next } });
              // Mirror the choice into the unencrypted pre-unlock preference (crypto.js reads this
              // for the lock/setup screens, which can't see the encrypted state.theme) so the lock
              // screen doesn't show a stale theme after this change.
              try { localStorage.setItem("spendtracker_pretheme", next); } catch {}
            }} />
          </div>
        </div>
        <div style={S.settingsCard}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase" }}>Descriptions</div>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:2 }}>Show a description field when logging or editing a spend</div>
            </div>
            <ToggleSwitch on={state.descriptionPrompt} onToggle={() => dispatch({ type:"SETTINGS", patch:{ descriptionPrompt: !state.descriptionPrompt } })} ariaLabel="Toggle description field" thumbOn="📝" thumbOff="✕" />
          </div>
        </div>
        <PaymentMethodsSettingsCard state={state} dispatch={dispatch} />
        <CategoriesSettingsCard state={state} dispatch={dispatch} />
      </div>
    </Modal>
  );
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

  const tile = (bg, border, content, label, on, onClick, key) => (
    <button key={key} onClick={onClick} title={label}
      style={{ background:"none", border:"none", padding:0, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <span style={{ position:"relative", width:58, height:58, borderRadius:"50%", background:bg, border:`2px solid ${on ? "var(--text-heading)" : border}`, display:"flex", alignItems:"center", justifyContent:"center", boxShadow: on ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text-heading)" : "none" }}>
        {content}
        {on && <span style={{ position:"absolute", top:-2, right:-2, width:18, height:18, borderRadius:"50%", background:"var(--text-heading)", color:"var(--surface)", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>✓</span>}
      </span>
      <span style={{ fontSize:11, color: on ? "var(--text-heading)" : "var(--text-muted)", fontWeight: on?700:500, textAlign:"center", maxWidth:70, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
    </button>
  );

  if (creating) {
    const createCategory = () => {
      if (!name.trim()) return;
      const cat = { id: genId(), name: name.trim(), icon, color };
      onCreate(cat);
      onPick(cat.id);
    };
    return (
      <div>
        <div style={{ fontSize:12, color:"var(--text-secondary)", fontWeight:600, marginBottom:10 }}>New category</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          {/* Live preview of the chosen icon on the chosen colour */}
          <span style={{ width:40, height:40, borderRadius:"50%", background:color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={icon} size={22} color={readableIconColor(color)} /></span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Category colour"
            style={{ width:34, height:34, padding:2, border:"1px solid var(--border)", borderRadius:8, background:"var(--surface)", cursor:"pointer", flexShrink:0 }} />
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createCategory(); }} placeholder="Name e.g. Coffee" autoFocus
            style={{ ...S.input, marginBottom:0, flex:1 }} />
        </div>
        <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:6 }}>Icon</div>
        <div style={{ marginBottom:10 }}><IconPicker value={icon} onPick={setIcon} /></div>
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }} onClick={() => setCreating(false)}>Cancel</button>
          <button style={{ ...S.btn, background:"#0369a1", flex:1, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim()}
            onClick={createCategory}>Create</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, justifyItems:"center", maxHeight:300, overflowY:"auto" }}>
        {tile("var(--surface)", "var(--border-strong)", <span style={{ color:"var(--text-muted)", fontSize:20 }}>∅</span>, "None", value == null, () => onPick(null), "none")}
        {categories.map(c => tile(c.color, c.color, <CategoryIcon icon={c.icon} size={26} color={readableIconColor(c.color)} />, c.name, value === c.id, () => onPick(c.id), c.id))}
        {!full && tile("var(--surface)", "var(--border-strong)", <span style={{ color:"var(--text-secondary)", fontSize:26, fontWeight:300 }}>+</span>, "Create", false, () => setCreating(true), "create")}
      </div>
      {onBack && <button style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:13, cursor:"pointer", padding:"12px 0 0", width:"100%" }} onClick={onBack}>← Back</button>}
    </div>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────
function EntryModal({ weekIndex, weeks, edit, prefill, defaultMethod, categories, categoryPrompt, descriptionPrompt, onAddCategory, onSave, onSaveCredit, onUpdate, onUpdateCredit, onDeleteEntry, onClose }) {
  const editEntry = edit && edit.kind === "entry" ? edit.data : null;
  const editCredit = edit && edit.kind === "credit" ? edit.data : null;
  // A split (both halves) edited as one unit — its own self-contained editor further down.
  const editSplit = edit && edit.kind === "split" ? edit.data : null;
  const splitRef = editSplit ? (editSplit.your || editSplit.their) : null; // for seeding shared fields
  const editData = editEntry || editCredit;
  const isEdit = !!editData;
  // A split's two halves must keep summing to the original total, so editing one can't change
  // its amount — the card/note stay editable, the amount is locked.
  const isSplitEdit = !!(editEntry && editEntry.splitGroupId);

  // The amount is an integer number of pence, filled in from the right (calculator style), so the
  // decimal never has to be typed: tap 1-2-5-0 → £12.50. Starts at £0.00. Prefilled when editing.
  // `prefill` seeds a NEW entry from somewhere else in the app — currently a statement row the
  // reconciliation screen found nothing logged against. It fills the sheet in; it does not save.
  const [cents, setCents] = useState(() => editData ? Math.round(editData.amount * 100)
    : (prefill && prefill.amount ? Math.round(prefill.amount * 100) : 0));
  // Which DAY a new entry is logged to, as a "YYYY-MM-DD" key. Seeds to today when today falls in
  // the week the modal was opened for, otherwise that week's last day — so the quick-add ＋ lands
  // on today, while "Log spend" on some other week lands in the week you actually tapped. Seeded
  // fresh every open (the modal is remounted per open), so a chosen day never persists across opens.
  const [selectedDay, setSelectedDay] = useState(() => {
    // A prefilled day wins: the statement says when the money actually left.
    if (prefill && prefill.day && weekIndexForDay(weeks, prefill.day)) return prefill.day;
    const w = (weeks || []).find(x => x.index === weekIndex) || (weeks || [])[0];
    if (!w || !w.days.length) return null;
    const today = todayDayKey(weeks);
    if (today && w.days.some(d => dayKey(d) === today)) return today;
    return dayKey(w.days[w.days.length - 1]);
  });
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  // Which week the open picker is showing. Null = follow the selected day; stepping with ‹ › sets
  // an override so another week can be browsed, and picking a day clears it again.
  const [pickerWeekOverride, setPickerWeekOverride] = useState(null);
  // The week is DERIVED from the chosen day and never stored separately — one control, so the two
  // can't contradict each other and a dated entry can't be filed outside its own day's week. Falls
  // back to the opening week only if there's no usable day (a period with no days can't happen).
  const selectedWeek = weekIndexForDay(weeks, selectedDay) || weekIndex;
  // Fall back to the first method if the seeded id no longer exists (e.g. its type was removed).
  const [method, setMethod] = useState(() => {
    const seed = editEntry ? editEntry.method
      : editCredit ? (editCredit.method || defaultMethod)
      : (splitRef ? splitRef.method : ((prefill && prefill.method) || defaultMethod));
    return METHOD_NAME[seed] ? seed : METHODS[0].id;
  });
  const [type, setType] = useState(() => editCredit ? "credit" : (editEntry ? editEntry.type : ((prefill && prefill.type) || "personal")));
  const [note, setNote] = useState(() => editData ? (editData.label || "") : (splitRef ? (splitRef.label || "") : ((prefill && prefill.label) || "")));
  const [flash, setFlash] = useState(null);
  // The chosen category id (or null = None). Seeds from the edited entry (or a split's personal half).
  const [category, setCategory] = useState(() => (editEntry && editEntry.category) || (editSplit && editSplit.your && editSplit.your.category) || null);
  // After ↵ on a categorisable spend, we stash the built entry here and swap the keypad for the
  // category grid; selecting a category commits the save. Null the rest of the time.
  const [pendingSave, setPendingSave] = useState(null);
  // In edit mode, an inline category picker toggled from the Category row.
  const [editPickCat, setEditPickCat] = useState(false);

  // Split flow: null (not splitting) → "total" (entering the full amount) → "theirs" (entering the portion that isn't yours)
  const [splitStage, setSplitStage] = useState(null);
  const [splitTotal, setSplitTotal] = useState(0);

  // Unified split editor: the whole total and the "not yours" portion are both editable (your share
  // is derived), sharing one keypad via the active field. Seeded from the two existing halves.
  const [totalCents, setTotalCents] = useState(() => editSplit ? Math.round(((editSplit.your ? editSplit.your.amount : 0) + (editSplit.their ? editSplit.their.amount : 0)) * 100) : 0);
  const [theirsCents, setTheirsCents] = useState(() => editSplit ? Math.round((editSplit.their ? editSplit.their.amount : 0) * 100) : 0);
  const [activeField, setActiveField] = useState("total"); // "total" | "theirs"

  // Preserve the page's scroll position across the edit. The window is what scrolls (the week/summary
  // list isn't its own scroll container), and opening/closing this fixed bottom-sheet otherwise leaves
  // the browser scrolled to the bottom. Pin the body while the sheet is open, then restore the exact
  // offset on close. useLayoutEffect captures scrollY before paint, i.e. before any native jump.
  useLayoutEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const amount = cents / 100;
  const displayStr = amount.toFixed(2);
  const creditColors = chipColors("#22c55e");
  const splitColors = chipColors("#a855f7");
  const mc = type === "credit" ? creditColors : type === "split" ? splitColors : chipColors(METHOD_COLOR[method] || "#60a5fa");

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

  // Split editor: digits/delete drive whichever amount field is active (Total or Not yours).
  function splitPress(d) {
    const set = activeField === "theirs" ? setTheirsCents : setTotalCents;
    set(prev => { const next = d === "00" ? prev * 100 : prev * 10 + Number(d); return next > 99999999 ? prev : next; });
  }
  function splitDelete() {
    const set = activeField === "theirs" ? setTheirsCents : setTotalCents;
    set(prev => Math.floor(prev / 10));
  }

  // Save the unified split editor. Recomputes your share from total − theirs and writes both halves.
  // Degenerate results collapse cleanly: theirs = 0 → a plain personal entry; theirs = total → a
  // plain excluded entry (the splitGroupId is dropped so it stops rendering as a split).
  function saveSplit() {
    const total = totalCents / 100;
    if (total <= 0) return;
    const theirs = +(Math.min(theirsCents, totalCents) / 100).toFixed(2);
    const yours = +(total - theirs).toFixed(2);
    const g = editSplit;
    const label = note.trim();
    const base = g.their || g.your; // reuse the group's week/date/order/id
    const stripSplit = (e) => { const { splitGroupId, ...rest } = e; return rest; };
    const mkHalf = (t, amt, cat) => ({ id: genId(), amount: amt, label, note: label, method, type: t, weekIndex: base.weekIndex, date: base.date, order: base.order, splitGroupId: g.groupId, ...(cat ? { category: cat } : {}) });

    if (yours > 0 && theirs > 0) {
      // A genuine split: keep both halves under the group id.
      if (g.their) onUpdate({ ...g.their, amount: theirs, label, note: label, method });
      else onSave(mkHalf("excluded", theirs));
      if (g.your) onUpdate({ ...g.your, amount: yours, label, note: label, method, category: category || undefined });
      else onSave(mkHalf("personal", yours, category || undefined));
    } else if (theirs === 0) {
      // Whole amount is yours now → collapse to a single personal entry.
      if (g.their) onDeleteEntry(g.their.id);
      if (g.your) onUpdate({ ...stripSplit(g.your), amount: total, label, note: label, method, type: "personal", category: category || undefined });
      else onSave({ id: genId(), amount: total, label, note: label, method, type: "personal", weekIndex: base.weekIndex, date: base.date, order: base.order, ...(category ? { category } : {}) });
    } else {
      // Whole amount is someone else's → collapse to a single excluded (reimbursable) entry.
      if (g.your) onDeleteEntry(g.your.id);
      if (g.their) onUpdate({ ...stripSplit(g.their), amount: total, label, note: label, method, type: "excluded" });
      else onSave({ id: genId(), amount: total, label, note: label, method, type: "excluded", weekIndex: base.weekIndex, date: base.date, order: base.order });
    }
    onClose();
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
    if (v !== "split") { setSplitStage(null); setSplitTotal(0); }
    else { setSplitStage("total"); setCents(0); }
  }

  // Commit a stashed save once its category is chosen (or None). A pending save is either a
  // single entry (`{kind:"entry", entry, flash}`) or a split pair (`{kind:"split", your, their,
  // flash}`) — the category lands only on the *personal* portion; the excluded half isn't yours.
  function commitPending(save, catId) {
    if (save.kind === "split") {
      if (save.your) onSave(catId ? { ...save.your, category: catId } : save.your);
      onSave(save.their);
    } else {
      onSave(catId ? { ...save.entry, category: catId } : save.entry);
    }
    setPendingSave(null);
    setFlash(save.flash);
    setTimeout(() => setFlash(null), 900);
    resetAfterSave();
  }

  function pressEnter() {
    if (amount <= 0) return;

    // Editing an existing item: write the change back in place, keeping id/date/week/split.
    if (isEdit) {
      if (editCredit) {
        onUpdateCredit({ ...editCredit, amount, label: note.trim(), method });
      } else {
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
        const your = yourPortion > 0 ? { id: Math.random().toString(36).slice(2), amount: yourPortion, label: note.trim(), note: note.trim(), method, type: "personal", weekIndex: selectedWeek, day: selectedDay || undefined, date: baseDate, order: baseOrder, splitGroupId: groupId } : null;
        const their = { id: Math.random().toString(36).slice(2), amount: theirPortion, label: note.trim(), note: note.trim(), method, type: "excluded", weekIndex: selectedWeek, day: selectedDay || undefined, date: baseDate, order: baseOrder, splitGroupId: groupId };
        const save = { kind: "split", your, their, flash: { amount: splitTotal, split: true } };
        // Offer categorisation of the personal portion when there is one and the prompt is on.
        if (categoryPrompt && your) { setPendingSave(save); return; }
        commitPending(save, null);
        return;
      }
    }

    if (type === "credit") {
      // `method` matters: a refund lands on a specific card, so without it a credit can't be
      // reconciled against that card's statement. The selector above was already being shown and
      // its choice quietly discarded.
      onSaveCredit({ id: Math.random().toString(36).slice(2), amount, label: note.trim(), method, weekIndex: selectedWeek, day: selectedDay || undefined, from: "", date: new Date().toISOString(), order: Date.now() });
      setFlash({ amount, credit: true });
      setTimeout(() => setFlash(null), 900);
      resetAfterSave();
      return;
    }

    const entry = { id: Math.random().toString(36).slice(2), amount, label: note.trim(), note: note.trim(), method, type, weekIndex: selectedWeek, day: selectedDay || undefined, date: new Date().toISOString(), order: Date.now() };
    // Personal spends get the category prompt (when enabled); work expenses skip it.
    if (categoryPrompt && type === "personal") {
      setPendingSave({ kind: "entry", entry, flash: { amount, method } });
      return;
    }
    commitPending({ kind: "entry", entry, flash: { amount, method } }, null);
  }

  const digits = [[7,8,9],[4,5,6],[1,2,3],["00",0,"⌫"]];
  const subheading = { fontSize:12, color:"var(--text-secondary)", marginBottom:6, fontWeight:500 };

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
  // When logging (not editing), the title carries a day picker so a cost can be dropped on any day
  // of the period — not just today. It reads "Today" in the common case rather than the date, since
  // that's the 90% path and scans faster. Editing keeps a plain title (a row's day can't change:
  // its week is fixed, and changing the day would mean re-deriving the week under the entry).
  const todayKey = todayDayKey(weeks);
  const dayLabel = !selectedDay ? "day" : (selectedDay === todayKey ? "Today" : dayKeyLabel(selectedDay));
  const title = isEdit ? (editCredit ? "Edit credit" : "Edit spend") : (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
      Log ·
      <button onClick={() => setDayPickerOpen(o => !o)} style={S.daySelectBtn}>
        {dayLabel} <span style={{ fontSize:10, opacity:0.7 }}>{dayPickerOpen ? "▴" : "▾"}</span>
      </button>
    </span>
  );

  // The expanded picker: one chip per day of the shown week, aligned to weekday columns so a
  // partial week (the first week of a period starts on payday, mid-week) still lines up under the
  // right headings instead of sliding left. ‹ › step whole weeks, so filing into another week is
  // never lost by dropping the old week select.
  const pickerWeek = (weeks || []).find(w => w.index === (pickerWeekOverride != null ? pickerWeekOverride : selectedWeek));
  const dayPicker = (!isEdit && dayPickerOpen && pickerWeek) ? (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:10, marginBottom:12 }}>
      <div style={{ display:"flex", gap:4, marginBottom:8 }}>
        {Array.from({ length: weekCol(pickerWeek.days[0]) }).map((_, i) => <div key={"sp" + i} style={{ flex:1 }} />)}
        {pickerWeek.days.map(d => {
          const k = dayKey(d);
          const active = k === selectedDay;
          return (
            <button key={k} onClick={() => { setSelectedDay(k); setPickerWeekOverride(null); setDayPickerOpen(false); }}
              style={{ ...S.dayChip, ...(active ? S.dayChipActive : {}), ...(!active && k === todayKey ? S.dayChipToday : {}) }}>
              <div style={{ fontSize:9, opacity:0.75, textTransform:"uppercase" }}>{dayName(d)}</div>
              <div style={{ fontSize:14, fontWeight:700 }}>{d.getDate()}</div>
            </button>
          );
        })}
        {Array.from({ length: 6 - weekCol(pickerWeek.days[pickerWeek.days.length - 1]) }).map((_, i) => <div key={"tp" + i} style={{ flex:1 }} />)}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <button style={S.dayStepBtn} disabled={pickerWeek.index <= 1}
          onClick={() => setPickerWeekOverride(pickerWeek.index - 1)}>‹</button>
        <span style={{ fontSize:11, color:"var(--text-secondary)", textAlign:"center", flex:1 }}>
          Week {pickerWeek.index} · {dateStr(pickerWeek.start)}–{dateStr(pickerWeek.end)}
        </span>
        <button style={S.dayStepBtn} disabled={pickerWeek.index >= (weeks || []).length}
          onClick={() => setPickerWeekOverride(pickerWeek.index + 1)}>›</button>
      </div>
    </div>
  ) : null;

  // After ↵ on a categorisable spend, the keypad is swapped for the category grid (Monzo-style).
  if (pendingSave) {
    const pendAmt = pendingSave.kind === "split" ? pendingSave.flash.amount : pendingSave.entry.amount;
    return (
      <Modal onClose={onClose} title="Category">
        <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:14, textAlign:"center" }}>What was this <strong style={{ color:"var(--text-heading)" }}>{fmt(pendAmt)}</strong> for?</div>
        <CategoryPicker categories={categories} value={null}
          onPick={(id) => commitPending(pendingSave, id)}
          onCreate={onAddCategory}
          onBack={() => setPendingSave(null)} />
      </Modal>
    );
  }

  const catRow = category && CATEGORY_BY_ID[category];

  // ── Unified split editor: one screen for the whole split (both halves) ──
  if (editSplit) {
    const sTotal = totalCents / 100;
    const sTheirs = Math.min(theirsCents, totalCents) / 100;
    const sYours = +(sTotal - sTheirs).toFixed(2);
    const amountBox = (fieldKey, lbl, val) => (
      <button onClick={() => setActiveField(fieldKey)} style={{ flex:1, textAlign:"center", background:"var(--surface-2)", borderRadius:12, padding:"12px 8px", border:`2px solid ${activeField === fieldKey ? "#a855f7" : "var(--border-strong)"}`, cursor:"pointer" }}>
        <div style={{ fontSize:10, color: activeField === fieldKey ? "#a855f7" : "var(--text-secondary)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>{lbl}</div>
        <div style={{ fontSize:24, fontWeight:800, color:"var(--text-heading)" }}>£{val.toFixed(2)}</div>
      </button>
    );
    return (
      <Modal onClose={onClose} title="Edit split">
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          {amountBox("total", "Total", sTotal)}
          {amountBox("theirs", "Not yours", sTheirs)}
        </div>
        <div style={{ textAlign:"center", fontSize:12, color:"#a855f7", fontWeight:600, marginBottom:12 }}>Your share £{sYours.toFixed(2)} <span style={{ color:"var(--text-muted)", fontWeight:400 }}>· counts to your budget</span></div>

        <div style={subheading}>Payment type</div>
        <MethodSelector value={method} onChange={setMethod} />

        {sYours > 0 && (
          <>
            <div style={subheading}>Category</div>
            {editPickCat ? (
              <div style={{ marginBottom:10 }}>
                <CategoryPicker categories={categories} value={category}
                  onPick={(id) => { setCategory(id); setEditPickCat(false); }}
                  onCreate={onAddCategory}
                  onBack={() => setEditPickCat(false)} />
              </div>
            ) : (
              <button onClick={() => setEditPickCat(true)}
                style={{ display:"flex", alignItems:"center", gap:8, width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", marginBottom:10, cursor:"pointer", color:"var(--text-heading)", fontSize:13 }}>
                {catRow
                  ? <><span style={{ width:20, height:20, borderRadius:"50%", background:catRow.color, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={catRow.icon} size={12} color={readableIconColor(catRow.color)} /></span>{catRow.name}</>
                  : <span style={{ color:"var(--text-muted)" }}>None</span>}
                <span style={{ marginLeft:"auto", color:"var(--text-tertiary)" }}>Change ▸</span>
              </button>
            )}
          </>
        )}

        {descriptionPrompt && (
          <>
            <div style={subheading}>Description</div>
            <input style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-heading)", padding:"9px 12px", marginBottom:10, fontSize:13, boxSizing:"border-box", outline:"none" }}
              placeholder="Tap to add a description" value={note} onChange={e => setNote(e.target.value)} />
          </>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
          {digits.map((row, ri) => (<>{row.map((d, i) => <button key={`${ri}-${i}`} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color: d==="⌫" ? "#ef4444" : "var(--text-body)", fontSize: d==="⌫" ? 18 : 20, fontWeight:600, padding:"14px 0", cursor:"pointer" }} onClick={() => d === "⌫" ? splitDelete() : splitPress(d)}>{d}</button>)}{ri === 0 && <button style={{ gridRow: "span 4", background: totalCents>0 ? splitColors.bg : "var(--surface)", border:`1px solid ${totalCents>0 ? splitColors.border : "var(--border)"}`, borderRadius:8, color: totalCents>0 ? splitColors.text : "var(--text-muted)", fontSize:18, fontWeight:800, cursor: totalCents>0?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={saveSplit}>↵</button>}</> ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={title}>
      {dayPicker}
      <div style={{ background:"var(--surface-2)", borderRadius:12, padding:"14px 20px", marginBottom:12, textAlign:"center", border:`1px solid ${flash ? mc.border : "var(--border-strong)"}`, opacity: isSplitEdit ? 0.7 : 1 }}>
        {displayCaption && <div style={{ fontSize:11, color:"#a855f7", fontWeight:600, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>{displayCaption}</div>}
        <div style={{ fontSize: displayStr.length > 7 ? 30 : 42, fontWeight:800, color: flash ? "#22c55e" : "var(--text-heading)" }}>
          {flash ? (flash.split ? `✓ ${fmt(flash.amount)} split` : `✓ ${fmt(flash.amount)}`) : `£${displayStr}`}
        </div>
      </div>

      {!editCredit && <>
        <div style={subheading}>Payment type</div>
        <MethodSelector value={method} onChange={setMethod} dimmed={type === "credit"} />
      </>}

      {classOptions.length > 0 && <>
        <div style={subheading}>Classification</div>
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {classOptions.map(([v,l]) => <button key={v} style={{ flex:1, background: type===v ? "var(--surface-2)":"var(--surface)", border:`1px solid ${type===v?"var(--border-strong)":"var(--border)"}`, borderRadius:8, color: type===v ? (v==="business"?"#f59e0b":v==="credit"?"#22c55e":v==="split"?"#a855f7":"var(--text-heading)") : "var(--text-muted)", padding:"8px 4px", fontSize:12, fontWeight:type===v?600:400, cursor:"pointer" }} onClick={() => selectType(v)}>{l}</button>)}
        </div>
      </>}

      {isEdit && !editCredit && !isSplitEdit && type === "personal" && (
        <>
          <div style={subheading}>Category</div>
          {editPickCat ? (
            <div style={{ marginBottom:10 }}>
              <CategoryPicker categories={categories} value={category}
                onPick={(id) => { setCategory(id); setEditPickCat(false); }}
                onCreate={onAddCategory}
                onBack={() => setEditPickCat(false)} />
            </div>
          ) : (
            <button onClick={() => setEditPickCat(true)}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", marginBottom:10, cursor:"pointer", color:"var(--text-heading)", fontSize:13 }}>
              {catRow
                ? <><span style={{ width:20, height:20, borderRadius:"50%", background:catRow.color, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={catRow.icon} size={12} color={readableIconColor(catRow.color)} /></span>{catRow.name}</>
                : <span style={{ color:"var(--text-muted)" }}>None</span>}
              <span style={{ marginLeft:"auto", color:"var(--text-tertiary)" }}>Change ▸</span>
            </button>
          )}
        </>
      )}

      {type === "split" && !isEdit && (
        <div style={{ fontSize:11, color:"#a855f7", marginBottom:10, lineHeight:1.5 }}>
          {splitStage === "total"
            ? "Enter the full amount you paid, then continue."
            : "Enter just the portion that isn't yours — work reimbursement, a friend's share of the bill, etc. The rest stays personal."}
        </div>
      )}

      {descriptionPrompt && (
        <>
          <div style={subheading}>Description</div>
          <input style={{ width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-heading)", padding:"9px 12px", marginBottom:10, fontSize:13, boxSizing:"border-box", outline:"none" }}
            placeholder="Tap to add a description" value={note} onChange={e => setNote(e.target.value)} />
        </>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
        {digits.map((row, ri) => (<>{row.map((d, i) => <button key={`${ri}-${i}`} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color: d==="⌫" ? "#ef4444" : "var(--text-body)", fontSize: d==="⌫" ? 18 : 20, fontWeight:600, padding:"14px 0", cursor:"pointer", opacity: isSplitEdit ? 0.4 : 1 }} onClick={() => d === "⌫" ? pressDelete() : pressDigit(d)}>{d}</button>)}{ri === 0 && <button style={{ gridRow: "span 4", background: amount>0 ? mc.bg : "var(--surface)", border:`1px solid ${amount>0 ? mc.border : "var(--border)"}`, borderRadius:8, color: amount>0 ? mc.text : "var(--text-muted)", fontSize:18, fontWeight:800, cursor: amount>0?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center" }} onClick={pressEnter}>{enterGlyph}</button>}</> ))}
      </div>
    </Modal>
  );
}

// ─── Pin Modal ────────────────────────────────────────────────────────────────
function PinModal({ pin, categories, onAddCategory, onSave, onClose }) {
  const [label, setLabel] = useState(pin?.label || "");
  const [amount, setAmount] = useState(pin?.amount?.toString() || "");
  const [method, setMethod] = useState(() => (pin && METHOD_NAME[pin.method]) ? pin.method : METHODS[0].id);
  const [type, setType] = useState(pin?.type || "personal");
  const [category, setCategory] = useState(pin?.category || null);
  const [pickCat, setPickCat] = useState(false);
  const [note, setNote] = useState(pin?.note || "");
  // Scheduling. Keep the month-day and week-day choices in separate state so switching
  // frequency back and forth doesn't lose the other selection. `day` on the saved pin is
  // the day-of-month for monthly and the day-of-week (0=Sun) for weekly.
  const [freq, setFreq] = useState(pin?.freq || "none");
  const [dom, setDom] = useState(String(pin?.freq === "monthly" ? (pin?.day ?? 1) : 1));
  const [dow, setDow] = useState(pin?.freq === "weekly" ? (pin?.day ?? 1) : 1);

  const segBtn = (on) => ({ flex:1, background: on ? "var(--surface-2)":"var(--surface)", border:`1px solid ${on?"var(--border-strong)":"var(--border)"}`, borderRadius:8, color: on ? "var(--text-heading)" : "var(--text-muted)", padding:"8px 4px", fontSize:12, fontWeight:600, cursor:"pointer" });
  const dayBtn = (on) => ({ flex:1, background: on ? chipColors("#38bdf8").bg : "var(--surface)", border:`1px solid ${on?"#0369a1":"var(--border)"}`, borderRadius:8, color: on ? "#38bdf8" : "var(--text-muted)", padding:"7px 2px", fontSize:11, fontWeight:600, cursor:"pointer" });
  const hint = { fontSize:11, color:"var(--text-secondary)", marginBottom:6 };

  return (
    <Modal onClose={onClose} title={pin ? "Edit" : "New pin"}>
      <input style={S.input} placeholder="Label e.g. Gym" value={label} onChange={e => setLabel(e.target.value)} />
      <input style={{ ...S.input, marginBottom:10 }} type="number" inputMode="decimal" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
      <MethodSelector value={method} onChange={setMethod} />
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        {[["personal","Personal"],["business","Work"],["excluded","Split"]].map(([v,l]) => <button key={v} style={{ flex:1, background: type===v ? "var(--surface-2)":"var(--surface)", border:`1px solid ${type===v?"var(--border-strong)":"var(--border)"}`, borderRadius:8, color: type===v ? (v==="business"?"#f59e0b":v==="excluded"?"#a855f7":"var(--text-heading)") : "var(--text-muted)", padding:"8px 4px", fontSize:12, fontWeight:600, cursor:"pointer" }} onClick={() => setType(v)}>{l}</button>)}
      </div>

      {type === "personal" && (
        <>
          <div style={hint}>Category</div>
          {pickCat ? (
            <div style={{ marginBottom:10 }}>
              <CategoryPicker categories={categories} value={category}
                onPick={(id) => { setCategory(id); setPickCat(false); }}
                onCreate={onAddCategory}
                onBack={() => setPickCat(false)} />
            </div>
          ) : (
            <button onClick={() => setPickCat(true)}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", marginBottom:10, cursor:"pointer", color:"var(--text-heading)", fontSize:13 }}>
              {category && CATEGORY_BY_ID[category]
                ? <><span style={{ width:20, height:20, borderRadius:"50%", background:CATEGORY_BY_ID[category].color, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={CATEGORY_BY_ID[category].icon} size={12} color={readableIconColor(CATEGORY_BY_ID[category].color)} /></span>{CATEGORY_BY_ID[category].name}</>
                : <span style={{ color:"var(--text-muted)" }}>None</span>}
              <span style={{ marginLeft:"auto", color:"var(--text-tertiary)" }}>Change ▸</span>
            </button>
          )}
        </>
      )}

      <div style={hint}>Populate into the week log</div>
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        {[["none","One-off"],["monthly","Monthly"],["weekly","Weekly"],["daily","Daily"]].map(([v,l]) => <button key={v} style={segBtn(freq===v)} onClick={() => setFreq(v)}>{l}</button>)}
      </div>
      {freq === "monthly" && (
        <div style={{ marginBottom:10 }}>
          <div style={hint}>On day of the month it falls</div>
          <input style={{ ...S.input, marginBottom:0 }} type="number" inputMode="numeric" min="1" max="31" value={dom}
                 onChange={e => setDom(e.target.value)}
                 onBlur={() => { const v = parseInt(dom, 10); setDom(String(!isNaN(v) ? Math.min(31, Math.max(1, v)) : 1)); }} />
        </div>
      )}
      {freq === "weekly" && (
        <div style={{ marginBottom:10 }}>
          <div style={hint}>On this day, every week</div>
          <div style={{ display:"flex", gap:4 }}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i) => <button key={i} style={dayBtn(dow===i)} onClick={() => setDow(i)}>{d}</button>)}
          </div>
        </div>
      )}

      <textarea style={{ ...S.input, height:60, resize:"none" }} placeholder="Note" value={note} onChange={e => setNote(e.target.value)} />
      <button style={{ ...S.btn, background:"#0369a1", marginTop:12 }} onClick={() => {
        const base = { id: pin?.id || Math.random().toString(36).slice(2), label: label.trim(), amount: parseFloat(amount) || 0, method, type, category: type === "personal" ? (category || undefined) : undefined, note: note.trim(), freq };
        if (freq === "monthly") base.day = Math.min(31, Math.max(1, parseInt(dom, 10) || 1));
        else if (freq === "weekly") base.day = dow;
        onSave(base);
      }}>Save</button>
    </Modal>
  );
}

// ─── Summary View ─────────────────────────────────────────────────────────────
function SummaryView({ state, weeks, rebalancedBudgets, totalSpent, totalEntries, totalPinned, totalCredits, remaining, methodTotals, businessEntries, onExport, onReconcile, statements, onEditEntry, onEditCredit, onGoToWeek }) {
  const [methodDetail, setMethodDetail] = useState(null); // method name or null
  const [categoryDetail, setCategoryDetail] = useState(null); // category id, "uncat", or null
  const [spendView, setSpendView] = useState("txn"); // "txn" = largest individual, "label" = grouped by name
  const [labelDetail, setLabelDetail] = useState(null); // the label group being drilled into, or null
  const [showAllSpends, setShowAllSpends] = useState(false); // full "Largest spends" ranking open?
  const [waterfallDetail, setWaterfallDetail] = useState(null); // "business" | "split" | "credits" | null — drill-down from the Gross vs net card

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
  const netTotal = totalSpent;                          // personal (entries + personal pins)
  const reimbursableTotal = grossSpend - netTotal;      // business + split (entries + pins)
  const splitTotal = reimbursableTotal - businessTotal; // excluded entries + any "split" pins

  // Net personal spend per category (entries + pins, mirroring grossByMethod's inclusion of pins).
  // Only personal items ever carry a category. A dangling id (category deleted after logging —
  // possible via pins, whose references don't lock a category in Settings) folds into
  // Uncategorised, matching how CATEGORY_BY_ID misses render everywhere else.
  const byCategory = {};
  let uncategorisedTotal = 0;
  const addCat = (id, amt) => {
    if (id && CATEGORY_BY_ID[id]) byCategory[id] = (byCategory[id] || 0) + amt;
    else uncategorisedTotal += amt;
  };
  state.entries.filter(e => e.type === "personal").forEach(e => addCat(e.category, e.amount));
  state.pins.filter(p => p.type !== "business" && p.type !== "excluded").forEach(p => addCat(p.category, p.amount || 0));
  const categoryRows = [
    ...CATEGORIES.map(c => ({ cat: c, total: byCategory[c.id] || 0 })),
    { cat: null, total: uncategorisedTotal }, // null = Uncategorised
  ].filter(r => r.total > 0).sort((a, b) => b.total - a.total);

  // Per-week, per-method breakdown
  const weekRows = weeks.map(w => {
    const wEntries = state.entries.filter(e => e.weekIndex === w.index && e.type === "personal");
    const wTotal = wEntries.reduce((s, e) => s + e.amount, 0);
    const wByMethod = {};
    METHODS.forEach(m => { wByMethod[m.id] = wEntries.filter(e => e.method === m.id).reduce((s, e) => s + e.amount, 0); });
    const wBudget = rebalancedBudgets[w.index] ?? state.weeklyBudget;
    return { week: w, total: wTotal, byMethod: wByMethod, budget: wBudget };
  });

  // All transactions for a given method (entries + pins), grouped by week for the drill-down.
  // weekIndex/order are carried through so groupByWeek can reproduce the week log's arrangement.
  function transactionsFor(method) {
    const fromEntries = state.entries
      .filter(e => e.method === method)
      // A scheduled-pin virtual entry (e.pinned) isn't a real editable row — leave it without an
      // entry ref so the drill-down keeps it read-only, matching By category / the week log.
      .map(e => ({ date: e.date, amount: e.amount, desc: e.label || METHOD_NAME[e.method] || e.method, type: e.type, entry: e.pinned ? undefined : e, pinned: !!e.pinned, weekIndex: e.weekIndex, order: e.order }));
    // Flat (unscheduled) pins are whole-period costs with no week of their own — deliberately left
    // without weekIndex/order so groupByWeek collects them into the trailing "Fixed costs" group.
    const fromPins = state.pins
      .filter(p => p.method === method)
      .map(p => ({ date: null, amount: p.amount || 0, desc: p.label + " (pinned)", type: p.type === "business" ? "business" : p.type === "excluded" ? "excluded" : "personal", pinned: true }));
    return groupByWeek([...fromEntries, ...fromPins], weeks);
  }

  // All personal transactions for a category (entries + pins), for the category drill-down;
  // catId null = uncategorised (no category, or one that no longer exists).
  function transactionsForCategory(catId) {
    const match = (c) => catId ? c === catId : !(c && CATEGORY_BY_ID[c]);
    const fromEntries = state.entries
      .filter(e => e.type === "personal" && match(e.category))
      // Guard scheduled-pin virtuals (e.pinned): they carry a synthetic id UPD_ENTRY can't match,
      // so they must stay read-only here rather than opening an editor that no-ops on save.
      .map(e => ({ date: e.date, amount: e.amount, desc: e.label || METHOD_NAME[e.method] || e.method, method: e.method, entry: e.pinned ? undefined : e, pinned: !!e.pinned, weekIndex: e.weekIndex, order: e.order }));
    const fromPins = state.pins
      .filter(p => p.type !== "business" && p.type !== "excluded" && match(p.category))
      .map(p => ({ date: null, amount: p.amount || 0, desc: p.label + " (pinned)", method: p.method, pinned: true }));
    return groupByWeek([...fromEntries, ...fromPins], weeks);
  }

  // Business or split ("excluded") transactions (entries + pins), for the Gross vs net drill-down.
  function transactionsForType(type) {
    const fromEntries = state.entries
      .filter(e => e.type === type)
      .map(e => ({ date: e.date, amount: e.amount, desc: e.label || METHOD_NAME[e.method] || e.method, method: e.method, entry: e.pinned ? undefined : e, pinned: !!e.pinned, weekIndex: e.weekIndex, order: e.order }));
    const fromPins = state.pins
      .filter(p => p.type === type)
      .map(p => ({ date: null, amount: p.amount || 0, desc: p.label + " (pinned)", method: p.method, pinned: true }));
    return groupByWeek([...fromEntries, ...fromPins], weeks);
  }

  // Credits, grouped by week for the Gross vs net drill-down. Credits already carry weekIndex and
  // order natively (and are drag-reordered alongside spend in the week log), so no mapping needed.
  const creditGroups = groupByWeek([...(state.credits || [])], weeks);

  // Every personal/business spend this period (entries + pins), excluding credits and the "not yours"
  // portion of splits. Carries entry/pinned so both the individual list and the by-label drill can
  // open real entries in the editor (scheduled-pin virtuals + flat pins stay read-only).
  const spendItems = [
    ...state.entries.filter(e => e.type !== "credit" && e.type !== "excluded").map(e => ({ desc: e.label || METHOD_NAME[e.method] || e.method, amount: e.amount, method: e.method, type: e.type, date: e.date, entry: e.pinned ? undefined : e, pinned: !!e.pinned, weekIndex: e.weekIndex, order: e.order })),
    ...state.pins.filter(p => p.type !== "excluded").map(p => ({ desc: p.label, amount: p.amount || 0, method: p.method, type: p.type, date: null, pinned: true })),
  ];
  // Individual spends ranked high to low — the full list. The card shows the leading few; "View all"
  // opens the complete ranking, so both read from the same array and can't disagree.
  const rankedItems = [...spendItems].sort((a, b) => b.amount - a.amount);
  // Cumulative spends grouped by (normalised) label, ranked by summed total — again the full list,
  // previewed on the card. A group whose members share one card keeps that card's dot; mixed
  // cards/types fall back to neutral.
  const rankedLabels = (() => {
    const map = new Map();
    spendItems.forEach(it => {
      const key = (it.desc || "").trim().toLowerCase();
      let g = map.get(key);
      if (!g) { g = { desc: it.desc, total: 0, count: 0, method: it.method, type: it.type, items: [] }; map.set(key, g); }
      g.total += it.amount; g.count += 1; g.items.push(it);
      if (g.method !== it.method) g.method = null;
      if (g.type !== it.type) g.type = "mixed";
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  })();
  // Both views cover the same spend, so one total serves either ranking.
  const rankedTotal = rankedItems.reduce((s, it) => s + it.amount, 0);
  const SPEND_PREVIEW = 5; // rows shown on the card before "View all"

  // Source split: how much of personal spend came from pins vs quick-logged entries
  const sourcePct = totalSpent > 0 ? Math.round((totalPinned / totalSpent) * 100) : 0;

  return (
    <div style={{ padding:"12px 16px" }}>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:6, marginBottom:10 }}>
        <button style={{ background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:8, color:"var(--text-tertiary)", padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:500 }} onClick={() => onReconcile()}>⇄ Reconcile</button>
        <button style={{ background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:8, color:"var(--text-tertiary)", padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:500 }} onClick={onExport}>↗ Export</button>
      </div>

      {/* One button per card whose statement has been saved — straight back into its results,
          no re-uploading. The dates are the statement's own coverage, not when it was uploaded. */}
      {(statements || []).length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12, justifyContent:"flex-end" }}>
          {(statements || []).map(st => {
            const colour = METHOD_COLOR[st.method] || "var(--text-muted)";
            return (
              <button key={st.method} onClick={() => onReconcile(st.method)}
                style={{ display:"flex", alignItems:"center", gap:7, background:"var(--surface)", border:`1px solid ${colour}`,
                         borderRadius:20, padding:"5px 12px", cursor:"pointer" }}>
                <span style={{ ...S.dot, background:colour }} />
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text-heading)" }}>{METHOD_NAME[st.method] || st.method}</span>
                <span style={{ fontSize:11, color:"var(--text-secondary)" }}>{statementLabel(st)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Hero: remaining */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"18px", marginBottom:12 }}>
        <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:6, textTransform:"uppercase" }}>Month overview</div>
        <div style={{ fontSize:32, fontWeight:800, color: remaining<0?"#ef4444":remaining<state.monthlyBudget*0.15?"#f97316":"#22c55e", marginBottom:12 }}>{fmt(remaining)}</div>
        <div style={{ fontSize:12, color:"var(--text-body)" }}>{fmt(totalSpent)} spent of {fmt(state.monthlyBudget)}</div>
      </div>

      {/* Gross vs net — waterfall from what hit your cards down to what's actually yours. Shown
          when there's reimbursable (business or split) spend, or credits, to make the distinction. */}
      {(reimbursableTotal > 0 || totalCredits > 0) && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Gross vs net</div>
          {businessTotal > 0 && (
            <button onClick={() => setWaterfallDetail("business")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", fontSize:13, background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
              <span style={{ color:"#f59e0b" }}>Business spend</span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <span style={{ color:"#f59e0b", fontWeight:600 }}>{fmt(businessTotal)}</span>
                <span style={{ color:"var(--text-tertiary)", fontSize:18, fontWeight:700, lineHeight:1 }}>›</span>
              </span>
            </button>
          )}
          {splitTotal > 0 && (
            <button onClick={() => setWaterfallDetail("split")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", fontSize:13, background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
              <span style={{ color:"#a855f7" }}>Split spend</span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <span style={{ color:"#a855f7", fontWeight:600 }}>{fmt(splitTotal)}</span>
                <span style={{ color:"var(--text-tertiary)", fontSize:18, fontWeight:700, lineHeight:1 }}>›</span>
              </span>
            </button>
          )}
          <div style={{ borderTop:"1px solid var(--border)", marginTop:6, display:"flex", justifyContent:"space-between", padding:"6px 0 5px" }}>
            <span style={{ color:"var(--text-body)", fontSize:13, fontWeight:600 }}>Gross spend across all cards</span>
            <span style={{ color:"var(--text-heading)", fontWeight:700, fontSize:13 }}>{fmt(grossSpend)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:13 }}>
            <span style={{ color:"var(--text-tertiary)" }}>Reimbursable spend</span>
            <span style={{ color:"var(--text-tertiary)", fontWeight:600 }}>− {fmt(reimbursableTotal)}</span>
          </div>
          {totalCredits > 0 && (
            <button onClick={() => setWaterfallDetail("credits")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", fontSize:13, background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
              <span style={{ color:"#22c55e" }}>Credits</span>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <span style={{ color:"#22c55e", fontWeight:600 }}>+ {fmt(totalCredits)}</span>
                <span style={{ color:"var(--text-tertiary)", fontSize:18, fontWeight:700, lineHeight:1 }}>›</span>
              </span>
            </button>
          )}
          <div style={{ borderTop:"1px solid var(--border)", marginTop:6, paddingTop:8, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
            <span style={{ color:"var(--text-heading)", fontSize:13, fontWeight:700 }}>Net spend</span>
            <span style={{ color:"var(--text-heading)", fontWeight:800, fontSize:15 }}>{fmt(netTotal)}</span>
          </div>
        </div>
      )}

      {/* By card · as charged — gross per card, matching each card's own statement. Tappable for
          a per-card gross/net breakdown + the transactions that make it up. */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:2, textTransform:"uppercase" }}>By card · as charged</div>
        <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:10 }}>Matches your card statement</div>
        {METHODS.filter(m => grossByMethod[m.id] > 0).map(m => (
          <button key={m.id} onClick={() => setMethodDetail(m.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 0", background:"none", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer", textAlign:"left" }}>
            <span style={{ ...S.dot, background: m.color }} />
            <span style={{ flex:1, fontSize:13, color:"var(--text-body)" }}>{m.name}</span>
            <span style={{ fontWeight:600, color: m.color, fontSize:13 }}>{fmt(grossByMethod[m.id])}</span>
            <span style={{ color:"var(--text-tertiary)", fontSize:20, fontWeight:700, lineHeight:1 }}>›</span>
          </button>
        ))}
        {METHODS.every(m => grossByMethod[m.id] === 0) && <div style={{ color:"var(--text-muted)", fontSize:13, padding:"4px 0" }}>No spend logged yet</div>}
      </div>

      {/* By category — where net personal spend went. Colour is functional here (it keys each
          row to the picker's tiles), unlike the week/pin lists, which are monochrome. */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:2, textTransform:"uppercase" }}>By category</div>
        <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:10 }}>Personal spend only</div>
        {categoryRows.map(r => (
          <button key={r.cat ? r.cat.id : "uncat"} onClick={() => setCategoryDetail(r.cat ? r.cat.id : "uncat")}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"7px 0", background:"none", border:"none", borderBottom:"1px solid var(--border)", cursor:"pointer", textAlign:"left" }}>
            {r.cat
              ? <span style={{ width:22, height:22, borderRadius:"50%", background:r.cat.color, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={r.cat.icon} size={13} color={readableIconColor(r.cat.color)} /></span>
              : <span style={{ width:22, height:22, borderRadius:"50%", background:"var(--surface-2)", display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"var(--text-muted)", fontSize:13 }}>∅</span>}
            <span style={{ flex:1, fontSize:13, color: r.cat ? "var(--text-body)" : "var(--text-tertiary)" }}>{r.cat ? r.cat.name : "Uncategorised"}</span>
            <span style={{ fontWeight:600, color: r.cat ? readableChipColor(r.cat.color) : "var(--text-tertiary)", fontSize:13 }}>{fmt(r.total)}</span>
            <span style={{ color:"var(--text-tertiary)", fontSize:20, fontWeight:700, lineHeight:1 }}>›</span>
          </button>
        ))}
        {categoryRows.length === 0 && <div style={{ color:"var(--text-muted)", fontSize:13, padding:"4px 0" }}>No personal spend logged yet</div>}
      </div>

      {/* Weekly breakdown */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Weekly breakdown</div>
        {/* Latest week first, matching the drill-downs' statement-style ordering. The separator keys
            off position in the rendered list (not week number) so the last row stays borderless. */}
        {[...weekRows].reverse().map(({ week, total, byMethod, budget }, i, arr) => (
          <div key={week.index} style={{ marginBottom: i < arr.length - 1 ? 12 : 0, paddingBottom: i < arr.length - 1 ? 12 : 0, borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div onClick={onGoToWeek ? () => onGoToWeek(week.index) : undefined}
                 style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6, cursor: onGoToWeek ? "pointer" : "default" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"var(--text-heading)" }}>Week {week.index}</span>
              <span style={{ fontSize:13, fontWeight:700, color: total > budget ? "#ef4444" : "var(--text-body)", display:"inline-flex", alignItems:"baseline", gap:6 }}>{fmt(total)} <span style={{ color:"var(--text-secondary)", fontWeight:400 }}>/ {fmt(budget)}</span>{onGoToWeek && <span style={{ color:"var(--text-tertiary)", fontSize:16, fontWeight:700, lineHeight:1 }}>›</span>}</span>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {METHODS.filter(m => byMethod[m.id] > 0).map(m => (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--text-tertiary)" }}>
                  <span style={{ ...S.dot, background: m.color }} />
                  {m.name} {fmt(byMethod[m.id])}
                </div>
              ))}
              {METHODS.every(m => byMethod[m.id] === 0) && <span style={{ fontSize:11, color:"var(--text-muted)" }}>Nothing logged</span>}
            </div>
          </div>
        ))}
      </div>


      {/* Largest spends — toggle between individual transactions and same-name totals. The card is a
          preview of the leading few; "View all" opens the complete ranking in a modal. */}
      {rankedItems.length > 0 && (() => {
        const rows = spendView === "txn" ? rankedItems : rankedLabels;
        const shown = rows.slice(0, SPEND_PREVIEW);
        const hidden = rows.length - shown.length;
        return (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:8 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase" }}>Largest spends</div>
            <div style={{ display:"flex", gap:4 }}>
              <button style={spendSegBtn(spendView === "txn")} onClick={() => setSpendView("txn")}>By transaction</button>
              <button style={spendSegBtn(spendView === "label")} onClick={() => setSpendView("label")}>By label</button>
            </div>
          </div>
          {spendView === "txn"
            ? shown.map((item, i) => <SpendTxnRow key={i} item={item} sep={i < shown.length - 1} onEditEntry={onEditEntry} />)
            : shown.map((g, i) => <SpendLabelRow key={i} group={g} sep={i < shown.length - 1} onOpen={() => setLabelDetail(g)} />)}
          {hidden > 0 && (
            <button onClick={() => setShowAllSpends(true)}
                    style={{ width:"100%", background:"none", border:"none", borderTop:"1px solid var(--border)", color:"var(--text-tertiary)", padding:"10px 0 0", marginTop:6, fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"center" }}>
              View all {rows.length} {spendView === "txn" ? "transactions" : "labels"} ›
            </button>
          )}
        </div>
        );
      })()}

      {/* Source split */}
      {totalSpent > 0 && totalPinned > 0 && totalEntries > 0 && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"14px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:10, textTransform:"uppercase" }}>Spend source</div>
          <div style={{ height:6, background:"var(--surface-2)", borderRadius:3, overflow:"hidden", marginBottom:8, display:"flex" }}>
            <div style={{ height:"100%", width: sourcePct+"%", background:"#0369a1" }} />
            <div style={{ height:"100%", width: (100-sourcePct)+"%", background:"#06b6d4" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
            <span style={{ color:"#0369a1" }}>● Pinned costs {fmt(totalPinned)}</span>
            <span style={{ color:"#06b6d4" }}>Quick-logged {fmt(totalEntries)} ●</span>
          </div>
        </div>
      )}

      {methodDetail && (
        <MethodDetailModal method={methodDetail} groups={transactionsFor(methodDetail)} gross={grossByMethod[methodDetail]} net={methodTotals[methodDetail]} onEditEntry={onEditEntry ? (entry) => { setMethodDetail(null); onEditEntry(entry); } : null} onClose={() => setMethodDetail(null)} />
      )}
      {categoryDetail && (
        <CategoryDetailModal
          cat={categoryDetail === "uncat" ? null : CATEGORY_BY_ID[categoryDetail]}
          groups={transactionsForCategory(categoryDetail === "uncat" ? null : categoryDetail)}
          total={categoryDetail === "uncat" ? uncategorisedTotal : (byCategory[categoryDetail] || 0)}
          onEditEntry={onEditEntry ? (entry) => { setCategoryDetail(null); onEditEntry(entry); } : null}
          onClose={() => setCategoryDetail(null)} />
      )}
      {/* Rendered before the label drill-down so that, with overlays sharing a z-index, tapping a
          label stacks its breakdown on top of this list rather than replacing it. */}
      {showAllSpends && (
        <AllSpendsModal
          view={spendView}
          onView={setSpendView}
          items={rankedItems}
          labels={rankedLabels}
          total={rankedTotal}
          onEditEntry={onEditEntry}
          onOpenLabel={setLabelDetail}
          onClose={() => setShowAllSpends(false)} />
      )}
      {labelDetail && (
        <LabelDetailModal
          group={labelDetail}
          groups={groupByWeek(labelDetail.items, weeks)}
          onEditEntry={onEditEntry ? (entry) => { setLabelDetail(null); onEditEntry(entry); } : null}
          onClose={() => setLabelDetail(null)} />
      )}
      {(waterfallDetail === "business" || waterfallDetail === "split") && (
        <SpendTypeDetailModal
          title={waterfallDetail === "business" ? "Business spend" : "Split spend"}
          color={waterfallDetail === "business" ? "#f59e0b" : "#a855f7"}
          total={waterfallDetail === "business" ? businessTotal : splitTotal}
          groups={transactionsForType(waterfallDetail === "business" ? "business" : "excluded")}
          onEditEntry={onEditEntry ? (entry) => { setWaterfallDetail(null); onEditEntry(entry); } : null}
          onClose={() => setWaterfallDetail(null)} />
      )}
      {waterfallDetail === "credits" && (
        <CreditsDetailModal
          total={totalCredits}
          groups={creditGroups}
          onEditCredit={onEditCredit ? (credit) => { setWaterfallDetail(null); onEditCredit(credit); } : null}
          onClose={() => setWaterfallDetail(null)} />
      )}
    </div>
  );
}

// ─── Largest Spends rows ──────────────────────────────────────────────────────
// Shared by the Summary card (which previews the leading few) and the "View all" modal (which shows
// the complete ranking), so the two renderings can't drift apart.
// Tabs for the reconciliation sheet's two pages. A function, not an entry in S, because S is
// evaluated once at load and this depends on which page is showing.
const reconTabBtn = (on) => ({
  flex: 1, background: on ? "var(--surface-2)" : "transparent",
  border: `1px solid ${on ? "var(--border-strong)" : "transparent"}`, borderRadius: 6,
  // --text-muted here made the inactive tab look disabled rather than like the other half of a
  // pair, which was most of why the second page went unnoticed.
  color: on ? "var(--text-heading)" : "var(--text-tertiary)",
  padding: "7px 4px", fontSize: 12, fontWeight: on ? 700 : 600, cursor: "pointer",
});

const spendSegBtn = (on) => ({ background: on ? "var(--surface-2)" : "transparent", border:`1px solid ${on ? "var(--border-strong)" : "var(--border)"}`, borderRadius:6, color: on ? "var(--text-heading)" : "var(--text-muted)", padding:"4px 8px", fontSize:11, fontWeight: on ? 600 : 500, cursor:"pointer" });

function SpendTxnRow({ item, sep, onEditEntry }) {
  // Real entries tap to edit; pins (no entry ref) stay read-only.
  const editable = item.entry && onEditEntry;
  return (
    <div onClick={editable ? () => onEditEntry(item.entry) : undefined}
         style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: editable ? "pointer" : "default" }}>
      <span style={{ ...S.dot, background: METHOD_COLOR[item.method] || "var(--text-secondary)" }} />
      <span style={{ flex:1, fontSize:13, color: item.type === "business" ? "#f59e0b" : "var(--text-body)" }}>{item.desc}{item.type === "business" && <span style={{ ...S.badge, background:chipColors("#f59e0b").bg, color:"#f59e0b" }}>work</span>}</span>
      <span style={{ fontWeight:600, fontSize:13, color: item.type === "business" ? "#f59e0b" : "var(--text-primary)" }}>{fmt(item.amount)}</span>
      {editable && <span style={{ color:"var(--text-tertiary)", fontSize:15 }}>›</span>}
    </div>
  );
}

function SpendLabelRow({ group, sep, onOpen }) {
  return (
    <div onClick={onOpen}
         style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor:"pointer" }}>
      <span style={{ ...S.dot, background: group.method ? (METHOD_COLOR[group.method] || "var(--text-secondary)") : "var(--text-secondary)" }} />
      <span style={{ flex:1, fontSize:13, color: group.type === "business" ? "#f59e0b" : "var(--text-body)" }}>{group.desc}{group.count > 1 && <span style={{ color:"var(--text-secondary)", fontWeight:400 }}> ×{group.count}</span>}</span>
      <span style={{ fontWeight:600, fontSize:13, color: group.type === "business" ? "#f59e0b" : "var(--text-primary)" }}>{fmt(group.total)}</span>
      <span style={{ color:"var(--text-tertiary)", fontSize:15 }}>›</span>
    </div>
  );
}

// ─── All Spends Modal ─────────────────────────────────────────────────────────
// "View all" from the Summary "Largest spends" card: the complete ranking, highest to lowest, with
// the same By transaction / By label toggle. The toggle is the card's own state, so the modal opens
// on whichever view you were already looking at and the card reflects any change on close.
//
// Tapping a row leaves this modal mounted rather than closing it first: the label breakdown (and the
// entry editor) stack on top, so dismissing one drops you back into the ranking with your scroll
// position intact — the point of the screen being to work down a long list.
function AllSpendsModal({ view, onView, items, labels, total, onEditEntry, onOpenLabel, onClose }) {
  const isTxn = view === "txn";
  const rows = isTxn ? items : labels;
  return (
    <Modal onClose={onClose} title="Largest spends">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, gap:8 }}>
        <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
          {rows.length} {isTxn ? (rows.length === 1 ? "transaction" : "transactions") : (rows.length === 1 ? "label" : "labels")} · {fmt(total)}
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          <button style={spendSegBtn(isTxn)} onClick={() => onView("txn")}>By transaction</button>
          <button style={spendSegBtn(!isTxn)} onClick={() => onView("label")}>By label</button>
        </div>
      </div>
      <div style={{ maxHeight:420, overflowY:"auto" }}>
        {rows.length === 0 && <div style={{ color:"var(--text-muted)", fontSize:13, padding:"12px 0", textAlign:"center" }}>No spend logged yet</div>}
        {isTxn
          ? rows.map((item, i) => <SpendTxnRow key={i} item={item} sep={i < rows.length - 1} onEditEntry={onEditEntry} />)
          : rows.map((g, i) => <SpendLabelRow key={i} group={g} sep={i < rows.length - 1} onOpen={() => onOpenLabel(g)} />)}
      </div>
    </Modal>
  );
}

// ─── Week Grouped List ────────────────────────────────────────────────────────
// Shared list body for the Summary drill-downs: week headers (ascending) punctuating one continuous
// list, each week's rows in the order they were arranged in the week log, then a trailing "Fixed
// costs" section for whole-period pins. Rows stay bespoke per drill-down via renderRow, which
// receives the item, its index within the section, and whether it should draw a separator.
//
// The sections deliberately don't sit in separate blocks: every row keeps its separator except the
// very last one overall, so the rule carries straight through each header and the list scrolls as
// one unbroken run from the end of one week into the start of the next.
//
// These drill-downs stay grouped by WEEK even though entries now carry a spend `day`. Two reasons:
// the drill-downs span the whole period, where day headings would fragment a short list into a
// dozen near-empty sections; and `day` is optional, so any run of older or moved-between-weeks rows
// would collapse into one undated block anyway. The week log is where days earn their keep.
//
// Note the per-transaction date shown here is still nothing: `date` remains the LOGGED-at timestamp
// and is not safe to render — a cross-week move rewrites weekIndex and leaves it alone, so it can
// point outside its own week. `day` is the field that means "when it was spent"; `date` is not.
function WeekGroupedList({ groups, empty, renderRow }) {
  if (!groups.length) return <div style={{ color:"var(--text-muted)", fontSize:13, padding:"12px 0", textAlign:"center" }}>{empty}</div>;
  const lastGroup = groups.length - 1;
  return (
    <div style={{ maxHeight:360, overflowY:"auto" }}>
      {groups.map((g, gi) => (
        <div key={g.key}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.04em", padding:"10px 0 4px" }}>{g.label}</div>
          {g.items.map((t, i) => renderRow(t, i, !(gi === lastGroup && i === g.items.length - 1)))}
        </div>
      ))}
    </div>
  );
}

// ─── Method Detail Modal ──────────────────────────────────────────────────────
function MethodDetailModal({ method, groups, gross, net, onEditEntry, onClose }) {
  const col = METHOD_COLOR[method];
  const reimbursable = gross - net;
  const count = groupCount(groups);
  return (
    <Modal onClose={onClose} title={`${METHOD_NAME[method] || method} transactions`}>
      {/* Gross (what hit the card / matches the statement) reconciled down to your net share */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <div style={{ flex:1, background:"var(--surface-2)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.03em" }}>Gross · as charged</div>
          <div style={{ fontSize:17, fontWeight:800, color: col }}>{fmt(gross)}</div>
        </div>
        <div style={{ flex:1, background:"var(--surface-2)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.03em" }}>Net · your share</div>
          <div style={{ fontSize:17, fontWeight:800, color:"var(--text-heading)" }}>{fmt(net)}</div>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12, padding:"0 2px" }}>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{count} transaction{count === 1 ? "" : "s"}</span>
        {reimbursable > 0.005 && <span style={{ fontSize:11, color:"var(--text-tertiary)" }}>{fmt(reimbursable)} reimbursable</span>}
      </div>
      <WeekGroupedList groups={groups} empty="No transactions yet" renderRow={(t, i, sep) => {
        // Entry-backed rows tap to open the standard editor (splits route to the split editor via
        // openEditEntry); pinned rows stay read-only — managed on the Pinned tab.
        const editable = t.entry && onEditEntry;
        return (
        <div key={i} onClick={editable ? () => onEditEntry(t.entry) : undefined}
             style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: editable ? "pointer" : "default" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a855f7" : "var(--text-primary)" }}>
              {t.desc}
              {t.type === "business" && <span style={{ ...S.badge, background:chipColors("#f59e0b").bg, color:"#f59e0b" }}>work</span>}
              {t.type === "excluded" && <span style={{ ...S.badge, background:chipColors("#a855f7").bg, color:"#a855f7" }}>reimbursable</span>}
            </div>
          </div>
          <span style={{ fontWeight:600, fontSize:13, color: t.type === "business" ? "#f59e0b" : t.type === "excluded" ? "#a855f7" : col }}>{fmt(t.amount)}</span>
          {editable && <span style={{ color:"var(--text-tertiary)", fontSize:15, marginLeft:2 }}>›</span>}
        </div>
        );
      }} />
    </Modal>
  );
}

// ─── Category Detail Modal ────────────────────────────────────────────────────
// Drill-down from the Summary "By category" card: the personal transactions (entries + pins)
// behind one category's total. `cat` is a category object, or null for Uncategorised.
function CategoryDetailModal({ cat, groups, total, onEditEntry, onClose }) {
  const name = cat ? cat.name : "Uncategorised";
  const count = groupCount(groups);
  return (
    <Modal onClose={onClose} title={`${name} spend`}>
      <div style={{ display:"flex", alignItems:"center", gap:10, background:"var(--surface-2)", borderRadius:8, padding:"10px 12px", marginBottom:14 }}>
        {cat
          ? <span style={{ width:34, height:34, borderRadius:"50%", background:cat.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><CategoryIcon icon={cat.icon} size={18} color={readableIconColor(cat.color)} /></span>
          : <span style={{ width:34, height:34, borderRadius:"50%", background:"var(--surface)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"var(--text-muted)", fontSize:18 }}>∅</span>}
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:"var(--text-heading)" }}>{fmt(total)}</div>
          <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{count} transaction{count === 1 ? "" : "s"}</div>
        </div>
      </div>
      <WeekGroupedList groups={groups} empty="No transactions yet" renderRow={(t, i, sep) => {
        // Entry-backed rows are tappable to edit (mainly to re-categorise) via the standard
        // Edit spend modal. Pinned rows stay read-only here — they're managed on the Pinned tab.
        const editable = t.entry && onEditEntry;
        return (
        <div key={i} onClick={editable ? () => onEditEntry(t.entry) : undefined}
             style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: editable ? "pointer" : "default" }}>
          <span style={{ ...S.dot, background: METHOD_COLOR[t.method] || "var(--text-secondary)" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:"var(--text-primary)" }}>{t.desc}</div>
          </div>
          <span style={{ fontWeight:600, fontSize:13, color:"var(--text-primary)" }}>{fmt(t.amount)}</span>
          {editable && <span style={{ color:"var(--text-tertiary)", fontSize:15, marginLeft:2 }}>›</span>}
        </div>
        );
      }} />
    </Modal>
  );
}

// ─── Label Detail Modal ───────────────────────────────────────────────────────
// Drill-down from the Summary "Largest spends · By label" view: every transaction sharing one
// name, summed. Entry-backed rows tap to edit (splits route through openEditEntry); pins are
// read-only, matching the other drill-downs.
function LabelDetailModal({ group, groups, onEditEntry, onClose }) {
  const { desc, total, count } = group;
  return (
    <Modal onClose={onClose} title={desc}>
      <div style={{ background:"var(--surface-2)", borderRadius:8, padding:"10px 12px", marginBottom:14 }}>
        <div style={{ fontSize:17, fontWeight:800, color:"var(--text-heading)" }}>{fmt(total)}</div>
        <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{count} transaction{count === 1 ? "" : "s"}</div>
      </div>
      {/* Grouped by week like the other drill-downs — with repeated same-name purchases, the week
          is what tells two otherwise identical rows apart. */}
      <WeekGroupedList groups={groups} empty="No transactions yet" renderRow={(t, i, sep) => {
        const editable = t.entry && onEditEntry;
        return (
        <div key={i} onClick={editable ? () => onEditEntry(t.entry) : undefined}
             style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: editable ? "pointer" : "default" }}>
          <span style={{ ...S.dot, background: METHOD_COLOR[t.method] || "var(--text-secondary)" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color: t.type === "business" ? "#f59e0b" : "var(--text-primary)" }}>
              {t.desc}
              {t.type === "business" && <span style={{ ...S.badge, background:chipColors("#f59e0b").bg, color:"#f59e0b" }}>work</span>}
              {t.pinned && <span style={{ ...S.badge, background:chipColors("#38bdf8").bg, color:"#38bdf8" }}>📌 fixed</span>}
            </div>
          </div>
          <span style={{ fontWeight:600, fontSize:13, color: t.type === "business" ? "#f59e0b" : "var(--text-primary)" }}>{fmt(t.amount)}</span>
          {editable && <span style={{ color:"var(--text-tertiary)", fontSize:15, marginLeft:2 }}>›</span>}
        </div>
        );
      }} />
    </Modal>
  );
}

// ─── Spend Type Detail Modal ──────────────────────────────────────────────────
// Drill-down from the Summary "Gross vs net" card: the business or split ("not yours")
// transactions (entries + pins) behind one of those subtotals. Pinned rows stay read-only,
// matching the other drill-downs.
function SpendTypeDetailModal({ title, color, total, groups, onEditEntry, onClose }) {
  const count = groupCount(groups);
  return (
    <Modal onClose={onClose} title={title}>
      <div style={{ background:"var(--surface-2)", borderRadius:8, padding:"10px 12px", marginBottom:14 }}>
        <div style={{ fontSize:17, fontWeight:800, color }}>{fmt(total)}</div>
        <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{count} transaction{count === 1 ? "" : "s"}</div>
      </div>
      <WeekGroupedList groups={groups} empty="No transactions yet" renderRow={(t, i, sep) => {
        const editable = t.entry && onEditEntry;
        return (
        <div key={i} onClick={editable ? () => onEditEntry(t.entry) : undefined}
             style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: editable ? "pointer" : "default" }}>
          <span style={{ ...S.dot, background: METHOD_COLOR[t.method] || "var(--text-secondary)" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color }}>{t.desc}</div>
          </div>
          <span style={{ fontWeight:600, fontSize:13, color }}>{fmt(t.amount)}</span>
          {editable && <span style={{ color:"var(--text-tertiary)", fontSize:15, marginLeft:2 }}>›</span>}
        </div>
        );
      }} />
    </Modal>
  );
}

// ─── Credits Detail Modal ─────────────────────────────────────────────────────
// Drill-down from the Summary "Gross vs net" card: every credit this period. Tappable to edit,
// matching how credits are edited from the week log.
function CreditsDetailModal({ total, groups, onEditCredit, onClose }) {
  const count = groupCount(groups);
  return (
    <Modal onClose={onClose} title="Credits">
      <div style={{ background:"var(--surface-2)", borderRadius:8, padding:"10px 12px", marginBottom:14 }}>
        <div style={{ fontSize:17, fontWeight:800, color:"#22c55e" }}>+{fmt(total)}</div>
        <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{count} credit{count === 1 ? "" : "s"}</div>
      </div>
      <WeekGroupedList groups={groups} empty="No credits yet" renderRow={(c, i, sep) => (
        <div key={c.id} onClick={onEditCredit ? () => onEditCredit(c) : undefined}
             style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom: sep ? "1px solid var(--border)" : "none", cursor: onEditCredit ? "pointer" : "default" }}>
          <span style={{ ...S.dot, background:"#22c55e" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:"#22c55e" }}>{c.label || "Credit"}{c.from && <span style={{ color:"var(--text-secondary)" }}> from {c.from}</span>}</div>
          </div>
          <span style={{ fontWeight:600, fontSize:13, color:"#22c55e" }}>+{fmt(c.amount)}</span>
          {onEditCredit && <span style={{ color:"var(--text-tertiary)", fontSize:15, marginLeft:2 }}>›</span>}
        </div>
      )} />
    </Modal>
  );
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ state, weeks, rebalancedBudgets, totalSpent, remaining, totalCredits, methodTotals, onClose }) {
  const [copied, setCopied] = useState(false);

  function buildText() {
    const mn = (id) => METHOD_NAME[id] || id; // resolve a stored method id to its display name
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

  return (
    <Modal onClose={onClose} title="Export">
      <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"12px", fontFamily:"monospace", fontSize:11, color:"var(--text-tertiary)", whiteSpace:"pre-wrap", maxHeight:360, overflowY:"auto", marginBottom:12, lineHeight:1.6 }}>
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
      <div style={{ fontSize:13, color:"var(--text-body)", lineHeight:1.5, marginBottom:12 }}>This is your <strong>encrypted</strong> account — it can only be opened with your passphrase or recovery code, so it's safe to save or send to yourself. Import it in another browser or on a new phone to carry everything across.</div>
      {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
      <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"12px", fontFamily:"monospace", fontSize:10, color:"var(--text-secondary)", whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:150, overflowY:"auto", marginBottom:12, lineHeight:1.5 }}>{text ? (text.length > 500 ? text.slice(0, 500) + "\n…" : text) : "Preparing…"}</div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={{ ...S.btn, background:copied?"#16a34a":"#0369a1", flex:1, ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={copy}>{copied ? "✓ Copied" : "Copy backup"}</button>
        <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1, ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={download}>Download file</button>
      </div>
    </Modal>
  );
}

// ─── Account backup: import (wipes current, installs the imported account) ────
function ImportBackupModal({ onClose }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
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
      <div style={{ background:chipColors("#f59e0b").bg, border:"1px solid #f59e0b", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#f59e0b", lineHeight:1.6, marginBottom:12 }}>
        Importing <strong>replaces everything on this device</strong> with the imported account — the data here is wiped. Export your current account first if you might want it back.
      </div>
      <textarea style={{ ...S.input, height:90, resize:"none", fontFamily:"monospace", fontSize:11 }} placeholder="Paste a backup here…" value={text} onChange={e => setText(e.target.value)} />
      <input type="file" accept=".json,application/json" onChange={onFile} style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:12, width:"100%" }} />
      {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
      {!confirm ? (
        <button style={{ ...S.btn, background: text?"#f59e0b":"var(--surface-2)", color: text?"var(--on-accent)":"var(--text-heading)", width:"100%", ...(text?{}:{opacity:0.5}) }} disabled={!text} onClick={() => setConfirm(true)}>Continue…</button>
      ) : (
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }} onClick={() => setConfirm(false)}>Cancel</button>
          <button style={{ ...S.btn, background:"#dc2626", flex:1 }} disabled={busy} onClick={doImport}>{busy ? "Importing…" : "Wipe & import"}</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Reconcile with a bank statement ──────────────────────────────────────────
// Three steps in one sheet: upload the CSV, confirm which column is which, then work through
// the discrepancies. Nothing is written until the footer's two-step confirm, and everything it
// does write goes out as a single RECONCILE_APPLY so the vault is re-encrypted once, not once
// per fix.
function ReconcileModal({ state, periods, openWith, onEditItem, onDeleteItem, onAddFromRow, onSaveStatement, onForgetStatement, onClose }) {
  const [step, setStep] = useState("upload");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [map, setMap] = useState(null);
  const [methodId, setMethodId] = useState(state.lastMethod || (state.methods[0] || {}).id);
  const [allCards, setAllCards] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [dayIndex, setDayIndex] = useState(null);
  const [open, setOpen] = useState({ missing: true, mismatch: true, extra: true, matched: false, other: false });
  const [updating, setUpdating] = useState(false);   // replacing a saved statement rather than adding one
  const [forget, setForget] = useState(false);      // two-step guard on removing a saved statement
  const [page, setPage] = useState(0);          // 0 = findings, 1 = week log
  const [display, setDisplay] = useState([]);   // every logged item, per period, for the week log
  const [wkPeriod, setWkPeriod] = useState(null);
  const [wkWeek, setWkWeek] = useState(1);
  const pagerRef = useRef(null);

  const lib = REC();
  const methodName = (id) => METHOD_NAME[id] || id;
  const saved = state.statements || [];

  // The statement currently being reconciled, kept so the results can be recomputed against
  // changed data without re-parsing or re-reading the vault.
  const activeRef = useRef(null);

  // Launched from a saved statement's button: go straight to its results. Runs once, on mount.
  useEffect(() => {
    if (!openWith || !lib) return;
    const st = statementFor(state, openWith);
    if (st) runReconcile(lib.unpackStatement(st.rows), st.method);
  }, []);

  // Editing happens in the app's own spend sheet, over the top of this one — so when it writes,
  // these results are stale. Recompute them, and the row just fixed moves out of its category
  // instead of continuing to claim there's a problem.
  useEffect(() => {
    if (step !== "review" || !activeRef.current) return;
    computeResults(activeRef.current.statement, activeRef.current.card);
  }, [state.entries, state.credits, state.pins, state.monthHistory]);

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    f.text().then(t => { setText(t); setErr(""); }).catch(() => setErr("Couldn't read that file."));
  }

  function readStatement() {
    if (!lib) { setErr("The reconciliation module didn't load. Try reopening the app."); return; }
    const parsed = lib.parseCSV(text);
    if (!parsed.rows.length) { setErr("That file has no rows in it."); return; }
    const sniffed = lib.sniffColumns(parsed.rows);
    if (sniffed.dateCol == null || (sniffed.amountCol == null && sniffed.debitCol == null)) {
      setErr("We couldn't find a date and an amount in that file. Check it's the CSV your bank exports.");
      setRows(parsed.rows); setMap(sniffed); setStep("map"); return;
    }
    setErr(""); setRows(parsed.rows); setMap(sniffed); setStep("map");
  }

  // Cross-references `statement` against everything logged and installs the result. Split out from
  // runReconcile so it can be re-run cheaply after an edit without re-parsing or re-saving.
  function computeResults(statement, card) {
    const idx = lib.buildDayIndex(periods.map(p => ({ archiveIndex: p.archiveIndex, weeks: p.weekKeys })));
    // `card` null means every card — the "All cards" option. It is resolved once by the caller and
    // stored, so a re-run after an edit filters exactly as the first run did.
    const candidates = [];
    for (const p of periods) candidates.push(...reconcileCandidates(p, card));
    const res = lib.reconcile({ statement, candidates, dayIndex: idx });
    // Filtered to the card being reconciled, exactly as the matching is: a spend on another card
    // has no bearing on this statement, so listing it only pads the week out with rows carrying no
    // verdict. Credits are unfiltered — reconcileCandidates never filters those by card, and an
    // incoming refund is compared regardless of which card it landed on.
    setDisplay(periods.map(p => ({ archiveIndex: p.archiveIndex, label: p.label, weeks: p.weeks, items: reconcileCandidates(p, card) })));
    setDayIndex(idx);
    setResult(res);
    return { res, idx };
  }

  // `preset` is a saved statement's rows, already normalised — reopening one skips parsing and
  // the column step entirely, which is the whole point of saving it.
  function runReconcile(preset, presetMethod) {
    const statement = preset || lib.buildStatement(rows, map);
    if (!statement.length) { setErr("None of those rows read as transactions. Check the columns above."); return; }
    const card = presetMethod || methodId;
    if (presetMethod) setMethodId(presetMethod);
    if (!preset && onSaveStatement) {
      // Saved on cross-reference, not on apply: an upload is worth keeping even if you decide to
      // change nothing this time.
      onSaveStatement({ method: card, rows: lib.packStatement(statement), span: lib.statementSpan(statement) });
    }
    // Resolve the filter once. Storing the raw card while running with null would mean an edit
    // silently narrowed an "All cards" reconciliation to a single card on the next re-run.
    const compareCard = allCards && !presetMethod ? null : card;
    activeRef.current = { statement, card: compareCard };
    const { res, idx } = computeResults(statement, compareCard);
    // Open the week log where the statement ends, which is the part being reconciled.
    const landing = res.span ? lib.periodIndexFor(res.span.to, idx) : null;
    setWkPeriod(landing ? landing.archiveIndex : null);
    setWkWeek(landing ? landing.weekIndex : (periods[0] ? todayWeekIndex(periods[0].weeks) : 1));
    setPage(0);
    setErr(""); setUpdating(false); setStep("review");
  }

  // Rows are grouped by day and rendered exactly as the week log renders them, newest first.
  // The whole point of this screen is that a discrepancy looks like the thing it refers to.
  const byDay = (list, dayOf) => {
    const out = [];
    const sorted = list.slice().sort((a, b) => {
      const A = dayOf(a) || "0", B = dayOf(b) || "0";
      return B < A ? -1 : B > A ? 1 : 0;
    });
    for (const it of sorted) {
      const k = dayOf(it) || "undated";
      if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  };
  const DayHead = ({ k }) => (
    <div style={S.dayHead}><span style={S.dayHeadLabel}>{k === "undated" ? "Undated" : dayKeyLabel(k)}</span></div>
  );
  const rowNote = { fontSize:11, lineHeight:1.5, padding:"0 0 8px 22px", marginTop:-4 };

  // One logged item, in the app's own row language — the same components the week log uses, so
  // tapping it opens the same editor and it reads identically in both places.
  const LoggedRow = ({ c, note, noteColour, hideDelete }) => {
    const ref = c.ref;
    // A pinned occurrence isn't a row in `entries` — it's generated from the pin. Tapping opens the
    // pin editor and deleting skips just this month's charge, which is exactly what the week log
    // offers. A pin inside a finished period is a snapshot, so it stays read-only there.
    const pinLocked = c.kind === "pin" && ref.archiveIndex != null;
    const handlers = {
      onEdit: !pinLocked && onEditItem ? () => onEditItem(c) : undefined,
      onDel: !pinLocked && onDeleteItem ? () => onDeleteItem(c) : undefined,
      hideDelete: hideDelete || pinLocked,
    };
    return (
      <div>
        {c.kind === "split"
          ? <SplitLine group={[ref.your, ref.their].filter(Boolean)} {...handlers} />
          : c.kind === "credit"
            ? <CreditLine credit={ref.credit} {...handlers} />
            : <EntryLine entry={ref.entry} {...handlers} />}
        {note && <div style={{ ...rowNote, color: noteColour || "var(--text-secondary)" }}>{note}</div>}
        {pinLocked && <div style={{ ...rowNote, color:"var(--text-secondary)" }}>A fixed cost in a finished period — read-only.</div>}
      </div>
    );
  };

  // A statement transaction with nothing logged against it, drawn the way it would look once
  // logged. Tapping opens the normal spend sheet filled in from the statement — you review and
  // save it yourself; nothing is written until you do.
  const StatementRow = ({ row, onOpen }) => (
    row.direction === "credit"
      ? <CreditLine credit={{ label: row.description || "Money in", amount: row.amount }} onEdit={onOpen} hideDelete />
      : <EntryLine entry={{ amount: row.amount, label: row.description, method: methodId, type: "personal" }} onEdit={onOpen} hideDelete />
  );

  const Section = ({ id, title, colour, count, hint, children }) => count === 0 ? null : (
    <div style={{ border:"1px solid var(--border)", borderRadius:10, marginBottom:10, overflow:"hidden" }}>
      <button onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
                 background:"var(--surface)", border:"none", padding:"10px 12px", cursor:"pointer", textAlign:"left" }}>
        <span style={{ fontSize:13, fontWeight:600, color: colour ? (colour.charAt(0) === "#" ? acc(colour) : colour) : "var(--text-heading)" }}>{title}</span>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{count} {open[id] ? "▾" : "▸"}</span>
      </button>
      {open[id] && (
        <div style={{ padding:"0 12px 10px" }}>
          {hint && <div style={{ fontSize:11, color:"var(--text-secondary)", lineHeight:1.5, margin:"2px 0 8px" }}>{hint}</div>}
          {children}
        </div>
      )}
    </div>
  );

  const rowBox = { display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop:"1px solid var(--border)" };
  const periodTag = (archiveIndex) => {
    const p = periods.find(x => x.archiveIndex === archiveIndex);
    return p && p.archiveIndex != null ? p.label : null;
  };

  // ── Step 1: upload ──────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <Modal onClose={onClose} title={updating ? "Update statement" : "Reconcile a statement"}>
        {saved.length > 0 && !updating && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", marginBottom:6 }}>Saved statements</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {saved.map(st => (
                <button key={st.method} onClick={() => runReconcile(lib.unpackStatement(st.rows), st.method)}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", cursor:"pointer",
                           background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:10, padding:"10px 12px" }}>
                  <span style={{ ...S.dot, background: METHOD_COLOR[st.method] || "var(--text-muted)" }} />
                  <span style={{ flex:1, minWidth:0 }}>
                    <span style={{ display:"block", fontSize:13, fontWeight:600, color:"var(--text-heading)" }}>{methodName(st.method)}</span>
                    <span style={{ display:"block", fontSize:11, color:"var(--text-secondary)" }}>
                      {statementLabel(st)} · {(st.rows || []).length} transaction{(st.rows || []).length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span style={{ fontSize:13, color:"var(--text-tertiary)", flexShrink:0 }}>›</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"var(--text-secondary)", lineHeight:1.5, marginTop:8 }}>
              Tap one to cross-reference it again — no need to upload it a second time. Upload below to
              replace whichever card's statement you choose.
            </div>
          </div>
        )}

        <div style={{ fontSize:13, color:"var(--text-body)", lineHeight:1.5, marginBottom:12 }}>
          {updating
            ? `Upload the latest CSV for ${methodName(methodId)}. It replaces the statement saved for this card — your logged spending isn't touched.`
            : "Upload the CSV your bank or card provider exports. SpendTracker reads it, cross-references it with what you've logged, and shows you anything that doesn't line up. Nothing is changed until you say so, and the file never leaves your phone."}
        </div>

        {!updating && <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:6 }}>Which card is this statement for?</div>}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6, ...(updating ? { display:"none" } : {}) }}>
          {(state.methods || []).map(m => (
            <button key={m.id} onClick={() => { setMethodId(m.id); setAllCards(false); }}
              style={{ background: (!allCards && methodId === m.id) ? m.color : "var(--surface)",
                       border:`1px solid ${(!allCards && methodId === m.id) ? m.color : "var(--border-strong)"}`,
                       color: (!allCards && methodId === m.id) ? readableIconColor(m.color) : "var(--text-tertiary)",
                       borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>{m.name}</button>
          ))}
          <button onClick={() => setAllCards(true)}
            style={{ background: allCards ? "var(--surface-2)" : "var(--surface)",
                     border:`1px solid ${allCards ? "var(--border-strong)" : "var(--border)"}`,
                     color: allCards ? "var(--text-heading)" : "var(--text-muted)",
                     borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>All cards</button>
        </div>
        {!updating && (
          <div style={{ fontSize:11, color:"var(--text-secondary)", lineHeight:1.5, marginBottom:12 }}>
            {allCards
              ? "Every spend you've logged will be compared against this statement — useful for a single-account check, but spends on your other cards will look missing."
              : `Only spends logged to ${methodName(methodId)} will be compared, so your other cards aren't wrongly flagged.`}
          </div>
        )}

        <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={onFile}
          style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:10, width:"100%" }} />
        {fileName && <div style={{ fontSize:11, color:"var(--text-tertiary)", marginBottom:8 }}>Loaded {fileName}</div>}
        <textarea style={{ ...S.input, height:80, resize:"none", fontFamily:"monospace", fontSize:11 }}
          placeholder="…or paste the statement here" value={text} onChange={e => setText(e.target.value)} />
        {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
        <button style={{ ...S.btn, background: text.trim() ? "#0369a1" : "var(--surface-2)",
                         color: text.trim() ? "var(--on-accent)" : "var(--text-heading)",
                         width:"100%", ...(text.trim() ? {} : { opacity:0.5 }) }}
          disabled={!text.trim()} onClick={readStatement}>Read statement</button>
        {updating && statementFor(state, methodId) && (
          <div style={{ marginTop:10 }}>
            {/* The app's two-step destructive pattern, as used by Reset in Settings. */}
            {!forget ? (
              <button style={{ ...S.btn, width:"100%", background:"var(--danger-soft-bg)", border:"1px solid var(--danger-soft-border)", color:"var(--danger-soft-text)" }}
                onClick={() => setForget(true)}>Forget this saved statement</button>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }}
                  onClick={() => setForget(false)}>Cancel</button>
                <button style={{ ...S.btn, background:"#dc2626", flex:1 }}
                  onClick={() => { if (onForgetStatement) onForgetStatement(methodId); onClose(); }}>Forget it</button>
              </div>
            )}
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:6, lineHeight:1.5 }}>
              This removes only the copy of the statement held here. Nothing you have logged changes.
            </div>
          </div>
        )}
      </Modal>
    );
  }

  // ── Step 2: confirm the columns ─────────────────────────────────────────────
  if (step === "map") {
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    const head = map.hasHeader ? rows[0] : null;
    const colLabel = (i) => (head && String(head[i] || "").trim()) ? String(head[i]).trim() : "Column " + (i + 1);
    const preview = (map.hasHeader ? rows.slice(1) : rows).slice(0, 3);
    const set = (patch) => setMap(m => ({ ...m, ...patch }));
    const pick = (label, value, onPick, allowNone) => (
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>{label}</label>
        <select value={value == null ? "" : value} onChange={e => onPick(e.target.value === "" ? null : Number(e.target.value))}
          style={{ ...S.input, marginBottom:0 }}>
          {allowNone && <option value="">— none —</option>}
          {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
        </select>
      </div>
    );
    const seg = (on) => ({ flex:1, background: on ? "var(--surface-2)" : "var(--surface)",
      border:`1px solid ${on ? "var(--border-strong)" : "var(--border)"}`, borderRadius:8,
      color: on ? "var(--text-heading)" : "var(--text-muted)", padding:"8px 4px", fontSize:12, fontWeight:600, cursor:"pointer" });

    return (
      <Modal onClose={onClose} title="Check the columns">
        <div style={{ fontSize:13, color:"var(--text-body)", lineHeight:1.5, marginBottom:12 }}>
          {map.confidence === "high"
            ? "We recognised this statement's layout. Have a quick look, then carry on."
            : "We've had a guess at this layout — banks all export differently. Correct anything that's wrong before carrying on."}
        </div>

        {pick("Date", map.dateCol, v => set({ dateCol: v }))}
        {pick("Description", map.descCol, v => set({ descCol: v }))}
        {map.debitCol != null || map.creditCol != null ? (
          <React.Fragment>
            {pick("Money out", map.debitCol, v => set({ debitCol: v }), true)}
            {pick("Money in", map.creditCol, v => set({ creditCol: v }), true)}
          </React.Fragment>
        ) : pick("Amount", map.amountCol, v => set({ amountCol: v }))}

        {map.dateAmbiguous && (
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>Date order</label>
            <div style={{ display:"flex", gap:6 }}>
              <button style={seg(map.dateFormat === "DMY")} onClick={() => set({ dateFormat:"DMY" })}>Day / month</button>
              <button style={seg(map.dateFormat === "MDY")} onClick={() => set({ dateFormat:"MDY" })}>Month / day</button>
            </div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6, lineHeight:1.5 }}>
              Every date in this file could be read either way, so we've assumed day first. Check one against your statement.
            </div>
          </div>
        )}

        {map.debitCol == null && map.creditCol == null && (
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:12, color:"var(--text-secondary)", display:"block", marginBottom:4 }}>A spend shows as</label>
            <div style={{ display:"flex", gap:6 }}>
              <button style={seg(map.spendIsPositive)} onClick={() => set({ spendIsPositive:true })}>A positive number</button>
              <button style={seg(!map.spendIsPositive)} onClick={() => set({ spendIsPositive:false })}>A negative number</button>
            </div>
          </div>
        )}

        <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", margin:"14px 0 6px" }}>How we read the first few rows</div>
        <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", marginBottom:12 }}>
          {preview.map((r, i) => {
            const d = map.dateCol == null ? null : lib.parseDate(r[map.dateCol], map.dateFormat);
            const amt = map.debitCol != null || map.creditCol != null
              ? (lib.parseAmount(r[map.debitCol]).ok && Math.abs(lib.parseAmount(r[map.debitCol]).value) > 0
                  ? lib.parseAmount(r[map.debitCol]).value : -Math.abs(lib.parseAmount(r[map.creditCol]).value))
              : (map.spendIsPositive === false ? -lib.parseAmount(r[map.amountCol]).value : lib.parseAmount(r[map.amountCol]).value);
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:12, padding:"4px 0",
                                    borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span style={{ color: d ? "var(--text-tertiary)" : "#f87171", flexShrink:0 }}>{d ? dayKeyLabel(d) : "unreadable"}</span>
                <span style={{ color:"var(--text-body)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {map.descCol == null ? "—" : String(r[map.descCol] || "").trim()}
                </span>
                <span style={{ color: amt > 0 ? "var(--text-heading)" : "#22c55e", fontWeight:600, flexShrink:0 }}>
                  {amt > 0 ? "−" : "+"}{fmt(amt)}
                </span>
              </div>
            );
          })}
        </div>

        {err && <div style={{ color:"#f87171", fontSize:13, marginBottom:10 }}>{err}</div>}
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", flex:1 }}
            onClick={() => setStep("upload")}>Back</button>
          <button style={{ ...S.btn, background:"#0369a1", flex:2 }} onClick={() => runReconcile()}>Cross-reference</button>
        </div>
      </Modal>
    );
  }

  // ── Step 3: the discrepancies ───────────────────────────────────────────────
  const r = result;
  const clean = !r.missingFromApp.length && !r.amountMismatch.length && !r.notOnStatement.length;

  const status = lib.statusIndex(r);
  // Accent colours are fixed across themes by design, but at full strength several of them are
  // near-illegible as TEXT on the light theme's cream surface (amber managed 2.1:1). Every accent
  // used as text in this sheet goes through here; fills and tints keep the raw colour.
  const acc = readableAccentText;

  const goPage = (i) => {
    setPage(i);
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  // Keep the tabs honest when the page is changed by swiping rather than tapping.
  const onPagerScroll = (e) => {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== page) setPage(i);
  };

  const findings = (
    <React.Fragment>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["Matched", r.matched.length, "#22c55e"], ["Don't match", r.amountMismatch.length, "#f59e0b"],
          ["Missing", r.missingFromApp.length, "#ef4444"], ["Extra", r.notOnStatement.length, "#a855f7"]].map(([l, n, c]) => (
          <div key={l} style={{ flex:1, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 6px", textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:800, color: n ? acc(c) : "var(--text-muted)" }}>{n}</div>
            <div style={{ fontSize:10, color:"var(--text-secondary)" }}>{l}</div>
          </div>
        ))}
      </div>

      {clean && (
        <div style={{ background:chipColors("#22c55e").bg, border:`1px solid ${acc("#22c55e")}`, borderRadius:10, padding:"12px 14px",
                      fontSize:13, color:acc("#22c55e"), lineHeight:1.6, marginBottom:12 }}>
          Everything on this statement lines up with what you have logged. Nothing to fix.
        </div>
      )}

      <Section id="missing" colour="#ef4444" title="On your statement, not logged" count={r.missingFromApp.length}
        hint={`Charged${allCards ? "" : ` to ${methodName(methodId)}`}, but nothing logged against it. Tap one to open it in the usual spend sheet, filled in from the statement — check it and save, or leave it alone.`}>
        {byDay(r.missingFromApp, (row) => row.date).map(day => (
          <div key={day.key}>
            <DayHead k={day.key} />
            {day.items.map(row => {
              const at = lib.periodIndexFor(row.date, dayIndex);
              const tag = at ? periodTag(at.archiveIndex) : null;
              return (
                <div key={row.id}>
                  <StatementRow row={row} onOpen={() => at && onAddFromRow && onAddFromRow(row, at, methodId)} />
                  {tag && <div style={{ ...rowNote, color:"var(--text-secondary)" }}>{tag}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </Section>

      <Section id="mismatch" colour="#f59e0b" title="Amounts don't match" count={r.amountMismatch.length}
        hint="Same date, same transaction as far as we can tell, but a different amount. Matching goes on the date and the amount, not the name — what you type is a note to yourself, while your bank writes something else — so check the pairing before changing anything.">
        {byDay(r.amountMismatch, (m) => m.candidate.day || m.row.date).map(day => (
          <div key={day.key}>
            <DayHead k={day.key} />
            {day.items.map(m => (
              <LoggedRow key={m.row.id} c={m.candidate}
                noteColour={acc("#f59e0b")}
                note={`Statement says ${fmt(m.row.amount)}${m.row.description ? ` · ${m.row.description}` : ""}`} />
            ))}
          </div>
        ))}
      </Section>

      <Section id="extra" colour="#a855f7" title="Logged, but not on your statement" count={r.notOnStatement.length}
        hint="Nothing on the statement accounts for these. A cash spend, a transaction still pending, or something logged to the wrong card would all land here — so they are not necessarily wrong.">
        {byDay(r.notOnStatement, (c) => c.day).map(day => (
          <div key={day.key}>
            <DayHead k={day.key} />
            {day.items.map(c => {
              const tag = periodTag(c.ref.archiveIndex);
              return <LoggedRow key={c.key} c={c} note={tag} />;
            })}
          </div>
        ))}
      </Section>

      <Section id="other" colour="var(--text-tertiary)" title="Skipped" count={r.skipped.length + r.outOfRange.length}
        hint="Left alone. Card payments and transfers aren't spending, and dates outside every period you have tracked have nowhere to go.">
        {[...r.skipped, ...r.outOfRange].map(row => (
          <div key={row.id} style={{ ...rowBox, opacity:0.75 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, color:"var(--text-tertiary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.description}</div>
              <div style={{ fontSize:11, color:"var(--text-secondary)" }}>{dayKeyLabel(row.date)} · {row.ignoreReason || "outside your tracked periods"}</div>
            </div>
            <div style={{ fontSize:13, color:"var(--text-tertiary)" }}>{fmt(row.amount)}</div>
          </div>
        ))}
      </Section>

      <Section id="matched" colour="#22c55e" title="Matched" count={r.matched.length}
        hint="These line up with the statement.">
        {byDay(r.matched, (m) => m.candidate.day || m.row.date).map(day => (
          <div key={day.key}>
            <DayHead k={day.key} />
            {day.items.map(m => (
              <LoggedRow key={m.row.id} c={m.candidate} hideDelete
                note={m.how === "date-drift" ? "Posted a few days later" : m.how === "remembered" ? "Reconciled before" : null} />
            ))}
          </div>
        ))}
      </Section>
    </React.Fragment>
  );

  const wkP = display.find(d => d.archiveIndex === wkPeriod) || display[0];
  const weekLog = !wkP ? null : (() => {
    const rows = wkP.items.filter(c => c.weekIndex === wkWeek);
    // Everything listed below, added up — including work spends and the not-yours half of a
    // split, because all of it hit the card. Deliberately NOT the Week tab's figure, which is
    // personal spend against budget across every card; hence the label, so two different numbers
    // for one week can't be mistaken for each other.
    const total = rows.filter(c => c.direction !== "credit").reduce((t, c) => t + c.amount, 0);
    // A flat list, newest first, with each row carrying its own date. Day headings work on the
    // Week tab because a week there is a dozen rows of one card's worth of life; here the list is
    // already filtered to one card and is mostly read by scanning dates against a statement, which
    // is easier when every row states its own.
    const ordered = rows.slice().sort((a, b) => (b.day || "0") < (a.day || "0") ? -1 : (b.day || "0") > (a.day || "0") ? 1 : 0);
    // Only the live period has a "this week"; an archived one is entirely in the past.
    const currentWeek = wkP.archiveIndex == null ? weekIndexForDay(wkP.weeks, dayKey(londonNow())) : null;
    const wIdx = wkP.weeks.findIndex(w => w.index === wkWeek);
    const week = wkP.weeks[wIdx];
    const pIdx = display.findIndex(d => d.archiveIndex === wkP.archiveIndex);
    const jumpPeriod = (delta) => {
      const next = display[pIdx + delta];
      if (!next) return;
      setWkPeriod(next.archiveIndex);
      setWkWeek(next.weeks.length ? next.weeks[next.weeks.length - 1].index : 1);
    };
    return (
      <div>
        {display.length > 1 && (
          <div style={{ ...S.periodNav, marginBottom:8 }}>
            {/* display is ordered live-first, so "earlier" means further down the list. */}
            <button style={{ ...S.periodNavBtn, ...(display[pIdx + 1] ? {} : S.periodNavBtnOff) }} disabled={!display[pIdx + 1]}
              aria-label="Earlier period in log" onClick={() => jumpPeriod(1)}>◀</button>
            <div style={{ textAlign:"center", lineHeight:1.2 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text-heading)" }}>{wkP.label}</div>
              <div style={{ fontSize:10, color:"var(--text-muted)" }}>{wkP.archiveIndex == null ? "current period" : "finished period"}</div>
            </div>
            <button style={{ ...S.periodNavBtn, ...(display[pIdx - 1] ? {} : S.periodNavBtnOff) }} disabled={!display[pIdx - 1]}
              aria-label="Later period in log" onClick={() => jumpPeriod(-1)}>▶</button>
          </div>
        )}
        {/* Wraps rather than scrolling sideways: a nested horizontal scroller would fight the
            swipe between these two pages. */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
          {wkP.weeks.map(w => (
            <button key={w.index} onClick={() => setWkWeek(w.index)}
              style={{ ...S.weekPill, ...(w.index === currentWeek ? S.weekPillCurrent : {}), ...(wkWeek === w.index ? S.weekPillActive : {}) }}>W{w.index}</button>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8, marginBottom:4 }}>
          <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
            {week ? `${dateStr(week.start)} — ${dateStr(week.end)}` : `Week ${wkWeek}`}
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--text-heading)" }}>{fmt(total)}</div>
            <div style={{ fontSize:10, color:"var(--text-secondary)" }}>{allCards ? "logged this week" : `logged to ${methodName(methodId)}`}</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ ...S.empty, marginTop:4, textAlign:"center" }}>
            {allCards ? "Nothing logged this week" : `Nothing logged to ${methodName(methodId)} this week`}
          </div>
        ) : (
          <div>
            {ordered.map(c => {
              const v = status[c.key];
              // A glyph, not a filled dot: the Week tab already uses a coloured dot in this exact
              // position to mean "which card", and the two palettes overlap almost exactly.
              // Shape carries the verdict, colour only reinforces it.
              const mark = !v ? { g:"·", c:"var(--text-muted)", text:"" }
                : v.status === "matched" ? { g:"✓", c:acc("#22c55e"), text:"on the statement" }
                : v.status === "mismatch" ? { g:"≠", c:acc("#f59e0b"), text:`statement says ${fmt(v.row.amount)}` }
                : v.status === "extra" ? { g:"!", c:acc("#a855f7"), text:"not on the statement" }
                : v.status === "undated" ? { g:"·", c:"var(--text-muted)", text:"undated, so not compared" }
                : { g:"·", c:"var(--text-muted)", text:"outside the statement's dates" };
              // Built as a list so the separator can't be decided from the wrong subset — a credit
              // with no card and no share once rendered as "money inon the statement".
              const meta = [
                // Only worth naming the card when several are in play — otherwise the header
                // already says which card this is, and repeating it on every row is what pushes
                // the line onto a second row.
                allCards && c.method ? METHOD_NAME[c.method] || c.method : null,
                c.kind === "pin" ? "pinned" : c.type === "split" ? "split" : c.type === "business" ? "work"
                  : c.type === "excluded" ? "not yours" : c.direction === "credit" ? "money in" : null,
                c.kind === "split" && c.ref.your ? `your share ${fmt(c.ref.your.amount)}` : null,
              ].filter(Boolean);
              return (
                <div key={c.key} style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"7px 0", borderTop:"1px solid var(--border)" }}>
                  <span role="img" aria-label={mark.text || "no verdict"}
                    style={{ width:14, flexShrink:0, textAlign:"center", fontSize:12, fontWeight:700, lineHeight:"18px", color:mark.c }}>{mark.g}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {c.label || "(no description)"}
                    </div>
                    {/* Wraps rather than truncating: at 320px, or with a long payment-type name,
                        an ellipsis here cut the verdict off and left colour as the only signal. */}
                    <div style={{ fontSize:11, color:"var(--text-secondary)", lineHeight:1.45 }}>
                      <span style={{ color:"var(--text-tertiary)", fontWeight:600 }}>{c.day ? dayKeyLabel(c.day) : "Undated"}</span>
                      {meta.length > 0 && ` · ${meta.join(" · ")}`}
                      {mark.text && <span style={{ color:mark.c }}> · {mark.text}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, flexShrink:0, color: c.direction === "credit" ? acc("#22c55e") : "var(--text-heading)" }}>
                    {c.direction === "credit" ? "+" : ""}{fmt(c.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })();

  return (
    <Modal onClose={onClose} title="Reconciliation">
      <div role="tablist" aria-label="Reconciliation pages"
        style={{ display:"flex", gap:4, marginBottom:10, background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:3,
                 position:"sticky", top:0, zIndex:2 }}>
        {["Findings", "Your week log"].map((l, i) => (
          <button key={l} role="tab" aria-selected={page === i} id={`recon-tab-${i}`} aria-controls={`recon-page-${i}`}
            onClick={() => goPage(i)} style={reconTabBtn(page === i)}>{l}</button>
        ))}
      </div>

      {(() => {
        const st = statementFor(state, methodId);
        if (!st) return null;
        return (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, fontSize:11, color:"var(--text-secondary)" }}>
            <span style={{ ...S.dot, background: METHOD_COLOR[st.method] || "var(--text-muted)" }} />
            <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {methodName(st.method)} · {statementLabel(st)}
            </span>
            <button onClick={() => { setUpdating(true); setForget(false); setText(""); setFileName(""); setErr(""); setStep("upload"); }}
              style={{ background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:6, color:"var(--text-tertiary)",
                       padding:"4px 9px", fontSize:11, fontWeight:600, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
              Update statement
            </button>
          </div>
        );
      })()}

      {/* Two pages side by side, swiped between or tapped above. Each scrolls on its own so the
          tabs and the apply bar stay put while you read either one. */}
      <div ref={pagerRef} onScroll={onPagerScroll} style={S.reconPager}>
        <div role="tabpanel" id="recon-page-0" aria-labelledby="recon-tab-0" style={S.reconPage}>{findings}</div>
        <div role="tabpanel" id="recon-page-1" aria-labelledby="recon-tab-1" style={S.reconPage}>{weekLog}</div>
      </div>

      <div style={{ borderTop:"1px solid var(--border)", paddingTop:12, marginTop:4,
                    position:"sticky", bottom:0, background:"var(--surface)", zIndex:2 }}>
        <button style={{ ...S.btn, background:"var(--surface-2)", border:"1px solid var(--border-strong)", color:"var(--text-heading)", width:"100%" }}
          onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ children, onClose, title }) {
  // The sheet is a column: a header that stays put and a body that scrolls. Without this the
  // sheet simply grew past the bottom of the screen with no way to reach the rest of it — which
  // only showed up once a modal (reconciliation) had more content than a phone screen.
  return <div style={S.modalOverlay} onClick={onClose}><div style={S.modalSheet} onClick={e => e.stopPropagation()}><div style={S.modalHeader}><span style={S.modalTitle}>{title}</span><button style={S.delBtn} onClick={onClose}>✕</button></div><div style={S.modalBody}>{children}</div></div></div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background:"var(--bg)", minHeight:"100vh", color:"var(--text-primary)", maxWidth:480, margin:"0 auto", paddingBottom:40 },
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"20px 16px 12px", borderBottom:"1px solid var(--border)" },
  appTitle: { fontSize:24, fontWeight:800, letterSpacing:"-1px", color:"var(--text-heading)" },
  appSub: { fontSize:12, color:"var(--text-secondary)", marginTop:2 },
  headerRight: { textAlign:"right" },
  headerGearBtn: { background:"var(--surface)", border:"1px solid var(--border-strong)", color:"var(--text-secondary)", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0 },
  remaining: { fontSize:28, fontWeight:800, letterSpacing:"-1px", lineHeight:1 },
  remainLabel: { fontSize:10, color:"var(--text-secondary)", textTransform:"uppercase" },
  pastBanner: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, background:"var(--surface-2)", borderBottom:"1px solid #f59e0b", padding:"8px 16px", fontSize:11, color:"var(--text-body)" },
  pastBannerBtn: { background:"#f59e0b", border:"none", borderRadius:6, color:"var(--on-accent)", padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" },
  tabs: { display:"flex", borderBottom:"1px solid var(--border)", padding:"0 16px" },
  tab: { flex:1, background:"none", border:"none", borderBottom:"2px solid transparent", color:"var(--text-secondary)", padding:"10px 4px", fontSize:13, fontWeight:500, cursor:"pointer" },
  tabActive: { color:"var(--text-heading)", borderBottom:"2px solid #0369a1" },
  weekNav: { display:"flex", gap:6, marginBottom:12, overflowX:"auto" },
  // The swipeable pair of pages inside the reconciliation sheet. A fixed height (rather than
  // letting the row grow to its tallest page) keeps the tabs and the apply bar in place, and
  // stops the short page dragging a screenful of blank space along behind it.
  // maxHeight, deliberately NOT height: a fixed height left a clean reconciliation showing half a
  // screen of blank surface, and on a short viewport (landscape) it pushed the apply bar off the
  // bottom. Capped instead, the pager is as tall as its content needs up to the cap.
  reconPager: { display:"flex", overflowX:"auto", overflowY:"hidden", scrollSnapType:"x mandatory", overscrollBehaviorX:"contain", WebkitOverflowScrolling:"touch", scrollbarWidth:"none", maxHeight:"56vh" },
  // No overscroll containment on the Y axis: with it, a flick inside a page refused to chain to
  // the sheet, so on a short viewport there was no way to scroll down to the apply bar at all.
  // The sheet body keeps its own containment, which is what stops the page behind scrolling.
  reconPage: { flex:"0 0 100%", width:"100%", minWidth:0, scrollSnapAlign:"start", overflowY:"auto", WebkitOverflowScrolling:"touch", paddingRight:2 },
  periodNav: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"6px 8px", marginBottom:10 },
  periodNavBtn: { background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:8, color:"var(--text-tertiary)", width:32, height:32, fontSize:13, cursor:"pointer", flexShrink:0, padding:0 },
  periodNavBtnOff: { opacity:0.3, cursor:"default" },
  weekPill: { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, color:"var(--text-secondary)", padding:"6px 12px", fontSize:13, fontWeight:500, cursor:"pointer", flexShrink:0 },
  // Both variants set the full `border` shorthand: mixing shorthand + borderColor longhand
  // makes React clear the colour to currentColor when a pill deactivates (white rings).
  weekPillActive: { background:"#0369a1", border:"1px solid #0369a1", color:"var(--on-accent)" },
  weekPillCurrent: { border:"1px solid var(--text-heading)" },
  dailyCard: { flex:1, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px" },
  dailyLabel: { fontSize:10, color:"var(--text-secondary)", textTransform:"uppercase", marginBottom:3 },
  dailySub: { fontSize:10, color:"var(--text-secondary)", marginTop:2 },
  weekHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"10px 0 8px", borderBottom:"1px solid var(--border)", marginBottom:10 },
  budgetCard: { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"12px" },
  bar: { height:6, background:"var(--surface-2)", borderRadius:3, overflow:"hidden" },
  barFill: { height:"100%", borderRadius:3 },
  entryRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:"1px solid var(--surface)" },
  splitGroup: { background:"#a855f714", border:"1px solid #a855f733", borderRadius:8, padding:"2px 10px", marginBottom:8 },
  entryRowGrouped: { borderBottom:"1px solid #a855f722" },
  dot: { width:7, height:7, borderRadius:"50%", flexShrink:0 },
  // Layout only — colour is applied inline at each usage site (via chipColors, called live at
  // render time), never baked in here: S is a plain object evaluated once at script load, so a
  // chipColors() call placed directly in this literal would freeze at whatever theme was active
  // then and never update on a later in-app theme toggle.
  badge: { fontSize:10, borderRadius:3, padding:"1px 4px", marginLeft:4 },
  delBtn: { background:"none", border:"none", color:"var(--text-secondary)", cursor:"pointer", fontSize:16, padding:"0 2px" },
  actionBtn: { background:"var(--surface)", border:"1px dashed var(--border-strong)", borderRadius:8, color:"var(--text-tertiary)", padding:"10px", fontSize:13, fontWeight:500, cursor:"pointer" },
  editToggle: { background:"var(--surface)", border:"1px solid var(--border-strong)", borderRadius:8, color:"var(--text-tertiary)", padding:"10px 16px", fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 },
  bulkDelBar: { display:"flex", alignItems:"center", gap:8, marginTop:12 },
  checkbox: { width:22, height:22, flexShrink:0, borderRadius:6, border:"1px solid var(--border-strong)", background:"var(--surface)", color:"#22c55e", fontSize:13, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 },
  dragHandle: { flexShrink:0, background:"none", border:"none", color:"var(--text-muted)", fontSize:20, lineHeight:1, cursor:"grab", padding:"6px 4px", touchAction:"none", userSelect:"none" },
  rowDragging: { opacity:0.55, background:"var(--surface)", borderRadius:8 },
  sectionTitle: { fontSize:13, fontWeight:700, color:"var(--text-body)", textTransform:"uppercase", letterSpacing:"0.08em" },
  addBtn: { background:"#0369a1", border:"none", borderRadius:6, color:"var(--on-accent)", padding:"5px 12px", fontSize:12, fontWeight:600, cursor:"pointer" },
  pinGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  pinCard: { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"12px" },
  empty: { color:"var(--text-muted)", fontSize:13, padding:"12px 0" },
  iconBtn: { background:"none", border:"none", color:"var(--text-secondary)", cursor:"pointer", fontSize:13, padding:"0 2px" },
  input: { width:"100%", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-heading)", padding:"10px 12px", marginBottom:10, fontSize:14, outline:"none", boxSizing:"border-box" },
  btn: { border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", color:"var(--on-accent)" },
  settingsCard: { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"14px", marginBottom:12 },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"flex-end", zIndex:100 },
  modalSheet: { background:"var(--surface)", borderRadius:"16px 16px 0 0", padding:"20px 16px 0", width:"100%", maxWidth:480, margin:"0 auto", border:"1px solid var(--border)", display:"flex", flexDirection:"column", maxHeight:"88vh" },
  // Scrolls independently of the page behind it; overscrollBehavior stops iOS handing the scroll
  // back to the page when the body reaches its end.
  modalBody: { overflowY:"auto", overscrollBehavior:"contain", WebkitOverflowScrolling:"touch", paddingBottom:32, flex:1, minHeight:0 },
  modalHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexShrink:0 },
  modalTitle: { fontSize:15, fontWeight:700, color:"var(--text-heading)" },
  weekSelect: { background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:6, color:"var(--text-heading)", fontSize:14, fontWeight:700, padding:"3px 6px", cursor:"pointer", outline:"none", fontFamily:"inherit" },
  daySelectBtn: { background:"var(--surface-2)", border:"1px solid var(--border-strong)", borderRadius:6, color:"var(--text-heading)", fontSize:14, fontWeight:700, padding:"3px 8px", cursor:"pointer", outline:"none", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 },
  dayChip: { flex:1, minWidth:0, background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-secondary)", padding:"5px 0", cursor:"pointer", fontFamily:"inherit", textAlign:"center" },
  dayChipActive: { background:"#0369a1", border:"1px solid #0369a1", color:"var(--on-accent)" },
  dayChipToday: { border:"1px solid var(--text-heading)", color:"var(--text-heading)" },
  dayStepBtn: { background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-secondary)", width:28, height:24, fontSize:14, cursor:"pointer", fontFamily:"inherit", padding:0, flexShrink:0 },
  // Day heading in the week log. Matches WeekGroupedList's section headings so the two lists read
  // as one system; the subtotal sits opposite on the same baseline.
  dayHead: { display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8, padding:"10px 0 4px" },
  dayHeadLabel: { fontSize:10, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.04em" },
  dayHeadTotal: { fontSize:11, fontWeight:600, color:"var(--text-tertiary)" },
  quickAdd: { position:"fixed", left:"calc(14px + env(safe-area-inset-left))", bottom:"calc(14px + env(safe-area-inset-bottom))", width:52, height:52, borderRadius:"50%", background:"#0369a1", border:"none", color:"var(--on-accent)", fontSize:30, fontWeight:400, lineHeight:1, cursor:"pointer", zIndex:50, boxShadow:"0 4px 14px rgba(3,105,161,0.5)", display:"flex", alignItems:"center", justifyContent:"center", paddingBottom:4 },
  hintBanner: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, background:"var(--surface-2)", borderBottom:"1px solid #0369a1", padding:"8px 16px", fontSize:12, color:"var(--text-body)", lineHeight:1.4 },
  hintBtn: { background:"#0369a1", border:"none", borderRadius:6, color:"var(--on-accent)", padding:"4px 10px", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" },
  hintDismiss: { background:"none", border:"none", color:"var(--text-secondary)", fontSize:14, cursor:"pointer", padding:"2px 4px", lineHeight:1 },
  // Floating help button — same footprint as the old lock button, themed so it reads in light + dark.
  helpFab: { position:"fixed", right:"calc(14px + env(safe-area-inset-right))", bottom:"calc(14px + env(safe-area-inset-bottom))", width:44, height:44, borderRadius:"50%", background:"var(--surface)", border:"1px solid var(--border-strong)", color:"var(--text-secondary)", fontSize:20, fontWeight:700, cursor:"pointer", zIndex:50, boxShadow:"0 2px 10px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, padding:0 },
};
