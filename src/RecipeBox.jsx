import React, { useState, useEffect, useRef, useCallback } from "react";
/* ?raw inlines the file at build time — the button hands out exactly the
   template that is committed alongside this component. */
import TEMPLATE_MD from "../claude-recipe-template.md?raw";

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

/* Colour themes for the page behind the recipe cards. Light and dark mode
   still decide the cards themselves; a theme sets the backdrop, the text and
   buttons on it, the accent, and what dark-mode cards are tinted with.

   Hackwith Teal reproduces the original colours exactly. Every other theme was
   checked for contrast against it: the faint captions (45% opacity) come out
   at least as readable as the teal's. `k` scales those opacities — dark ink at
   45% over cream loses far more contrast than cream at 45% over dark teal, so
   light themes lift their faint text rather than dropping below the rest. */
const PALETTES = [
  { id: "teal", name: "Hackwith Teal", soft: "#144043", bg: "#0B2F32", deep: "#061E21", ink: "#F7F2E6",
    accent: "#E7A427", onAccent: "#061E21", darkCard: "#123B3F", darkLift: "#17494D", darkMuted: "#A3B3A9", k: 1 },
  { id: "cast-iron", name: "Cast Iron", soft: "#33302D", bg: "#232120", deep: "#141312", ink: "#F2ECE0",
    accent: "#D9955A", onAccent: "#1A1817", darkCard: "#2F2C2A", darkLift: "#3A3633", k: 1 },
  { id: "sage", name: "Sage Garden", soft: "#304A38", bg: "#233629", deep: "#16241B", ink: "#F3EFE2",
    accent: "#E8C872", onAccent: "#1A281F", darkCard: "#2E4535", darkLift: "#37523F", k: 1.12 },
  { id: "terracotta", name: "Terracotta", soft: "#6E3121", bg: "#5A2417", deep: "#3C170E", ink: "#FBEFE4",
    accent: "#F2C45A", onAccent: "#34140D", darkCard: "#693023", darkLift: "#77392A", k: 1.12 },
  { id: "blue-willow", name: "Blue Willow", soft: "#27426B", bg: "#1C3152", deep: "#111F37", ink: "#F3F6FB",
    accent: "#9CC4F2", onAccent: "#12213A", darkCard: "#243C62", darkLift: "#2C4770", k: 1 },
  { id: "merlot", name: "Merlot", soft: "#5A2236", bg: "#47192A", deep: "#2C0E19", ink: "#F8ECE8",
    accent: "#E7AE72", onAccent: "#2B0E18", darkCard: "#552131", darkLift: "#62283A", k: 1 },
  { id: "butter", name: "Butter", soft: "#F8EDCB", bg: "#F3E4B5", deep: "#E6D194", ink: "#33261A",
    accent: "#A2371F", onAccent: "#FFF8EC", darkCard: "#3B2F22", darkLift: "#47392A", k: 1.45, grain: 0.04 },
  { id: "retro-mint", name: "Retro Mint", soft: "#D3EDE2", bg: "#BFE2D3", deep: "#A6D3C0", ink: "#172E29",
    accent: "#A1222C", onAccent: "#FFF6F1", darkCard: "#1F3B35", darkLift: "#274740", k: 1.45, grain: 0.04 },
  { id: "farmhouse", name: "Farmhouse", soft: "#F6F4EE", bg: "#EEEAE1", deep: "#DFD9CC", ink: "#262623",
    accent: "#4C6746", onAccent: "#FBFAF6", darkCard: "#2F312C", darkLift: "#393C36", k: 1.45, grain: 0.035 },
];
/* Backgrounds, picked separately from the colours and shown as they are —
   nothing tints the image. Readability comes from what sits on it instead:
   buttons, box tiles, search and tags get a near-solid fill of the colour
   theme's own background, and loose text gets a soft halo in the same colour
   (see .rb-textured in the stylesheet). The fill is .94: the least that keeps
   all 72 colour-and-texture pairings at the default teal's contrast over each
   image's brightest and darkest spots.

   Files live in public/themes and are served with the site, not from KV.
   Sources — tiles are CC0 from Poly Haven (kitchen_wood, dark_wood,
   waffle_pique_cotton, rough_linen, gingham_check), re-saved at JPEG 62;
   photos are from Unsplash under its licence: Slate by Lakshya Soni, Flour
   Dust by Patrick Fore (cropped to the dusted side), Floured Counter by
   Benjamin Jauregui. */
const TEXTURES = [
  { id: "butcher-block", name: "Butcher Block", src: "/themes/butcher-block.jpg", thumb: "/themes/thumbs/butcher-block.jpg", tile: 512 },
  { id: "mahogany", name: "Mahogany Board", src: "/themes/mahogany.jpg", thumb: "/themes/thumbs/mahogany.jpg", tile: 512 },
  { id: "slate", name: "Slate", src: "/themes/slate.webp", thumb: "/themes/thumbs/slate.jpg" },
  { id: "flour-dust", name: "Flour Dust", src: "/themes/flour-dust.webp", thumb: "/themes/thumbs/flour-dust.jpg" },
  { id: "tea-towel", name: "Tea Towel", src: "/themes/tea-towel.jpg", thumb: "/themes/thumbs/tea-towel.jpg", tile: 400 },
  { id: "blue-linen", name: "Blue Linen", src: "/themes/blue-linen.jpg", thumb: "/themes/thumbs/blue-linen.jpg", tile: 420 },
  { id: "gingham", name: "Gingham", src: "/themes/gingham.jpg", thumb: "/themes/thumbs/gingham.jpg", tile: 360 },
  { id: "floured-counter", name: "Floured Counter", src: "/themes/floured-counter.webp", thumb: "/themes/thumbs/floured-counter.jpg" },
];
const textureById = (id) => TEXTURES.find((t) => t.id === id) || null;
const localTexture = () => { try { return localStorage.getItem("rb-texture"); } catch { return null; } };

const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
/* what the picker shows for a colour theme */
const swatchFor = (p) =>
  `radial-gradient(circle at 70% 30%, ${p.accent} 0 27%, transparent 28%), linear-gradient(160deg, ${p.soft}, ${p.deep})`;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/* card text blended toward the card, for the muted grey on dark-mode cards */
const mixHex = (a, b, t) => `rgb(${hexRgb(a).map((v, i) => Math.round(v * t + hexRgb(b)[i] * (1 - t))).join(", ")})`;
const paletteVars = (p) => ({
  "--page-soft": p.soft, "--page-bg": p.bg, "--page-deep": p.deep, "--deep-rgb": hexRgb(p.deep).join(", "), "--bg-rgb": hexRgb(p.bg).join(", "),
  "--on-page": hexRgb(p.ink).join(", "), "--ink-k": String(p.k),
  "--page-accent": p.accent, "--accent-rgb": hexRgb(p.accent).join(", "), "--on-accent": p.onAccent,
  "--dark-card-bg": p.darkCard, "--dark-card-lift": p.darkLift, "--dark-card-muted": p.darkMuted || mixHex("#EFE8D6", p.darkCard, 0.64),
});
/* Mirrored in localStorage as well as the account, so the page can paint the
   right colours before the account has answered — see the script in index.html. */
const localPalette = () => { try { return localStorage.getItem("rb-palette"); } catch { return null; } };

const DISPLAY = "'Fraunces', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const UI = "'Karla', 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif";
const STORAGE_KEY = "recipe-box";

/* ══════════════════════════════════════════════════════════════════
   Photos
   Storage holds text, so a picture has to become a data URL. Two sizes:
   a thumbnail small enough to live inside the recipe record (the list view
   reads dozens at once), and a full copy under its own key, fetched only
   when a recipe is opened.
   ══════════════════════════════════════════════════════════════════ */
const FULL_MAX = 1400;
const THUMB_MAX = 300;
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

async function prepPhoto(file) {
  const bmp = await loadBitmap(file);
  const full = await shrink(bmp, FULL_MAX, 0.78);
  const thumb = await shrink(bmp, THUMB_MAX, 0.6);
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
const scaleServings = (s, factor) => {
  const n = servingsCount(s);
  if (!n) return s;
  return String(s).replace(/\d+/, String(Math.max(1, Math.round(n * factor))));
};

/* ══════════════════════════════════════════════════════════════════
   Shopping list
   One list for the household, under its own key: ticking off milk must not
   re-save every recipe and photo, and the list is written far more often than
   the box. Each item keeps the lines that fed it, recipe by recipe, so adding
   a recipe again replaces its share instead of doubling it, and taking one off
   removes exactly what it put on.
   ══════════════════════════════════════════════════════════════════ */
const LIST_KEY = "grocery-list";
const EMPTY_LIST = { items: [], recipes: {} };

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

async function loadList() {
  if (typeof window === "undefined" || !window.storage) return null;
  try {
    const res = await window.storage.get(LIST_KEY, true);
    const data = JSON.parse(res.value);
    return data && Array.isArray(data.items) ? { items: data.items, recipes: data.recipes || {} } : { ...EMPTY_LIST };
  } catch (err) {
    /* A missing key is an empty list. Anything else is a failed read, and must
       not be mistaken for one — that would wipe the list on screen. */
    return /not found/i.test(String(err && err.message)) ? { ...EMPTY_LIST } : null;
  }
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

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 20 }}>
      <span style={{ display: "block", font: `600 13px/1.4 ${UI}`, color: "var(--card-text)", marginBottom: 2 }}>{label}</span>
      {hint && <span style={{ display: "block", font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", marginBottom: 7 }}>{hint}</span>}
      {children}
    </label>
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
const sheet = { position: "relative", background: "var(--card-bg)", color: "var(--card-text)", borderRadius: 3, boxShadow: "0 26px 60px -30px rgba(0,0,0,.7)", overflow: "hidden" };
const ruleTop = { height: 7, background: `linear-gradient(90deg, ${T.marigold} 0 46%, ${T.rust} 46% 62%, ${T.sage} 62% 100%)` };

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
          <p style={{ font: `400 clamp(17px, 2.4vw, 21px)/1.68 ${DISPLAY}`, color: "rgba(var(--on-page), calc(.92 * var(--ink-k)))", margin: 0, maxWidth: "56ch" }}>
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
  const [box, setBox] = useState({ name: "The Hackwith Family Recipe Box", recipes: [] });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("list");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [activeBox, setActiveBox] = useState(null);   // null = every box
  const [scope, setScope] = useState("all");
  const [theme, setTheme] = useState("light");
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [hero, setHero] = useState("");        // full-size photo for the open recipe
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
  const [list, setList] = useState(EMPTY_LIST);
  const listRef = useRef(EMPTY_LIST);        // the latest list, for writes that fire later
  const listTimer = useRef(null);
  const listSaving = useRef(false);
  const listDirty = useRef(false);
  const shoppingFrom = useRef("list");
  const [newItem, setNewItem] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [crossed, setCrossed] = useState(loadCrossed);
  const [palette, setPalette] = useState(() => paletteById(localPalette()));
  const [texture, setTexture] = useState(() => textureById(localTexture()));
  const textureSave = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const paletteSave = useRef(null);
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
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  /* the theme is a personal setting: stored unshared, so one person's choice
     doesn't repaint the box for everyone else */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage?.get("theme", false);
        if (res?.value === "dark" || res?.value === "light") setTheme(res.value);
      } catch {}
      try {
        const res = await window.storage?.get("palette", false);
        if (PALETTES.some((p) => p.id === res?.value)) setPalette(paletteById(res.value));
      } catch {}
      try {
        /* "none" is stored on purpose, so choosing no background sticks too */
        const res = await window.storage?.get("texture", false);
        if (res?.value === "none") setTexture(null);
        else if (textureById(res?.value)) setTexture(textureById(res.value));
      } catch {}
    })();
  }, []);

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { window.storage?.set("theme", next, false); } catch {}
  };

  /* Personal, like light and dark. Clicking through the swatches to compare
     should cost one saved write, not one per click, so the save waits a beat. */
  const choosePalette = (id) => {
    const p = paletteById(id);
    setPalette(p);
    clearTimeout(paletteSave.current);
    paletteSave.current = setTimeout(() => { window.storage?.set("palette", p.id, false).catch(() => {}); }, 1200);
  };
  const chooseTexture = (id) => {
    const t = textureById(id);
    setTexture(t);
    try { localStorage.setItem("rb-texture", t ? t.id : ""); } catch { /* fine */ }
    clearTimeout(textureSave.current);
    textureSave.current = setTimeout(() => { window.storage?.set("texture", t ? t.id : "none", false).catch(() => {}); }, 1200);
  };

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
    root.style.setProperty("--boot-bg", palette.bg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
    try { localStorage.setItem("rb-palette", palette.id); localStorage.setItem("rb-palette-bg", palette.bg); } catch { /* fine */ }
  }, [palette]);

  /* the picker closes on a click elsewhere or Escape — and that Escape must not
     also carry on to the recipe page, where it means "go back" */
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e) => { if (!pickerRef.current?.contains(e.target)) setPickerOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setPickerOpen(false); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pickerOpen]);

  /* load */
  useEffect(() => {
    (async () => {
      const data = await loadBox();
      const loaded = data && Array.isArray(data.recipes) ? data : { name: "The Hackwith Family Recipe Box", recipes: [SEED] };
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

  /* Writes are debounced and never overlap: KV accepts about one write a second
     per key, and ticking things off in the store happens faster than that. */
  const writeList = async () => {
    if (listSaving.current) { listDirty.current = true; return; }
    listSaving.current = true;
    try { await window.storage?.set(LIST_KEY, JSON.stringify(listRef.current), true); }
    catch { flash("Couldn't save the shopping list — it will retry on your next change"); }
    finally {
      listSaving.current = false;
      if (listDirty.current) { listDirty.current = false; setTimeout(writeList, 1000); }
    }
  };
  const updateList = (change) => {
    const next = change(listRef.current);
    listRef.current = next;
    setList(next);
    clearTimeout(listTimer.current);
    listTimer.current = setTimeout(() => { listTimer.current = null; writeList(); }, 800);
  };

  useEffect(() => {
    loadList().then((l) => { if (l && !listTimer.current) { listRef.current = l; setList(l); } });
    /* a phone locked in the checkout queue must not lose the last tick */
    const flush = () => {
      if (document.visibilityState !== "hidden" || !listTimer.current) return;
      clearTimeout(listTimer.current);
      listTimer.current = null;
      writeList();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  /* Refetch on the way in so other people's additions show up — unless there
     are local changes still waiting to be written, which a refetch would undo. */
  const openShopping = async () => {
    if (view !== "shopping") shoppingFrom.current = view;
    setConfirmClear(false);
    setView("shopping");
    window.scrollTo(0, 0);
    if (listTimer.current || listSaving.current) return;
    const fresh = await loadList();
    if (!fresh || listTimer.current || listSaving.current) return;
    listRef.current = fresh;
    setList(fresh);
  };
  const leaveShopping = () => {
    const back = shoppingFrom.current;
    setView(back === "detail" && !openRecipe ? "list" : back);
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
    const prefill = activeBox && activeBox !== UNFILED ? { ...BLANK, contributor: activeBox } : BLANK;
    setForm(prefill);
    setPasteText("");
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
      --card-bg: ${T.paper};
      --card-lift: ${T.paperLift};
      --card-text: ${T.text};
      --card-muted: ${T.muted};
      --card-edge: ${T.edge};
      --card-accent: ${T.rust};
      --card-danger: ${T.rust};
      --grain-op: 0.035;
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
    /* On a texture, anything carrying text sits on its own near-solid fill, so
       the image itself never has to be dimmed. Loose text gets a strip behind
       each line rather than a glow — a glow cannot hold up against a bold
       gingham check. The negative margin keeps the text on its column. */
    .rb-textured .rb-onimg { background-color: rgba(var(--bg-rgb), .94) !important; }
    .rb-textured .rb-onimg-on { background: linear-gradient(rgba(var(--accent-rgb), .14), rgba(var(--accent-rgb), .14)), rgba(var(--bg-rgb), .94) !important; }
    .rb-textured .rb-strip {
      background: rgba(var(--bg-rgb), .94); border-radius: 2px;
      padding: .08em .3em; margin: 0 -.3em;
      -webkit-box-decoration-break: clone; box-decoration-break: clone;
    }
    .rb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 22px; }
    .rb-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .rb-detail { display: grid; grid-template-columns: 1fr; gap: 34px; }
    @media (min-width: 760px) { .rb-detail { grid-template-columns: 292px 1fr; gap: 52px; } }
    .rb-card { transition: transform 160ms cubic-bezier(.2,.7,.3,1), box-shadow 160ms ease; }
    .rb-card:active { cursor: grabbing; }
    .rb-shelf button { transition: transform 120ms ease, border-color 120ms ease, background 120ms ease; }
    @media (prefers-reduced-motion: reduce) { .rb-shelf button { transition: none; } }
    .rb-card:hover, .rb-card:focus-visible { transform: translateY(-3px); box-shadow: 0 14px 30px -14px rgba(0,0,0,.55); }
    @media (prefers-reduced-motion: reduce) { .rb-card { transition: none; } .rb-card:hover { transform: none; } }
    .rb-btn { cursor: pointer; border-radius: 2px; font-family: ${UI}; font-weight: 600; font-size: 14px; letter-spacing: .01em; transition: filter 120ms ease; }
    .rb-btn:hover { filter: brightness(1.07); }
    .rb-btn:disabled { cursor: not-allowed; filter: none; opacity: .5; }
    .rb-lede::first-letter { float: left; font-family: ${DISPLAY}; font-weight: 500; font-size: 3.4em; line-height: .82; padding: .04em .09em 0 0; color: var(--card-accent); }
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
      .rb-scope { width: 100%; }
      .rb-scope button { flex: 1 1 0; padding: 11px 4px !important; }
      /* 16px keeps iOS from zooming the viewport on focus */
      .rb input, .rb textarea { font-size: 16px !important; }
      .rb-actions button { flex: 1 1 auto; }
      .rb-corner { top: 8px !important; right: 16px !important; }
      .rb-shelf { gap: 8px; }
      .rb-shelf button { flex: 1 1 132px; min-width: 0 !important; padding: 10px 12px !important; }
      /* Two boxes fit per row at this width. Giving "All recipes" the whole
         row keeps it first and leaves an even number of author boxes below,
         so none is left alone on the last row stretched to full width. */
      .rb-shelf button.rb-shelf-all { flex: 1 1 100%; }
      .rb-shelf .rb-new-box { flex: 0 0 auto; }
      .rb-tray { padding: 10px 12px !important; }
    }
    @media (max-width: 400px) {
      .rb-scope button { font-size: 11.5px !important; letter-spacing: 0 !important; }
    }
  `;

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      className={texture ? "rb rb-textured" : "rb"}
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
        ...paletteVars(palette),
        position: "relative", isolation: "isolate", minHeight: "100vh", color: "rgb(var(--on-page))",
        background: `radial-gradient(120% 90% at 50% 0%, var(--page-soft) 0%, var(--page-bg) 45%, var(--page-deep) 100%)`,
        paddingBottom: timers.length ? 130 : 80,
      }}
    >
      <style>{css}</style>
      {texture && (
        <div
          aria-hidden
          className="rb-backdrop"
          style={{
            position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none",
            backgroundImage: `url("${texture.src}")`,
            backgroundRepeat: texture.tile ? "repeat" : "no-repeat",
            backgroundSize: texture.tile ? `${texture.tile}px` : "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {/* a real texture makes the speckle redundant */}
      {!texture && <Grain opacity={palette.grain ?? 0.06} />}

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
        <div ref={pickerRef} className="rb-corner" style={{ position: "absolute", top: 14, right: 26, zIndex: 5, display: "flex", gap: 8 }}>
          <button
            className="rb-btn rb-focus rb-onimg"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            title="Change the colour theme"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "transparent", border: "1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))",
              color: "rgba(var(--on-page), calc(.7 * var(--ink-k)))", padding: "7px 13px", fontSize: 12.5, fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12, height: 12, borderRadius: "50%", flex: "none",
                background: texture ? `url("${texture.thumb}") center / cover` : `linear-gradient(135deg, ${palette.soft} 0 50%, ${palette.accent} 50% 100%)`,
                boxShadow: "0 0 0 1px rgba(var(--on-page), calc(.45 * var(--ink-k)))",
              }}
            />
            Theme
          </button>
          <button
            className="rb-btn rb-focus rb-onimg"
            onClick={flipTheme}
            aria-pressed={theme === "dark"}
            title="Switch between light and dark mode"
            style={{
              background: "transparent", border: "1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))",
              color: "rgba(var(--on-page), calc(.7 * var(--ink-k)))", padding: "7px 13px", fontSize: 12.5, fontWeight: 500,
            }}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          {pickerOpen && (
            <div
              role="dialog"
              aria-label="Colour theme"
              style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, width: 312, maxWidth: "calc(100vw - 32px)",
                background: "var(--card-bg)", color: "var(--card-text)", border: "1px solid var(--card-edge)",
                borderRadius: 3, padding: "14px 14px 12px", boxShadow: "0 22px 44px -18px rgba(0,0,0,.6)",
                maxHeight: "min(72vh, 620px)", overflowY: "auto",
              }}
            >
              <p style={{ font: `600 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--card-muted)", margin: "2px 2px 4px" }}>Theme</p>
              <p style={{ font: `400 12.5px/1.45 ${UI}`, color: "var(--card-muted)", margin: "0 2px 12px" }}>Just for you — everyone picks their own.</p>
              <p style={{ font: `600 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--card-muted)", margin: "0 2px 8px" }}>Colours</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PALETTES.map((p) => swatchButton(p.id, p.id === palette.id, () => choosePalette(p.id), swatchFor(p), p.name))}
              </div>
              <p style={{ font: `600 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--card-muted)", margin: "16px 2px 4px" }}>Background</p>
              <p style={{ font: `400 12.5px/1.45 ${UI}`, color: "var(--card-muted)", margin: "0 2px 8px" }}>Shown behind your colours, as it is.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {swatchButton("none", !texture, () => chooseTexture(null), swatchFor(palette), "Plain")}
                {TEXTURES.map((t) => swatchButton(t.id, texture?.id === t.id, () => chooseTexture(t.id), `url("${t.thumb}") center / cover`, t.name))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ minWidth: 260 }}>
            <h1 style={{ font: `300 clamp(34px, 6vw, 52px)/1.02 ${DISPLAY}`, margin: 0, letterSpacing: "-0.015em", color: "rgb(var(--on-page))" }}>
              <span className="rb-strip">{activeBox ? `${activeBox}'s Recipes` : box.name}</span>
            </h1>
            <p style={{ font: `400 14.5px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.58 * var(--ink-k)))", margin: "12px 0 0", maxWidth: "46ch" }}>
              <span className="rb-strip">{activeBox
                ? `${boxCount(activeBox)} ${boxCount(activeBox) === 1 ? "recipe" : "recipes"} from ${activeBox}.`
                : `${box.recipes.length} ${box.recipes.length === 1 ? "recipe" : "recipes"} kept here, for whoever asks next.`}</span>
            </p>
            {activeBox && activeBox !== UNFILED && boxCount(activeBox) === 0 && (
              <button
                className="rb-btn rb-focus rb-onimg"
                onClick={() => removeBox(activeBox)}
                style={{ ...btnGhost, marginTop: 14, padding: "6px 12px", fontSize: 12.5 }}
              >
                Remove this box
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="rb-btn rb-focus rb-onimg" style={btnGhost} onClick={openShopping}>
              <span aria-hidden style={{ marginRight: 7 }}>🛒</span>Shopping list{toBuy ? ` (${toBuy})` : ""}
            </button>
            <button className="rb-btn rb-focus rb-onimg" style={btnGhost} onClick={() => fileRef.current?.click()}>Import files</button>
            <button className="rb-btn rb-focus rb-onimg" style={btnGhost} onClick={exportAll} disabled={exporting}>
              {exporting ? "Exporting…" : "Export all"}
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
        {status && <p className="rb-noprint" style={{ font: `500 13px/1.4 ${UI}`, color: "var(--page-accent)", margin: "0 0 18px" }}><span className="rb-strip">{status}</span></p>}
        {loading && <p style={{ font: `400 15px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.7 * var(--ink-k)))" }}><span className="rb-strip">Opening the box…</span></p>}

        {/* ═══════ LIST ═══════ */}
        {!loading && view === "list" && (
          <>
            <div className="rb-shelf" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 26 }}>
              {[
                { key: null, name: "All recipes", count: box.recipes.length },
                ...allAuthors.map((c) => ({ key: c, name: `${c}'s recipes`, count: boxCount(c) })),
                ...(unfiled ? [{ key: UNFILED, name: "No author", count: unfiled }] : []),
              ].map((b) => {
                const on = activeBox === b.key;              
                return (
                  <button
                    key={b.key ?? "all"}
                    className={`rb-focus${b.key === null ? " rb-shelf-all" : ""}${on ? " rb-onimg-on" : " rb-onimg"}`}
                    onClick={() => { setActiveBox(b.key); setQuery(""); setTagFilter(null); }}
                    style={{
                      display: "flex", flexDirection: "column", gap: 4, textAlign: "left", cursor: "pointer",
                      padding: "11px 16px", borderRadius: 2, minWidth: 120,
                      border:  `1px solid ${on ? "var(--page-accent)" : "rgba(var(--on-page), calc(.22 * var(--ink-k)))"}`,
                      background: on ? "rgba(var(--accent-rgb), .14)" : "transparent",
                      transform: "none",
                    }}
                  >
                    <span style={{ font: `400 17px/1.2 ${DISPLAY}`, color: on ? "var(--page-accent)" : "rgb(var(--on-page))" }}>{b.name}</span>
                    <span style={{ font: `500 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(var(--on-page), calc(.45 * var(--ink-k)))" }}>
                      {b.count} {b.count === 1 ? "recipe" : "recipes"}
                    </span>
                  </button>
                );
              })}

              {addingBox ? (
                <input
                  autoFocus
                  className="rb-new-box rb-onimg"
                  value={newBoxName}
                  onChange={(e) => setNewBoxName(e.target.value)}
                  onBlur={addBox}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                    if (e.key === "Escape") { cancelBoxRef.current = true; e.target.blur(); }
                  }}
                  placeholder="Name"
                  aria-label="Name of the person to add"
                  style={{
                    padding: "11px 16px", borderRadius: 2, width: 150, maxWidth: "100%",
                    border: "1px solid var(--page-accent)", background: "transparent",
                    color: "rgb(var(--on-page))", font: `400 17px/1.2 ${DISPLAY}`, outline: "none",
                  }}
                />
              ) : (
                <button
                  className="rb-focus rb-new-box rb-onimg"
                  onClick={() => setAddingBox(true)}
                  title="Add someone new"
                  aria-label="Add someone new"
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
                    textAlign: "left", cursor: "pointer", padding: "11px 16px", borderRadius: 2, minWidth: 120,
                    border: "1px dashed rgba(var(--on-page), calc(.3 * var(--ink-k)))", background: "transparent", transform: "none",
                  }}
                >
                  <span style={{ font: `400 17px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))" }}>+</span>
                  <span style={{ font: `500 11px/1 ${UI}`, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(var(--on-page), calc(.45 * var(--ink-k)))" }}>
                    Add someone
                  </span>
                </button>
              )}
            </div>


            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={SCOPES.find((s2) => s2.id === scope).placeholder}
                className="rb-focus rb-onimg"
                style={{
                  flex: "1 1 250px", font: `400 15px/1.5 ${UI}`, padding: "12px 15px", borderRadius: 2,
                  border: `1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))`, background: "rgba(var(--on-page), calc(.06 * var(--ink-k)))", color: "rgb(var(--on-page))",
                }}
              />
              <div className="rb-scope rb-onimg" style={{ display: "flex", border: `1px solid rgba(var(--on-page), calc(.22 * var(--ink-k)))`, borderRadius: 2, overflow: "hidden" }}>
                {SCOPES.map((s2) => (
                  <button
                    key={s2.id}
                    className="rb-focus"
                    onClick={() => setScope(s2.id)}
                    style={{
                      font: `500 12.5px/1 ${UI}`, padding: "11px 14px", cursor: "pointer", border: "none",
                      background: scope === s2.id ? "rgba(var(--on-page), calc(.14 * var(--ink-k)))" : "transparent",
                      color: scope === s2.id ? "var(--page-accent)" : "rgba(var(--on-page), calc(.66 * var(--ink-k)))",
                    }}
                  >
                    {s2.label}
                  </button>
                ))}
              </div>
            </div>

            {scope === "ingredient" && (
              <p style={{ font: `400 12.5px/1.5 ${UI}`, color: "rgba(var(--on-page), calc(.5 * var(--ink-k)))", margin: "0 0 16px" }}>
                <span className="rb-strip">Separate ingredients with commas to find recipes that use all of them — “lime, tequila”.</span>
              </p>
            )}

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 30 }}>
              {allTags.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {allTags.map((t) => {
                    const on = tagFilter === t;
                    return (
                      <button
                        key={t}
                        className={on ? "rb-focus" : "rb-focus rb-onimg"}
                        onClick={() => setTagFilter(on ? null : t)}
                        style={{
                          font: `500 12.5px/1 ${UI}`, padding: "8px 13px", borderRadius: 999, cursor: "pointer",
                          border: `1px solid ${on ? "var(--page-accent)" : "rgba(var(--on-page), calc(.26 * var(--ink-k)))"}`,
                          background: on ? "var(--page-accent)" : "transparent", color: on ? "var(--on-accent)" : "rgba(var(--on-page), calc(.8 * var(--ink-k)))",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="rb-onimg" style={{ border: `1px dashed rgba(var(--on-page), calc(.28 * var(--ink-k)))`, borderRadius: 3, padding: "56px 30px", textAlign: "center" }}>
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
                    className="rb-card rb-focus"
                    style={{
                      ...sheet, display: "flex", flexDirection: "column",
                      cursor: "pointer",
                    }}
                  >
                    <div style={ruleTop} />
                    {(r.thumb || r.imageUrl) && (
                      <div
                        style={{
                          display: "flex", justifyContent: "center", alignItems: "center",
                          height: 168, borderBottom: `1px solid var(--card-edge)`,
                        }}
                      >
                        <img
                          src={r.thumb || r.imageUrl}
                          alt=""
                          loading="lazy"
                          style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%" }}
                        />
                      </div>
                    )}
                    <Grain card />
                    <div style={{ position: "relative", padding: "22px 24px 20px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                      <h3 style={{ font: `400 24px/1.18 ${DISPLAY}`, color: "var(--card-text)", margin: 0, letterSpacing: "-0.01em" }}>{r.title}</h3>
                      {r.contributor && <p style={{ font: `italic 400 14.5px/1.4 ${DISPLAY}`, color: "var(--card-accent)", margin: 0 }}>from {r.contributor}'s kitchen</p>}
                      {r.description && <p className="rb-clamp" style={{ font: `400 14px/1.65 ${UI}`, color: "var(--card-muted)", margin: 0 }}>{r.description}</p>}
                      <div style={{ marginTop: "auto", paddingTop: 14, borderTop: `1px solid var(--card-edge)`, font: `400 12.5px/1.4 ${UI}`, color: "var(--card-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>{r.ingredients.length} ingredients</span>
                        <span>{r.steps.length} steps</span>
                        {r.time && <span>{r.time}</span>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="rb-noprint" style={{ marginTop: 50, paddingTop: 24, borderTop: `1px solid rgba(var(--on-page), calc(.16 * var(--ink-k)))` }}>
              <p style={{ font: `400 12.5px/1.65 ${UI}`, color: "rgba(var(--on-page), calc(.48 * var(--ink-k)))", margin: 0, maxWidth: 460 }}>
                <span className="rb-strip">Everyone shares one box. Whoever has the link can add, change, or remove anything in it.</span>
              </p>
            </div>
          </>
        )}

        {/* ═══════ IMPORT REVIEW ═══════ */}
        {!loading && view === "import" && (
          <div style={{ ...sheet, maxWidth: 820 }}>
            <div style={ruleTop} />
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
              <div style={ruleTop} className="rb-noprint" />
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
                  {" "}One list for the whole family — anyone can add to it or tick things off.
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
                        <span style={{ font: `500 13.5px/1.4 ${UI}`, color: "var(--card-danger)" }}>Empty it for everyone?</span>
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
            <div style={ruleTop} className="rb-noprint" />
            {hero && (
              <div
                style={{
                  display: "flex", justifyContent: "center",
                  borderBottom: `1px solid var(--card-edge)`,
                }}
              >
                <img
                  src={hero}
                  alt={openRecipe.title}
                  style={{
                    display: "block", width: "auto", height: "auto",
                    maxWidth: "100%", maxHeight: 460,
                  }}
                />
              </div>
            )}
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
                <p style={{ font: `italic 400 17px/1.4 ${DISPLAY}`, color: "var(--card-accent)", margin: "0 0 20px" }}>from {openRecipe.contributor}'s kitchen</p>
              )}
              {openRecipe.description && (
                <p className="rb-lede" style={{ font: `400 17px/1.72 ${DISPLAY}`, color: "var(--card-text)", maxWidth: "60ch", margin: "0 0 26px" }}>
                  {openRecipe.description}
                </p>
              )}

              <div className="rb-noprint" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 30 }}>
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

              <div className="rb-detail">
                <div>
                  {(openRecipe.servings || openRecipe.time) && (
                    <div style={{ font: `400 13px/1.8 ${UI}`, color: "var(--card-muted)", paddingBottom: 15, marginBottom: 18, borderBottom: `2px solid var(--card-text)` }}>
                      {openRecipe.servings && <div>{scaleServings(openRecipe.servings, factor)}</div>}
                      {openRecipe.time && <div>{openRecipe.time}</div>}
                    </div>
                  )}
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
                            <p style={{ font: `400 16.5px/1.75 ${DISPLAY}`, color: "var(--card-text)", margin: 0 }}>{scaleText(text, factor)}</p>
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
            <div style={ruleTop} />
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
                  <p style={{ font: `400 13px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 12px" }}>Markdown or JSON both work. Or drag a file anywhere on the page instead.</p>
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

              <Field label="Photo" hint="Optional. Resized in your browser before it's saved — originals never leave your device at full size.">
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

              <Field label="Steps" hint={'One per line. Write "Short title: the actual instruction" and the title shows in cooking mode. Any duration you mention becomes a timer.'}>
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
