import React, { useState, useEffect, useRef, useCallback } from "react";
/* ?raw inlines the file at build time — the button hands out exactly the
   template that is committed alongside this component. */
import TEMPLATE_MD from "../claude-recipe-template.md?raw";
import CHANGELOG_MD from "../CHANGELOG.md?raw";

/* ══════════════════════════════════════════════════════════════════
   What's new
   Read out of CHANGELOG.md at build time, so a change and the sentence
   describing it are committed together and cannot drift apart. A
   "## 2026-09-11" line opens a dated group and every "- " line beneath it is
   one change, with an optional "**Headline.**" to start it. Everything else —
   the note at the top of the file explaining the format — is passed over, so
   the file still reads as a file.
   ══════════════════════════════════════════════════════════════════ */
function parseChangelog(md) {
  const days = [];
  for (const line of String(md).split("\n")) {
    const day = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (day) { days.push({ date: day[1], changes: [] }); continue; }
    const change = line.match(/^-\s+(.*\S)\s*$/);
    if (!change || !days.length) continue;
    const lead = change[1].match(/^\*\*(.+?)\*\*\s*(.*)$/);
    days[days.length - 1].changes.push(
      lead ? { title: lead[1], text: lead[2] } : { title: "", text: change[1] },
    );
  }
  return days.filter((d) => d.changes.length);
}

const CHANGELOG = parseChangelog(CHANGELOG_MD);

/* One dot, on this device, for days the person reading here has not seen yet.
   Only the newest date is kept: opening the list clears everything older along
   with it. ISO dates sort as strings, which is the whole reason for the format.
   Somebody new sees the dot on their first visit, which is right — all of it is
   new to them. */
const NEWS_KEY = "rb-news-seen";
const latestNews = () => (CHANGELOG.length ? CHANGELOG[0].date : "");
const newsSeen = () => { try { return localStorage.getItem(NEWS_KEY) || ""; } catch { return ""; } };
const newsDot = (color, size = 7) => ({
  flex: "none", width: size, height: size, borderRadius: "50%", background: color,
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
/* Split by hand rather than through Date, which reads a bare YYYY-MM-DD as UTC
   midnight and would show the day before to anyone west of Greenwich. */
const prettyDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
};

/* ══════════════════════════════════════════════════════════════════
   Tokens
   ══════════════════════════════════════════════════════════════════ */
const T = {
  ink: "#0B2F32",
  inkDeep: "#061E21",
  inkSoft: "#144043",
  paper: "#F7F2E6",
  paperLift: "#FFFCF4",
  edge: "#DCD0B2",
  marigold: "#E7A427",
  rust: "#A2412A",
  sage: "#8FA68C",
  text: "#1B1913",
  muted: "#6B6450",
};

/* The site's name, matching its address (thehackwithtable.com). Fixed here
   rather than read from the saved box, which still carries the old name. */
const SITE_NAME = "The Hackwith Table";

/* Colour themes, each in a light and a dark version. Light and dark mode pick
   the version, so the mode reaches everything — the page, its text, the
   buttons and tiles on it, cooking mode, and the recipe cards (cream in light
   mode, tinted with the theme in dark).

   Hackwith Teal's dark version reproduces the original colours exactly. Every
   version was checked for contrast against it: faint captions (45% opacity)
   come out at least as readable as the original teal's. `k` scales those
   opacities — dark ink at 45% over a pale page loses far more contrast than
   cream at 45% over a dark one, so light versions lift their faint text. */
const PALETTES = [
  { id: "teal", name: "Hackwith Teal", darkCard: "#123B3F", darkLift: "#17494D", darkMuted: "#A3B3A9",
    dark: { soft: "#144043", bg: "#0B2F32", deep: "#061E21", ink: "#F7F2E6", accent: "#E7A427", onAccent: "#061E21", k: 1 },
    light: { soft: "#FFFFFF", bg: "#FAFAF8", deep: "#E9E7E1", ink: "#17201F", accent: "#0E5054", onAccent: "#FFF9EC", k: 1.45, grain: 0.04 } },
  { id: "cast-iron", name: "Cast Iron", darkCard: "#2F2C2A", darkLift: "#3A3633",
    dark: { soft: "#33302D", bg: "#232120", deep: "#141312", ink: "#F2ECE0", accent: "#D9955A", onAccent: "#1A1817", k: 1 },
    light: { soft: "#FFFFFF", bg: "#FAF9F6", deep: "#E9E5DE", ink: "#201E1C", accent: "#8A4A1B", onAccent: "#FFF7EE", k: 1.45, grain: 0.04 } },
  { id: "sage", name: "Sage Garden", darkCard: "#2E4535", darkLift: "#37523F",
    dark: { soft: "#304A38", bg: "#233629", deep: "#16241B", ink: "#F3EFE2", accent: "#E8C872", onAccent: "#1A281F", k: 1.12 },
    light: { soft: "#FFFFFF", bg: "#FAFBF8", deep: "#E7EAE3", ink: "#1B211B", accent: "#4F6B22", onAccent: "#FFF9EA", k: 1.45, grain: 0.04 } },
  { id: "terracotta", name: "Terracotta", darkCard: "#693023", darkLift: "#77392A",
    dark: { soft: "#6E3121", bg: "#5A2417", deep: "#3C170E", ink: "#FBEFE4", accent: "#F2C45A", onAccent: "#34140D", k: 1.12 },
    light: { soft: "#FFFFFF", bg: "#FDFAF8", deep: "#EFE5DE", ink: "#241A16", accent: "#A3441D", onAccent: "#FFF6F0", k: 1.45, grain: 0.04 } },
  { id: "blue-willow", name: "Blue Willow", darkCard: "#243C62", darkLift: "#2C4770",
    dark: { soft: "#27426B", bg: "#1C3152", deep: "#111F37", ink: "#F3F6FB", accent: "#9CC4F2", onAccent: "#12213A", k: 1.05 },
    light: { soft: "#FFFFFF", bg: "#F9FAFC", deep: "#E6EAF1", ink: "#171C25", accent: "#24527F", onAccent: "#F6F9FD", k: 1.45, grain: 0.04 } },
  { id: "merlot", name: "Merlot", darkCard: "#552131", darkLift: "#62283A",
    dark: { soft: "#5A2236", bg: "#47192A", deep: "#2C0E19", ink: "#F8ECE8", accent: "#E7AE72", onAccent: "#2B0E18", k: 1.05 },
    light: { soft: "#FFFFFF", bg: "#FCF9FA", deep: "#EDE3E6", ink: "#2A1620", accent: "#8E4418", onAccent: "#FFF6F0", k: 1.45, grain: 0.04 } },
  { id: "butter", name: "Butter", darkCard: "#3B2F22", darkLift: "#47392A",
    dark: { soft: "#3C3122", bg: "#2E2519", deep: "#1C170F", ink: "#F6EAC8", accent: "#F2C96B", onAccent: "#1C170F", k: 1.05 },
    light: { soft: "#FFFFFF", bg: "#FDFBF4", deep: "#EFE8D6", ink: "#2A2318", accent: "#A2371F", onAccent: "#FFF8EC", k: 1.45, grain: 0.04 } },
  { id: "retro-mint", name: "Retro Mint", darkCard: "#20403A", darkLift: "#274A43",
    dark: { soft: "#1F3B35", bg: "#15302A", deep: "#0C1E1A", ink: "#E6F4EE", accent: "#F2939A", onAccent: "#0D1F1B", k: 1 },
    light: { soft: "#FFFFFF", bg: "#F7FBF9", deep: "#E2EDE7", ink: "#16221F", accent: "#A1222C", onAccent: "#FFF6F1", k: 1.45, grain: 0.04 } },
  { id: "farmhouse", name: "Farmhouse", darkCard: "#2F312C", darkLift: "#393C36",
    dark: { soft: "#30322D", bg: "#242622", deep: "#161715", ink: "#EEEAE1", accent: "#A6C39C", onAccent: "#161715", k: 1 },
    light: { soft: "#FFFFFF", bg: "#FAF9F5", deep: "#E8E5DC", ink: "#232320", accent: "#4C6746", onAccent: "#FBFAF6", k: 1.45, grain: 0.035 } },
];

const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
/* what the picker shows for a colour theme */
const swatchFor = (p, mode) =>
  `radial-gradient(circle at 70% 30%, ${p[mode].accent} 0 27%, transparent 28%), linear-gradient(160deg, ${p[mode].soft}, ${p[mode].deep})`;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/* card text blended toward the card, for the muted grey on dark-mode cards */
const mixHex = (a, b, t) => `rgb(${hexRgb(a).map((v, i) => Math.round(v * t + hexRgb(b)[i] * (1 - t))).join(", ")})`;
const paletteVars = (p, mode) => {
  const v = p[mode];
  return {
    "--page-soft": v.soft, "--page-bg": v.bg, "--page-deep": v.deep, "--deep-rgb": hexRgb(v.deep).join(", "), "--bg-rgb": hexRgb(v.bg).join(", "),
    "--on-page": hexRgb(v.ink).join(", "), "--ink-k": String(v.k),
    "--page-accent": v.accent, "--accent-rgb": hexRgb(v.accent).join(", "), "--on-accent": v.onAccent,
    "--dark-card-bg": p.darkCard, "--dark-card-lift": p.darkLift, "--dark-card-muted": p.darkMuted || mixHex("#EFE8D6", p.darkCard, 0.64),
  };
};
/* Mirrored in localStorage as well as the account, so the page can paint the
   right colours before the account has answered — see the script in index.html. */
const localPalette = () => { try { return localStorage.getItem("rb-palette"); } catch { return null; } };

/* Jost for titles and figures, Radley for the words you actually read while
   cooking, Inter for buttons and labels — Bon Appétit's arrangement, as near as
   free faces reach it (their Futura PT and Archer are both licensed).

   Radley ships one weight and one italic and nothing else, so nothing set in
   PROSE may ask for 500 or bold: the browser would fake it and the fake is
   visibly worse than the real thing. Headings and step titles carry weight,
   which is why they stay on Jost. */
const DISPLAY = "'Jost', 'Futura', 'Century Gothic', 'Avenir Next', sans-serif";
const PROSE = "'Radley', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
const UI = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const STORAGE_KEY = "recipe-box";

/* ══════════════════════════════════════════════════════════════════
   Photos
   Storage holds text, so a picture has to become a data URL. Two sizes:
   a thumbnail small enough to live inside the recipe record (the list view
   reads dozens at once), and a full copy under its own key, fetched only
   when a recipe is opened.
   ══════════════════════════════════════════════════════════════════ */
const FULL_MAX = 1400;
/* The preview used to be 300px at quality 0.6, which was ample while a card
   showed it about 160px wide. A tile now runs to roughly 340px, and doubles
   that again on a retina screen, so the old cut was being stretched past twice
   its size and every JPEG artifact came with it. 640 covers a tile on a 2x
   display; the preview still lives inside the recipe record, which is read on
   every visit, so this is as large as it should get. */
const THUMB_MAX = 640;
const THUMB_Q = 0.72;
const imageKey = (id) => `image:${id}`;

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("not an image"));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
}

async function shrink(source, maxDim, quality) {
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/* Load a data URL back into something canvas will draw. Only ever called with
   a data: URL from our own storage, so the canvas is never tainted and
   toDataURL keeps working — a remote photo would poison it. */
const imageFromSrc = (src) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("could not read that photo"));
    img.src = src;
  });

async function prepPhoto(file) {
  const bmp = await loadBitmap(file);
  const full = await shrink(bmp, FULL_MAX, 0.78);
  const thumb = await shrink(bmp, THUMB_MAX, THUMB_Q);
  bmp.close?.();
  return { full, thumb };
}

/* Strip accents so a search for "acai" finds "açaí" and "jalapeno" finds
   "jalapeño". NFD splits a letter from its accent; the range below is the
   combining-mark block. */
const fold = (v) =>
  String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const SCOPES = [
  { id: "all", label: "Everything", placeholder: "Search titles, authors, ingredients, equipment" },
  { id: "ingredient", label: "Ingredient", placeholder: "e.g. lime, tequila" },
  { id: "author", label: "Author", placeholder: "Who wrote it? e.g. Tracey" },
  { id: "equipment", label: "Equipment", placeholder: "e.g. blender, stand mixer" },
];

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* ══════════════════════════════════════════════════════════════════
   Storage
   ══════════════════════════════════════════════════════════════════ */
async function loadBox() {
  if (typeof window === "undefined" || !window.storage) return null;
  try {
    const res = await window.storage.get(STORAGE_KEY, true);
    return res?.value ? JSON.parse(res.value) : null;
  } catch {
    return null;
  }
}
async function saveBox(box) {
  if (typeof window === "undefined" || !window.storage) return false;
  try {
    return !!(await window.storage.set(STORAGE_KEY, JSON.stringify(box), true));
  } catch (err) {
    console.error("Save failed:", err);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════
   Quantities — parsing, scaling, pretty-printing
   ══════════════════════════════════════════════════════════════════ */
const UNI = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
const NUM = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\\d+\\/\\d+|\\d*\\.?\\d+|[¼½¾⅓⅔⅛⅜⅝⅞])";
const QTY_RE = new RegExp(`^(\\s*)(${NUM})(\\s*(?:-|–|to)\\s*)?(${NUM})?`);
const FRACTIONS = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];

function toNumber(tok) {
  if (!tok) return null;
  const t = String(tok).trim();
  if (UNI[t] != null) return UNI[t];
  const mixed = t.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (mixed) return parseInt(mixed[1], 10) + UNI[mixed[2]];
  const mixedFrac = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFrac) return parseInt(mixedFrac[1], 10) + Number(mixedFrac[2]) / Number(mixedFrac[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function prettyNumber(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 0.05) return String(Math.round(n * 100) / 100);
  if (n >= 10) return String(Math.round(n * 10) / 10);
  const whole = Math.floor(n + 1e-9);
  const rem = n - whole;
  if (rem < 0.06) return String(whole || 0);
  let best = null;
  let bestGap = Infinity;
  for (const [val, glyph] of FRACTIONS) {
    const gap = Math.abs(rem - val);
    if (gap < bestGap) { bestGap = gap; best = glyph; }
  }
  if (bestGap > 0.07) return String(Math.round(n * 100) / 100);
  return whole ? `${whole}${best}` : best;
}

function scaleLine(line, factor) {
  if (!factor || factor === 1) return line;
  const m = line.match(QTY_RE);
  if (!m) return line;
  const a = toNumber(m[2]);
  if (a == null) return line;
  const b = m[4] ? toNumber(m[4]) : null;
  const scaled = prettyNumber(a * factor) + (b != null ? `${m[3] || "–"}${prettyNumber(b * factor)}` : "");
  return line.slice(0, m[1].length) + scaled + line.slice(m[0].length);
}

/* split leading quantity from the ingredient name, for the ruled column */
const UNITS = new Set([
  "cup","cups","tbsp","tbsps","tablespoon","tablespoons","tsp","tsps","teaspoon","teaspoons","oz","ounce","ounces",
  "lb","lbs","pound","pounds","g","gram","grams","kg","ml","l","liter","liters","clove","cloves","can","cans",
  "pinch","pinches","sprig","sprigs","slice","slices","stick","sticks","bunch","bunches","package","packages",
  "quart","quarts","pint","pints","dash","dashes","qt","pt",
  "scoop","scoops","packet","packets","handful","handfuls","head","heads","stalk","stalks",
  "sheet","sheets","drop","drops","jar","jars","bottle","bottles","bag","bags","knob","knobs",
]);

function splitQty(s) {
  const m = s.match(new RegExp(`^\\s*(${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?)\\s*([A-Za-z]+\\.?)?\\s+(.*)$`));
  if (!m) return [null, s];
  let qty = m[1];
  let rest = m[3];
  const unit = m[2] ? m[2].toLowerCase().replace(/\.$/, "") : null;
  if (unit && UNITS.has(unit)) qty += " " + m[2];
  else if (m[2]) rest = m[2] + " " + rest;
  return [qty, rest];
}

/* A step’s quantities were resolved into prose when the recipe was imported, so
   they sit there as plain text and do not follow the scaler the way the
   ingredient list does. Scale a number only where a measure follows it: that
   leaves "8 minutes", "425°F" and "step 2 of 6" alone, none of which may move.
   Parentheses are skipped as well, because that is where package sizes live — a
   100 g packet is still 100 g however many of them go in. */
const STEP_QTY_RE = new RegExp(`(${NUM})(\\s*(?:-|–|to)\\s*(${NUM}))?(\\s+)([A-Za-z]+)\\b`, "g");

/* A measure followed by one of these is sizing the container, not the amount
   going into it: a 40 oz pitcher is still 40 oz however much you make, and a
   14 oz can is the tin you bought. */
const VESSELS = new Set([
  "pitcher","pitchers","blender","blenders","bowl","bowls","pan","pans","skillet","skillets",
  "dish","dishes","pot","pots","tin","tins","ramekin","ramekins","mold","molds","tray","trays",
  "jar","jars","bottle","bottles","can","cans","packet","packets","bag","bags","box","boxes",
  "tub","tubs","container","containers","carton","cartons","block","blocks","loaf","loaves",
]);

function scaleText(text, factor) {
  if (!text || !factor || factor === 1) return text;
  return String(text)
    .split(/(\([^)]*\))/)
    .map((seg) =>
      seg.startsWith("(")
        ? seg
        : seg.replace(STEP_QTY_RE, (whole, a, _range, b, gap, word, offset, str) => {
            if (!UNITS.has(word.toLowerCase())) return whole;
            const next = str.slice(offset + whole.length).match(/^\s+([A-Za-z]+)/);
            if (next && VESSELS.has(next[1].toLowerCase())) return whole;
            const A = toNumber(a);
            if (A == null) return whole;
            const B = b ? toNumber(b) : null;
            return prettyNumber(A * factor) + (B != null ? `–${prettyNumber(B * factor)}` : "") + gap + word;
          })
    )
    .join("");
}

const servingsCount = (s) => {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};
/* A stats row labels the figure, so "Serves 6" would read "Serves / Serves 6".
   Authors write it both ways and the template does not force either. */
const servesOnly = (s, factor) => String(scaleServings(s, factor)).replace(/^\s*serves\s+/i, "").trim();

const scaleServings = (s, factor) => {
  const n = servingsCount(s);
  if (!n) return s;
  return String(s).replace(/\d+/, String(Math.max(1, Math.round(n * factor))));
};

/* ══════════════════════════════════════════════════════════════════
   Shopping list
   One list per person, following them between their own devices and visible to
   nobody else. localStorage is still where a change lands first — instantly, so
   a tick survives a phone locking mid-shop and needs no signal — and the copy
   in the account is a sync channel layered over that, not the truth.
   Each item keeps the lines that fed it,
   recipe by recipe, so adding
   a recipe again replaces its share instead of doubling it, and taking one off
   removes exactly what it put on.
   ══════════════════════════════════════════════════════════════════ */
const LIST_KEY = "rb-shopping-list";
const EMPTY_LIST = { items: [], recipes: {}, tombstones: {} };

const UNIT_CANON = {
  cups: "cup", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tsps: "tsp", teaspoon: "tsp",
  teaspoons: "tsp", ounce: "oz", ounces: "oz", lbs: "lb", pound: "lb", pounds: "lb", gram: "g",
  grams: "g", liter: "l", liters: "l", qt: "quart", quarts: "quart", pt: "pint", pints: "pint",
};
const canonUnit = (u) => {
  const k = u.toLowerCase().replace(/\.$/, "");
  if (UNIT_CANON[k]) return UNIT_CANON[k];
  if (k.endsWith("es") && UNITS.has(k.slice(0, -2))) return k.slice(0, -2);
  if (k.endsWith("s") && UNITS.has(k.slice(0, -1))) return k.slice(0, -1);
  return k;
};
/* abbreviations read the same for one or many */
const SHORT_UNITS = new Set(["tbsp", "tsp", "oz", "lb", "g", "kg", "ml", "l"]);
const plural = (w) =>
  /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;
const singular = (w) =>
  /ies$/.test(w) ? `${w.slice(0, -3)}y`
  : /(ch|sh|x|ss|o)es$/.test(w) ? w.slice(0, -2)
  : /[^s]s$/.test(w) ? w.slice(0, -1)
  : w;
const unitLabel = (u, n) => (!u ? "" : SHORT_UNITS.has(u) || n <= 1 ? u : plural(u));

/* Only for matching — "2 large eggs" and "1 large egg" are the same thing to buy. */
const itemKey = (unit, name) => {
  const words = fold(name).replace(/\(optional\)/g, "").replace(/\s+/g, " ").trim().split(" ");
  words[words.length - 1] = singular(words[words.length - 1]);
  return `${unit || ""}|${words.join(" ")}`;
};

function parseLine(line) {
  const [qty, rest] = splitQty(String(line));
  /* What comes before the first comma is what you shop for: "onion, diced"
     and "onion, sliced" are the same onion at the store. */
  const name = clean(String(rest).split(",")[0]) || clean(rest);
  if (!qty) return { amount: null, unit: null, name, qtyText: null };
  const um = qty.match(/^(.*?)\s+([A-Za-z]+\.?)$/);
  const unit = um && UNITS.has(um[2].toLowerCase().replace(/\.$/, "")) ? canonUnit(um[2]) : null;
  const num = unit ? um[1] : qty;
  /* a range cannot be added to anything, so it is kept as written */
  const amount = /[-–]|\bto\b/.test(num) ? null : toNumber(num);
  return { amount, unit, name, qtyText: amount == null ? qty : null };
}

function addLine(items, line, recipeId) {
  const p = parseLine(line);
  if (!p.name) return;
  const key = p.qtyText ? `raw|${fold(line)}` : itemKey(p.unit, p.name);
  const source = { recipeId, amount: p.amount, qtyText: p.qtyText, name: p.name };
  const hit = items.find((i) => i.key === key);
  if (!hit) {
    items.push({
      id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      key, unit: p.unit, checked: false, sources: [source],
    });
    return;
  }
  hit.sources = [...hit.sources, source];
  /* more is needed than was ticked off — but "salt" with no amount is still salt */
  if (p.amount != null || p.qtyText) hit.checked = false;
}

const withoutRecipe = (list, recipeId) => {
  const items = list.items
    .map((i) => ({ ...i, sources: i.sources.filter((src) => src.recipeId !== recipeId) }))
    .filter((i) => i.sources.length);
  const { [recipeId]: _gone, ...recipes } = list.recipes;
  return { items, recipes };
};

function withRecipe(list, recipe, lines, servings) {
  const base = withoutRecipe(list, recipe.id);
  const items = base.items.map((i) => ({ ...i }));
  for (const line of lines) addLine(items, line, recipe.id);
  return { items, recipes: { ...base.recipes, [recipe.id]: { title: recipe.title, servings: servings ?? null } } };
}

function withTyped(list, text) {
  const items = list.items.map((i) => ({ ...i }));
  addLine(items, text, null);
  return { ...list, items };
}

/* forget recipes whose every item has since been cleared away */
const prune = (list) => {
  const live = new Set(list.items.flatMap((i) => i.sources.map((src) => src.recipeId)));
  return { items: list.items, recipes: Object.fromEntries(Object.entries(list.recipes).filter(([id]) => live.has(id))) };
};

function describeItem(item) {
  const counted = item.sources.filter((src) => src.amount != null);
  const summed = counted.reduce((t, src) => t + src.amount, 0);
  /* nobody buys half an egg: whole things round up, measured things do not */
  const total = item.unit ? summed : Math.ceil(summed - 1e-9);
  const lead = counted.length ? counted.reduce((a, b) => (b.amount > a.amount ? b : a)) : item.sources[0];
  let name = lead.name;
  if (!item.unit && total > 1 && !/s$/i.test(name)) name = name.replace(/([A-Za-z]+)$/, (w) => plural(w));
  const qty = [
    ...(counted.length ? [`${prettyNumber(total)}${item.unit ? ` ${unitLabel(item.unit, total)}` : ""}`] : []),
    ...new Set(item.sources.filter((src) => src.qtyText).map((src) => src.qtyText)),
  ].join(" + ");
  return { qty, name };
}

const itemRecipes = (item, list) =>
  [...new Set(item.sources.map((src) => list.recipes[src.recipeId]?.title).filter(Boolean))];

const asStoredList = (data) =>
  data && Array.isArray(data.items)
    ? { items: data.items, recipes: data.recipes || {}, tombstones: data.tombstones || {} }
    : null;

/* The family-wide list from the first build is still in KV under its old key,
   untouched and no longer read. This is only ever the one on this device. */
function loadList() {
  try {
    return asStoredList(JSON.parse(localStorage.getItem(LIST_KEY) || "null")) || { ...EMPTY_LIST };
  } catch {
    return { ...EMPTY_LIST };
  }
}

/* ══════════════════════════════════════════════════════════════════
   Syncing a list between one person's devices
   The account copy sits under a key the server namespaces to the verified
   signed-in email, so nobody else can read or write it. Writes are debounced:
   a shop's worth of ticking costs a couple of them rather than thirty, which is
   what keeps this inside KV's free allowance.

   Merging is the whole difficulty. The realistic conflict is not two people
   racing for one item — it is someone adding things at home while someone else
   ticks things off at the shop. Last-write-wins across the whole list throws
   one of those away, so instead every item records when it last changed, every
   deletion leaves a tombstone behind, and the newer fact wins item by item.
   ══════════════════════════════════════════════════════════════════ */
const SYNC_KEY = "grocery-list";
const SYNC_DEBOUNCE = 2000;
const TOMBSTONE_LIFE = 7 * 24 * 60 * 60 * 1000;   // outlives a weekly shop

/* an item's content, ignoring when it last changed */
const itemBody = (i) => JSON.stringify({ ...i, updatedAt: undefined });

/* Date whatever a change actually touched and record whatever it removed, so
   that none of the list operations above have to know that syncing exists. */
function stamp(prev, next, now = Date.now()) {
  const before = new Map(prev.items.map((i) => [i.id, i]));
  const items = next.items.map((i) => {
    const was = before.get(i.id);
    return was && i.updatedAt && itemBody(was) === itemBody(i) ? i : { ...i, updatedAt: now };
  });
  const alive = new Set(items.map((i) => i.id));
  const tombstones = { ...prev.tombstones, ...next.tombstones };
  for (const id of before.keys()) if (!alive.has(id)) tombstones[id] = now;
  for (const [id, at] of Object.entries(tombstones)) {
    if (alive.has(id) || now - at > TOMBSTONE_LIFE) delete tombstones[id];
  }
  return { ...next, items, tombstones };
}

/* Two versions of one person's list, reconciled item by item. */
function mergeLists(mine, theirs) {
  const tombstones = { ...mine.tombstones };
  for (const [id, at] of Object.entries(theirs.tombstones)) {
    tombstones[id] = Math.max(tombstones[id] || 0, at);
  }

  const byId = new Map();
  for (const i of [...mine.items, ...theirs.items]) {
    const held = byId.get(i.id);
    if (!held || (i.updatedAt || 0) > (held.updatedAt || 0)) byId.set(i.id, i);
  }
  /* A deletion only beats the version of the item it deleted. Editing that item
     afterwards on another device is a deliberate act, and brings it back. */
  const items = [...byId.values()].filter((i) => !(tombstones[i.id] >= (i.updatedAt || 0)));

  /* Recipe titles are only ever read through the items that came from them. */
  const live = new Set(items.flatMap((i) => i.sources.map((src) => src.recipeId)));
  const recipes = Object.fromEntries(
    Object.entries({ ...theirs.recipes, ...mine.recipes }).filter(([id]) => live.has(id)),
  );

  /* This device's order is the familiar one; anything new lands underneath. */
  const order = new Map();
  mine.items.forEach((i, n) => order.set(i.id, n));
  theirs.items.forEach((i, n) => { if (!order.has(i.id)) order.set(i.id, mine.items.length + n); });
  items.sort((x, y) => order.get(x.id) - order.get(y.id));

  return { items, recipes, tombstones };
}

/* ══════════════════════════════════════════════════════════════════
   Steps — titles and timers
   ══════════════════════════════════════════════════════════════════ */
const DUR_RE = /(\d+(?:\.\d+)?)\s*(?:–|-|to)?\s*(\d+(?:\.\d+)?)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i;

function stepParts(step) {
  if (step && typeof step === "object")
    return {
      title: step.title || "",
      text: step.text || step.content || "",
      seconds: step.seconds ?? step.timer_seconds ?? null,
    };
  const s = String(step || "");
  const m = s.match(/^([^.!?;]{2,52}):\s+(.+)$/);
  return m ? { title: m[1].trim(), text: m[2].trim(), seconds: null } : { title: "", text: s, seconds: null };
}

function stepDuration(step) {
  const { title, text, seconds } = stepParts(step);
  if (seconds === 0) return null;               // author said this step has no timer
  if (seconds) return Number(seconds);          // an explicit timer always wins
  const m = `${title} ${text}`.match(DUR_RE);
  if (!m) return null;
  const value = Number(m[2] || m[1]);
  const unit = m[3].toLowerCase();
  const mult = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
  const secs = Math.round(value * mult);
  return secs >= 20 && secs <= 60 * 60 * 24 ? secs : null;
}

const clock = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const durLabel = (s) => (s >= 3600 ? `${Math.round((s / 3600) * 10) / 10} hr` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`);

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.45, 0.9].forEach((offset) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 784;
      o.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime + offset;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      o.start(t0);
      o.stop(t0 + 0.35);
    });
    setTimeout(() => ctx.close?.(), 2000);
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════
   Import parsing — markdown, frontmatter, JSON (incl. schema.org)
   ══════════════════════════════════════════════════════════════════ */
const SECTION =
  /^\s*#{0,6}\s*\**\s*(ingredients?|equipment|tools?|appliances?|steps?|instructions?|directions?|method|preparation|notes?|tips?)\s*\**\s*:?\s*$/i;
const stripBullet = (l) => l.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "").trim();
const clean = (s) => String(s || "").replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();

const asList = (v) =>
  Array.isArray(v)
    ? v
        .map((x) =>
          typeof x === "string"
            ? clean(x)
            : x?.title && (x?.text || x?.content)
            ? { title: clean(x.title), text: clean(x.text || x.content), seconds: x.timer_seconds ?? x.seconds ?? null }
            : clean(x?.text || x?.name || x?.content || "")
        )
        .filter((x) => (typeof x === "string" ? x : x.text))
    : String(v || "").split("\n").map(stripBullet).filter(Boolean);

/* ── a small YAML subset: nested maps, block sequences, sequences of maps ── */
function yamlScalar(v) {
  const t = v.trim();
  if (!t) return "";
  if (/^["'].*["']$/.test(t)) return t.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true" || t === "false") return t === "true";
  return t;
}

function parseYamlBlock(lines, indent) {
  /* returns [value, nextIndex] for the block starting at lines[0] */
  const isSeq = lines.length && /^\s*-\s?/.test(lines[0]);
  if (isSeq) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const ind = line.search(/\S/);
      if (ind < indent || !/^\s*-\s?/.test(line)) break;
      const first = line.replace(/^\s*-\s?/, "");
      const childIndent = ind + 2;
      const block = [];
      if (/^[A-Za-z_][\w-]*\s*:/.test(first)) block.push(" ".repeat(childIndent) + first);
      i++;
      while (i < lines.length) {
        const nInd = lines[i].search(/\S/);
        if (nInd < childIndent || /^\s*-\s?/.test(lines[i].slice(0, childIndent + 2))) break;
        block.push(lines[i]);
        i++;
      }
      if (block.length) out.push(parseYamlBlock(block, childIndent)[0]);
      else out.push(yamlScalar(first));
    }
    return [out, i];
  }

  const map = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    const ind = line.search(/\S/);
    if (ind < indent) break;
    const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1].toLowerCase();
    const inline = kv[2];
    if (inline.trim()) {
      /* A quoted string may wrap across several indented lines — keep pulling
         them in until the closing quote shows up. */
      let raw = inline.trim();
      const q = raw[0];
      i++;
      if ((q === '"' || q === "'") && !(raw.length > 1 && raw.endsWith(q))) {
        while (i < lines.length) {
          const cont = lines[i].trim();
          const contInd = lines[i].search(/\S/);
          if (!cont || contInd <= ind) break;
          raw += " " + cont;
          i++;
          if (cont.endsWith(q)) break;
        }
      }
      map[key] = yamlScalar(raw);
    } else {
      const child = [];
      i++;
      while (i < lines.length) {
        const nInd = lines[i].search(/\S/);
        if (lines[i].trim() && nInd <= ind) break;
        child.push(lines[i]);
        i++;
      }
      const childIndent = child.length ? Math.max(...[child[0].search(/\S/)]) : ind + 2;
      map[key] = child.length ? parseYamlBlock(child, childIndent)[0] : "";
    }
  }
  return [map, i];
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  let meta = {};
  try { meta = parseYamlBlock(m[1].split("\n"), 0)[0] || {}; } catch { meta = {}; }
  return { meta, body: raw.slice(m[0].length) };
}

/* ── structured ingredients: { amount, unit, name } → "1⅓ cups almond milk" ── */
const PLURAL_UNITS = new Set([
  "cup","packet","scoop","clove","can","slice","stick","sprig","bunch","package",
  "pinch","dash","quart","pint","ounce","pound","gram","liter","handful","head","stalk",
]);

function renderIngredient(x) {
  if (typeof x === "string") return clean(x);
  if (!x || typeof x !== "object") return "";
  const name = clean(x.name || x.ingredient || x.item || x.text || "");
  if (!name) return "";
  const amount = x.amount ?? x.quantity ?? null;
  let unit = clean(x.unit || "");
  if (unit && PLURAL_UNITS.has(unit.toLowerCase()) && Number(amount) > 1) unit += "s";
  const qty = amount == null || amount === "" ? "" : prettyNumber(Number(amount));
  const optional = x.optional ? " (optional)" : "";
  return [qty, unit, name].filter(Boolean).join(" ") + optional;
}

/* steps written with {ingredient_id} placeholders get the real amounts spliced in */
function resolvePlaceholders(text, ingredients) {
  if (!text || !Array.isArray(ingredients)) return text;
  const byId = new Map();
  for (const ing of ingredients) {
    if (ing && typeof ing === "object" && ing.id) byId.set(String(ing.id), renderIngredient(ing));
  }
  if (!byId.size) return text;
  return text.replace(/\{([A-Za-z0-9_-]+)\}/g, (whole, id) => byId.get(id) ?? whole);
}

function parseMarkdown(raw) {
  const { meta, body } = parseFrontmatter(raw);

  /* Path A — the frontmatter already carries the recipe (structured export).
     Trust it, and keep the prose body as notes rather than trying to re-parse it. */
  const metaIngredients = Array.isArray(meta.ingredients) ? meta.ingredients : null;
  const metaSteps = Array.isArray(meta.steps) ? meta.steps : null;

  if (metaIngredients || metaSteps) {
    const ingredients = (metaIngredients || []).map(renderIngredient).filter(Boolean);
    /* If the author declared timers anywhere, they own the timers — 0 means
       "deliberately none here", which stops us guessing from the prose. */
    const authored = (metaSteps || []).some((st) => st && (st.timer_seconds ?? st.seconds) != null);
    const steps = (metaSteps || [])
      .map((st) => {
        if (typeof st === "string") return clean(st);
        const text = resolvePlaceholders(clean(st.content || st.text || ""), metaIngredients || []);
        const declared = st.timer_seconds ?? st.seconds ?? null;
        return { title: clean(st.title || ""), text, seconds: declared ?? (authored ? 0 : null) };
      })
      .filter((st) => (typeof st === "string" ? st : st.text));

    const prose = body
      .split("\n")
      .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const minutes = meta.total_time_minutes ?? meta.prep_time_minutes ?? null;
    const servings =
      meta.servings != null && meta.servings !== ""
        ? /\d/.test(String(meta.servings)) && !/[a-z]/i.test(String(meta.servings))
          ? `Serves ${meta.servings}`
          : String(meta.servings)
        : "";

    return normalize({
      title: meta.title || "",
      contributor: meta.contributor || meta.author || meta.from || "",
      description: meta.description || meta.summary || "",
      servings: servings || meta.yield || "",
      time: meta.time || (minutes ? `${minutes} minutes` : "") || meta.total_time || "",
      tags: [meta.tags, meta.category, meta.categories].flat().filter(Boolean),
      ingredients,
      equipment: meta.equipment || meta.tools || meta.appliances || [],
      nutrition: meta.nutrition || meta.nutrition_facts || meta.nutritional_facts,
      steps,
      notes: [meta.yield && servings ? `Yield: ${meta.yield}` : "", prose].filter(Boolean).join("\n\n"),
    });
  }

  /* Path B — plain markdown with Ingredients / Steps headings. */
  const ingredients = [];
  const equipment = [];
  const steps = [];
  const notes = [];
  const head = [];
  let section = "head";

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || /^[-=_*]{3,}$/.test(line)) continue;
    const hit = line.match(SECTION);
    if (hit) {
      const w = hit[1].toLowerCase();
      section = w.startsWith("ingredient")
        ? "ingredients"
        : w.startsWith("equipment") || w.startsWith("tool") || w.startsWith("appliance")
        ? "equipment"
        : w.startsWith("note") || w.startsWith("tip")
        ? "notes"
        : "steps";
      continue;
    }
    if (section === "head") head.push(clean(line));
    else if (section === "ingredients") ingredients.push(clean(stripBullet(line)));
    else if (section === "equipment") equipment.push(clean(stripBullet(line)));
    else if (section === "steps") steps.push(clean(stripBullet(line).replace(/^\*\*(.+?)\*\*:?\s*/, "$1: ")));
    else notes.push(clean(stripBullet(line)));
  }

  return normalize({
    title: meta.title || head[0] || "",
    contributor: meta.contributor || meta.author || meta.from || "",
    description: meta.description || head.slice(1).join(" "),
    servings: meta.servings || meta.yield || "",
    time: meta.time || meta.totaltime || "",
    tags: meta.tags || meta.categories || "",
    ingredients,
    equipment: meta.equipment || meta.tools || meta.appliances || equipment,
    nutrition: meta.nutrition || meta.nutrition_facts || meta.nutritional_facts,
    steps,
    notes: notes.join("\n"),
  });
}

/* Estimated nutrition, per serving of the finished dish. Values are kept as
   written — "18 g", "410 mg" — rather than parsed into numbers: the site only
   prints them, and a unit stated by the source beats one inferred here. Every
   label sits flush left; order is the order they appear on the recipe. */
const NUTRIENTS = [
  { key: "calories", label: "Calories", eg: "320", alt: ["kcal", "energy"] },
  { key: "fat", label: "Fat", eg: "18 g", alt: ["totalFat", "fatContent"] },
  { key: "saturatedFat", label: "Saturated fat", eg: "7 g", alt: ["satFat", "saturated", "saturatedFatContent"] },
  { key: "carbs", label: "Carbohydrate", eg: "31 g", alt: ["carbohydrate", "carbohydrates", "carbohydrateContent"] },
  { key: "fiber", label: "Fiber", eg: "2 g", alt: ["dietaryFiber", "fiberContent"] },
  { key: "sugars", label: "Sugars", eg: "12 g", alt: ["sugar", "sugarContent"] },
  { key: "protein", label: "Protein", eg: "8 g", alt: ["proteinContent"] },
  { key: "sodium", label: "Sodium", eg: "410 mg", alt: ["sodiumContent"] },
];

const flatKey = (k) => String(k).toLowerCase().replace(/[_\s-]/g, "");

/* Accepts snake_case, camelCase and the schema.org *Content names, since the
   source of a pasted recipe varies. Returns null when nothing usable is there,
   so the section simply does not render. */
const normalizeNutrition = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const flat = {};
  for (const [k, v] of Object.entries(raw)) flat[flatKey(k)] = v;
  const out = {};
  for (const n of NUTRIENTS) {
    const hit = [n.key, ...(n.alt || [])]
      .map((name) => flat[flatKey(name)])
      .find((v) => v !== undefined && v !== null && String(v).trim() !== "");
    if (hit !== undefined) out[n.key] = clean(String(hit));
  }
  return Object.keys(out).length ? out : null;
};

/* Stored per serving and written with its unit ("18 g"), so scaling means
   lifting the number off the front and putting the unit back after. Anything
   that does not begin with a number passes through untouched. */
const scaleNutrient = (value, mult) => {
  const m = String(value ?? "").match(/^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return value;
  const n = parseFloat(m[1].replace(",", ".")) * mult;
  if (!Number.isFinite(n)) return value;
  const rounded = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return m[2] ? `${rounded} ${m[2]}` : String(rounded);
};

/* A cleared input means the line does not apply, so it is dropped rather than
   stored empty — an object of blank values would still draw the panel with
   nothing under it. */
const cleanNutrition = (n) => {
  if (!n) return null;
  const out = {};
  for (const { key } of NUTRIENTS) {
    const v = String(n[key] ?? "").trim();
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
};

function normalize(r) {
  if (!r || typeof r !== "object") return null;
  const title = clean(r.title || r.name || r.recipeName || "");
  const rawIngredients = r.ingredients || r.recipeIngredient || r.ingredientText;
  const ingredients = (Array.isArray(rawIngredients)
    ? rawIngredients.map(renderIngredient)
    : asList(rawIngredients).map((x) => (typeof x === "string" ? x : x.text))
  ).filter(Boolean);
  const steps = asList(r.steps || r.instructions || r.recipeInstructions || r.directions || r.method);
  const equipment = asList(r.equipment || r.tools || r.appliances || r.equipmentText || r.tool)
    .map((x) => (typeof x === "string" ? x : x.text || x.name || ""))
    .filter(Boolean);
  if (!title && !ingredients.length) return null;

  const rawTags = Array.isArray(r.tags)
    ? r.tags.flat().map((t) => String(t).toLowerCase().trim())
    : String(r.tags || r.keywords || r.recipeCategory || "").split(",").map((t) => t.toLowerCase().trim());
  const tags = Array.from(new Set(rawTags.filter(Boolean)));

  return {
    id: r.id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || "Untitled recipe",
    contributor: clean(r.contributor || r.author?.name || r.author || r.from || ""),
    description: clean(r.description || r.summary || ""),
    servings: clean(r.servings || r.recipeYield || r.yield || ""),
    time: clean(r.time || r.totalTime || r.totaltime || ""),
    tags,
    imageUrl: typeof (r.image || r.photo || r.imageUrl) === "string" ? clean(r.image || r.photo || r.imageUrl) : "",
    thumb: typeof r.thumb === "string" ? r.thumb : "",
    ingredients,
    equipment,
    steps,
    notes: clean(r.notes || r.note || r.tips || ""),
    nutrition: normalizeNutrition(r.nutrition || r.nutritionalFacts || r.nutritionInformation),
    created: r.created || Date.now(),
  };
}

const parseJSON = (raw) => {
  const data = JSON.parse(raw);
  const pool = Array.isArray(data) ? data : Array.isArray(data.recipes) ? data.recipes : [data];
  return pool.map(normalize).filter(Boolean);
};

/* ── Import from a link ───────────────────────────────────────────
   A page's schema.org Recipe, fetched by functions/api/fetch-recipe.js, turned
   into the shape the rest of the importer already understands. */

/* Structured data carries markup and entities ("Mom&#39;s", "<p>Whisk</p>").
   DOMParser reads it as inert text — nothing in it runs. */
const htmlToText = (s) => {
  if (s == null) return "";
  const str = String(s);
  const text = /[<&]/.test(str) && typeof DOMParser !== "undefined"
    ? new DOMParser().parseFromString(str, "text/html").body.textContent || ""
    : str;
  return text.replace(/\s+/g, " ").trim();
};
/* the same, keeping the paragraph breaks an instruction blob is split on */
const htmlToLines = (s) =>
  String(s ?? "")
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\b[^>]*>/gi, "\n")
    .split(/\n+/)
    .map(htmlToText)
    .filter(Boolean);

const looksLikeUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || "").trim());

/* ISO 8601 durations — "PT1H30M", "P0DT45M" — into whole minutes */
function isoMinutes(v) {
  const m = String(v || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const mins = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / 60;
  return mins > 0 ? Math.round(mins) : null;
}
const minutesLabel = (n) => {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return [h && `${h} ${h === 1 ? "hour" : "hours"}`, m && `${m} ${m === 1 ? "minute" : "minutes"}`].filter(Boolean).join(" ");
};

/* Yields arrive as "4", ["4", "4 servings"] or ["2", "2 dozen"]. The longest
   entry says the most — a bare "2" beside "2 dozen" means two dozen cookies,
   not two servings — and a bare number standing alone is a serving count. */
function schemaServings(y) {
  const list = [].concat(y ?? []).map(htmlToText).filter((v) => /\d/.test(v));
  if (!list.length) return "";
  const best = list.reduce((a, b) => (b.length > a.length ? b : a));
  return /^\d+$/.test(best) ? `Serves ${best}` : best;
}

/* Instructions come as one blob, a list of strings, HowToSteps, or HowToSections
   holding HowToSteps. Flatten all of it. A step's name is used as its title only
   when it says something the text does not — many sites repeat the text there. */
function schemaSteps(v) {
  const out = [];
  const walk = (x) => {
    if (x == null) return;
    if (typeof x === "string") { out.push(...htmlToLines(x)); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x !== "object") return;
    if (x.itemListElement) { walk(x.itemListElement); return; }
    const text = htmlToText(x.text || x.description || x.name || "");
    if (!text) return;
    const name = htmlToText(x.name || "");
    const titled = name && name !== text && name.length <= 60 && !fold(text).startsWith(fold(name).slice(0, 24));
    out.push(titled ? { title: name, text } : text);
  };
  walk(v);
  return out;
}

function schemaImage(img, base) {
  const first = [].concat(img ?? [])[0];
  const src = typeof first === "string" ? first : first?.url || first?.contentUrl || "";
  try { return src ? new URL(src, base).href : ""; } catch { return ""; }
}

/* Sites write nutrition every which way — "2 grams fat", "14.58 g", "253.6
   milligrams", calories to fourteen decimal places. Keep the number and a
   standard unit (inferred from the nutrient when a site leaves it off), with
   no more precision than an estimate deserves. */
function tidyNutrient(key, v) {
  const m = String(v ?? "").match(/^\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  const word = m[2].toLowerCase();
  const unit = /^(mg|milligrams?)$/.test(word) ? "mg"
    : /^(g|gr|grams?)$/.test(word) ? "g"
    : /calorie|energy/i.test(key) ? ""
    : /sodium|cholesterol/i.test(key) ? "mg"
    : "g";
  const shown = unit && n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return unit ? `${shown} ${unit}` : String(shown);
}

function fromSchemaRecipe(node, pageUrl) {
  if (!node || typeof node !== "object") return null;
  const words = (v) =>
    [].concat(v ?? []).flatMap((x) => String(x).split(",")).map((t) => htmlToText(t).toLowerCase()).filter(Boolean);
  /* Keywords are written for search engines — author names, "cook school",
     "flipping" — and every tag becomes a filter chip under the shelf. Use the
     category and cuisine, and fall back to short keywords only when a page
     offers neither. */
  const primary = [...words(node.recipeCategory), ...words(node.recipeCuisine)];
  const tags = [...new Set(primary.length ? primary : words(node.keywords).filter((k) => k.split(" ").length <= 2))].slice(0, 6);
  const minutes = isoMinutes(node.totalTime) ?? (((isoMinutes(node.prepTime) || 0) + (isoMinutes(node.cookTime) || 0)) || null);
  const nutrition = {};
  if (node.nutrition && typeof node.nutrition === "object") {
    for (const [k, v] of Object.entries(node.nutrition)) {
      if (k.startsWith("@") || k === "servingSize") continue;
      const t = tidyNutrient(k, v);
      if (t != null) nutrition[k] = t;
    }
  }
  /* The site's author is not family. Made the contributor, they would open a new
     box on the shelf in a stranger's name — so they are credited in the notes,
     beside the address the recipe came from. */
  const by = [].concat(node.author ?? []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean).map(htmlToText);
  let host = "";
  try { host = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch { /* keep just the address */ }
  return normalize({
    title: htmlToText(node.name || node.headline),
    description: htmlToText(node.description),
    servings: schemaServings(node.recipeYield ?? node.yield),
    time: minutes ? minutesLabel(minutes) : "",
    tags,
    ingredients: [].concat(node.recipeIngredient ?? node.ingredients ?? []).map(htmlToText).filter(Boolean),
    steps: schemaSteps(node.recipeInstructions),
    nutrition: Object.keys(nutrition).length ? nutrition : null,
    notes: [`From ${host || "the web"}${by.length ? `, by ${by.join(" and ")}` : ""}.`, pageUrl].join("\n"),
  });
}

function parseFile(name, text) {
  const isJSON = /\.json$/i.test(name) || text.trim().startsWith("{") || text.trim().startsWith("[");
  if (isJSON) return parseJSON(text);
  const one = parseMarkdown(text);
  if (one && !one.title) one.title = name.replace(/\.[^.]+$/, "");
  return one ? [one] : [];
}

/* ── step formatting, shared by the form and the parser ── */
const stepLine = (s) => {
  const { title, text } = stepParts(s);
  return title ? `${title}: ${text}` : text;
};


/* ══════════════════════════════════════════════════════════════════
   Seed
   ══════════════════════════════════════════════════════════════════ */
const SEED = {
  id: "seed-sangria",
  title: "Cantina-Style Red Sangria",
  contributor: "Devon",
  description:
    "A reverse-engineered take on the sangria at Javier's — dry Spanish red, brandy, orange liqueur, and a reposado accent that sits in the background where it belongs.",
  servings: "Serves 6",
  time: "20 minutes, plus overnight",
  tags: ["drinks", "party"],
  equipment: ["Large pitcher (2 qt or bigger)", "Small saucepan", "Citrus juicer", "Long bar spoon", "Sharp paring knife"],
  ingredients: [
    "750 ml dry Spanish red wine (Garnacha or Tempranillo)",
    "3 oz Spanish brandy",
    "2 oz orange liqueur (Cointreau or good triple sec)",
    "1 oz reposado tequila",
    "6 oz fresh orange juice",
    "4 oz pineapple juice",
    "1 oz fresh lime juice",
    "2 oz simple syrup, plus more to taste",
    "1 orange, sliced into half-moons",
    "1 lime, sliced into thin rounds",
    "1 Granny Smith apple, diced",
    "1 cinnamon stick",
    "6 oz club soda, chilled",
  ],
  steps: [
    { title: "Make the simple syrup", text: "Combine equal parts sugar and water over medium heat until dissolved, then let it cool for 5 minutes. Hot syrup dulls the fruit." },
    { title: "Macerate the fruit", text: "Put the orange, lime, and apple in the pitcher with the orange liqueur and simple syrup. Leave it 10 minutes — this is what separates restaurant sangria from wine with fruit floating in it." },
    { title: "Build the base", text: "Add the wine, brandy, tequila, and all three juices. Drop in the cinnamon stick and stir gently. If you can pick the tequila out cleanly, you used too much." },
    { title: "Chill and steep", text: "Cover and refrigerate 4 hours, ideally overnight. The brandy heat rounds off and the cinnamon blooms. Pull the cinnamon stick after about 6 hours." },
    { title: "Taste and adjust", text: "Taste it cold — chilling flattens sweetness. Add syrup a half ounce at a time if it's thin, more lime if it's cloying." },
    { title: "Serve over ice", text: "Pour over plenty of ice with a spoonful of the macerated fruit. Top with club soda for lift." },
  ],
  notes:
    "Sweeter and more purple-fruit forward? Swap the pineapple juice for blackberry or pomegranate. Drier? Cut the syrup to 1 oz and skip the tequila.",
  created: 1,
};

const DEFAULT_AUTHORS = ["Tracey", "Devon", "Haven", "Ashton"];

/* Identifies the button a timer came from. Keyed by step rather than by the
   label so the same step started from the recipe page and again from cook
   mode counts as one timer, not two identical countdowns. */
const timerKey = (recipeId, stepIndex) => `${recipeId}:${stepIndex}`;

/* What has gone in and which steps are done, per recipe, on this device only —
   it is one cook's progress, not the family's. Kept in localStorage so a reload
   mid-recipe keeps your place, and dropped after half a day so last week's
   ticks are not waiting the next time you open the recipe. */
const CROSS_KEY = "rb-crossed";
const CROSS_TTL = 12 * 60 * 60 * 1000;
const NO_MARKS = { ing: [], steps: [] };
const loadCrossed = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CROSS_KEY) || "{}");
    const now = Date.now();
    return Object.fromEntries(Object.entries(saved).filter(([, m]) => m && now - m.at < CROSS_TTL));
  } catch {
    return {};
  }
};
const UNFILED = "\u0000unfiled";   // sentinel: recipes with no author named
/* A drag carrying files is an import. Card drags are tracked in a ref instead:
   custom dataTransfer MIME types aren't readable during dragover in every
   browser, so relying on them meant preventDefault never ran and the drop
   was refused before it began. */
const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

const BLANK = { thumb: "", full: null, photoTouched: false, title: "", contributor: "", description: "", servings: "", time: "", tagText: "", ingredientText: "", equipmentText: "", stepText: "", notes: "", nutrition: null };

/* ══════════════════════════════════════════════════════════════════
   Shared bits
   ══════════════════════════════════════════════════════════════════ */
const Grain = ({ opacity = 0.045, blend = "normal", card = false }) => (
  <div
    aria-hidden
    style={{
      position: "absolute", inset: 0, backgroundImage: NOISE, pointerEvents: "none",
      opacity: card ? "var(--grain-op)" : opacity,
      mixBlendMode: card ? "var(--grain-blend)" : blend,
    }}
  />
);

/* A button that opens a panel beneath it. The panel closes on a click anywhere
   else or on Escape — and that Escape stops here, since on a recipe page it
   would otherwise also mean "go back". `children` gets a close() to call once
   a choice is made; choices that people compare, like themes, leave it open. */
function Popover({ trigger, children, align = "left", width = 300, label, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => setOpen((o) => { if (!o && onOpen) onOpen(); return !o; });
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {trigger({ open, toggle })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{
            position: "absolute", top: "calc(100% + 6px)", [align]: 0, zIndex: 30, width, maxWidth: "calc(100vw - 32px)",
            background: "var(--card-bg)", color: "var(--card-text)", border: "1px solid var(--card-edge)", borderRadius: 3,
            padding: 10, boxShadow: "0 22px 44px -18px rgba(0,0,0,.6)", maxHeight: "min(74vh, 640px)", overflowY: "auto",
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* A field is a <label>, which is what makes its whole block a click target for the
   one input inside it — right for a text box, wrong for a row of buttons, where it
   meant that clicking anywhere in the Photo row, even far out to the right of the
   button, opened the file picker. Fields holding controls rather than a single
   input pass `group` and get a named <div>, which nothing clicks through. */
function Field({ label, hint, children, group }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag
      {...(group ? { role: "group", "aria-label": label } : {})}
      style={{ display: "block", marginBottom: 20 }}
    >
      <span style={{ display: "block", font: `600 13px/1.4 ${UI}`, color: "var(--card-text)", marginBottom: 2 }}>{label}</span>
      {hint && <span style={{ display: "block", font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", marginBottom: 7 }}>{hint}</span>}
      {children}
    </Tag>
  );
}

const input = {
  width: "100%", boxSizing: "border-box", font: `400 15px/1.55 ${UI}`, color: "var(--card-text)",
  padding: "10px 12px", border: `1px solid var(--card-edge)`, borderRadius: 2, background: "var(--card-lift)",
};

/* servings stepper */
function Servings({ base, factor, setFactor, dark }) {
  if (!base) return null;
  const current = Math.max(1, Math.round(base * factor));
  const set = (n) => setFactor(Math.max(1, n) / base);
  const fg = dark ? "rgba(var(--on-page), calc(.9 * var(--ink-k)))" : "var(--card-text)";
  const line = dark ? "rgba(var(--on-page), calc(.3 * var(--ink-k)))" : "var(--card-edge)";
  const btn = {
    width: 34, height: 34, borderRadius: 2, cursor: "pointer", background: "transparent",
    border: `1px solid ${line}`, color: fg, font: `500 18px/1 ${UI}`,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div>
        {Math.abs(factor - 1) > 0.001 ? (
          
          <button
            className="rb-focus"
            onClick={() => setFactor(1)}
            style={{ background: "none", border: "none", cursor: "pointer", whiteSpace: "break-spaces", maxWidth: 50 }}
          >
            <span style={{ font: `600 12px/1 ${UI}`, color: dark ? "rgba(var(--on-page), calc(.6 * var(--ink-k)))" : "var(--card-muted)" }}>Reset</span>
          </button>
        ) : (
          <span style={{ font: `600 12px/1 ${UI}`, color: dark ? "rgba(var(--on-page), calc(.6 * var(--ink-k)))" : "var(--card-muted)" }}>Servings</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="rb-focus" style={btn} onClick={() => set(current - 1)} aria-label="Fewer servings">−</button>
        <span className="rb-num" style={{ minWidth: 30, textAlign: "center", fontSize: 21, color: fg }}>{current}</span>
        <button className="rb-focus" style={btn} onClick={() => set(current + 1)} aria-label="More servings">+</button>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Static styles
   ══════════════════════════════════════════════════════════════════ */
const btnPrimary = { background: "var(--page-accent)", color: "var(--on-accent)", border: "none", padding: "12px 22px" };
const btnGhost = { background: "transparent", color: "rgba(var(--on-page), calc(.88 * var(--ink-k)))", border: "1px solid rgba(var(--on-page), calc(.28 * var(--ink-k)))", padding: "11px 20px" };
const btnQuiet = { background: "transparent", color: "var(--card-muted)", border: `1px solid var(--card-edge)`, padding: "10px 18px" };
const linkButton = { background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--card-accent)", font: "inherit", textDecoration: "underline", textUnderlineOffset: 2 };
/* rows and headings inside the dropdown panels, which use the card palette */
/* Sized to what it holds, not to the width of the menu. Stretching every row
   edge to edge left a band of dead-looking space beside each label that still
   toggled dark mode or started an export when clicked — the same surprise the
   photo field used to hand out, arrived at a different way. The gap inside a
   row, between a label and its own switch or chevron, is part of that control
   and stays live. */
const menuRow = (on) => ({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  width: "fit-content", maxWidth: "100%",
  padding: "9px 10px", border: "none", borderRadius: 3, cursor: "pointer", textAlign: "left",
  font: `500 14px/1.3 ${UI}`, background: on ? "var(--card-lift)" : "transparent", color: on ? "var(--card-accent)" : "var(--card-text)",
});
const menuLabel = { font: `600 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--card-muted)", margin: "4px 4px 8px" };
/* the toolbar buttons on the page, matched to the search box beside them */
const toolbarButton = {
  display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 50,
  padding: "8px 14px", borderRadius: 2, cursor: "pointer", textAlign: "left",
  border: "1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))", background: "rgba(var(--on-page), calc(.06 * var(--ink-k)))",
};
const sheet = {
  position: "relative", background: "var(--card-bg)", color: "var(--card-text)",
  borderRadius: 3, border: "1px solid var(--card-edge)", overflow: "hidden",
};

/* ══════════════════════════════════════════════════════════════════
   Cooking mode — defined at module scope on purpose. Declaring it inside
   RecipeBox would make it a brand-new component type on every render, so
   each timer tick would unmount and remount the whole overlay (and replay
   its entrance animation), which read as a full-screen flash.
   ══════════════════════════════════════════════════════════════════ */
function CookingMode({ recipe, stepIndex, setStepIndex, factor, setFactor, baseServings,
                      showPantry, setShowPantry, onClose, startTimer, hasTimer, prevStep, nextStep,
                      marks, onToggle, onFinish }) {
  const steps = recipe.steps;
  const step = stepParts(steps[stepIndex]);
  const secs = stepDuration(steps[stepIndex]);
  const done = marks.steps.includes(stepIndex);
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column",
        background: `radial-gradient(120% 80% at 50% 0%, var(--page-soft) 0%, var(--page-bg) 50%, var(--page-deep) 100%)`,
      }}
    >
      <Grain opacity={0.06} />
      {/* top bar */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "18px 22px", flexWrap: "wrap" }}>
        <div>
          <p style={{ font: `400 17px/1.3 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: 0 }}>{recipe.title}</p>
          <p style={{ font: `500 12px/1.4 ${UI}`, color: "rgba(var(--on-page), calc(.55 * var(--ink-k)))", margin: "2px 0 0" }}>
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Servings base={baseServings} factor={factor} setFactor={setFactor} dark />
          <button className="rb-btn rb-focus" style={btnGhost} onClick={() => setShowPantry((s) => !s)}>
            {showPantry ? "Hide ingredients" : "Ingredients"}
          </button>
          <button className="rb-btn rb-focus" style={btnGhost} onClick={() => onClose()}>Done</button>
        </div>
      </div>

      {/* progress */}
      <div style={{ position: "relative", display: "flex", gap: 3, padding: "0 22px 6px" }}>
        {steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setStepIndex(i)}
            aria-label={`Go to step ${i + 1}`}
            className="rb-focus"
            style={{
              flex: 1, height: 3, border: "none", padding: 0, cursor: "pointer",
              background: marks.steps.includes(i) ? "var(--page-accent)" : i === stepIndex ? "rgba(var(--on-page), calc(.65 * var(--ink-k)))" : "rgba(var(--on-page), calc(.18 * var(--ink-k)))",
            }}
          />
        ))}
      </div>

      {/* body */}
      <div style={{ position: "relative", flex: 1, overflowY: "auto", padding: "26px 22px 10px" }}>
        <div key={stepIndex} className="rb-step" style={{ maxWidth: 780, margin: "0 auto" }}>
          {step.title && (
            <h2 style={{ font: `300 clamp(28px, 5vw, 44px)/1.1 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: "0 0 18px", letterSpacing: "-0.02em" }}>
              {step.title}
            </h2>
          )}
          <p style={{ font: `400 clamp(17px, 2.4vw, 21px)/1.68 ${PROSE}`, color: "rgba(var(--on-page), calc(.92 * var(--ink-k)))", margin: 0, maxWidth: "56ch" }}>
            {scaleText(step.text, factor)}
          </p>
          {secs && (
            <button
              className="rb-btn rb-focus"
              style={{ ...btnPrimary, marginTop: 26 }}
              disabled={hasTimer(timerKey(recipe.id, stepIndex))}
              onClick={() => startTimer(`${recipe.title} — ${step.title || `step ${stepIndex + 1}`}`, secs, timerKey(recipe.id, stepIndex))}
            >
              {hasTimer(timerKey(recipe.id, stepIndex)) ? `${durLabel(secs)} timer running` : `Start a ${durLabel(secs)} timer`}
            </button>
          )}
          <button
            className="rb-focus"
            aria-pressed={done}
            onClick={() => onToggle("steps", stepIndex)}
            style={{
              display: "flex", alignItems: "center", gap: 9, marginTop: secs ? 16 : 26, padding: "6px 0",
              background: "none", border: "none", cursor: "pointer", font: `600 13.5px/1 ${UI}`,
              color: done ? "var(--page-accent)" : "rgba(var(--on-page), calc(.6 * var(--ink-k)))",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11,
                border: `1.5px solid ${done ? "var(--page-accent)" : "rgba(var(--on-page), calc(.45 * var(--ink-k)))"}`,
                background: done ? "var(--page-accent)" : "transparent", color: "var(--on-accent)",
              }}
            >
              {done ? "✓" : ""}
            </span>
            {done ? "Done — tap to undo" : "Mark this step done"}
          </button>
        </div>

        {showPantry && (
          <div style={{ maxWidth: 780, margin: "34px auto 0", borderTop: "1px solid rgba(var(--on-page), calc(.2 * var(--ink-k)))", paddingTop: 20 }}>
            <p style={{ font: `400 19px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: "0 0 4px" }}>Ingredients</p>
            <p style={{ font: `400 12.5px/1.5 ${UI}`, color: "rgba(var(--on-page), calc(.5 * var(--ink-k)))", margin: "0 0 8px" }}>Tap each one as it goes in.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, columns: "220px 2", columnGap: 30 }}>
              {recipe.ingredients.map((ing, i) => {
                const got = marks.ing.includes(i);
                return (
                  <li key={i} style={{ breakInside: "avoid" }}>
                    <button
                      className="rb-focus"
                      aria-pressed={got}
                      onClick={() => onToggle("ing", i)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "7px 0",
                        background: "none", border: "none", cursor: "pointer", font: `400 14.5px/1.5 ${UI}`,
                        color: got ? "rgba(var(--on-page), calc(.38 * var(--ink-k)))" : "rgba(var(--on-page), calc(.8 * var(--ink-k)))", textDecoration: got ? "line-through" : "none",
                      }}
                    >
                      {scaleLine(ing, factor)}
                    </button>
                  </li>
                );
              })}
            </ul>
            {recipe.equipment?.length > 0 && (
              <>
                <p style={{ font: `400 19px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: "22px 0 12px" }}>You'll need</p>
                <p style={{ font: `400 14.5px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.8 * var(--ink-k)))", margin: 0 }}>
                  {recipe.equipment.join(" · ")}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* nav */}
      <div style={{ position: "relative", display: "flex", gap: 12, padding: "14px 22px 22px", borderTop: "1px solid rgba(var(--on-page), calc(.14 * var(--ink-k)))" }}>
        <button
          className="rb-btn rb-focus"
          style={{ ...btnGhost, flex: 1, opacity: stepIndex === 0 ? 0.4 : 1 }}
          onClick={prevStep}
          disabled={stepIndex === 0}
        >
          Back
        </button>
        {stepIndex === steps.length - 1 ? (
          <button className="rb-btn rb-focus" style={{ ...btnPrimary, flex: 2 }} onClick={onFinish}>Finish</button>
        ) : (
          <button className="rb-btn rb-focus" style={{ ...btnPrimary, flex: 2 }} onClick={nextStep}>Next step</button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   App
   ══════════════════════════════════════════════════════════════════ */
export default function RecipeBox() {
  const [box, setBox] = useState({ name: SITE_NAME, recipes: [] });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("list");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [activeBox, setActiveBox] = useState(null);   // null = every box
  const [scope, setScope] = useState("all");
  /* Mirrored locally, like the colour theme, so the first paint is already in
     the right mode. With nothing stored, follow the device's own setting. */
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("rb-mode");
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [hero, setHero] = useState("");        // full-size photo for the open recipe
  /* "" wide, "mid" squarish, "tall" portrait. Cleared with every recipe, or the
     shape of the last photo is inherited by the next one. */
  const [heroShape, setHeroShape] = useState("");
  const photoRef = useRef(null);
  /* Snapshot of the list the recipe was opened from, so Back returns to the
     same search, scope, tag and box — not to a reset list. */
  const listStateRef = useRef({ query: "", scope: "all", tagFilter: null, activeBox: null });
  const [addingBox, setAddingBox] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  /* Escape has to beat the input's own blur handler, which would otherwise
     file the half-typed name on the way out. */
  const cancelBoxRef = useRef(false);
  const [staged, setStaged] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [list, setList] = useState(loadList);
  const listRef = useRef(list);              // the latest list, so quick successive changes build on each other
  const shoppingFrom = useRef("list");
  const [newItem, setNewItem] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [crossed, setCrossed] = useState(loadCrossed);
  const [palette, setPalette] = useState(() => paletteById(localPalette()));
  const [menuPane, setMenuPane] = useState("main");
  const [newsRead, setNewsRead] = useState(newsSeen);
  const unreadNews = Boolean(latestNews()) && newsRead < latestNews();
  const markNewsRead = () => {
    const at = latestNews();
    setNewsRead(at);
    try { localStorage.setItem(NEWS_KEY, at); } catch { /* private mode: the dot simply comes back */ }
  };
  const [dragging, setDragging] = useState(false);
  const [factor, setFactor] = useState(1);
  const [cooking, setCooking] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showPantry, setShowPantry] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [timers, setTimers] = useState([]);
  const fileRef = useRef(null);
  const wakeRef = useRef(null);
  const firedRef = useRef(new Set());

  /* fonts */
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,300;0,400;0,500;1,400&family=Radley:ital@0;1&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  /* Mode, colours and background belong to this device, like the shopping
     list. Mode, colours and the background used to be mirrored to the account
     as well; they are kept here alone now, so one person's dark mode is not
     everybody's. The effect below mirrors mode and colours locally. */
  const flipTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const choosePalette = (id) => setPalette(paletteById(id));

  const swatchButton = (key, on, onClick, swatch, label) => (
    <button
      key={key}
      className="rb-focus"
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 3, cursor: "pointer", textAlign: "left",
        border: `1px solid ${on ? "var(--card-accent)" : "var(--card-edge)"}`, background: on ? "var(--card-lift)" : "transparent",
      }}
    >
      <span aria-hidden style={{ flex: "none", width: 26, height: 26, borderRadius: "50%", background: swatch, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.14)" }} />
      <span style={{ font: `${on ? 600 : 500} 13px/1.25 ${UI}`, color: "var(--card-text)" }}>{label}</span>
    </button>
  );

  /* the page around the app — overscroll, the phone's status bar, and the
     first paint on the next visit — should match the theme too */
  useEffect(() => {
    const root = document.documentElement;
    const bg = palette[theme].bg;
    root.style.setProperty("--boot-bg", bg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    try {
      localStorage.setItem("rb-palette", palette.id);
      localStorage.setItem("rb-palette-bg", bg);
      localStorage.setItem("rb-mode", theme);
    } catch { /* fine */ }
  }, [palette, theme]);


  /* load */
  useEffect(() => {
    (async () => {
      const data = await loadBox();
      const loaded = data && Array.isArray(data.recipes) ? data : { name: SITE_NAME, recipes: [SEED] };
      loaded.name = SITE_NAME;
      /* DEFAULT_AUTHORS seeds a box that has never stored a roster. Unioning it
         in on every load instead would make the four permanent: remove one and
         it reappears on the next visit, which the shelf offers to do. */
      const stored = Array.isArray(loaded.authors) ? loaded.authors : Array.isArray(loaded.cooks) ? loaded.cooks : null;
      loaded.authors = stored ? Array.from(new Set(stored)) : [...DEFAULT_AUTHORS];
      delete loaded.cooks;
      setBox(loaded);
      setLoading(false);
    })();
  }, []);

  /* timer tick — one interval for the life of the app. Returns the same array
     reference when nothing changed, so React skips the re-render entirely. */
  useEffect(() => {
    const id = setInterval(() => {
      setTimers((prev) => {
        if (!prev.some((t) => t.running)) return prev;
        let changed = false;
        const next = prev.map((t) => {
          if (!t.running || !t.endsAt) return t;
          const remaining = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
          if (remaining === t.remaining) return t;
          changed = true;
          if (remaining === 0 && !firedRef.current.has(t.id)) {
            firedRef.current.add(t.id);
            beep();
          }
          return { ...t, remaining, running: remaining > 0 };
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  /* the full-size photo is only worth fetching once a recipe is opened */
  useEffect(() => {
    let cancelled = false;
    const r = box.recipes.find((x) => x.id === openId);
    setHeroShape("");
    if (!openId || !r) { setHero(""); return; }
    if (r.imageUrl) { setHero(r.imageUrl); return; }
    setHero(r.thumb || "");
    (async () => {
      try {
        const res = await window.storage?.get(imageKey(openId), true);
        if (!cancelled && res?.value) setHero(res.value);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [openId]);

  /* never leave a half-armed delete behind when navigating */
  useEffect(() => { setConfirmRemove(false); }, [openId, view]);

  /* keep the screen awake while cooking */
  useEffect(() => {
    if (!cooking) return;
    (async () => {
      try { wakeRef.current = await navigator.wakeLock?.request("screen"); } catch {}
    })();
    return () => { try { wakeRef.current?.release(); } catch {} wakeRef.current = null; };
  }, [cooking]);

  /* One timer, restarted by each message. With a timer per call, an older one
     fired partway through a newer message and wiped it early. */
  const flashTimer = useRef(null);
  const flash = (msg, ms = 3000) => {
    setStatus(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setStatus(""), ms);
  };
  const persist = async (next) => {
    setBox(next);
    flash((await saveBox(next)) ? "Saved" : "Couldn't save — that change is only on this screen");
  };

  /* Photos uploaded before the previews were enlarged still carry the old
     300px cut, and no amount of new code re-cuts them on its own. The full-size
     copy is already in storage, so the preview can just be taken again — no
     re-uploading, nothing destroyed, and a failure part way through simply
     leaves the rest as they were. */
  const [sharpening, setSharpening] = useState(false);
  const sharpenable = box.recipes.filter((r) => r.thumb && !r.imageUrl).length;

  const sharpenPreviews = async () => {
    setSharpening(true);
    try {
      const recipes = [...box.recipes];
      let done = 0;
      let missing = 0;
      for (let i = 0; i < recipes.length; i++) {
        const r = recipes[i];
        /* a URL photo is already shown full size in the tile */
        if (!r.thumb || r.imageUrl) continue;
        let full = null;
        try { full = (await window.storage?.get(imageKey(r.id), true))?.value || null; } catch { full = null; }
        if (!full) { missing++; continue; }
        try {
          recipes[i] = { ...r, thumb: await shrink(await imageFromSrc(full), THUMB_MAX, THUMB_Q) };
          done++;
        } catch { missing++; }
      }
      if (!done) {
        flash(missing
          ? `No full-size copy stored for ${missing} ${missing === 1 ? "photo" : "photos"}, so there is nothing sharper to cut from`
          : "Nothing needed sharpening", 6000);
        return;
      }
      const next = { ...box, recipes };
      setBox(next);
      const saved = await saveBox(next);
      flash(
        saved
          ? `Sharpened ${done} ${done === 1 ? "preview" : "previews"}${missing ? `, ${missing} left alone` : ""}`
          : "Sharpened them on this screen, but the save didn't go through",
        6000,
      );
    } finally {
      setSharpening(false);
    }
  };

  const openRecipe = box.recipes.find((r) => r.id === openId);
  const baseServings = servingsCount(openRecipe?.servings);
  /* Nutrition is stored for one serving. The panel describes the batch actually
     being made, so it moves with the scaler exactly as the ingredients do. */
  const servingsMade = baseServings ? Math.max(1, Math.round(baseServings * factor)) : null;
  const toBuy = list.items.filter((i) => !i.checked).length;
  const marks = (openRecipe && crossed[openRecipe.id]) || NO_MARKS;
  /* the next step to do — but only once one is done; before that nothing is "current" */
  const currentStep = openRecipe && marks.steps.length ? openRecipe.steps.findIndex((_, k) => !marks.steps.includes(k)) : -1;
  const allTags = Array.from(new Set(box.recipes.flatMap((r) => r.tags || []))).sort();
  const allAuthors = Array.from(
    new Set([...(box.authors || DEFAULT_AUTHORS), ...box.recipes.map((r) => r.contributor).filter(Boolean)])
  ).sort();
  const boxCount = (author) => box.recipes.filter((r) => r.contributor === author).length;
  const unfiled = box.recipes.filter((r) => !r.contributor).length;

  const openCard = (id) => {
    listStateRef.current = { query, scope, tagFilter, activeBox };
    setOpenId(id);
    setFactor(1);
    setView("detail");
  };

  const goBack = () => {
    const from = listStateRef.current;
    setQuery(from.query);
    setScope(from.scope);
    setTagFilter(from.tagFilter);
    setActiveBox(from.activeBox);
    setView("list");
  };

  /* what Back will say, described from the snapshot rather than current state */
  const backLabel = () => {
    const from = listStateRef.current;
    if (from.query || from.tagFilter) return "Back to results";
    if (from.activeBox === UNFILED) return "Back to unattributed";
    if (from.activeBox) return `Back to ${from.activeBox}'s recipes`;
    return "Back to all recipes";
  };

  const moveRecipe = (id, target) => {
    const recipe = box.recipes.find((r) => r.id === id);
    const author = target === UNFILED ? "" : target;
    if (!recipe || recipe.contributor === author) return;
    persist({ ...box, recipes: box.recipes.map((r) => (r.id === id ? { ...r, contributor: author } : r)) });
    flash(author ? `Moved "${recipe.title}" to ${author}'s recipes` : `Removed the author from "${recipe.title}"`);
  };

  /* A box is just a name in box.authors. Persisting that list writes it to
     shared storage, so the box turns up for everyone — empty until someone
     files a recipe under the name. allAuthors already folds in contributors
     found on the recipes themselves, so a name in use is a duplicate rather
     than a new box. Seeding from DEFAULT_AUTHORS matters on the first add:
     until box.authors exists, the roster is only the hardcoded four. */
  const addBox = () => {
    const name = newBoxName.trim();
    setAddingBox(false);
    setNewBoxName("");
    if (cancelBoxRef.current) { cancelBoxRef.current = false; return; }
    if (!name) return;
    const existing = allAuthors.find((a) => a.toLowerCase() === name.toLowerCase());
    if (existing) { flash(`${existing} is already listed`); setActiveBox(existing); return; }
    persist({ ...box, authors: [...(box.authors || DEFAULT_AUTHORS), name] });
    setActiveBox(name);
  };

  /* Only an empty box can go. allAuthors also gathers names off the recipes
     themselves, so dropping a name that still has recipes would leave the box
     on the shelf regardless and strand them under a name no longer offered as
     a filing choice. Removing is safe precisely because it is reversible: the
     name can be added straight back. */
  const removeBox = (name) => {
    if (boxCount(name) > 0) { flash(`${name} still has recipes — move those first`); return; }
    setActiveBox(null);
    persist({ ...box, authors: (box.authors || DEFAULT_AUTHORS).filter((a) => a !== name) });
  };

  /* A backup, not a share. The box object round-trips through the existing
     importer, which reads data.recipes. Full-size photos live under their own
     keys rather than inside the box, so they are fetched and folded in here —
     without that the file preserves thumbnails only, which is not much of a
     backup of a recipe with a picture. */
  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const photos = {};
      await Promise.all(box.recipes.map(async (r) => {
        try {
          const res = await window.storage?.get(imageKey(r.id), true);
          if (res?.value) photos[r.id] = res.value;
        } catch { /* no full-size photo stored for this one */ }
      }));
      const payload = { ...box, photos, exported: new Date().toISOString() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `recipe-box-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const n = box.recipes.length;
      flash(`Exported ${n} ${n === 1 ? "recipe" : "recipes"}`);
    } catch (err) {
      flash(`Export failed — ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  /* Saved to the device on every change — synchronous, so there is nothing to
     debounce and nothing that can be lost when a phone locks mid-shop. The
     copy in the account follows a couple of seconds behind. */
  const writeLocal = (l) => {
    try { localStorage.setItem(LIST_KEY, JSON.stringify(l)); return true; }
    catch { return false; }
  };

  const updateList = (change) => {
    const next = stamp(listRef.current, change(listRef.current));
    listRef.current = next;
    setList(next);
    if (!writeLocal(next)) flash("Couldn't save the shopping list on this device — its storage may be full or switched off", 7000);
    queueSync();
  };

  /* ── The same list on this person's other devices ──────────────────
     One exchange: read what the account holds, fold it together with what is
     here, write the result back. Reading before writing is what stops a phone
     that has been asleep in a pocket from wiping out a morning's additions on
     the laptop. Nothing is written when nothing differs, so a tab left open
     costs no writes at all. */
  const syncTimer = useRef(null);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const [listSync, setListSync] = useState("unknown");   // unknown | synced | device

  const syncList = useCallback(async () => {
    /* Changes can outrun a round trip; collapse them into one more pass. */
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    try {
      let theirs = null;
      try {
        theirs = asStoredList(JSON.parse((await window.storage.get(SYNC_KEY)).value));
      } catch (err) {
        /* Nothing stored yet is an ordinary first run, not a failure — and it
           is the moment a list built before any of this gets carried up. */
        if (!/not found/i.test(String(err && err.message))) throw err;
      }

      const mine = listRef.current;
      const merged = theirs ? mergeLists(mine, theirs) : mine;
      if (JSON.stringify(merged) !== JSON.stringify(mine)) {
        listRef.current = merged;
        setList(merged);
        writeLocal(merged);
      }
      if (!theirs || JSON.stringify(merged) !== JSON.stringify(theirs)) {
        await window.storage.set(SYNC_KEY, JSON.stringify(merged));
      }
      setListSync("synced");
    } catch {
      /* Offline, or Access would not vouch for us. The device's own copy is
         untouched, and the next change or the next visit tries again. */
      setListSync("device");
    } finally {
      syncing.current = false;
      if (syncAgain.current) { syncAgain.current = false; syncList(); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const queueSync = () => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncList, SYNC_DEBOUNCE);
  };

  /* On arrival, and again whenever the tab comes back — waking a phone at the
     shop is exactly when another device's changes matter. KV answers reads from
     a ~60s edge cache, so a change made elsewhere can take about a minute to
     surface no matter how often this asks. */
  useEffect(() => {
    syncList();
    const onWake = () => { if (document.visibilityState === "visible") syncList(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearTimeout(syncTimer.current);
    };
  }, [syncList]);

  /* two tabs on one device share its list, so a change in one shows in the other */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== LIST_KEY) return;
      const l = loadList();
      listRef.current = l;
      setList(l);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const openShopping = () => {
    if (view !== "shopping") shoppingFrom.current = view;
    setConfirmClear(false);
    setView("shopping");
    window.scrollTo(0, 0);
  };
  const leaveShopping = () => {
    const back = shoppingFrom.current;
    setView(back === "detail" && !openRecipe ? "list" : back);
  };

  /* Home: back to the list from anywhere. The search, filters and chosen box
     live outside the views, so they are still set when the list comes back.
     A half-written recipe or a pending import is not thrown away on one tap. */
  const [homeArmed, setHomeArmed] = useState(false);
  const formStartRef = useRef("");
  useEffect(() => {
    if (view === "form") formStartRef.current = JSON.stringify(form);
    setHomeArmed(false);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!homeArmed) return;
    const t = setTimeout(() => setHomeArmed(false), 4000);
    return () => clearTimeout(t);
  }, [homeArmed]);
  const goHome = () => {
    const unsaved =
      (view === "form" && (JSON.stringify(form) !== formStartRef.current || pasteText.trim() !== "" || linkText.trim() !== "")) ||
      (view === "import" && staged.length > 0);
    if (unsaved && !homeArmed) { setHomeArmed(true); return; }
    setHomeArmed(false);
    setCooking(false);
    if (view === "import") { setStaged([]); setImportErrors([]); }
    if (view !== "list") setView("list");
    window.scrollTo({ top: 0, behavior: view === "list" ? "smooth" : "auto" });
  };

  const addRecipeToList = (recipe) => {
    const lines = recipe.ingredients.map((ing) => scaleLine(ing, factor));
    updateList((l) => withRecipe(l, recipe, lines, servingsMade));
    flash(`${recipe.title} is on the shopping list`);
  };
  const removeRecipeFromList = (id) => updateList((l) => withoutRecipe(l, id));
  const toggleItem = (id) =>
    updateList((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) }));
  const removeItem = (id) => updateList((l) => prune({ ...l, items: l.items.filter((i) => i.id !== id) }));
  const clearChecked = () => updateList((l) => prune({ ...l, items: l.items.filter((i) => !i.checked) }));
  const clearAll = () => updateList(() => ({ items: [], recipes: {} }));
  const addTyped = () => {
    const text = newItem.trim();
    if (!text) return;
    updateList((l) => withTyped(l, text));
    setNewItem("");
  };

  /* The button always does something safe: add, update to the servings now on
     the stepper, or say it is already there. Pressing it twice cannot double
     the quantities, because a recipe's share is replaced, never stacked. */
  const listControls = (recipe) => {
    const entry = list.recipes[recipe.id];
    const takeOff = (
      <button className="rb-btn rb-focus" style={{ ...btnQuiet, borderColor: "transparent", padding: "10px 8px" }} onClick={() => removeRecipeFromList(recipe.id)}>
        Take it off
      </button>
    );
    if (!entry) {
      return <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => addRecipeToList(recipe)}>Add to shopping list</button>;
    }
    if (entry.servings !== (servingsMade ?? null)) {
      return (
        <>
          <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => addRecipeToList(recipe)}>
            Update list to {servingsMade} {servingsMade === 1 ? "serving" : "servings"}
          </button>
          {takeOff}
        </>
      );
    }
    return (
      <>
        <button className="rb-btn rb-focus" style={btnQuiet} onClick={openShopping}>On the shopping list →</button>
        {takeOff}
      </>
    );
  };

  const setNutrient = (key, value) =>
    setForm((prev) => ({ ...prev, nutrition: { ...(prev.nutrition || {}), [key]: value } }));

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_MD], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude-recipe-template.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  /* Comma-separated terms are ANDed: "lime, tequila" means both, not either. */
  const terms = fold(query).split(",").map((t) => t.trim()).filter(Boolean);
  const haystack = (r) => {
    if (scope === "ingredient") return fold(r.ingredients.join(" "));
    if (scope === "author") return fold(r.contributor);
    if (scope === "equipment") return fold((r.equipment || []).join(" "));
    return fold(
      [r.title, r.contributor, r.ingredients.join(" "), (r.equipment || []).join(" "), (r.tags || []).join(" ")].join(" ")
    );
  };

  const visible = box.recipes.filter((r) => {
    const hay = haystack(r);
    const hitQ = !terms.length || terms.every((t) => hay.includes(t));
    const inBox =
      activeBox === null ? true : activeBox === UNFILED ? !r.contributor : r.contributor === activeBox;
    return hitQ && (!tagFilter || (r.tags || []).includes(tagFilter)) && inBox;
  });

  /* Spam-clicking otherwise stacks identical countdowns. A second press on a
     step that is already counting does nothing; a different step is free to
     run alongside it. */
  const startTimer = (label, seconds, key) => {
    setTimers((prev) => (prev.some((t) => t.key === key) ? prev : [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, key, label, total: seconds, remaining: seconds, running: true, endsAt: Date.now() + seconds * 1000 },
    ]));
  };
  const hasTimer = (key) => timers.some((t) => t.key === key);
  const toggleTimer = (id) =>
    setTimers((p) =>
      p.map((t) => {
        if (t.id !== id || t.remaining <= 0) return t;
        return t.running
          ? { ...t, running: false, endsAt: null }
          : { ...t, running: true, endsAt: Date.now() + t.remaining * 1000 };
      })
    );
  const dropTimer = (id) => {
    firedRef.current.delete(id);
    setTimers((p) => p.filter((t) => t.id !== id));
  };

  /* Escape backs out of a recipe, the same as the button */
  useEffect(() => {
    if (view !== "detail" || cooking) return;
    const onKey = (e) => { if (e.key === "Escape") goBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, cooking]);

  /* cooking-mode keyboard */
  useEffect(() => {
    try { localStorage.setItem(CROSS_KEY, JSON.stringify(crossed)); } catch { /* private mode: ticks just won't outlive a reload */ }
  }, [crossed]);
  const marksFor = (id) => crossed[id] || NO_MARKS;
  const changeMarks = (id, kind, change) =>
    setCrossed((all) => {
      const cur = all[id] || NO_MARKS;
      const next = { ...cur, [kind]: change(cur[kind]), at: Date.now() };
      const rest = { ...all };
      if (next.ing.length || next.steps.length) rest[id] = next;
      else delete rest[id];
      return rest;
    });
  const toggleMark = (id, kind, i) => changeMarks(id, kind, (l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]));
  const markDone = (id, i) => changeMarks(id, "steps", (l) => (l.includes(i) ? l : [...l, i]));
  const clearMarks = (id) => setCrossed(({ [id]: _gone, ...rest }) => rest);
  /* cooking picks up where you left off, or at the top if nothing is done */
  const firstOpenStep = (r) => {
    const done = marksFor(r.id).steps;
    const i = r.steps.findIndex((_, k) => !done.includes(k));
    return i < 0 ? 0 : i;
  };

  /* Moving on from a step means it is done — the Next button and the arrow key
     alike. Jumping about on the progress bar is only looking, and marks nothing. */
  const nextStep = useCallback(() => {
    if (openRecipe) markDone(openRecipe.id, stepIndex);
    setStepIndex(Math.min(stepIndex + 1, (openRecipe?.steps.length || 1) - 1));
  }, [openRecipe, stepIndex]);
  const prevStep = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);
  useEffect(() => {
    if (!cooking) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") nextStep();
      else if (e.key === "ArrowLeft") prevStep();
      else if (e.key === "Escape") setCooking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cooking, nextStep, prevStep]);

  /* file intake */
  const ingestFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const found = [];
    const errs = [];
    for (const f of files) {
      try {
        const text = await f.text();
        const parsed = parseFile(f.name, text);
        if (!parsed.length) errs.push(`${f.name} — no recipe found inside`);
        else found.push(...parsed.map((r) => ({ ...r, _source: f.name })));
      } catch (err) {
        errs.push(`${f.name} — couldn't read it (${err.message})`);
      }
    }
    setStaged(found);
    setImportErrors(errs);
    setView("import");
  };

  const commitImport = () => {
    const existing = new Set(box.recipes.map((r) => r.id));
    const additions = staged.filter((r) => r._keep !== false && !existing.has(r.id)).map(({ _source, _keep, ...r }) => r);
    persist({ ...box, recipes: [...additions, ...box.recipes] });
    setStaged([]); setImportErrors([]); setView("list");
    flash(`Added ${additions.length} ${additions.length === 1 ? "recipe" : "recipes"}`);
  };

  /* form */
  const startAdd = () => {
    listStateRef.current = { query, scope, tagFilter, activeBox };
    const prefill = activeBox && activeBox !== UNFILED ? { ...BLANK, contributor: activeBox } : BLANK;
    setForm(prefill);
    setPasteText("");
    setLinkText("");
    setEditingId(null);
    setView("form");
  };
  const startEdit = (r) => {
    setForm({
      thumb: r.thumb || "", full: null, photoTouched: false,
      title: r.title, contributor: r.contributor || "", description: r.description || "",
      servings: r.servings || "", time: r.time || "", tagText: (r.tags || []).join(", "),
      ingredientText: r.ingredients.join("\n"), equipmentText: (r.equipment || []).join("\n"),
      stepText: r.steps.map(stepLine).join("\n"), notes: r.notes || "", nutrition: r.nutrition || null,
    });
    setEditingId(r.id); setView("form");
  };

  const fillFormFrom = (p) =>
    setForm((f) => ({
      ...f,
      title: p.title || f.title, contributor: p.contributor || f.contributor, description: p.description || f.description,
      servings: p.servings || f.servings, time: p.time || f.time,
      tagText: p.tags?.length ? p.tags.join(", ") : f.tagText,
      ingredientText: p.ingredients.length ? p.ingredients.join("\n") : f.ingredientText,
      equipmentText: p.equipment?.length ? p.equipment.join("\n") : f.equipmentText,
      stepText: p.steps.length ? p.steps.map(stepLine).join("\n") : f.stepText,
      notes: p.notes || f.notes, nutrition: p.nutrition || f.nutrition,
    }));

  const applyPaste = () => {
    const text = pasteText.trim();
    if (!text) return;
    /* a bare address in the paste box means "go and get it" */
    if (looksLikeUrl(text)) { setPasteText(""); importFromLink(text); return; }
    let p;
    try { p = /^[[{]/.test(text) ? parseJSON(pasteText)[0] : parseMarkdown(pasteText); }
    catch { p = parseMarkdown(pasteText); }
    if (!p) return flash("Couldn't make sense of that text");
    fillFormFrom(p);
    setPasteText("");
  };

  /* Fills the form rather than saving: a recipe from someone else's site is
     worth a look before it joins the family box. */
  const importFromLink = async (raw) => {
    const url = String(raw || "").trim();
    if (!looksLikeUrl(url)) return flash("That doesn't look like a web address — it should start with https://", 7000);
    const ask = (body) =>
      fetch("/api/fetch-recipe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin",
      });
    setLinkBusy(true);
    try {
      const res = await ask({ url });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.recipe) return flash(data.error || `Couldn't fetch that page (${res.status})`, 7000);
      const from = data.url || url;
      const p = fromSchemaRecipe(data.recipe, from);
      if (!p) return flash("That page has a recipe, but not one this could read — try the paste box", 7000);
      fillFormFrom(p);
      setLinkText("");
      /* the photo is optional: a recipe without one is still worth having */
      const src = schemaImage(data.recipe.image, from);
      let gotPhoto = false;
      if (src) {
        try {
          const img = await ask({ url: src, kind: "image" });
          if (img.ok) {
            const { full, thumb } = await prepPhoto(await img.blob());
            setForm((f) => ({ ...f, thumb, full, photoTouched: true }));
            gotPhoto = true;
          }
        } catch { /* keep the recipe, skip the photo */ }
      }
      const host = new URL(from).hostname.replace(/^www\./, "");
      flash(`Filled in from ${host}${src && !gotPhoto ? " (the photo wouldn't come through)" : ""} — check it over, then add it`, 5000);
    } catch {
      flash("Couldn't reach that page — check the link and your connection", 7000);
    } finally {
      setLinkBusy(false);
    }
  };

  const pickPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return flash("That file isn't an image");
    setPhotoBusy(true);
    try {
      const { full, thumb } = await prepPhoto(file);
      setForm((f) => ({ ...f, thumb, full, photoTouched: true }));
    } catch {
      flash("Couldn't read that image");
    } finally {
      setPhotoBusy(false);
    }
  };

  const dropPhoto = () => setForm((f) => ({ ...f, thumb: "", full: null, photoTouched: true }));

  const saveRecipe = () => {
    if (!form.title.trim()) return;
    const recipe = {
      id: editingId || `r-${Date.now()}`,
      thumb: form.thumb || "",
      imageUrl: editingId ? box.recipes.find((r) => r.id === editingId)?.imageUrl || "" : "",
      title: form.title.trim(),
      contributor: form.contributor.trim(),
      description: form.description.trim(),
      servings: form.servings.trim(),
      time: form.time.trim(),
      tags: form.tagText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      ingredients: form.ingredientText.split("\n").map((l) => l.trim()).filter(Boolean),
      equipment: form.equipmentText.split("\n").map((l) => l.trim()).filter(Boolean),
      steps: form.stepText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => stepParts(l)),
      notes: form.notes.trim(),
      created: editingId ? box.recipes.find((r) => r.id === editingId)?.created : Date.now(),
      /* carried on the form, so it survives an edit and a pasted import alike */
      nutrition: cleanNutrition(form.nutrition),
    };
    persist({ ...box, recipes: editingId ? box.recipes.map((r) => (r.id === editingId ? recipe : r)) : [recipe, ...box.recipes] });
    if (editingId) clearMarks(editingId);   // an edit can reorder lines; old ticks would point at the wrong ones

    if (form.photoTouched) {
      (async () => {
        try {
          if (form.full) await window.storage?.set(imageKey(recipe.id), form.full, true);
          else await window.storage?.delete(imageKey(recipe.id), true);
        } catch {}
        setHero(form.full || "");
      })();
    }

    setOpenId(recipe.id); setFactor(1); setView("detail");
  };

  /* styles */
  const css = `
    .rb {
      --card-bg: #FFFFFF;
      --card-lift: #FAF9F6;
      --card-text: #1A1917;
      --card-muted: #6B675F;
      --card-edge: #E4E0D8;
      --card-accent: var(--page-accent);
      --card-danger: ${T.rust};
      --grain-op: 0.022;
      --grain-blend: multiply;
    }
    .rb[data-theme="dark"] {
      --card-bg: var(--dark-card-bg);
      --card-lift: var(--dark-card-lift);
      --card-text: #EFE8D6;
      --card-muted: var(--dark-card-muted);
      --card-edge: rgba(239,232,214,.26);
      --card-accent: #F0A578;
      --card-danger: #F08A6B;
      --grain-op: 0.05;
      --grain-blend: overlay;
    }
    .rb * { box-sizing: border-box; }
    .rb ::selection { background: var(--page-accent); color: var(--on-accent); }
    .rb-focus:focus-visible { outline: 2px solid var(--page-accent); outline-offset: 3px; }
    /* Nothing in the menu reacted to a pointer, so a row gave no sign of where
       it began or ended. Now it lights up exactly as far as it is live.
       !important is doing real work here: menuRow sets background inline, and
       an inline declaration beats a stylesheet rule whatever its specificity. */
    .rb [role="dialog"] > button:hover:not(:disabled) { background: var(--card-lift) !important; }
    .rb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 22px; }
    .rb-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    /* Title, who wrote it, what it is, what you can do, then the photograph —
       the order every recipe site puts them in. The actions sit between rules
       so they read as a bar rather than as loose buttons. */
    .rb-actbar { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 15px 0; border-top: 1px solid var(--card-edge); border-bottom: 1px solid var(--card-edge); margin-bottom: 26px; }
    /* Nothing is cropped here. A wide photo fills the column; a tall one is
       capped by height and centred, which leaves gutters — so a tall photo gets
       a narrower frame of its own and fills that instead, the way a magazine
       sets a portrait plate. Which one it is can only be known once the file
       has loaded, so the class arrives with the image. */
    /* Nothing is cropped here. A photo gets a frame shaped like itself, so it
       fills that frame instead of sitting in a band of gutter: wide ones take
       the whole column, squarish ones a medium plate, tall ones a narrow one,
       the way a magazine sets a portrait. The proportions below are measured
       against a 1000px column so 16:9, 3:2 and 4:3 all reach both edges.
       Only the loaded file knows its shape, so the class arrives with it. */
    .rb-hero { margin: 0 0 24px; border-radius: 2px; overflow: hidden; border: 1px solid var(--card-edge); background: var(--card-lift); display: flex; justify-content: center; }
    .rb-hero img { display: block; width: auto; height: auto; max-width: 100%; max-height: 760px; }
    .rb-hero-mid { max-width: 620px; margin-left: auto; margin-right: auto; }
    .rb-hero-tall { max-width: 400px; margin-left: auto; margin-right: auto; }
    .rb-hero-tall img { max-height: 700px; }
    .rb-stats { display: flex; flex-wrap: wrap; margin: 0 0 30px; padding: 0; border: 1px solid var(--card-edge); border-radius: 2px; }
    .rb-stats > div { flex: 1 1 116px; padding: 11px 15px; border-right: 1px solid var(--card-edge); }
    .rb-stats > div:last-child { border-right: 0; }
    .rb-stats dt { font: 600 9.5px/1 ${UI}; letter-spacing: .12em; text-transform: uppercase; color: var(--card-muted); margin: 0 0 6px; }
    .rb-stats dd { font: 400 16px/1 ${DISPLAY}; margin: 0; color: var(--card-text); }
    .rb-detail { display: grid; grid-template-columns: 1fr; gap: 34px; }
    @media (min-width: 760px) { .rb-detail { grid-template-columns: 292px 1fr; gap: 52px; } }
    /* A tile is a photograph with its name under it — no card, no border, no
       shadow. Lifting every recipe off the page flattened the hierarchy; the
       picture is the thing that should catch the eye. */
    .rb-tile { display: block; cursor: pointer; background: none; border: 0; padding: 0; text-align: left; }
    .rb-shot { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 2px; background: var(--card-lift); border: 1px solid var(--card-edge); display: grid; place-items: center; }
    .rb-shot img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 220ms cubic-bezier(.2,.7,.3,1); }
    .rb-tile:hover .rb-shot img, .rb-tile:focus-visible .rb-shot img { transform: scale(1.035); }
    .rb-noshot { font: 500 10px/1 ${UI}; letter-spacing: .13em; text-transform: uppercase; color: var(--card-muted); }
    @media (prefers-reduced-motion: reduce) { .rb-shot img { transition: none; } .rb-tile:hover .rb-shot img { transform: none; } }
    .rb-card { transition: transform 160ms cubic-bezier(.2,.7,.3,1), box-shadow 160ms ease; }
    .rb-card:active { cursor: grabbing; }

    .rb-card:hover, .rb-card:focus-visible { transform: translateY(-3px); box-shadow: 0 14px 30px -14px rgba(0,0,0,.55); }
    @media (prefers-reduced-motion: reduce) { .rb-card { transition: none; } .rb-card:hover { transform: none; } }
    .rb-btn { cursor: pointer; border-radius: 2px; font-family: ${UI}; font-weight: 600; font-size: 14px; letter-spacing: .01em; transition: filter 120ms ease; }
    .rb-btn:hover { filter: brightness(1.07); }
    .rb-btn:disabled { cursor: not-allowed; filter: none; opacity: .5; }
    .rb-lede::first-letter { float: left; font-family: ${PROSE}; font-weight: 400; font-size: 3.4em; line-height: .82; padding: .04em .09em 0 0; color: var(--card-accent); }
    .rb-num { font-family: ${DISPLAY}; font-weight: 400; font-variant-numeric: lining-nums tabular-nums; }
    .rb-step { animation: rbfade 260ms ease both; }
    @keyframes rbfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .rb-step { animation: none; } }
    @media print {
      @page { margin: 14mm; }
      /* The dark palette follows the screen onto paper otherwise, which means
         near-white text on a white sheet. Force the light one either way. */
      .rb, .rb[data-theme="dark"] {
        background: #fff !important;
        --card-bg: #fff; --card-lift: #fff; --card-text: #1B1913;
        --card-muted: #4A4638; --card-edge: #C9C2AE; --card-accent: #A2412A;
        --grain-op: 0;
      }
      .rb-noprint { display: none !important; }
      /* overflow:hidden on the sheet clips whatever crosses a page boundary */
      .rb-sheet { box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
      .rb-pad { padding: 0 !important; }
      /* Grid items cannot break across pages — the two-column layout is what
         was slicing sections at the margin. One column flows properly. */
      .rb-detail { display: block !important; }
      .rb-detail > div + div { margin-top: 30px; }
      /* Never split one ingredient, one step, or the notes block in half. */
      .rb-detail li, .rb-notes, .rb-nutrition { break-inside: avoid; page-break-inside: avoid; }
      .rb-done, .rb-done * { opacity: 1 !important; text-decoration: none !important; }
      .rb-backdrop { display: none !important; }
      /* Never strand a heading at the foot of a page. */
      h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
      p { orphans: 3; widows: 3; }
      /* A photo at screen size otherwise eats most of the first sheet. */
      .rb-sheet img { max-height: 2.4in !important; }
    }

    /* ── phones ── */
    @media (max-width: 640px) {
      .rb-head { padding: 52px 16px 0 !important; }
      .rb-main { padding: 20px 16px 0 !important; }
      .rb-pad { padding: 24px 18px 30px !important; }
      .rb-grid { grid-template-columns: 1fr; gap: 16px; }

      /* 16px keeps iOS from zooming the viewport on focus */
      .rb input, .rb textarea { font-size: 16px !important; }
      .rb-actions button { flex: 1 1 auto; }
      .rb-corner { top: 8px !important; right: 16px !important; }

      .rb-tray { padding: 10px 12px !important; }
    }
    @media (max-width: 400px) {

    }
  `;

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      className="rb"
      data-theme={theme}
      onDragOver={(e) => { if (isFileDrag(e)) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDragging(false);
        ingestFiles(e.dataTransfer.files);
      }}
      style={{
        ...paletteVars(palette, theme),
        position: "relative", isolation: "isolate", minHeight: "100vh", color: "rgb(var(--on-page))",
        background: `radial-gradient(120% 90% at 50% 0%, var(--page-soft) 0%, var(--page-bg) 45%, var(--page-deep) 100%)`,
        paddingBottom: timers.length ? 130 : 80,
      }}
    >
      <style>{css}</style>
      <Grain opacity={palette[theme].grain ?? 0.06} />

      {dragging && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(var(--deep-rgb), .88)", display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <p style={{ font: `400 30px/1.3 ${DISPLAY}`, color: "var(--page-accent)", textAlign: "center", padding: 24 }}>Drop .json or .md files to add them</p>
        </div>
      )}

      {cooking && openRecipe && (
        <CookingMode
          recipe={openRecipe}
          stepIndex={stepIndex}
          setStepIndex={setStepIndex}
          factor={factor}
          setFactor={setFactor}
          baseServings={baseServings}
          showPantry={showPantry}
          setShowPantry={setShowPantry}
          onClose={() => setCooking(false)}
          startTimer={startTimer}
          hasTimer={hasTimer}
          prevStep={prevStep}
          nextStep={nextStep}
          marks={marksFor(openRecipe.id)}
          onToggle={(kind, i) => toggleMark(openRecipe.id, kind, i)}
          onFinish={() => { markDone(openRecipe.id, stepIndex); setCooking(false); }}
        />
      )}

      {/* ─── masthead ─── */}
      <header className="rb-noprint rb-head" style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: "52px 26px 0" }}>
        <div className="rb-corner" style={{ position: "absolute", top: 14, right: 26, zIndex: 5, display: "flex", gap: 8 }}>
          <button
            className="rb-btn rb-focus"
            onClick={goHome}
            aria-current={view === "list" ? "page" : undefined}
            title={view === "list" ? "Back to the top" : "Back to all the recipes — your search and filters stay as they were"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: homeArmed ? "var(--card-danger)" : "transparent",
              border: `1px solid ${homeArmed ? "var(--card-danger)" : "rgba(var(--on-page), calc(.22 * var(--ink-k)))"}`,
              color: homeArmed ? T.inkDeep : "rgba(var(--on-page), calc(.8 * var(--ink-k)))",
              padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
            }}
          >
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>⌂</span>
            {homeArmed ? "Discard & go home?" : "Home"}
          </button>
          <Popover
            align="right"
            width={312}
            label="Menu"
            onOpen={() => setMenuPane("main")}
            trigger={({ open, toggle }) => (
              <button
                className="rb-btn rb-focus"
                onClick={toggle}
                aria-expanded={open}
                aria-haspopup="dialog"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "transparent", border: "1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))",
                  color: "rgba(var(--on-page), calc(.8 * var(--ink-k)))", padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
                }}
              >
                <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>☰</span>
                Menu
                {unreadNews && <span role="img" aria-label="new updates" title="New updates" style={newsDot("var(--page-accent)")} />}
              </button>
            )}
          >
            {(close) => menuPane === "news" ? (
              <>
                <button className="rb-focus" onClick={() => setMenuPane("main")} style={{ ...menuRow(false), color: "var(--card-accent)", fontWeight: 600, marginBottom: 4 }}>
                  <span>‹ Back</span>
                </button>
                <p style={menuLabel}>What's new</p>
                {CHANGELOG.map((day) => (
                  <div key={day.date} style={{ margin: "0 4px 16px" }}>
                    <p style={{ font: `600 11px/1 ${UI}`, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--card-accent)", margin: "0 0 7px" }}>
                      {prettyDate(day.date)}
                    </p>
                    {day.changes.map((c, n) => (
                      <p key={n} style={{ font: `400 12.5px/1.55 ${UI}`, color: "var(--card-muted)", margin: "0 0 8px" }}>
                        {c.title && <span style={{ color: "var(--card-text)", fontWeight: 600 }}>{c.title} </span>}
                        {c.text}
                      </p>
                    ))}
                  </div>
                ))}
                {!CHANGELOG.length && (
                  <p style={{ font: `400 12.5px/1.55 ${UI}`, color: "var(--card-muted)", margin: "0 4px" }}>Nothing noted down yet.</p>
                )}
              </>
            ) : menuPane === "theme" ? (
              <>
                <button className="rb-focus" onClick={() => setMenuPane("main")} style={{ ...menuRow(false), color: "var(--card-accent)", fontWeight: 600, marginBottom: 4 }}>
                  <span>‹ Back</span>
                </button>
                <p style={menuLabel}>Colours</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {PALETTES.map((p) => swatchButton(p.id, p.id === palette.id, () => choosePalette(p.id), swatchFor(p, theme), p.name))}
                </div>
                <p style={{ font: `400 12px/1.45 ${UI}`, color: "var(--card-muted)", margin: "12px 4px 2px" }}>Just for this device — everyone picks their own.</p>
              </>
            ) : (
              <>
                <button className="rb-focus" onClick={flipTheme} aria-pressed={theme === "dark"} style={menuRow(false)}>
                  <span>Dark mode</span>
                  <span aria-hidden style={{ position: "relative", flex: "none", width: 34, height: 20, borderRadius: 999, background: theme === "dark" ? "var(--card-accent)" : "var(--card-edge)" }}>
                    <span style={{ position: "absolute", top: 3, left: theme === "dark" ? 17 : 3, width: 14, height: 14, borderRadius: "50%", background: "var(--card-bg)", transition: "left 120ms ease" }} />
                  </span>
                </button>
                <button className="rb-focus" onClick={() => setMenuPane("theme")} style={menuRow(false)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span
                      aria-hidden
                      style={{
                        flex: "none", width: 18, height: 18, borderRadius: "50%", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)",
                        background: swatchFor(palette, theme),
                      }}
                    />
                    Colours
                  </span>
                  <span aria-hidden style={{ color: "var(--card-muted)" }}>›</span>
                </button>
                <button className="rb-focus" onClick={() => { exportAll(); close(); }} disabled={exporting} style={menuRow(false)}>
                  <span>{exporting ? "Exporting…" : "Export all recipes"}</span>
                  <span aria-hidden style={{ color: "var(--card-muted)", fontSize: 12 }}>backup</span>
                </button>
                {sharpenable > 0 && (
                  <button className="rb-focus" onClick={() => { sharpenPreviews(); close(); }} disabled={sharpening} style={menuRow(false)}>
                    <span>{sharpening ? "Sharpening…" : "Sharpen photo previews"}</span>
                    <span aria-hidden style={{ color: "var(--card-muted)", fontSize: 12 }}>
                      {sharpenable} {sharpenable === 1 ? "photo" : "photos"}
                    </span>
                  </button>
                )}
                <button className="rb-focus" onClick={() => { setMenuPane("news"); markNewsRead(); }} style={menuRow(false)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    What's new
                    {unreadNews && <span role="img" aria-label="unread" style={newsDot("var(--card-accent)", 6)} />}
                  </span>
                  <span aria-hidden style={{ color: "var(--card-muted)", fontSize: 12 }}>
                    {CHANGELOG.length ? prettyDate(CHANGELOG[0].date) : ""} ›
                  </span>
                </button>
              </>
            )}
          </Popover>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ minWidth: 260 }}>
            <h1 style={{ font: `300 clamp(34px, 6vw, 52px)/1.02 ${DISPLAY}`, margin: 0, letterSpacing: "-0.015em", color: "rgb(var(--on-page))" }}>
              {activeBox ? `${activeBox}'s Recipes` : SITE_NAME}
            </h1>
            <p style={{ font: `400 14.5px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.58 * var(--ink-k)))", margin: "12px 0 0", maxWidth: "46ch" }}>
              {activeBox
                ? `${boxCount(activeBox)} ${boxCount(activeBox) === 1 ? "recipe" : "recipes"} from ${activeBox}.`
                : `${box.recipes.length} ${box.recipes.length === 1 ? "recipe" : "recipes"} kept here, for whoever asks next.`}
            </p>

          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="rb-btn rb-focus" style={btnGhost} onClick={openShopping}>
              <span aria-hidden style={{ marginRight: 7 }}>🛒</span>Shopping list{toBuy ? ` (${toBuy})` : ""}
            </button>

            <button className="rb-btn rb-focus" style={btnPrimary} onClick={startAdd}>Add a recipe</button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
          onChange={(e) => { ingestFiles(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
        <div style={{ marginTop: 30, borderTop: `1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))`, borderBottom: `1px solid rgba(var(--on-page), calc(.1 * var(--ink-k)))`, height: 4 }} />
      </header>

      <main className="rb-main" style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: "30px 26px 0" }}>
        {status && <p className="rb-noprint" style={{ font: `500 13px/1.4 ${UI}`, color: "var(--page-accent)", margin: "0 0 18px" }}>{status}</p>}
        {loading && <p style={{ font: `400 15px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.7 * var(--ink-k)))" }}>Opening the box…</p>}

        {/* ═══════ LIST ═══════ */}
        {!loading && view === "list" && (
          <>
            {(() => {
              const shelf = [
                { key: null, name: "All recipes", count: box.recipes.length },
                ...allAuthors.map((c) => ({ key: c, name: `${c}'s recipes`, count: boxCount(c) })),
                ...(unfiled ? [{ key: UNFILED, name: "No author", count: unfiled }] : []),
              ];
              const current = shelf.find((b) => b.key === activeBox) || shelf[0];
              const activeFilters = (scope !== "all" ? 1 : 0) + (tagFilter ? 1 : 0);
              const chip = (key, label, onClear) => (
                <button
                  key={key}
                  className="rb-focus"
                  onClick={onClear}
                  aria-label={`Remove filter: ${label}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, font: `500 12.5px/1 ${UI}`, padding: "7px 10px 7px 12px",
                    borderRadius: 999, cursor: "pointer", border: "1px solid var(--page-accent)",
                    background: "rgba(var(--accent-rgb), .12)", color: "rgb(var(--on-page))",
                  }}
                >
                  {label}
                  <span aria-hidden style={{ fontSize: 15, lineHeight: 1, opacity: 0.7 }}>×</span>
                </button>
              );
              return (
                <div style={{ marginBottom: 26 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                    <Popover
                      width={300}
                      label="Recipe boxes"
                      trigger={({ open, toggle }) => (
                        <button className="rb-focus" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" style={{ ...toolbarButton, maxWidth: "100%" }}>
                          <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", minWidth: 0 }}>
                            <span style={{ font: `400 17px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "min(60vw, 340px)" }}>
                              {current.name}
                            </span>
                            <span style={{ font: `500 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(var(--on-page), calc(.45 * var(--ink-k)))" }}>
                              {current.count} {current.count === 1 ? "recipe" : "recipes"}
                            </span>
                          </span>
                          <span aria-hidden style={{ fontSize: 12, color: "rgba(var(--on-page), calc(.6 * var(--ink-k)))" }}>▾</span>
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <p style={menuLabel}>Recipe boxes</p>
                          {shelf.map((b) => {
                            const on = activeBox === b.key;
                            return (
                              <button
                                key={b.key ?? "all"}
                                className="rb-focus"
                                aria-pressed={on}
                                onClick={() => { setActiveBox(b.key); setQuery(""); setTagFilter(null); close(); }}
                                style={menuRow(on)}
                              >
                                <span style={{ font: `400 16px/1.25 ${DISPLAY}` }}>{b.name}</span>
                                <span style={{ font: `500 12px/1 ${UI}`, color: "var(--card-muted)" }}>{b.count}</span>
                              </button>
                            );
                          })}
                          <div style={{ borderTop: "1px solid var(--card-edge)", margin: "8px 0" }} />
                          {addingBox ? (
                            <input
                              autoFocus
                              value={newBoxName}
                              onChange={(e) => setNewBoxName(e.target.value)}
                              onBlur={addBox}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.target.blur();
                                if (e.key === "Escape") { cancelBoxRef.current = true; e.target.blur(); }
                              }}
                              placeholder="Their name, then Enter"
                              aria-label="Name of the person to add"
                              className="rb-focus"
                              style={{ ...input, padding: "9px 10px" }}
                            />
                          ) : (
                            <button className="rb-focus" onClick={() => setAddingBox(true)} style={menuRow(false)}>
                              <span>+ Add someone</span>
                            </button>
                          )}
                          {activeBox && activeBox !== UNFILED && boxCount(activeBox) === 0 && (
                            <button className="rb-focus" onClick={() => { removeBox(activeBox); close(); }} style={{ ...menuRow(false), color: "var(--card-danger)" }}>
                              <span>Remove {activeBox}'s box</span>
                            </button>
                          )}
                        </>
                      )}
                    </Popover>

                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={SCOPES.find((s2) => s2.id === scope).placeholder}
                      aria-label="Search recipes"
                      className="rb-focus"
                      style={{
                        flex: "1 1 200px", minWidth: 0, minHeight: 50, font: `400 15px/1.5 ${UI}`, padding: "12px 15px", borderRadius: 2,
                        border: `1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))`, background: "rgba(var(--on-page), calc(.06 * var(--ink-k)))", color: "rgb(var(--on-page))",
                      }}
                    />

                    <Popover
                      align="right"
                      width={340}
                      label="Filters"
                      trigger={({ open, toggle }) => (
                        <button className="rb-focus" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" style={toolbarButton}>
                          <span style={{ font: `600 13.5px/1 ${UI}`, color: "rgb(var(--on-page))" }}>Filters</span>
                          {activeFilters > 0 && (
                            <span style={{ font: `700 11px/1 ${UI}`, padding: "3px 7px", borderRadius: 999, background: "var(--page-accent)", color: "var(--on-accent)" }}>{activeFilters}</span>
                          )}
                          <span aria-hidden style={{ fontSize: 12, color: "rgba(var(--on-page), calc(.6 * var(--ink-k)))" }}>▾</span>
                        </button>
                      )}
                    >
                      {() => (
                        <>
                          <p style={menuLabel}>Search in</p>
                          <div style={{ display: "flex", border: "1px solid var(--card-edge)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
                            {SCOPES.map((s2) => (
                              <button
                                key={s2.id}
                                className="rb-focus"
                                aria-pressed={scope === s2.id}
                                onClick={() => setScope(s2.id)}
                                style={{
                                  flex: "1 1 0", font: `500 12.5px/1 ${UI}`, padding: "10px 4px", cursor: "pointer", border: "none",
                                  background: scope === s2.id ? "var(--card-lift)" : "transparent",
                                  color: scope === s2.id ? "var(--card-accent)" : "var(--card-muted)",
                                }}
                              >
                                {s2.label}
                              </button>
                            ))}
                          </div>
                          {allTags.length > 0 && (
                            <>
                              <p style={menuLabel}>Tags</p>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 2px" }}>
                                {allTags.map((t) => {
                                  const on = tagFilter === t;
                                  return (
                                    <button
                                      key={t}
                                      className="rb-focus"
                                      aria-pressed={on}
                                      onClick={() => setTagFilter(on ? null : t)}
                                      style={{
                                        font: `500 12.5px/1 ${UI}`, padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                                        border: `1px solid ${on ? "var(--card-accent)" : "var(--card-edge)"}`,
                                        background: on ? "var(--card-accent)" : "transparent", color: on ? "var(--card-bg)" : "var(--card-text)",
                                      }}
                                    >
                                      {t}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                          {activeFilters > 0 && (
                            <button className="rb-focus" onClick={() => { setScope("all"); setTagFilter(null); }} style={{ ...linkButton, margin: "14px 4px 2px", fontSize: 13 }}>
                              Clear filters
                            </button>
                          )}
                        </>
                      )}
                    </Popover>
                  </div>

                  {/* the filters live in a dropdown, so show which are on */}
                  {activeFilters > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      {scope !== "all" && chip("scope", `Searching ${{ ingredient: "ingredients", author: "authors", equipment: "equipment" }[scope]}`, () => setScope("all"))}
                      {tagFilter && chip("tag", tagFilter, () => setTagFilter(null))}
                    </div>
                  )}

                  {scope === "ingredient" && (
                    <p style={{ font: `400 12.5px/1.5 ${UI}`, color: "rgba(var(--on-page), calc(.5 * var(--ink-k)))", margin: "12px 0 0" }}>
                      Separate ingredients with commas to find recipes that use all of them — “lime, tequila”.
                    </p>
                  )}
                </div>
              );
            })()}

            {visible.length === 0 ? (
              <div style={{ border: `1px dashed rgba(var(--on-page), calc(.28 * var(--ink-k)))`, borderRadius: 3, padding: "56px 30px", textAlign: "center" }}>
                <p style={{ font: `300 26px/1.35 ${DISPLAY}`, margin: "0 0 10px" }}>Nothing in the box yet.</p>
                <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "rgba(var(--on-page), calc(.62 * var(--ink-k)))", margin: "0 0 22px" }}>
                  {box.recipes.length === 0
                    ? "Add one by hand, or drag a folder of .md or .json files anywhere on this page."
                    : activeBox && activeBox !== UNFILED && !query && !tagFilter
                    ? `${activeBox} hasn't added a recipe yet. Anything you add from here gets filed to this box.`
                    : "No recipe matches that search."}
                </p>
                <button className="rb-btn rb-focus" style={btnPrimary} onClick={startAdd}>Add a recipe</button>
              </div>
            ) : (
              <div className="rb-grid">
                {visible.map((r) => (
                  <article
                    key={r.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => openCard(r.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(r.id); } }}
                    className="rb-tile rb-focus"
                  >
                    <div className="rb-shot">
                      {(r.imageUrl || r.thumb)
                        ? <img src={r.imageUrl || r.thumb} alt="" loading="lazy" />
                        : <span className="rb-noshot">no photo yet</span>}
                    </div>
                    <h3 style={{ font: `400 20px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: "12px 0 2px", letterSpacing: "-0.01em" }}>{r.title}</h3>
                    {r.contributor && (
                      <p style={{ font: `italic 400 13.5px/1.4 ${PROSE}`, color: "var(--page-accent)", margin: 0 }}>from {r.contributor}'s kitchen</p>
                    )}
                    <p style={{ font: `400 12.5px/1.5 ${UI}`, color: "rgba(var(--on-page), calc(.6 * var(--ink-k)))", margin: "7px 0 0", display: "flex", gap: 13, flexWrap: "wrap" }}>
                      <span>{r.steps.length} steps</span>
                      <span>{r.ingredients.length} ingredients</span>
                      {r.time && <span>{r.time}</span>}
                    </p>
                  </article>
                ))}
              </div>
            )}

            <div className="rb-noprint" style={{ marginTop: 50, paddingTop: 24, borderTop: `1px solid rgba(var(--on-page), calc(.16 * var(--ink-k)))` }}>
              <p style={{ font: `400 12.5px/1.65 ${UI}`, color: "rgba(var(--on-page), calc(.48 * var(--ink-k)))", margin: 0, maxWidth: 460 }}>
                Everyone shares one box. Whoever has the link can add, change, or remove anything in it.
              </p>
            </div>
          </>
        )}

        {/* ═══════ IMPORT REVIEW ═══════ */}
        {!loading && view === "import" && (
          <div style={{ ...sheet, maxWidth: 820 }}>
            <Grain card />
            <div className="rb-pad" style={{ position: "relative", padding: "32px 30px 34px" }}>
              <h2 style={{ font: `300 30px/1.2 ${DISPLAY}`, margin: "0 0 6px", color: "var(--card-text)" }}>Review before adding</h2>
              <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 24px", maxWidth: "58ch" }}>
                {staged.length} {staged.length === 1 ? "recipe" : "recipes"} read from your files. Uncheck anything you don't want, then add the rest.
              </p>

              {importErrors.length > 0 && (
                <div style={{ borderLeft: `3px solid var(--card-accent)`, background: "var(--card-lift)", padding: "12px 16px", marginBottom: 22 }}>
                  <p style={{ font: `600 13px/1.4 ${UI}`, color: "var(--card-accent)", margin: "0 0 6px" }}>Some files didn't come through</p>
                  {importErrors.map((e, i) => <p key={i} style={{ font: `400 13px/1.6 ${UI}`, color: "var(--card-muted)", margin: 0 }}>{e}</p>)}
                </div>
              )}

              {staged.map((r, i) => (
                <label key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderTop: i === 0 ? `1px solid var(--card-edge)` : "none", borderBottom: `1px solid var(--card-edge)`, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={r._keep !== false}
                    onChange={(e) => setStaged(staged.map((s, j) => (j === i ? { ...s, _keep: e.target.checked } : s)))}
                    style={{ marginTop: 5, width: 17, height: 17, accentColor: T.rust }}
                  />
                  <div>
                    <p style={{ font: `400 19px/1.3 ${DISPLAY}`, color: "var(--card-text)", margin: 0 }}>{r.title}</p>
                    <p style={{ font: `400 13px/1.6 ${UI}`, color: "var(--card-muted)", margin: "3px 0 0" }}>
                      {r.ingredients.length} ingredients · {r.steps.length} steps{r.contributor ? ` · ${r.contributor}` : ""}
                      {r.imageUrl ? " · has a photo" : ""} · from {r._source}
                    </p>
                  </div>
                </label>
              ))}

              <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
                <button
                  className="rb-btn rb-focus"
                  style={{ ...btnPrimary, opacity: staged.some((s) => s._keep !== false) ? 1 : 0.45 }}
                  disabled={!staged.some((s) => s._keep !== false)}
                  onClick={commitImport}
                >
                  Add to the box
                </button>
                <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => { setStaged([]); setImportErrors([]); setView("list"); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ DETAIL ═══════ */}
        {!loading && view === "shopping" && (() => {
          const needed = list.items.filter((i) => !i.checked);
          const got = list.items.filter((i) => i.checked);
          const onList = Object.entries(list.recipes);
          const backLabel = { detail: "Back to the recipe", form: "Back to editing", import: "Back to the import" }[shoppingFrom.current] || "Back to recipes";
          const row = (item) => {
            const { qty, name } = describeItem(item);
            const from = itemRecipes(item, list);
            return (
              <li key={item.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 0", borderBottom: `1px solid var(--card-edge)` }}>
                <input
                  type="checkbox"
                  className="rb-focus"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                  aria-label={`${item.checked ? "Put back" : "Tick off"} ${name}`}
                  style={{ marginTop: 4, width: 18, height: 18, accentColor: T.rust, flex: "none", cursor: "pointer" }}
                />
                <div style={{ flex: 1, minWidth: 0, opacity: item.checked ? 0.5 : 1 }}>
                  <span style={{ font: `400 15.5px/1.5 ${UI}`, color: "var(--card-text)", textDecoration: item.checked ? "line-through" : "none" }}>
                    {qty && <><span className="rb-num" style={{ color: "var(--card-accent)", marginRight: 4 }}>{qty}</span>{" "}</>}
                    {name}
                  </span>
                  {from.length > 0 && (
                    <span style={{ display: "block", font: `400 12px/1.5 ${UI}`, color: "var(--card-muted)" }}>for {from.join(", ")}</span>
                  )}
                </div>
                <button
                  className="rb-focus rb-noprint"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${name}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--card-muted)", font: `400 20px/1 ${UI}`, padding: "0 4px" }}
                >
                  ×
                </button>
              </li>
            );
          };
          return (
            <article className="rb-sheet" style={{ ...sheet, maxWidth: 820 }}>
              <Grain card />
              <div className="rb-pad" style={{ position: "relative", padding: "32px 30px 36px" }}>
                <button
                  className="rb-btn rb-focus rb-noprint"
                  onClick={leaveShopping}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16,
                    background: "transparent", border: "none", padding: "4px 0",
                    color: "var(--card-accent)", font: `600 13.5px/1 ${UI}`,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
                  {backLabel}
                </button>
                <h2 style={{ font: `300 30px/1.2 ${DISPLAY}`, margin: "0 0 6px", color: "var(--card-text)" }}><span aria-hidden style={{ fontSize: "0.85em", marginRight: 10 }}>🛒</span>Shopping list</h2>
                <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 22px", maxWidth: "58ch" }}>
                  {needed.length
                    ? `${needed.length} ${needed.length === 1 ? "thing" : "things"} to buy.`
                    : list.items.length
                    ? "Everything is in the basket."
                    : "Nothing on it yet. Open a recipe and add it, or type something below."}
                  {listSync === "synced"
                    ? " It follows you between your own devices, and nobody else can see it."
                    : listSync === "device"
                    ? " Saved on this device. It couldn't reach your account just now, so it will catch up later."
                    : ""}
                </p>

                <form
                  className="rb-noprint"
                  onSubmit={(e) => { e.preventDefault(); addTyped(); }}
                  style={{ display: "flex", gap: 10, margin: "0 0 22px" }}
                >
                  <input
                    className="rb-focus"
                    style={input}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add something — paper towels, 2 lb chicken thighs"
                    aria-label="Add something to the list"
                  />
                  <button type="submit" className="rb-btn rb-focus" style={btnQuiet} disabled={!newItem.trim()}>Add</button>
                </form>

                {onList.length > 0 && (
                  <div className="rb-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 18px" }}>
                    {onList.map(([id, r]) => (
                      <span
                        key={id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 4px 4px 12px", borderRadius: 999,
                          border: `1px solid var(--card-edge)`, background: "var(--card-lift)", font: `500 12.5px/1.3 ${UI}`, color: "var(--card-text)",
                        }}
                      >
                        {r.title}{r.servings ? ` · ${r.servings} ${r.servings === 1 ? "serving" : "servings"}` : ""}
                        <button
                          className="rb-focus"
                          onClick={() => removeRecipeFromList(id)}
                          aria-label={`Take ${r.title} off the list`}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--card-muted)", font: `400 16px/1 ${UI}`, padding: "0 6px" }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {needed.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: `1px solid var(--card-edge)` }}>{needed.map(row)}</ul>
                )}

                {got.length > 0 && (
                  <div className="rb-noprint">
                    <p style={{ font: `600 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--card-muted)", margin: "26px 0 6px" }}><span aria-hidden style={{ fontSize: 14, letterSpacing: 0, marginRight: 6 }}>🧺</span>In the basket</p>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: `1px solid var(--card-edge)` }}>{got.map(row)}</ul>
                  </div>
                )}

                {list.items.length > 0 && (
                  <div className="rb-noprint rb-actions" style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={clearChecked} disabled={!got.length}>Clear ticked items</button>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => window.print()}>Print</button>
                    {confirmClear ? (
                      <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ font: `500 13.5px/1.4 ${UI}`, color: "var(--card-danger)" }}>Empty your list?</span>
                        <button
                          className="rb-btn rb-focus"
                          style={{ ...btnQuiet, background: "var(--card-danger)", color: T.inkDeep, borderColor: "var(--card-danger)" }}
                          onClick={() => { clearAll(); setConfirmClear(false); }}
                        >
                          Empty it
                        </button>
                        <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => setConfirmClear(false)}>Keep it</button>
                      </span>
                    ) : (
                      <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => setConfirmClear(true)}>Empty the list</button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })()}

        {!loading && view === "detail" && openRecipe && (
          <article className="rb-sheet" style={sheet}>
            <Grain card />
            <div className="rb-pad" style={{ position: "relative", padding: "38px 34px 42px" }}>
              <button
                className="rb-btn rb-focus rb-noprint"
                onClick={goBack}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18,
                  background: "transparent", border: "none", padding: "4px 0",
                  color: "var(--card-accent)", font: `600 13.5px/1 ${UI}`,
                }}
              >
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
                {backLabel()}
              </button>
              <h2 style={{ font: `300 clamp(30px, 4.6vw, 42px)/1.08 ${DISPLAY}`, margin: "0 0 10px", letterSpacing: "-0.02em", color: "var(--card-text)" }}>
                {openRecipe.title}
              </h2>
              {openRecipe.contributor && (
                <p style={{ font: `italic 400 17px/1.4 ${PROSE}`, color: "var(--card-accent)", margin: "0 0 20px" }}>from {openRecipe.contributor}'s kitchen</p>
              )}
              {openRecipe.description && (
                <p className="rb-lede" style={{ font: `400 17px/1.72 ${PROSE}`, color: "var(--card-text)", maxWidth: "60ch", margin: "0 0 26px" }}>
                  {openRecipe.description}
                </p>
              )}

              <div className="rb-noprint rb-actbar">
                <button
                  className="rb-btn rb-focus"
                  style={btnPrimary}
                  onClick={() => { setStepIndex(firstOpenStep(openRecipe)); setShowPantry(false); setCooking(true); }}
                >
                  Start cooking
                </button>
                <Servings base={baseServings} factor={factor} setFactor={setFactor} />
                {listControls(openRecipe)}
              </div>

              {hero && (
                <div className={`rb-hero${heroShape ? ` rb-hero-${heroShape}` : ""}`}>
                  <img
                    src={hero}
                    alt={openRecipe.title}
                    onLoad={(e) => {
                      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                      setHeroShape(!w || !h ? "" : w / h >= 1.3 ? "" : w / h >= 0.85 ? "mid" : "tall");
                    }}
                  />
                </div>
              )}

              <dl className="rb-stats">
                {openRecipe.servings && (
                  <div><dt>Serves</dt><dd className="rb-num">{servesOnly(openRecipe.servings, factor)}</dd></div>
                )}
                {openRecipe.time && <div><dt>Time</dt><dd>{openRecipe.time}</dd></div>}
                <div><dt>Ingredients</dt><dd className="rb-num">{openRecipe.ingredients.length}</dd></div>
                <div><dt>Steps</dt><dd className="rb-num">{openRecipe.steps.length}</dd></div>
              </dl>

              <div className="rb-detail">
                <div>
                  <h3 style={{ font: `400 21px/1.2 ${DISPLAY}`, margin: "0 0 4px", color: "var(--card-text)" }}>Ingredients</h3>
                  <p className="rb-noprint" style={{ font: `400 12px/1.5 ${UI}`, color: "var(--card-muted)", margin: "0 0 10px" }}>
                    {marks.ing.length ? (
                      <>
                        {marks.ing.length} of {openRecipe.ingredients.length} in ·{" "}
                        <button type="button" className="rb-focus" style={linkButton} onClick={() => changeMarks(openRecipe.id, "ing", () => [])}>clear</button>
                      </>
                    ) : "Tap each one as it goes in."}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {openRecipe.ingredients.map((ing, i) => {
                      const [qty, rest] = splitQty(scaleLine(ing, factor));
                      const got = marks.ing.includes(i);
                      const strike = got ? "line-through" : "none";
                      return (
                        <li key={i} style={{ borderBottom: `1px solid var(--card-edge)` }}>
                          <button
                            type="button"
                            className={`rb-focus${got ? " rb-done" : ""}`}
                            aria-pressed={got}
                            onClick={() => toggleMark(openRecipe.id, "ing", i)}
                            style={{
                              display: "grid", gridTemplateColumns: qty ? "auto 1fr" : "1fr", gap: 12, alignItems: "baseline",
                              width: "100%", padding: "9px 0", background: "none", border: "none", textAlign: "left", cursor: "pointer",
                              opacity: got ? 0.45 : 1, transition: "opacity 150ms ease",
                            }}
                          >
                            {qty && <span className="rb-num" style={{ fontSize: 15, color: "var(--card-accent)", whiteSpace: "nowrap", textDecoration: strike }}>{qty}</span>}
                            <span style={{ font: `400 14.5px/1.5 ${UI}`, color: "var(--card-text)", textDecoration: strike }}>{rest}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {openRecipe.equipment?.length > 0 && (
                    <div style={{ marginTop: 30 }}>
                      <h3 style={{ font: `400 21px/1.2 ${DISPLAY}`, margin: "0 0 12px", color: "var(--card-text)" }}>You'll need</h3>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {openRecipe.equipment.map((tool, i) => (
                          <li
                            key={i}
                            style={{
                              font: `400 14.5px/1.5 ${UI}`, color: "var(--card-text)", padding: "8px 0 8px 16px",
                              borderBottom: `1px solid var(--card-edge)`, position: "relative",
                            }}
                          >
                            <span aria-hidden style={{ position: "absolute", left: 0, top: 15, width: 6, height: 6, background: T.sage, borderRadius: "50%" }} />
                            {tool}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {openRecipe.nutrition && (
                    <div className="rb-nutrition" style={{ marginTop: 30 }}>
                      <h3 style={{ font: `400 21px/1.2 ${DISPLAY}`, margin: "0 0 3px", color: "var(--card-text)" }}>Nutrition</h3>
                      <p style={{ font: `400 12px/1.5 ${UI}`, color: "var(--card-muted)", margin: "0 0 12px" }}>{servingsMade ? `Estimated, total for ${servingsMade} ${servingsMade === 1 ? "serving" : "servings"}.` : "Estimated, per serving."}</p>
                      <dl style={{ margin: 0, borderTop: `2px solid var(--card-text)` }}>
                        {NUTRIENTS.filter((n) => openRecipe.nutrition[n.key]).map((n) => (
                          <div
                            key={n.key}
                            style={{
                              display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
                              padding: "8px 0", borderBottom: `1px solid var(--card-edge)`,
                            }}
                          >
                            <dt style={{ font: `400 14.5px/1.4 ${UI}`, color: "var(--card-text)" }}>{n.label}</dt>
                            <dd className="rb-num" style={{ margin: 0, fontSize: 15, color: "var(--card-accent)", whiteSpace: "nowrap" }}>{scaleNutrient(openRecipe.nutrition[n.key], servingsMade || 1)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>

                <div>
                  <h3 style={{ font: `400 21px/1.2 ${DISPLAY}`, margin: "0 0 4px", color: "var(--card-text)" }}>Method</h3>
                  <p className="rb-noprint" style={{ font: `400 12px/1.5 ${UI}`, color: "var(--card-muted)", margin: "0 0 14px" }}>
                    {marks.steps.length ? (
                      <>
                        {marks.steps.length} of {openRecipe.steps.length} done ·{" "}
                        <button type="button" className="rb-focus" style={linkButton} onClick={() => changeMarks(openRecipe.id, "steps", () => [])}>clear</button>
                      </>
                    ) : "Tap a step when it's done."}
                  </p>
                  <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {openRecipe.steps.map((s, i) => {
                      const { title, text } = stepParts(s);
                      const secs = stepDuration(s);
                      const done = marks.steps.includes(i);
                      const current = i === currentStep;
                      return (
                        <li
                          key={i}
                          className={done ? "rb-done" : undefined}
                          /* the whole step is the target — a kitchen tap is not precise — but not
                             its timer button, and not while you are selecting text to copy */
                          onClick={(e) => {
                            if (e.target.closest("button") || window.getSelection()?.toString()) return;
                            toggleMark(openRecipe.id, "steps", i);
                          }}
                          style={{ display: "grid", gridTemplateColumns: "38px 1fr", gap: 10, marginBottom: 24, cursor: "pointer", opacity: done ? 0.45 : 1, transition: "opacity 150ms ease" }}
                        >
                          <button
                            type="button"
                            className="rb-focus rb-num"
                            aria-pressed={done}
                            aria-label={`Step ${i + 1} done`}
                            onClick={() => toggleMark(openRecipe.id, "steps", i)}
                            style={{
                              background: "none", border: "none", padding: "0 4px 0 0", cursor: "pointer", alignSelf: "start",
                              fontSize: 26, lineHeight: 1.15, textAlign: "right",
                              color: done || current ? "var(--card-accent)" : "var(--card-edge)",
                            }}
                          >
                            {done ? "✓" : i + 1}
                          </button>
                          <div style={{ maxWidth: "64ch" }}>
                            {title && <p style={{ font: `500 17px/1.3 ${DISPLAY}`, color: "var(--card-text)", margin: "0 0 5px" }}>{title}</p>}
                            <p style={{ font: `400 16.5px/1.75 ${PROSE}`, color: "var(--card-text)", margin: 0 }}>{scaleText(text, factor)}</p>
                            {secs && (
                              <button
                                className="rb-btn rb-focus rb-noprint"
                                style={{ ...btnQuiet, marginTop: 10, padding: "7px 14px", fontSize: 13 }}
                                disabled={hasTimer(timerKey(openRecipe.id, i))}
                                onClick={() => startTimer(`${openRecipe.title} — ${title || `step ${i + 1}`}`, secs, timerKey(openRecipe.id, i))}
                              >
                                {hasTimer(timerKey(openRecipe.id, i)) ? `${durLabel(secs)} timer running` : `Start a ${durLabel(secs)} timer`}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {openRecipe.notes && (
                    <div className="rb-notes" style={{ marginTop: 28, padding: "18px 20px", background: "var(--card-lift)", borderLeft: `3px solid var(--card-accent)` }}>
                      <h4 style={{ font: `400 18px/1.2 ${DISPLAY}`, margin: "0 0 7px", color: "var(--card-text)" }}>Notes</h4>
                      <p style={{ font: `400 15px/1.72 ${UI}`, color: "var(--card-muted)", margin: 0, whiteSpace: "pre-wrap" }}>{openRecipe.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rb-noprint rb-actions" style={{ display: "flex", gap: 10, marginTop: 38, flexWrap: "wrap" }}>
                <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => startEdit(openRecipe)}>Edit</button>
                <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => window.print()}>Print</button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: `500 13px/1 ${UI}`, color: "var(--card-muted)" }}>Move to</span>
                  <select
                    className="rb-focus"
                    value={openRecipe.contributor || UNFILED}
                    onChange={(e) => moveRecipe(openRecipe.id, e.target.value)}
                    style={{
                      font: `600 13.5px/1 ${UI}`, color: "var(--card-text)", background: "var(--card-lift)",
                      border: `1px solid var(--card-edge)`, borderRadius: 2, padding: "10px 12px", cursor: "pointer",
                    }}
                  >
                    {allAuthors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value={UNFILED}>No author</option>
                  </select>
                </label>
                {confirmRemove ? (
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ font: `500 13.5px/1.4 ${UI}`, color: "var(--card-danger)" }}>
                      Remove this for everyone? It can't be undone.
                    </span>
                    <button
                      className="rb-btn rb-focus"
                      style={{ ...btnQuiet, background: "var(--card-danger)", color: T.inkDeep, borderColor: "var(--card-danger)" }}
                      onClick={() => {
                        persist({ ...box, recipes: box.recipes.filter((r) => r.id !== openRecipe.id) });
                        window.storage?.delete(imageKey(openRecipe.id), true).catch(() => {});
                        setConfirmRemove(false);
                        setView("list");
                      }}
                    >
                      Yes, remove it
                    </button>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => setConfirmRemove(false)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    className="rb-btn rb-focus"
                    style={{ ...btnQuiet, color: "var(--card-danger)", borderColor: "var(--card-danger)" }}
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </article>
        )}

        {/* ═══════ FORM ═══════ */}
        {!loading && view === "form" && (
          <div style={{ ...sheet, maxWidth: 820 }}>
            <Grain card />
            <div className="rb-pad" style={{ position: "relative", padding: "34px 32px 38px" }}>
              <h2 style={{ font: `300 30px/1.2 ${DISPLAY}`, margin: "0 0 24px", color: "var(--card-text)" }}>{editingId ? "Edit recipe" : "Add a recipe"}</h2>

              {!editingId && (
                <div style={{ background: "var(--card-lift)", border: `1px solid var(--card-edge)`, padding: "18px 20px", marginBottom: 28 }}>
                  <p style={{ font: `600 14px/1.4 ${UI}`, color: "var(--card-text)", margin: "0 0 4px" }}>Import from a link</p>
                  <p style={{ font: `400 13px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 12px" }}>
                    Paste the address of a recipe page. Most recipe sites publish their recipes in a form this can read; a few refuse outright.
                  </p>
                  <form
                    noValidate
                    onSubmit={(e) => { e.preventDefault(); importFromLink(linkText); }}
                    style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                  >
                    <input
                      type="url"
                      inputMode="url"
                      className="rb-focus"
                      style={{ ...input, flex: "1 1 240px", width: "auto" }}
                      value={linkText}
                      onChange={(e) => setLinkText(e.target.value)}
                      placeholder="https://www.bbcgoodfood.com/recipes/…"
                      aria-label="Recipe page address"
                      disabled={linkBusy}
                    />
                    <button type="submit" className="rb-btn rb-focus" style={btnQuiet} disabled={linkBusy || !linkText.trim()}>
                      {linkBusy ? "Fetching…" : "Get recipe"}
                    </button>
                  </form>
                  <div style={{ borderTop: `1px solid var(--card-edge)`, margin: "18px 0 16px" }} />
                  <p style={{ font: `600 14px/1.4 ${UI}`, color: "var(--card-text)", margin: "0 0 4px" }}>Paste a recipe</p>
                  <p style={{ font: `400 13px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 12px" }}>Markdown or JSON both work — paste it below, or{" "}<button type="button" className="rb-focus" style={linkButton} onClick={() => fileRef.current?.click()}>choose a file</button>.</p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={5}
                    className="rb-focus"
                    style={{ ...input, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}
                    placeholder={"## Ingredients\n- 2 lb pork shoulder\n\n## Steps\n1. Brown the pork: Sear it 8 minutes a side."}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={applyPaste}>Fill the fields</button>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={downloadTemplate}>Download template</button>
                  </div>
                  <p style={{ font: `400 12px/1.6 ${UI}`, color: "var(--card-muted)", margin: "10px 0 0" }}>
                    The template is a prompt for Claude plus the exact schema this importer reads —
                    ingredients, timers, equipment and estimated nutrition. Fill it in, then paste the
                    result above or drop the file anywhere on the page.
                  </p>
                </div>
              )}

              <Field label="Recipe name">
                <input className="rb-focus" style={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>

              <Field label="Photo" group hint="Optional. Resized in your browser before it's saved — originals never leave your device at full size.">
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  {form.thumb ? (
                    <img
                      src={form.thumb}
                      alt=""
                      style={{
                        width: "auto", height: "auto", maxWidth: 118, maxHeight: 88,
                        borderRadius: 2, border: `1px solid var(--card-edge)`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 108, height: 78, borderRadius: 2, border: `1px dashed var(--card-edge)`,
                        display: "grid", placeItems: "center", font: `400 12px/1.3 ${UI}`, color: "var(--card-muted)",
                      }}
                    >
                      No photo
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => photoRef.current?.click()} disabled={photoBusy}>
                      {photoBusy ? "Working…" : form.thumb ? "Replace photo" : "Choose a photo"}
                    </button>
                    {form.thumb && (
                      <button className="rb-btn rb-focus" style={btnQuiet} onClick={dropPhoto}>Remove photo</button>
                    )}
                  </div>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                </div>
              </Field>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <Field label="Author" hint="Whose recipe is it? This decides which box it lands in.">
                    <input className="rb-focus" style={input} value={form.contributor} onChange={(e) => setForm({ ...form, contributor: e.target.value })} placeholder="Grandma Rosa" />
                  </Field>
                </div>
                <div style={{ flex: "1 1 140px" }}>
                  <Field label="Servings" hint="Include a number — it drives the scaler.">
                    <input className="rb-focus" style={input} value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} placeholder="Serves 6" />
                  </Field>
                </div>
                <div style={{ flex: "1 1 140px" }}>
                  <Field label="Time">
                    <input className="rb-focus" style={input} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="About 2 hours" />
                  </Field>
                </div>
              </div>

              <Field label="A line about it" hint="What it tastes like, when you make it, who it came from.">
                <textarea className="rb-focus" rows={2} style={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>

              <Field label="Ingredients" hint="One per line, quantity first — that's what gets scaled.">
                <textarea className="rb-focus" rows={8} style={input} value={form.ingredientText} onChange={(e) => setForm({ ...form, ingredientText: e.target.value })} />
              </Field>

              <Field label="Equipment and tools" hint="One per line — blender, 9x13 pan, kitchen scale, candy thermometer.">
                <textarea className="rb-focus" rows={4} style={input} value={form.equipmentText}
                  onChange={(e) => setForm({ ...form, equipmentText: e.target.value })} />
              </Field>

              <Field label="Steps" hint={'One per line. Write "Short title: the actual instruction" and the title shows in cooking mode. Any duration you mention becomes a timer — "blend 60 seconds" as readily as "bake 40 minutes".'}>
                <textarea className="rb-focus" rows={8} style={input} value={form.stepText} onChange={(e) => setForm({ ...form, stepText: e.target.value })} />
              </Field>

              <Field label="Notes" hint="Substitutions, warnings, the story behind it.">
                <textarea className="rb-focus" rows={3} style={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>

              <Field label="Tags" hint="Comma separated — dinner, holiday, abuela.">
                <input className="rb-focus" style={input} value={form.tagText} onChange={(e) => setForm({ ...form, tagText: e.target.value })} />
              </Field>

              <div style={{ marginBottom: 20 }}>
                <span style={{ display: "block", font: `600 13px/1.4 ${UI}`, color: "var(--card-text)", marginBottom: 2 }}>Nutrition</span>
                <span style={{ display: "block", font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", marginBottom: 7 }}>
                  Estimated, per serving. Filled in for you when an imported or pasted recipe carries it. Clear a box to drop that line.
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10 }}>
                  {NUTRIENTS.map((n) => (
                    <label key={n.key} style={{ display: "block" }}>
                      <span style={{ display: "block", font: `500 12px/1.4 ${UI}`, color: "var(--card-muted)", marginBottom: 4 }}>{n.label}</span>
                      <input
                        className="rb-focus"
                        style={input}
                        value={(form.nutrition && form.nutrition[n.key]) || ""}
                        onChange={(e) => setNutrient(n.key, e.target.value)}
                        placeholder={n.eg}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button className="rb-btn rb-focus" style={{ ...btnPrimary, opacity: form.title.trim() ? 1 : 0.45 }} onClick={saveRecipe} disabled={!form.title.trim()}>
                  {editingId ? "Save changes" : "Add to the box"}
                </button>
                <button
                  className="rb-btn rb-focus"
                  style={btnQuiet}
                  onClick={() => (editingId ? setView("detail") : goBack())}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ═══════ TIMER TRAY ═══════ */}
      {timers.length > 0 && (
        <div
          className="rb-noprint rb-tray"
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 70,
            background: "rgba(var(--deep-rgb), .96)", borderTop: `1px solid rgba(var(--on-page), calc(.2 * var(--ink-k)))`,
            padding: "12px 18px", gap: 12, overflowX: "auto",
          }}
        >
          {timers.map((t) => {
            const done = t.remaining === 0;
            return (
              <div
                key={t.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", flex: "0 0 auto",
                  border: `1px solid ${done ? "var(--page-accent)" : "rgba(var(--on-page), calc(.24 * var(--ink-k)))"}`, borderRadius: 2,
                  background: done ? "rgba(var(--accent-rgb), .16)" : "transparent",
                }}
              >
                <div style={{ paddingInline: 8, minWidth: 50 }}>
                  <span className="rb-num" style={{ fontSize: 22, color: done ? "var(--page-accent)" : "rgb(var(--on-page))", minWidth: 66 }}>{clock(t.remaining)}</span>
                </div>
                <span style={{ font: `400 12.5px/1.35 ${UI}`, color: "rgba(var(--on-page), calc(.7 * var(--ink-k)))", paddingInlineEnd: '8px', width: '100%', textJustify: 'right'  }}>
                  {done ? "Time's up — " : ""}{t.label}
                </span>
                {!done && (
                  <button className="rb-btn rb-focus" style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => toggleTimer(t.id)}>
                    {t.running ? "Pause" : "Resume"}
                  </button>
                )}
                <button className="rb-btn rb-focus" style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => dropTimer(t.id)}>
                  {done ? "Clear" : "Stop"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
