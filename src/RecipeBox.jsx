import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
/* ?raw inlines the file at build time — the button hands out exactly the
   template that is committed alongside this component. */
import TEMPLATE_MD from "../claude-recipe-template.md?raw";
import CHANGELOG_MD from "../CHANGELOG.md?raw";
/* Quantities live in units.js — one place that knows what "1½" means, rather
   than one here and one there that can drift apart. */
import {
  NUM, UNITS, VESSELS, toNumber, prettyNumber,
  SYSTEMS, isSystem, convertText, convertIngredient, scaleLine,
} from "./units.js";
import {
  dailyTargets, bmi, ACTIVITY, GOALS,
  lbToKg, kgToLb, feetInchesToCm, cmToFeetInches,
} from "./body.js";
/* The way back out of the meal plan, shopping list and tracker, which can each
   be opened from the others. */
import { trailTo, backFrom } from "./trail.js";
/* Photos on steps, kept under keys of their own rather than inside the box. */
import {
  STEP_PHOTO_MAX, STEP_PHOTO_WIDTH, STEP_PHOTO_QUALITY,
  stepImageKey, stepImageUrl, newStepPhotoId, stepLines, stepPhotoIds, carryStepPhotos,
} from "./stepphotos.js";
/* Note times in the reader's own zone and clock style. */
import { whenAt, whenFull } from "./when.js";
/* The one thing the box will not keep — see shared/hate.js. */
import { hasHate, newHate, HATE_MESSAGE } from "../shared/hate.js";
import { asFavorites, emptyFavorites, isFavorite, setFavorite, mergeFavorites } from "./favorites.js";
import { QUICK_EMOJI, DEFAULT_QUICK_EMOJI, asQuickEmoji, emojiOnly } from "./emoji.js";
import { gifUrl, isGifMessage } from "../shared/gif.js";

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
  { id: "lavender", name: "Lavender", darkCard: "#332A4A", darkLift: "#3E3358", darkMuted: "#B3A9C4",
    dark: { soft: "#362C52", bg: "#2A2240", deep: "#191327", ink: "#F3EFFA", accent: "#C9ADF2", onAccent: "#1D1531", k: 1.05 },
    light: { soft: "#FFFFFF", bg: "#FBFAFE", deep: "#E9E4F4", ink: "#221C2E", accent: "#5B3E9B", onAccent: "#FBF8FF", k: 1.45, grain: 0.04 } },
  { id: "midnight-purple", name: "Midnight Purple", darkCard: "#271C3F", darkLift: "#31254D", darkMuted: "#A79CBD",
    dark: { soft: "#291E42", bg: "#1E1630", deep: "#120C1E", ink: "#EFEAF7", accent: "#A98BE8", onAccent: "#150E24", k: 1.05 },
    light: { soft: "#FFFFFF", bg: "#FAF9FD", deep: "#E6E2F0", ink: "#1B1528", accent: "#4A2E86", onAccent: "#F9F6FF", k: 1.45, grain: 0.04 } },
  { id: "light-pink", name: "Light Pink", darkCard: "#452C39", darkLift: "#523546", darkMuted: "#C7AEB8",
    dark: { soft: "#482D3C", bg: "#3A2430", deep: "#24151E", ink: "#FBEEF4", accent: "#F2A9C4", onAccent: "#2A1720", k: 1.08 },
    light: { soft: "#FFFFFF", bg: "#FDF9FB", deep: "#F2E3EB", ink: "#2B1B23", accent: "#A03C68", onAccent: "#FFF7FA", k: 1.45, grain: 0.04 } },
  { id: "hot-pink", name: "Hot Pink", darkCard: "#4A1439", darkLift: "#5A1B46", darkMuted: "#CFA5BC",
    dark: { soft: "#4D163D", bg: "#3D1030", deep: "#260A1E", ink: "#FDEBF5", accent: "#FF6FAE", onAccent: "#2C0821", k: 1.08 },
    light: { soft: "#FFFFFF", bg: "#FEF8FB", deep: "#F7DFEC", ink: "#2E1022", accent: "#C2185B", onAccent: "#FFF6FA", k: 1.45, grain: 0.04 } },
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
const SOCIAL = "'Nunito Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";
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

/* A made-it picture is cut smaller than a recipe's, and deliberately so. This
   thumbnail travels inside every listing — a dozen of them arrive together in
   the feed — where a recipe's preview is fetched one at a time. 360px still
   covers the gallery tile on a 2x screen. */
const SHOT_MAX_DIM = 360;
const SHOT_Q = 0.62;

async function prepShot(file) {
  const bmp = await loadBitmap(file);
  const full = await shrink(bmp, FULL_MAX, 0.78);
  const shot = await shrink(bmp, SHOT_MAX_DIM, SHOT_Q);
  bmp.close?.();
  return { full, shot };
}

async function prepPhoto(file) {
  const bmp = await loadBitmap(file);
  const full = await shrink(bmp, FULL_MAX, 0.78);
  const thumb = await shrink(bmp, THUMB_MAX, THUMB_Q);
  bmp.close?.();
  return { full, thumb };
}

/* A step photo is one size: it is only ever shown on a recipe that has been
   opened, never in a listing, so there is no small copy to keep. */
async function prepStepPhoto(file) {
  const bmp = await loadBitmap(file);
  const data = await shrink(bmp, STEP_PHOTO_WIDTH, STEP_PHOTO_QUALITY);
  bmp.close?.();
  return data;
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
/* scaleLine lives in units.js, beside the unit tables that decide which
   brackets restate an amount and so scale with it. */

/* split leading quantity from the ingredient name, for the ruled column */
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

/* Scale first, then convert. Scaling reads the recipe as its author wrote it —
   which is what the vessel and bracket rules were tuned against — and the
   conversion translates whatever that produced. The other order would have the
   scaler reading text it had never seen the shape of. */
const showLine = (line, factor, units) => convertIngredient(scaleLine(line, factor), units);
const showText = (text, factor, units) => convertText(scaleText(text, factor), units);

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
   The daily nutrition tracker
   Called "the day" throughout the code, which is what it holds: one date's
   meals and the figures they add up to.
   What was eaten, and roughly what a day needs. It follows a person between
   their own devices, under a key the server namespaces to the verified email —
   so the family cannot read it, the same way they cannot read each other's
   shopping lists. It is not device-only: there is a copy on the server, which is
   the price of logging breakfast on a phone and lunch on a laptop.

   The device is still written first and instantly. The account is a sync channel
   over the top, debounced, and folded in on read rather than overwritten.
   ══════════════════════════════════════════════════════════════════ */
const DAY_KEY = "rb-day-log";
const BODY_KEY = "rb-body";
const DAY_HISTORY = 45;                      // days kept before the oldest are dropped

const MEALS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" },
];

/* Local, not UTC: a day ends when the person says it does, not at midnight in
   Greenwich. new Date().toISOString() would roll over an evening early for
   anybody west of it. */
const dayId = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* How far back you can look. The store keeps more than this — see DAY_HISTORY —
   so that a day sitting at the edge of the range is whole rather than being
   pruned out from under somebody who is reading it. */
const HISTORY_DAYS = 31;

/* Arithmetic through a Date rather than on the string. Adding a day is not
   "add one to the last number": months end, February moves, and the two clock
   changes a year would each drop or duplicate a day if this counted in
   milliseconds. Setting the date and reading it back lets the calendar answer. */
const shiftDay = (id, delta) => {
  const [y, m, d] = String(id).split("-").map(Number);
  if (!y || !m || !d) return id;
  const at = new Date(y, m - 1, d);
  at.setDate(at.getDate() + delta);
  return dayId(at);
};

/* The oldest day the picker will offer, given what today is. */
const earliestDay = (today) => shiftDay(today, -(HISTORY_DAYS - 1));

/* Yesterday deserves its name. Beyond that a weekday and a date is what people
   actually use to place a day — "Tuesday, 9 September" rather than 2026-09-09,
   which is a key and reads like one. */
const dayLabel = (id, today) => {
  if (id === today) return "Today";
  if (id === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = String(id).split("-").map(Number);
  if (!y || !m || !d) return id;
  const at = new Date(y, m - 1, d);
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }),
  });
};

const emptyDay = () => ({ breakfast: [], lunch: [], dinner: [], snacks: [] });

/* Whether a day has anything on it at all, for telling an untouched day apart
   from one somebody genuinely ate nothing worth logging on. */
const dayIsEmpty = (day) => !day || MEALS.every((m) => !(day[m.id] || []).length);

/* Named for the store rather than for localStorage: the shopping list already
   has its own writeLocal inside the component, and a two-argument helper of the
   same name is shadowed by it — which quietly wrote the string "rb-body" over
   somebody's shopping list before this was caught. */
const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

/* What is stored: the days themselves, and the ids of entries somebody has
   taken off. The tombstones exist for the same reason the shopping list has
   them — without them, a removal on a phone is undone the moment a laptop that
   still remembers the entry syncs. */
const emptyLog = () => ({ days: {}, removed: {} });

/* A log written before any of this was the bare days object. */
const asLog = (raw) => {
  if (!raw || typeof raw !== "object") return emptyLog();
  if (raw.days && typeof raw.days === "object") return { days: raw.days, removed: raw.removed || {} };
  return { days: raw, removed: {} };
};

/* Only the last few weeks are kept. A log nobody prunes is a blob that grows
   until localStorage refuses it, and the refusal lands on whoever is logging
   dinner that evening. Tombstones go when the day they belong to would have. */
const pruneDays = (log) => {
  const keep = Object.keys(log.days).sort().slice(-DAY_HISTORY);
  const cutoff = Date.now() - DAY_HISTORY * 86400000;
  return {
    days: Object.fromEntries(keep.map((k) => [k, log.days[k]])),
    removed: Object.fromEntries(Object.entries(log.removed || {}).filter(([, at]) => at > cutoff)),
  };
};

/* Two devices, one person, one day. Entries are never edited once added — they
   are added or taken off — so there is no "whose version is newer" to settle
   per entry, only whether an id is still there at all. That makes this simpler
   than the shopping list's merge: union by id, minus anything removed.

   Entry ids begin with a base-36 timestamp, so sorting by id puts a day back in
   the order things were eaten no matter which device recorded which. */
function mergeLogs(mine, theirs) {
  const removed = { ...mine.removed };
  for (const [id, at] of Object.entries(theirs.removed || {})) {
    removed[id] = Math.max(removed[id] || 0, at);
  }

  const days = {};
  for (const date of new Set([...Object.keys(mine.days), ...Object.keys(theirs.days)])) {
    const out = emptyDay();
    for (const meal of MEALS) {
      const byId = new Map();
      for (const e of [...(mine.days[date]?.[meal.id] || []), ...(theirs.days[date]?.[meal.id] || [])]) {
        if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
      }
      out[meal.id] = [...byId.values()]
        .filter((e) => !removed[e.id])
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    days[date] = out;
  }
  return pruneDays({ days, removed });
}

/* The profile is one small object that only its owner edits, so there is
   nothing to merge — the later of the two simply wins. It carries when it was
   last touched so that "later" means later in time rather than whichever device
   happened to sync second. */
const newerBody = (mine, theirs) => {
  if (!mine) return theirs || null;
  if (!theirs) return mine;
  return (theirs.at || 0) > (mine.at || 0) ? theirs : mine;
};

/* Nutrition is written per serving, so a portion is simply a multiplier. The
   stored values are strings carrying their units — "18 g", "410 mg" — and only
   the number in front is wanted here. */
const numOf = (v) => {
  const m = String(v ?? "").match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
};

const MACROS = [
  { key: "calories", label: "Calories", unit: "", target: "calories" },
  { key: "protein", label: "Protein", unit: "g", target: "protein" },
  { key: "carbs", label: "Carbs", unit: "g", target: "carbs" },
  { key: "fat", label: "Fat", unit: "g", target: "fat" },
];

/* What a day's entries add up to.

   Two kinds of entry. One names a recipe and its figures are read from the box,
   so editing the recipe corrects every day it appears in. The other carries its
   own numbers, because it came from somewhere that is not ours — a reading
   taken at a moment, which should not change afterwards because a database was
   edited.

   An entry that can be counted by neither route adds nothing rather than
   breaking the sum, and the view says how many of those there are. */
function dayTotals(day, recipes) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let unknown = 0;
  for (const meal of MEALS) {
    for (const entry of day[meal.id] || []) {
      if (entry.per && entry.per.calories) {
        for (const k of Object.keys(totals)) totals[k] += numOf(entry.per[k]) * entry.servings;
        continue;
      }
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      const n = recipe && recipe.nutrition;
      if (!n || !n.calories) { unknown += 1; continue; }
      for (const k of Object.keys(totals)) totals[k] += numOf(n[k]) * entry.servings;
    }
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
  return { ...totals, unknown };
}
/* ══════════════════════════════════════════════════════════════════
   The week's plan
   What somebody intends to cook, laid out across a week, and a way to turn
   that intention into a shopping list.

   Deliberately the same shape as the day log above — days keyed by local date,
   each holding the four meals, each meal a list of entries with ids — because
   that shape already has a merge that works across two devices, and a plan has
   exactly the same problem: two phones, one person, no conflict worth a
   dialogue box. mergeLogs and its tombstones are reused whole.

   The difference is which way it points. A log is a record of what happened and
   only ever grows backwards; a plan is mostly in the future, so it is kept in a
   window either side of today rather than as the last N days.

   One plan per person, like the shopping list and the tracker. A household plan
   is a fair thing to want, but it is a different feature: it needs the family
   to agree on one answer, and this one only needs you to.
   ══════════════════════════════════════════════════════════════════ */
const PLAN_KEY = "rb-plan";
const PLAN_BACK = 35;        // days of gone-by plan kept, so last week is still there
const PLAN_AHEAD = 120;      // how far ahead you may plan

/* Monday. Asked rather than assumed: the US convention is Sunday, and the rest
   of the world plus most planning apps start on Monday, which keeps the working
   week as one block and puts the weekend together at the end. */
const WEEK_STARTS_ON = 1;

/* The Monday on or before a given day. getDay() counts from Sunday, so the
   shift is how far this day sits past the start of its own week. */
const weekStart = (id) => {
  const [y, m, d] = String(id).split("-").map(Number);
  if (!y || !m || !d) return id;
  const at = new Date(y, m - 1, d);
  at.setDate(at.getDate() - ((at.getDay() - WEEK_STARTS_ON + 7) % 7));
  return dayId(at);
};

const weekDays = (start) => Array.from({ length: 7 }, (_, i) => shiftDay(start, i));

/* "September 7 – 13", or "7–13 September", or "30 December – 5 January".
   Which of those is right depends on where somebody is, and formatRange is the
   part of Intl that knows: it puts the month where the locale puts it and says
   the shared parts once. Assembling this by hand produced "7 – September 13"
   here, which is not how anybody writes a date. */
function weekLabel(start) {
  const asDate = (id) => {
    const [y, m, d] = String(id).split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const a = asDate(start);
  const b = asDate(shiftDay(start, 6));
  const sameYear = a.getFullYear() === b.getFullYear() && a.getFullYear() === new Date().getFullYear();
  const opts = { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) };
  try {
    const fmt = new Intl.DateTimeFormat(undefined, opts);
    /* formatRange is newer than the rest of Intl, so the join below stands in
       where it is missing rather than letting the header throw. */
    if (typeof fmt.formatRange === "function") return fmt.formatRange(a, b);
    return `${fmt.format(a)} – ${fmt.format(b)}`;
  } catch {
    return `${start} – ${shiftDay(start, 6)}`;
  }
}

/* How the week reads in a column heading: "Mon 15". */
const weekdayShort = (id) => {
  const [y, m, d] = String(id).split("-").map(Number);
  if (!y || !m || !d) return id;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
};
const dayNumber = (id) => Number(String(id).split("-")[2]) || "";

/* A window either side of today rather than a tail. Last month stays readable
   and next term is plannable, and anything outside that is dropped so the plan
   cannot grow without limit in a store that will eventually refuse it. */
const prunePlan = (plan, today = dayId()) => {
  const from = shiftDay(today, -PLAN_BACK);
  const to = shiftDay(today, PLAN_AHEAD);
  const cutoff = Date.now() - PLAN_BACK * 86400000;
  return {
    days: Object.fromEntries(Object.entries(plan.days || {}).filter(([d]) => d >= from && d <= to)),
    removed: Object.fromEntries(Object.entries(plan.removed || {}).filter(([, at]) => at > cutoff)),
  };
};

/* What a stretch of days asks you to buy.
   Totalled by recipe, not listed slot by slot, because the shopping list holds
   one share per recipe and replaces it rather than stacking — so a chicken
   salad on Tuesday and again on Friday has to arrive as one line of eight
   servings, not as four twice, which would silently buy half of what is
   needed. */
function planShopping(plan, dates) {
  const totals = new Map();
  for (const date of dates) {
    const day = (plan.days || {})[date];
    if (!day) continue;
    for (const meal of MEALS) {
      for (const entry of day[meal.id] || []) {
        if (!entry || !entry.recipeId) continue;
        const want = Number(entry.servings) || 0;
        if (want <= 0) continue;
        totals.set(entry.recipeId, (totals.get(entry.recipeId) || 0) + want);
      }
    }
  }
  return [...totals.entries()].map(([recipeId, servings]) => ({ recipeId, servings }));
}

/* How many meals are on a stretch of days, for the chip in the header. */
const planCount = (plan, dates) =>
  dates.reduce((n, date) => {
    const day = (plan.days || {})[date];
    return n + (day ? MEALS.reduce((k, meal) => k + (day[meal.id] || []).length, 0) : 0);
  }, 0);

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
const UNITS_KEY = "rb-units";
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

/* What you write in a recipe is not always what you ask a shop for. "Melted
   butter" is butter you melt; "frozen banana" is a banana you freeze. The list
   is for the shop, so the doing-words come off the front.

   The catch is that some of those words are how a thing is sold. Frozen peas
   are bought frozen, ground cinnamon is bought ground, and shredded mozzarella
   comes out of the bag shredded — so those words are only removed when what
   follows them is not one of the things that genuinely arrives that way.
   Anything not listed is treated as prep, which is the safer way round: buying
   a plain banana and freezing it works, buying a fresh pea and freezing it is
   a different evening. */
const DEGREE = new Set([
  "finely", "coarsely", "roughly", "thinly", "thickly", "lightly", "firmly",
  "freshly", "well", "very", "fine", "coarse", "packed",
]);

/* Never how a thing is sold — always something done to it. */
const PREP = new Set([
  "melted", "softened", "soft", "cooked", "uncooked", "cooled", "warmed",
  "chilled", "beaten", "whisked", "sifted", "peeled", "cored", "seeded",
  "pitted", "stemmed", "trimmed", "rinsed", "washed", "drained", "halved",
  "quartered", "cubed", "diced", "chopped", "minced", "shaved", "torn",
  "mashed", "pureed", "zested", "juiced", "thawed", "defrosted", "boiled",
  "boiling", "scrubbed", "deveined", "shelled", "husked", "pounded",
]);

/* Sometimes the word is the product. Kept when the rest of the name mentions
   one of these; removed otherwise. */
const SOLD_AS = {
  frozen: ["pea", "spinach", "corn", "berr", "berries", "edamame", "puff pastry",
    "pie crust", "fries", "waffle", "mixed vegetable", "concentrate"],
  ground: ["beef", "pork", "turkey", "chicken", "lamb", "veal", "sausage", "meat",
    "cinnamon", "cumin", "coriander", "ginger", "nutmeg", "clove", "allspice",
    "mustard", "pepper", "cardamom", "paprika", "almond", "coffee", "flax"],
  shredded: ["cheese", "mozzarella", "cheddar", "parmesan", "monterey", "gruyere",
    "coconut", "hash brown"],
  grated: ["cheese", "parmesan", "pecorino", "coconut", "romano"],
  crushed: ["tomato", "ice", "red pepper", "pineapple"],
  sliced: ["almond", "bread", "cheese", "pepperoni", "olive", "salami"],
  toasted: ["sesame oil", "coconut", "breadcrumb", "bread crumb"],
  crumbled: ["feta", "goat cheese", "blue cheese", "cheese", "sausage"],
  rolled: ["oat"],
};

/* Left alone on purpose: fresh, dried, smoked, canned, salted, unsalted, raw,
   whole, ripe. Every one of those separates two things a shop sells side by
   side, and dropping it would send somebody home with the wrong jar. */
function shoppingName(name) {
  let words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return String(name || "").trim();

  /* "room temperature eggs" — the only two-word prefix worth special-casing. */
  const lead = fold(words.slice(0, 2).join(" "));
  if (lead === "room temperature" && words.length > 2) words = words.slice(2);

  for (let guard = 0; guard < 6 && words.length > 1; guard++) {
    const head = fold(words[0]).replace(/[^a-z]/g, "");
    if (DEGREE.has(head) || PREP.has(head)) { words = words.slice(1); continue; }
    /* "peeled and deveined shrimp" — step over the joiner, but only when what
       follows it is another doing-word, so "salt and pepper" stays whole. */
    if (head === "and" && words.length > 2) {
      const next = fold(words[1]).replace(/[^a-z]/g, "");
      if (DEGREE.has(next) || PREP.has(next) || SOLD_AS[next]) { words = words.slice(1); continue; }
    }
    const keep = SOLD_AS[head];
    if (keep) {
      const rest = fold(words.slice(1).join(" "));
      if (keep.some((k) => rest.includes(k))) break;
      words = words.slice(1);
      continue;
    }
    break;
  }
  return words.join(" ");
}

function parseLine(line) {
  const [qty, rest] = splitQty(String(line));
  /* What comes before the first comma is what you shop for: "onion, diced"
     and "onion, sliced" are the same onion at the store. Whatever is left then
     loses any prep words in front of it, so "frozen banana" joins the bananas. */
  const name = shoppingName(clean(String(rest).split(",")[0]) || clean(rest));
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

/* What to buy, as a shop sells it (functions/api/packs.js). Suggestions are
   remembered on this device under the exact amount they were worked out for,
   so adding another recipe, or changing servings, simply leaves that item
   without one until it is asked for again rather than showing a stale count. */
const PACKS_KEY = "rb-packs";
const PACK_COUNTRY_KEY = "rb-pack-country";
const PACK_SEEN_KEY = "rb-pack-country-seen";
const PACKS_KEPT = 300;
const COUNTRY_NAMES = { US: "United States", NZ: "New Zealand" };

/* The amount an item adds up to, in the unit it is stored in, or null for
   something with no amount to size ("salt", or "2–3 limes"). */
function packNeed(item) {
  const counted = item.sources.filter((src) => src.amount != null);
  if (!counted.length) return null;
  const summed = counted.reduce((t, src) => t + src.amount, 0);
  const amount = item.unit ? summed : Math.ceil(summed - 1e-9);
  return { amount: Math.round(amount * 1000) / 1000, unit: item.unit || "", name: describeItem(item).name };
}
const packKey = (country, need) => `${country}|${fold(need.name)}|${need.unit}|${need.amount}`;

/* "2 × carton (64 fl oz)", "7 (sold each)", "about 4 oz loose". Loose produce
   is bought by what is needed, not by the kilo it is priced by. */
function packLabel(p) {
  const size = `${prettyNumber(p.size)}${p.unit === "count" ? "" : ` ${p.unit}`}`;
  if (p.package === "each") return `${prettyNumber(p.count * p.size)} (sold each)`;
  if (p.package === "loose" && Number(p.need) > 0) {
    if (p.unit === "lb") return `about ${p.need < 1 ? `${Math.ceil(p.need * 16)} oz` : `${prettyNumber(Math.ceil(p.need * 4) / 4)} lb`} loose`;
    if (p.unit === "kg") return `about ${p.need < 1 ? `${Math.ceil(p.need * 100) * 10} g` : `${prettyNumber(Math.ceil(p.need * 10) / 10)} kg`} loose`;
  }
  if (p.package === "loose") return `about ${prettyNumber(p.count * p.size)}${p.unit === "count" ? "" : ` ${p.unit}`} loose`;
  if (p.unit === "count") return `${p.count} × ${p.package} of ${size}`;
  return `${p.count} × ${p.package} (${size})`;
}

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
   Family notes and the "made it" log
   The server stamps who wrote each entry from the Access token, so nothing
   here sends an author and nothing here could usefully lie about one.
   ══════════════════════════════════════════════════════════════════ */
/* How many levels a reply thread indents before it stops. Past this a long
   back-and-forth would squeeze itself off a phone, so deeper replies line up
   with the last indented level and say who they answer instead. */
const REPLY_INDENTS = 3;

/* Notes arrive flat, oldest first; replies hang under what they answer, in the
   order they were written. An entry whose parent isn't in the list — past the
   listing limit, say — is shown at the top rather than lost. */
/* "you", "you and Tracey Hackwith", "you, Tracey Hackwith and Nicholas Heyer":
   who loves a note, the reader first. */
function lovedBy(loves) {
  const names = [...loves].sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0)).map((l) => (l.you ? "you" : l.name));
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function threadNotes(entries) {
  const ids = new Set(entries.map((e) => e.id));
  const kids = new Map();
  const roots = [];
  for (const e of entries) {
    if (e.parent && e.parent !== e.id && ids.has(e.parent)) {
      if (!kids.has(e.parent)) kids.set(e.parent, []);
      kids.get(e.parent).push(e);
    } else {
      roots.push(e);
    }
  }
  return { roots, kids };
}

const NOTES_API = "/api/notes";

async function notesCall(method, query = "", body) {
  const res = await fetch(NOTES_API + query, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  /* The server's own refusals are already written for a person to read, so they
     are passed straight through. The rest are translated here, because what
     reaches this line otherwise is a 200 carrying the app's own HTML — the
     dev server answering a route it does not have — and letting that fall
     through produces a null-property error where a sentence belongs. */
  if (!res.ok) throw new Error((data && data.error) || `Couldn't reach the notes (${res.status})`);
  if (data === null) throw new Error("Notes aren't available here — this needs the deployed site");
  return data;
}

const MESSAGES_API = "/api/messages";

/* Private messages (functions/api/messages.js). Same shape as notesCall: the
   server's own refusals are already written for a person to read. */
async function messagesCall(method, query = "", body) {
  const res = await fetch(MESSAGES_API + query, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `Couldn't reach your messages (${res.status})`);
  if (data === null) throw new Error("Messages aren't available here — this needs the deployed site");
  return data;
}

/* Sending a photo or a file goes as a form, so the file travels as bytes rather
   than swollen into text (functions/api/messages.js). */
async function messagesUpload(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v);
  const res = await fetch(MESSAGES_API, { method: "POST", credentials: "same-origin", body: form });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || (res.status === 413 ? "That file is too big to send" : `Couldn't send that (${res.status})`));
  if (data === null) throw new Error("Messages aren't available here — this needs the deployed site");
  return data;
}

/* The same ceiling the server holds, so a file too big is refused before
   anybody waits for it to upload. */
const ATTACH_MAX = 5 * 1024 * 1024;
const attachmentUrl = (id) => `${MESSAGES_API}?attachment=${encodeURIComponent(id)}`;
const sizeLabel = (n) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/* A photo is shrunk before it is sent, as a note's is: nobody needs a phone's
   full resolution in a chat window. Anything the browser can't redraw — a PDF,
   a HEIC it doesn't know, a GIF, whose animation a redraw would lose — goes as
   it came, and so does a picture that the redraw would only make bigger. */
const CHAT_PHOTO_MAX = 1600;
async function prepChatFile(file) {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    try {
      const source = await loadBitmap(file);
      const scale = Math.min(1, CHAT_PHOTO_MAX / Math.max(source.width, source.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";   // a transparent PNG would otherwise come out black as a JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.82));
      if (blob && blob.size < file.size) {
        const base = String(file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
        return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      }
    } catch { /* not drawable here: send it as it came */ }
  }
  return file;
}

const PROFILE_API = "/api/profile";

/* Profile pictures (functions/api/profile.js). Same shape as notesCall. */
async function profileCall(method, query = "", body) {
  const res = await fetch(PROFILE_API + query, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `Couldn't reach your profile (${res.status})`);
  if (data === null) throw new Error("Profiles aren't available here — this needs the deployed site");
  return data;
}

/* A profile picture is the middle square of whatever was chosen, at 256px:
   twice the largest size it is ever shown, so it stays sharp on a retina
   screen and small enough to send in one go. */
const FACE_SIZE = 256;
async function prepFace(file) {
  const source = await loadBitmap(file);
  const side = Math.min(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.max(1, Math.min(FACE_SIZE, side));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/* "Tracey Hackwith" -> "TH", for somebody who hasn't chosen a picture. */
const initialsOf = (name) =>
  String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

const lastMessageId = (messages) => (messages.length ? messages[messages.length - 1].id : 0);

/* Messages can arrive twice: once from sending one, and once from the waiting
   request, which asks for everything newer than the last id it saw and cannot
   know the page already has it. Merging by id is what keeps one line one line. */
const mergeById = (all, incoming) => {
  const seen = new Set(all.map((m) => m.id));
  return [...all, ...(incoming || []).filter((m) => m && !seen.has(m.id))];
};

/* When a note was written, in whatever zone the reader is in: the server stamps
   an exact moment and each device turns it into its own day and clock (see
   when.js). The full date and zone are there on hover, and <time> carries the
   moment itself for anything that reads the page rather than looks at it. */
/* ── The messenger dock ──────────────────────────────────────────────
   Laid out the way Facebook's chat is: the friends list in the bottom-right
   corner, and each open conversation in its own window beside it, newest
   nearest. MAX_CHATS is how many may sit in the dock at all; roomForChats is
   how many may be open rather than minimised — three where the screen has
   room, one on a phone, where an open chat takes the width of the screen. */
const CHATS_KEY = "recipe-box-chats";
/* the emoji the quick button beside Send sends, remembered on this device */
const QUICK_EMOJI_KEY = "recipe-box-quick-emoji";
/* how long a press on the quick emoji is held before it opens the menu instead */
const HOLD_MS = 450;
const MAX_CHATS = 5;
/* How long Take back is offered after sending. The server holds the same line
   by its own clock (functions/api/messages.js). */
const TAKE_BACK_MS = 60 * 1000;
const roomForChats = () => {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  return w < 700 ? 1 : Math.max(1, Math.min(3, Math.floor((w - 320) / 330)));
};

/* One conversation in the dock. Each window keeps its own messages, draft and
   waiting request, so two chats never tread on each other. A minimised window
   is only its title bar: it stops listening — a held-open request apiece is
   the expensive part, and a browser allows only a handful at once — keeps its
   draft, and flashes when the friends list's own loop says something unread
   has arrived. Opened again, it catches up from the last message it had. */
/* A paperclip, for attaching a file and for showing one. */
function Clip({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Searching KLIPY for a GIF (functions/api/gifs.js). With nothing typed it
   shows what is popular. Typing waits for a pause before it asks, so a word
   costs one search rather than one a letter — a test key allows a hundred an
   hour. "Powered by KLIPY" is their condition for using the library free. */
const GIFS_API = "/api/gifs";
const GIF_SEARCH_PAUSE_MS = 450;

function GifPicker({ onPick, onClose, busy }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState([]);
  const [state, setState] = useState("loading");
  const [note, setNote] = useState("");
  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const words = q.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`${GIFS_API}${words ? `?q=${encodeURIComponent(words)}` : ""}`, {
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (!res.ok) throw new Error((data && data.error) || `Couldn't search for GIFs (${res.status})`);
        if (data === null) throw new Error("GIF search isn't available here — this needs the deployed site");
        setGifs(data.gifs || []);
        setNote("");
        setState("ready");
      } catch (err) {
        if (err.name === "AbortError") return;
        setGifs([]);
        setNote(String(err.message || err));
        setState("error");
      }
    }, words ? GIF_SEARCH_PAUSE_MS : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  return (
    <div
      className="rb-gif-panel"
      role="group"
      aria-label="Choose a GIF"
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
    >
      <div className="rb-gif-search">
        <input
          ref={searchRef}
          type="search"
          className="rb-focus"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
          placeholder="Search KLIPY"
          aria-label="Search KLIPY for a GIF"
          style={{ ...input, padding: "6px 9px", font: `400 13.5px/1.4 ${SOCIAL}` }}
        />
        <button type="button" className="rb-chatwin-ctl rb-focus" onClick={onClose} aria-label="Close the GIF search" title="Close">
          <span aria-hidden>×</span>
        </button>
      </div>
      {state === "error" ? (
        <p className="rb-gif-note">{note}</p>
      ) : state === "ready" && !gifs.length ? (
        <p className="rb-gif-note">No GIFs found for that.</p>
      ) : (
        <ul className="rb-gif-grid" aria-busy={state === "loading"}>
          {gifs.map((g) => (
            <li key={g.id}>
              <button type="button" className="rb-focus" disabled={busy} onClick={() => onPick(g)} aria-label={`Send GIF: ${g.title}`} title={g.title}>
                <img src={g.preview.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="rb-gif-credit">{state === "loading" ? "Looking… · " : ""}Powered by KLIPY</p>
    </div>
  );
}

function ChatWindow({
  id, name, minimized, focusAt, unread, blocked, owner,
  face, faceWithLight, statusFor,
  onMinimize, onRestore, onClose, onBlock, onRead, onSent, onOpenPhoto,
  quickEmoji, onQuickEmoji,
}) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const since = useRef(0);
  /* How far through this conversation's hearts the window is, so a love on a
     message it already shows still reaches it (functions/api/messages.js). */
  const loveSince = useRef(0);
  const threadRef = useRef(null);
  const typeRef = useRef(null);
  const fileRef = useRef(null);
  const [gifOpen, setGifOpen] = useState(false);

  /* Tapping their name opens a small menu about them — for now, Block or
     Unblock — the way Facebook's chat does. A tap anywhere else, Escape, or
     minimising the window puts it away. */
  const [personMenu, setPersonMenu] = useState(false);
  const personRef = useRef(null);
  useEffect(() => {
    if (minimized) { setPersonMenu(false); return; }
    if (!personMenu) return;
    personRef.current?.querySelector('[role="menuitem"]')?.focus();
    const away = (e) => { if (!personRef.current?.contains(e.target)) setPersonMenu(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [personMenu, minimized]);
  const closePersonMenu = () => {
    setPersonMenu(false);
    personRef.current?.querySelector(".rb-chatwin-title")?.focus();
  };

  /* The quick emoji beside Send. A tap sends it. Pressing and holding opens a
     small menu to choose a different one, which then stands in its place in
     every chat — and so does a right-click, or the up arrow for somebody on a
     keyboard. `held` swallows the click that the end of a long press makes, so
     choosing never also sends. */
  const [emojiMenu, setEmojiMenu] = useState(false);
  const holdTimer = useRef(null);
  const held = useRef(false);
  const emojiRef = useRef(null);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  useEffect(() => {
    if (!emojiMenu) { held.current = false; return; }
    /* the current choice takes focus first, so the arrow keys start from it */
    emojiRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const away = (e) => { if (!emojiRef.current?.contains(e.target)) setEmojiMenu(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [emojiMenu]);
  const openEmojiMenu = (byPointer) => {
    clearTimeout(holdTimer.current);
    if (byPointer) held.current = true;
    setEmojiMenu(true);
  };
  const emojiButton = () => emojiRef.current?.querySelector(".rb-emoji-btn");
  const pickEmoji = (emoji) => {
    onQuickEmoji(emoji);
    setEmojiMenu(false);
    emojiButton()?.focus();
  };
  const sendEmoji = async () => {
    if (busy || blocked) return;
    setBusy(true);
    setError("");
    try {
      const { message } = await messagesCall("POST", "", { to: id, text: quickEmoji });
      setMessages((all) => mergeById(all, [message]));
      onSent();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };
  /* A GIF goes the moment it is chosen, as in any messenger, and travels as
     its address on KLIPY's file server (shared/gif.js). */
  const sendGif = async (gif) => {
    if (busy || blocked) return;
    setBusy(true);
    setError("");
    try {
      const { message } = await messagesCall("POST", "", { to: id, text: gif.url });
      setMessages((all) => mergeById(all, [message]));
      setGifOpen(false);
      onSent();
      typeRef.current?.focus();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };
  const emojiMenuKeys = (e) => {
    const items = [...emojiRef.current.querySelectorAll('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement);
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
    if (e.key === "Escape") { e.preventDefault(); setEmojiMenu(false); emojiButton()?.focus(); }
    else if (move) { e.preventDefault(); items[(at + move + items.length) % items.length]?.focus(); }
  };
  /* A photo or file waiting to go with the next message: { file, preview },
     the preview being a picture's own local address while it is shown. */
  const [pending, setPending] = useState(null);
  useEffect(() => () => { if (pending?.preview) URL.revokeObjectURL(pending.preview); }, [pending]);
  const choose = async (file) => {
    if (!file) return;
    setError("");
    const ready = await prepChatFile(file);
    if (ready.size > ATTACH_MAX) {
      setError(`That file is too big to send — the most is ${sizeLabel(ATTACH_MAX)}`);
      return;
    }
    setPending({ file: ready, preview: /^image\//.test(ready.type) ? URL.createObjectURL(ready) : null });
    typeRef.current?.focus();
  };
  /* A photo arriving after the thread was scrolled to the bottom pushes the
     last line out of view; this puts it back, unless somebody has scrolled up
     to read something older. */
  const keepAtBottom = () => {
    const el = threadRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 320) el.scrollTop = el.scrollHeight;
  };
  const first = String(name || "").split(" ")[0] || name;

  useEffect(() => {
    if (minimized) return;
    let stop = false;
    (async () => {
      let wait = false;
      while (!stop) {
        try {
          if (wait && document.hidden) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          const got = await messagesCall("GET", `?with=${encodeURIComponent(id)}&since=${since.current}&loves=${loveSince.current}${wait ? "&wait=1" : ""}`);
          if (stop) return;
          setLoaded(true);
          setError("");
          if (got.messages && got.messages.length) {
            since.current = Math.max(since.current, lastMessageId(got.messages));
            setMessages((all) => mergeById(all, got.messages));
            onRead(id, since.current);
          }
          if (typeof got.loveSeq === "number") loveSince.current = Math.max(loveSince.current, got.loveSeq);
          if (got.loved && got.loved.length) {
            const hearts = new Map(got.loved.map((l) => [l.id, l]));
            setMessages((all) => all.map((m) => (hearts.has(m.id) ? { ...m, loves: hearts.get(m.id).loves, loved: hearts.get(m.id).loved } : m)));
          }
          wait = true;
        } catch (err) {
          if (stop) return;
          setLoaded(true);
          setError(String(err.message || err));
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    })();
    return () => { stop = true; };
  }, [id, minimized]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Take back is offered for a minute. The window redraws the moment the
     youngest offer runs out, so the button goes when the server would start
     refusing it, rather than whenever something next happens to redraw. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const left = messages
      .filter((m) => m.mine && !m.deleted)
      .map((m) => Date.parse(m.at) + TAKE_BACK_MS - Date.now())
      .filter((ms) => ms > 0);
    if (!left.length) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(...left) + 250);
    return () => clearTimeout(t);
  });

  /* The newest line in view, as a chat window always has it. */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, minimized, loaded]);

  /* Somebody who has just opened a chat is about to type in it. Only when they
     opened it — a chat brought back on page load does not take the cursor. */
  useEffect(() => {
    if (focusAt && !minimized) typeRef.current?.focus();
  }, [focusAt, minimized]);

  /* A sent message is merged by id, and `since` is left where the waiting
     request put it: moving it past our own message could step over one of
     theirs that arrived a moment earlier and has not been fetched yet. */
  const send = async () => {
    const text = draft.trim();
    if ((!text && !pending) || busy) return;
    if (!isGifMessage(text) && hasHate(text)) { setError(HATE_MESSAGE); return; }
    setBusy(true);
    setError("");
    try {
      const { message } = pending
        ? await messagesUpload({ to: id, text, file: pending.file })
        : await messagesCall("POST", "", { to: id, text });
      setMessages((all) => mergeById(all, [message]));
      setDraft("");
      setPending(null);
      onSent();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  /* A heart on one of their messages, or taking it back. Both ends see it:
     theirs finds out through its waiting request. */
  const toggleLove = async (m) => {
    setError("");
    try {
      const res = await messagesCall("POST", "", { love: m.id, on: !m.loved });
      setMessages((all) => all.map((x) => (x.id === res.id ? { ...x, loves: res.loves, loved: res.loved } : x)));
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  /* Taking back your own, or — for the owner — removing anybody's. Removing
     is for good and reaches the other person's copy too, so it asks first. */
  const takeBack = async (messageId, asOwner = false) => {
    if (asOwner && !window.confirm("Remove this message for both of you? This can't be undone.")) return;
    try {
      const res = await messagesCall("DELETE", `?id=${encodeURIComponent(messageId)}`);
      setMessages((all) => all.map((m) => (m.id === messageId ? { ...m, deleted: true, text: "", removed: !!res.removed } : m)));
      onSent();
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  const closeButton = (
    <button type="button" className="rb-chatwin-ctl rb-focus" onClick={onClose} aria-label={`Close your chat with ${name}`} title="Close">
      <span aria-hidden>×</span>
    </button>
  );

  if (minimized) {
    return (
      <div className={`rb-chatwin is-min${unread ? " has-unread" : ""}`}>
        <div className="rb-chatwin-head">
          <button
            type="button"
            className="rb-chatwin-title rb-focus"
            onClick={onRestore}
            aria-label={`Open your chat with ${name}${unread ? ` — ${unread} unread` : ""}`}
          >
            {faceWithLight(id, name, 26)}
            <span className="rb-chatwin-name">{name}</span>
            {unread ? <span className="rb-chat-unread">{unread}</span> : null}
          </button>
          {closeButton}
        </div>
      </div>
    );
  }

  const status = statusFor(id);
  return (
    <section className="rb-chatwin" aria-label={`Chat with ${name}`}>
      <div className="rb-chatwin-head">
        <span className="rb-person-wrap" ref={personRef}>
          <button
            type="button"
            className="rb-chatwin-title rb-focus"
            onClick={() => setPersonMenu((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={personMenu}
            title={`Options for ${name}`}
          >
            {faceWithLight(id, name, 30)}
            <span className="rb-chatwin-lines">
              <span className="rb-chatwin-nameline">
                <span className="rb-chatwin-name">{name}</span>
                <span className="rb-chatwin-caret" aria-hidden>▾</span>
              </span>
              {status ? <span className="rb-chat-seen">{status}</span> : null}
            </span>
          </button>
          {personMenu && (
            <div
              className="rb-person-menu"
              role="menu"
              aria-label={`Options for ${name}`}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closePersonMenu(); } }}
            >
              <button type="button" role="menuitem" onClick={() => { setPersonMenu(false); onBlock(!blocked); }}>
                {blocked ? `Unblock ${first}` : `Block ${first}`}
              </button>
            </div>
          )}
        </span>
        <button type="button" className="rb-chatwin-ctl is-minimise rb-focus" onClick={onMinimize} aria-label={`Minimise your chat with ${name}`} title="Minimise">
          <span aria-hidden>_</span>
        </button>
        {closeButton}
      </div>

      <div className="rb-chatwin-body" ref={threadRef}>
        {!loaded ? (
          <p className="rb-chat-empty">Looking…</p>
        ) : (
          <ol className="rb-chat-thread">
            {messages.length === 0 && !error && <li className="rb-chat-empty">Nothing yet. Say hello.</li>}
            {messages.map((m, i) => {
              /* Their face beside the last of a run of their messages, as
                 most messengers do, rather than beside every line. */
              const endsRun = !m.mine && (!messages[i + 1] || messages[i + 1].mine);
              const gif = !m.deleted && !m.attachment ? gifUrl(m.text) : null;
              return (
                <li key={m.id} className={`rb-msg-row${m.mine ? " is-mine" : ""}`}>
                  {!m.mine && (endsRun ? face(id, name, 24) : <span className="rb-face-gap" aria-hidden />)}
                  <div className={`rb-msg${m.mine ? " is-mine" : ""}${(m.attachment?.picture && !m.deleted) || gif ? " has-photo" : ""}${!m.deleted && !m.attachment && emojiOnly(m.text) ? " is-emoji" : ""}${!m.deleted && m.loves?.length ? " has-love" : ""}`}>
                    {gif && (
                      <button
                        type="button"
                        className="rb-msg-photo rb-focus"
                        onClick={() => onOpenPhoto({ src: gif, alt: "GIF", caption: "GIF via KLIPY" })}
                        aria-label="See this GIF full size"
                      >
                        <img src={gif} alt="GIF" loading="lazy" referrerPolicy="no-referrer" onLoad={keepAtBottom} />
                      </button>
                    )}
                    {m.attachment && !m.deleted && (m.attachment.picture ? (
                      <button
                        type="button"
                        className="rb-msg-photo rb-focus"
                        onClick={() => onOpenPhoto({ src: attachmentUrl(m.attachment.id), alt: m.attachment.name, caption: m.attachment.name })}
                        aria-label={`See ${m.attachment.name} full size`}
                      >
                        <img src={attachmentUrl(m.attachment.id)} alt={m.attachment.name} loading="lazy" onLoad={keepAtBottom} />
                      </button>
                    ) : (
                      <a className="rb-msg-file rb-focus" href={attachmentUrl(m.attachment.id)} download={m.attachment.name}>
                        <span className="rb-chat-fileicon" aria-hidden><Clip size={16} /></span>
                        <span className="rb-msg-file-name">
                          {m.attachment.name}
                          <span>{sizeLabel(m.attachment.size)} · download</span>
                        </span>
                      </a>
                    ))}
                    {(m.deleted || (m.text && !gif)) && (
                      <p className={m.deleted ? "rb-msg-text rb-msg-gone" : "rb-msg-text"}>
                        {m.deleted ? (m.removed ? "Removed" : "Taken back") : m.text}
                      </p>
                    )}
                    <p className="rb-msg-when">
                      <When iso={m.at} />
                      {!m.mine && !m.deleted && !blocked && (
                        <button type="button" className="rb-entry-x rb-focus" onClick={() => toggleLove(m)} aria-pressed={!!m.loved}>
                          {m.loved ? "Unlove" : "Love"}
                        </button>
                      )}
                      {!m.deleted && (m.mine && Date.now() - Date.parse(m.at) < TAKE_BACK_MS ? (
                        <button type="button" className="rb-entry-x rb-focus" onClick={() => takeBack(m.id)}>
                          Take back
                        </button>
                      ) : owner ? (
                        <button type="button" className="rb-entry-x rb-focus" onClick={() => takeBack(m.id, true)} aria-label="Remove this message">
                          Remove
                        </button>
                      ) : null)}
                    </p>
                    {!m.deleted && m.loves?.length > 0 && (
                      <span
                        className="rb-love-badge"
                        role="img"
                        aria-label={m.mine ? `${first} loved this` : "You loved this"}
                        title={m.mine ? `${first} loved this` : "You loved this"}
                      >
                        ❤️
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {error && <p className="rb-messenger-error">{error}</p>}
      </div>

      <div className="rb-chatwin-compose">
        {gifOpen && !blocked && (
          <GifPicker
            busy={busy}
            onPick={sendGif}
            onClose={() => { setGifOpen(false); typeRef.current?.focus(); }}
          />
        )}
        {pending && (
          <div className="rb-chat-pending">
            {pending.preview
              ? <img src={pending.preview} alt="" />
              : <span className="rb-chat-fileicon" aria-hidden><Clip size={16} /></span>}
            <span className="rb-chat-pending-name">
              {pending.file.name}
              <span>{sizeLabel(pending.file.size)} · sends with your message</span>
            </span>
            <button type="button" className="rb-chatwin-ctl rb-focus" onClick={() => setPending(null)} aria-label={`Don't send ${pending.file.name}`} title="Don't send this">
              <span aria-hidden>×</span>
            </button>
          </div>
        )}
        <textarea
          ref={typeRef}
          /* Put away while a GIF is being chosen, when the search box is where
             the typing goes: a chat window has no room for both and the
             conversation. The draft is kept. */
          hidden={gifOpen && !blocked}
          /* A picture pasted into the box is attached, as in any messenger. */
          onPaste={(e) => {
            const pasted = [...(e.clipboardData?.files || [])][0];
            if (pasted && !blocked) { e.preventDefault(); choose(pasted); }
          }}
          className="rb-focus"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /* Enter sends, as it does everywhere people type to each other;
               shift and Enter is a new line. */
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={2}
          maxLength={4000}
          disabled={blocked}
          placeholder={blocked ? `You've blocked ${first}` : `Message ${first}`}
          aria-label={`Message ${name}`}
          style={{ ...input, resize: "none", padding: "8px 10px", font: `400 14px/1.45 ${SOCIAL}` }}
        />
        <div className="rb-chatwin-actions">
          <span className="rb-chatwin-tools">
            <button
              type="button"
              className="rb-chatwin-ctl rb-focus"
              onClick={() => fileRef.current?.click()}
              disabled={blocked || busy}
              aria-label="Attach a photo or file"
              title="Attach a photo or file"
            >
              <Clip />
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }}
            />
            <button
              type="button"
              className="rb-chatwin-ctl rb-gif-btn rb-focus"
              onClick={() => setGifOpen((open) => !open)}
              disabled={blocked}
              aria-expanded={gifOpen}
              aria-label="Send a GIF"
              title="Send a GIF"
            >
              GIF
            </button>
          </span>
          <span className="rb-chatwin-send">
            <span className="rb-emoji-wrap" ref={emojiRef}>
              {emojiMenu && (
                <div className="rb-emoji-menu" role="menu" aria-label="Choose your quick emoji" onKeyDown={emojiMenuKeys}>
                  <p className="rb-emoji-hint" aria-hidden>Your quick emoji</p>
                  {QUICK_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitemradio"
                      aria-checked={emoji === quickEmoji}
                      onClick={() => pickEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="rb-emoji-btn rb-focus"
                disabled={busy || blocked}
                aria-label={`Send ${quickEmoji} — press and hold, or press the up arrow, to choose a different emoji`}
                aria-haspopup="menu"
                aria-expanded={emojiMenu}
                title="Send — press and hold to choose another"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  held.current = false;
                  clearTimeout(holdTimer.current);
                  holdTimer.current = setTimeout(() => openEmojiMenu(true), HOLD_MS);
                }}
                onPointerUp={() => clearTimeout(holdTimer.current)}
                onPointerLeave={() => clearTimeout(holdTimer.current)}
                onPointerCancel={() => clearTimeout(holdTimer.current)}
                /* a long press on a phone, or a right-click */
                onContextMenu={(e) => { e.preventDefault(); openEmojiMenu(e.pointerType !== "mouse" && e.button !== 2); }}
                onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); openEmojiMenu(false); } }}
                onClick={() => {
                  if (held.current) { held.current = false; return; }
                  if (emojiMenu) { setEmojiMenu(false); return; }
                  sendEmoji();
                }}
              >
                {quickEmoji}
              </button>
            </span>
            <button
              className="rb-btn rb-focus"
              style={{ ...btnPrimary, padding: "7px 14px", fontSize: 13 }}
              onClick={send}
              disabled={busy || blocked || (!draft.trim() && !pending)}
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}

function When({ iso, inSentence = false }) {
  const label = whenAt(iso, { inSentence });
  if (!label) return null;
  return <time dateTime={iso} title={whenFull(iso)}>{label}</time>;
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

/* Favorites (src/favorites.js): this device's copy, and the person's own key
   in the account, which syncs the same way the shopping list does. */
const FAV_KEY = "rb-favorites";
const FAV_SYNC_KEY = "favorites";

/* The favorite star: filled when on, an outline when not. Drawn rather than
   typed, so it is the same shape in every font and on every device. */
function Star({ on, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

/* ══════════════════════════════════════════════════════════════════
   The alarm
   A harp playing five notes and settling back where it began. Generated rather
   than loaded, so there is no file to fetch and it still rings with the wifi
   off.

   One AudioContext for the life of the page, not one per ring. A browser will
   only allow a handful at once, and a timer that keeps chiming would run
   through them. It is opened when a timer is started, which is a real tap and
   therefore the moment a browser will let sound be unlocked at all.
   ══════════════════════════════════════════════════════════════════ */
let audioCtx = null;
function audio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume?.();
    return audioCtx;
  } catch { return null; }
}

/* G C D C G — out, and back to where it started. Offsets are in seconds from
   the top of the phrase and are already divided by 1.4, which is the tempo
   Devon picked: at this spacing a note is still sounding when the next one
   lands, so the middle blooms into something nearer a chord than a count.

   Only the spacing is sped up. A pluck decays for as long as a pluck decays,
   and compressing that too would change the instrument rather than the tempo. */
const HEARTH = [
  [392.00, 0],
  [523.25, 0.214],
  [587.33, 0.429],
  [523.25, 0.643],
  [392.00, 0.857],
];

function alarm() {
  const ctx = audio();
  if (!ctx) return;
  try {
    const at0 = ctx.currentTime + 0.04;
    /* A plucked string: the note itself on a triangle for warmth, with quiet
       touches of its octave and twelfth over the top so it does not sound like
       a bare sine. Struck, then left to fade — a sound that decays has already
       finished asking for attention, which is what something repeating every
       five seconds needs to do. */
    const pluck = (freq, at, peak) => {
      const partial = (f, dur, p, type) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, at);
        o.connect(g).connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(p, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.start(at);
        o.stop(at + dur + 0.03);
      };
      partial(freq, 1.3, peak * 0.85, "triangle");
      partial(freq * 2, 0.45, peak * 0.22, "sine");
      partial(freq * 3, 0.22, peak * 0.1, "sine");
    };
    HEARTH.forEach(([freq, off]) => pluck(freq, at0 + off, 0.24));
  } catch { /* a browser that will not make noise is not worth breaking over */ }
}

/* A finished timer keeps ringing until somebody clears it — the point of the
   whole thing is the pan you walked away from. It stops making noise after
   RING_FOR, because a tab left open should not still be chiming at midnight;
   the flashing and the chip stay until cleared either way. */
const RING_EVERY = 5000;
const RING_FOR = 5 * 60 * 1000;

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
  /* Jetpack's yield arrives with its visible label, "Servings: 8 slices". */
  const best = list.reduce((a, b) => (b.length > a.length ? b : a)).replace(/^(servings?|serves|yields?|makes)\s*:\s*/i, "");
  return /^\d+$/.test(best) ? `Serves ${best}` : best;
}

/* Most sites give ISO durations. Some give words — Jetpack's is "1.5 hours,
   with prep time" — and those are kept as written, less any "Time:" label,
   so long as they are short and mention a number. */
function schemaTime(node) {
  const minutes = isoMinutes(node.totalTime) ?? (((isoMinutes(node.prepTime) || 0) + (isoMinutes(node.cookTime) || 0)) || null);
  if (minutes) return minutesLabel(minutes);
  const words = htmlToText(node.totalTime).replace(/^[a-z ]{0,12}time\s*:\s*/i, "");
  return /\d/.test(words) && !/^P[\dT]/i.test(words) && words.length <= 40 ? words : "";
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
    time: schemaTime(node),
    tags,
    ingredients: [].concat(node.recipeIngredient ?? node.ingredients ?? []).map(htmlToText).filter(Boolean),
    steps: schemaSteps(node.recipeInstructions),
    /* the few sites that do list equipment publish it as tool */
    equipment: [].concat(node.tool ?? []).map((t) => htmlToText(typeof t === "string" ? t : t?.name || t?.text)).filter(Boolean),
    nutrition: Object.keys(nutrition).length ? nutrition : null,
    /* the recipe's own note, when the site has one, above where it came from */
    notes: [
      htmlToLines(node.notes).join("\n"),
      [`From ${host || "the web"}${by.length ? `, by ${by.join(" and ")}` : ""}.`, pageUrl].join("\n"),
    ].filter(Boolean).join("\n\n"),
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

const BLANK = { thumb: "", full: null, photoTouched: false, title: "", contributor: "", description: "", servings: "", time: "", tagText: "", ingredientText: "", equipmentText: "", stepText: "", notes: "", nutrition: null, photoChoices: [], photoPick: "", stepPhotos: [] };

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

  /* Lined up with the button's own edge, the panel can run off the screen when
     the button is not where `align` expects — on a phone the toolbar wraps and
     a right-aligned Filters button lands at the left, sending its panel out past
     the left edge. So once it is open it is measured, and slid back in to sit
     at least EDGE from either side. Measured before paint, so it never jumps. */
  const EDGE = 16;
  const panelRef = useRef(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open) { setShift(0); return; }
    const fit = () => {
      const el = panelRef.current;
      if (!el) return;
      el.style.transform = "none";
      const r = el.getBoundingClientRect();
      const room = document.documentElement.clientWidth;
      const dx = r.left < EDGE ? EDGE - r.left : r.right > room - EDGE ? room - EDGE - r.right : 0;
      el.style.transform = dx ? `translateX(${Math.round(dx)}px)` : "none";
      setShift(Math.round(dx));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {trigger({ open, toggle })}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{
            transform: shift ? `translateX(${shift}px)` : "none",
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
/* Still used by the lists in the menus — the recipe boxes, Back, Add someone —
   where the whole row really is one choice and clicking anywhere in it is the
   point. The settings rows are built differently; see .rb-setting. */
const menuRow = (on) => ({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
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
function CookingMode({ recipe, stepIndex, setStepIndex, factor, setFactor, baseServings, units,
                      showPantry, setShowPantry, onClose, startTimer, hasTimer, prevStep, nextStep,
                      marks, onToggle, onFinish, photoSrc, onOpenPhoto }) {
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
      {/* top bar — measured by the timers, which sit just below it */}
      <div data-cook-bar style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "18px 22px", flexWrap: "wrap" }}>
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
            {showText(step.text, factor, units)}
          </p>
          {photoSrc && Array.isArray(steps[stepIndex]?.photos) && steps[stepIndex].photos.length > 0 && (
            <div className="rb-cookshots">
              {steps[stepIndex].photos.slice(0, STEP_PHOTO_MAX).map((id, k) => (
                <button
                  key={id}
                  type="button"
                  className="rb-cookshot rb-focus"
                  onClick={() => onOpenPhoto?.(id)}
                  aria-label={`See photo ${k + 1} of this step full size`}
                >
                  <img src={photoSrc(id)} alt="" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
                </button>
              ))}
            </div>
          )}
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
                      {showLine(ing, factor, units)}
                    </button>
                  </li>
                );
              })}
            </ul>
            {recipe.equipment?.length > 0 && (
              <>
                <p style={{ font: `400 19px/1.2 ${DISPLAY}`, color: "rgb(var(--on-page))", margin: "22px 0 12px" }}>You'll need</p>
                <p style={{ font: `400 14.5px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.8 * var(--ink-k)))", margin: 0 }}>
                  {recipe.equipment.map((tool) => convertText(tool, units)).join(" · ")}
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
  /* only the recipes this person has starred */
  const [favOnly, setFavOnly] = useState(false);
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
  /* The import a suggestion is for. Bumped whenever the form starts over, so a
     suggestion that arrives late for an earlier import is dropped, not pasted
     into a different recipe. */
  const importRun = useRef(0);
  const [suggesting, setSuggesting] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  /* Step photos: the step one is being prepared for, the step choosing from an
     imported page's photos, and the photos just saved — shown from memory until
     their uploads land, so a recipe opened straight after saving never shows a
     gap where a picture is still on its way. */
  const [stepPhotoBusy, setStepPhotoBusy] = useState(null);
  const [stepPicking, setStepPicking] = useState(null);
  const [freshStepPhotos, setFreshStepPhotos] = useState({});
  const stepPhotoSrc = (id) => freshStepPhotos[id] || stepImageUrl(id);
  /* Which of an imported page's photos is on its way into the form. The run
     counter lets a newer choice, an upload or a fresh form win over one that
     is still loading. */
  const [photoChoosing, setPhotoChoosing] = useState("");
  const photoPickRun = useRef(0);
  const [hero, setHero] = useState("");        // full-size photo for the open recipe
  /* "" wide, "mid" squarish, "tall" portrait. Cleared with every recipe, or the
     shape of the last photo is inherited by the next one. */
  const [heroShape, setHeroShape] = useState("");
  const photoRef = useRef(null);
  /* Snapshot of the list the recipe was opened from, so Back returns to the
     same search, scope, tag and box — not to a reset list. */
  const listStateRef = useRef({ query: "", scope: "all", tagFilter: null, activeBox: null });
  /* How far down the box somebody had scrolled when they opened a recipe, and
     whether the next render of the list is the one that should go back there.
     Changing view does not move the page by itself: opening the fourth recipe
     down used to leave the window where it was, so the recipe arrived already
     scrolled past its own title. */
  const listScrollRef = useRef(0);
  const restoreScrollRef = useRef(null);
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
  const toolTrail = useRef([]);              // the path back out of the tool pages — see trail.js
  const [newItem, setNewItem] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  /* Package suggestions: which country's shops, as chosen here ("" is
     wherever Cloudflare says you are), the country last used, and the
     suggestions themselves by packKey. */
  const [packCountry, setPackCountry] = useState(() => {
    try { const v = localStorage.getItem(PACK_COUNTRY_KEY); return v === "US" || v === "NZ" ? v : ""; } catch { return ""; }
  });
  const [packFor, setPackFor] = useState(() => {
    try { const v = localStorage.getItem(PACK_SEEN_KEY); return v === "US" || v === "NZ" ? v : ""; } catch { return ""; }
  });
  const [packs, setPacks] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(PACKS_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
  });
  const [packsBusy, setPacksBusy] = useState(false);
  const [packsNote, setPacksNote] = useState("");
  useEffect(() => {
    try { localStorage.setItem(PACKS_KEY, JSON.stringify(Object.fromEntries(Object.entries(packs).slice(-PACKS_KEPT)))); } catch { /* this visit only */ }
  }, [packs]);
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
  /* Which units to read in. On the device rather than the account, like dark
     mode: it says something about whoever is holding the phone, not about the
     recipe, and the recipe belongs to everybody. */
  const [units, setUnits] = useState(() => {
    try {
      const saved = localStorage.getItem(UNITS_KEY);
      return isSystem(saved) ? saved : "as-written";
    } catch { return "as-written"; }
  });
  useEffect(() => {
    try { localStorage.setItem(UNITS_KEY, units); } catch { /* storage off; the choice lasts the visit */ }
  }, [units]);
  const [cooking, setCooking] = useState(false);

  /* Running timers sit in a small stack in the top right corner rather than a
     bar across the bottom, which covered the messenger. Where exactly is
     measured, so they cover nothing that matters:
     - in the very top right corner of the screen, whenever Home and Menu are
       far enough in from it (a wide screen, where the page is a centred column);
     - otherwise, beside Home and Menu in the header's empty row, where there
       is room for it (a laptop-sized screen);
     - otherwise just below them (a phone), where the title fills that row;
     - in cooking mode, beside Done when that has wrapped onto a line of its
       own with room to spare (a phone), and otherwise below the top bar.
     Worked out again whenever the page or the cooking bar changes size, not
     only on a resize event, which some ways of changing the width never send. */
  const TIMER_WIDTH = 250;
  const [timerSpot, setTimerSpot] = useState(null);
  useLayoutEffect(() => {
    const settle = (next) => setTimerSpot((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    const room = () => document.documentElement.clientWidth;
    const place = () => {
      if (cooking) {
        const bar = document.querySelector("[data-cook-bar]");
        if (!bar) return settle(null);
        const done = [...bar.querySelectorAll("button")].pop();
        const d = done?.getBoundingClientRect();
        if (d && room() - d.right - 16 >= TIMER_WIDTH) return settle({ top: Math.round(d.top) - 4, right: 8 });
        return settle({ top: Math.round(bar.getBoundingClientRect().bottom) + 8 });
      }
      const corner = document.querySelector(".rb-corner");
      if (!corner) return settle(null);
      const r = corner.getBoundingClientRect();
      const inset = room() < 700 ? 8 : 12;
      if (r.right <= room() - inset - TIMER_WIDTH - 12) return settle({ top: inset, right: inset });
      if (room() >= 1000) return settle({ top: Math.round(r.top + window.scrollY), right: Math.round(room() - r.left) + 10 });
      settle({ top: Math.round(r.bottom + window.scrollY) + 8, right: inset });
    };
    placeTimers.current = place;
    place();
    window.addEventListener("resize", place);
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    watch?.observe(document.documentElement);
    const bar = cooking ? document.querySelector("[data-cook-bar]") : null;
    if (bar) watch?.observe(bar);
    return () => { window.removeEventListener("resize", place); watch?.disconnect(); };
  }, [cooking]);
  /* And on every redraw while a timer is showing — which is every second, as
     it counts — so the spot can never be left stale by a change of size that
     sent no event at all. Nothing redraws unless the spot actually moved. */
  const placeTimers = useRef(null);
  useLayoutEffect(() => {
    if (timers.length) placeTimers.current?.();
  });
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
      "https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,300;0,400;0,500;1,400&family=Radley:ital@0;1&family=Inter:wght@400;500;600;700&family=Nunito+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap";
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

  /* Whether anything is currently owed attention. One flag for every finished
     timer rather than one per timer: two pans going off at once should not ring
     twice as fast. */
  const ringing = timers.some((t) => t.remaining === 0);

  useEffect(() => {
    if (!ringing) return;
    const since = Date.now();
    const id = setInterval(() => {
      if (Date.now() - since > RING_FOR) { clearInterval(id); return; }
      alarm();
    }, RING_EVERY);
    return () => clearInterval(id);
  }, [ringing]);
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
            alarm();
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
    /* The backstop for every other way the box is changed. Judged against what
       the box already holds, so one old line cannot block every later save. */
    if (newHate(next, box).length) { flash(HATE_MESSAGE, 7000); return false; }
    setBox(next);
    flash((await saveBox(next)) ? "Saved" : "Couldn't save — that change is only on this screen");
    return true;
  };

  /* The heading names whichever box is open, so switching boxes swaps both the
     title and the line under it. Doing that on the same frame as the click made
     the words appear to jump. They now lift and fade out, change while nobody
     can read them, and settle back — one element the whole time, so the text
     never sits in two places at once and the layout never reflows twice.

     shownBox trails activeBox by exactly the length of the fade; everything
     else on the page still filters on activeBox immediately, so only the
     heading waits. Somebody who has asked for less movement gets the swap on
     the spot instead. */
  const [shownBox, setShownBox] = useState(activeBox);
  const [titleSettling, setTitleSettling] = useState(false);
  useEffect(() => {
    if (activeBox === shownBox) { setTitleSettling(false); return; }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) { setShownBox(activeBox); return; }
    setTitleSettling(true);
    const t = setTimeout(() => { setShownBox(activeBox); setTitleSettling(false); }, 150);
    return () => clearTimeout(t);
  }, [activeBox, shownBox]);
  /* The newest few things said anywhere in the box, for the feed under the
     recipes. Re-read whenever the box page comes back into view, so leaving a
     note and going home shows it there. Quiet about failure: the recipes are
     the point of that page, and a feed that cannot load should not say so
     twice. */
  const [lately, setLately] = useState([]);
  useEffect(() => {
    if (view !== "list") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await notesCall("GET", "?recent=6");
        if (!cancelled) setLately(data.entries || []);
      } catch { if (!cancelled) setLately([]); }
    })();
    return () => { cancelled = true; };
  }, [view, box.recipes.length]);

  /* Notes belong to the open recipe and are fetched when it opens. null means
     "not asked yet", which is what keeps an empty recipe from flashing "nothing
     here" before the first answer arrives. */
  const [notes, setNotes] = useState(null);
  const [myName, setMyName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState("");
  /* The entry a reply is being written to, and what it says so far. One at a
     time: opening another reply box closes the first. */
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  /* ── private messages ──
     inbox is null until asked, the way notes are, so an empty inbox does not
     flash "nobody has written" before the first answer. */
  const [inbox, setInbox] = useState(null);
  const [messagePeople, setMessagePeople] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  /* Who is about: id -> { online, seen }. Refreshed by the same request that
     says this page is here, so the lights cost nothing of their own. */
  const [presence, setPresence] = useState({});
  /* The messenger dock along the bottom of every page: whether the friends
     list is open, who is waiting to be read, and the chats beside the list —
     [{ id, name, minimized, focusAt }], nearest the list first. The chats are
     remembered on this device, and come back minimised, so a reload neither
     loses them nor opens a handful of windows over the page. */
  const [listOpen, setListOpen] = useState(false);
  /* The emoji the quick button in every chat sends: a thumbs up until chosen. */
  const [quickEmoji, setQuickEmoji] = useState(() => {
    try { return asQuickEmoji(localStorage.getItem(QUICK_EMOJI_KEY)); } catch { return DEFAULT_QUICK_EMOJI; }
  });
  const chooseQuickEmoji = (emoji) => {
    const next = asQuickEmoji(emoji);
    setQuickEmoji(next);
    try { localStorage.setItem(QUICK_EMOJI_KEY, next); } catch { /* chosen for this visit, then */ }
  };
  const [listError, setListError] = useState("");
  const [waiting, setWaiting] = useState([]);
  const [chats, setChats] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
      return Array.isArray(saved)
        ? saved.filter((c) => c && typeof c.id === "string").slice(0, MAX_CHATS)
          .map((c) => ({ id: c.id, name: String(c.name || ""), minimized: true }))
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats.map(({ id, name, minimized }) => ({ id, name, minimized }))));
    } catch { /* private window, or storage blocked: the dock still works, it just isn't remembered */ }
  }, [chats]);
  /* Profile pictures: id -> version for everybody who has one, and who you
     are. Asked for when the page opens and again whenever the messenger does,
     so a new face reaches everybody else without a timer of its own. */
  const [faces, setFaces] = useState({});
  const [profile, setProfile] = useState(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceError, setFaceError] = useState("");
  useEffect(() => {
    let cancelled = false;
    profileCall("GET", "?faces")
      .then((data) => {
        if (cancelled) return;
        setFaces(data.faces || {});
        setProfile(data.me || null);
      })
      .catch(() => { /* not deployed, or offline: initials everywhere, quietly */ });
    return () => { cancelled = true; };
  }, [listOpen]);
  /* A note to bring into view once the recipe's notes are on the page, when it
     was opened from the Lately feed: { target, ids } — the note to scroll to,
     and the notes to light up for a moment. */
  const [noteFocus, setNoteFocus] = useState(null);
  useEffect(() => {
    if (!noteFocus || notes === null) return;
    const el = document.getElementById(`note-${noteFocus.target}`);
    if (el) el.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setNoteFocus(null), 2600);
    return () => clearTimeout(t);
  }, [notes, noteFocus]);
  const [notePhoto, setNotePhoto] = useState(null);   // { full, shot } waiting to be posted
  const [photoBusyNote, setPhotoBusyNote] = useState(false);
  const [lightbox, setLightbox] = useState(null);     // the entry being looked at full size

  useEffect(() => {
    if (!openId) { setNotes(null); setNotesError(""); return; }
    let cancelled = false;
    setNotes(null);
    setNoteText("");
    setReplyTo(null);
    setReplyText("");
    setNotesError("");
    setNotePhoto(null);
    (async () => {
      try {
        const data = await notesCall("GET", `?recipe=${encodeURIComponent(openId)}`);
        if (cancelled) return;
        setNotes(data.entries || []);
        setMyName(data.me?.name || "");
      } catch (err) {
        if (cancelled) return;
        /* Offline, or the endpoint isn't there. The recipe is still readable,
           so this says so quietly rather than taking the page down. */
        setNotes([]);
        setNotesError(String(err.message || err));
      }
    })();
    return () => { cancelled = true; };
  }, [openId]);

  /* Shrinking happens here, in the browser, before anything is sent. A phone
     photograph is several megabytes of picture nobody needs at that size, and
     sending it whole would spend the account's storage and the family's
     patience on detail no screen here will show. */
  const chooseNotePhoto = async (file) => {
    if (!file) return;
    setPhotoBusyNote(true);
    setNotesError("");
    try {
      setNotePhoto(await prepShot(file));
    } catch {
      setNotesError("That file didn't look like a photo");
    } finally {
      setPhotoBusyNote(false);
    }
  };

  const addEntry = async (kind) => {
    const text = kind === "note" ? noteText.trim() : "";
    if (kind === "note" && !text && !notePhoto) return;
    if (hasHate(text)) { setNotesError(HATE_MESSAGE); return; }
    setNotesBusy(true);
    setNotesError("");
    try {
      const { entry } = await notesCall("POST", "", {
        recipe: openId,
        kind,
        text,
        ...(notePhoto ? { shot: notePhoto.shot, photo: notePhoto.full } : {}),
      });
      setNotes((list) => [...(list || []), entry]);
      if (kind === "note") setNoteText("");
      setNotePhoto(null);
      flash(kind === "made" ? "Added to the log" : "Note added");
    } catch (err) {
      setNotesError(String(err.message || err));
    } finally {
      setNotesBusy(false);
    }
  };

  /* ── private messages ───────────────────────────────────────────
     The inbox and the conversation are two requests: the inbox is asked for
     when the page opens and after anything is sent, and the conversation holds
     a request open (wait=1) that answers the moment something arrives. Both go
     quiet when messaging is not switched on, because the rest of the site does
     not depend on it. */
  const refreshInbox = async () => {
    try {
      const box = await messagesCall("GET", "?inbox");
      setInbox(box.threads || []);
      setUnreadMessages(box.unread || 0);
    } catch { /* said elsewhere, if anywhere */ }
  };

  const markRead = async (who, upTo) => {
    if (!who || !upTo) return;
    try {
      await messagesCall("POST", "", { read: upTo, with: who });
      setInbox((list) => (list || []).map((t) => (t.with === who ? { ...t, unread: 0 } : t)));
      setUnreadMessages((n) => Math.max(0, n - 0));
      refreshInbox();
    } catch { /* the count is a nicety, not the message */ }
  };

  /* Being here, and the badge beside Meal plan and Shopping list. One request
     does both: it records that this person is using the site — anywhere on it,
     not only on the messages page — and brings back the unread count and
     everybody's lights. Quiet about failure: an unbound database or a dev
     server should not put an error on the page. */
  useEffect(() => {
    let stop = false;
    const look = async () => {
      if (stop || document.hidden) return;
      try {
        const beat = await messagesCall("POST", "", { here: true });
        if (stop) return;
        setUnreadMessages(beat.unread || 0);
        if (beat.people) setPresence(Object.fromEntries(beat.people.map((p) => [p.id, p])));
      } catch { /* quiet */ }
    };
    look();
    const every = setInterval(look, 45000);
    const onWake = () => look();
    document.addEventListener("visibilitychange", onWake);
    return () => { stop = true; clearInterval(every); document.removeEventListener("visibilitychange", onWake); };
  }, []);

  /* Who is waiting to be read. This one holds a request open rather than
     asking on a timer, so a name starts flashing a second or so after somebody
     writes, not on the next quarter-minute. It says which count it already
     knows; the server answers the moment that changes. */
  useEffect(() => {
    let stop = false;
    let known = -1;
    (async () => {
      while (!stop) {
        try {
          if (document.hidden) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const data = await messagesCall("GET", known >= 0 ? `?waiting&wait=1&unread=${known}` : "?waiting");
          if (stop) return;
          known = data.unread || 0;
          setUnreadMessages(known);
          setWaiting(data.waiting || []);
          if (data.people) setPresence((all) => ({ ...all, ...Object.fromEntries(data.people.map((p) => [p.id, p])) }));
        } catch {
          /* not switched on, or offline: wait a while and try again, quietly */
          await new Promise((r) => setTimeout(r, 20000));
        }
      }
    })();
    return () => { stop = true; };
  }, []);

  /* Who there is to talk to, and what has been said: when the friends list
     opens, and on page load too if chats were left in the dock, so a chat
     brought back knows whether its person is blocked. */
  const hasChats = chats.length > 0;
  useEffect(() => {
    if (!listOpen && !hasChats) return;
    let cancelled = false;
    (async () => {
      try {
        const who = await messagesCall("GET", "?people");
        if (cancelled) return;
        setMessagePeople(who.people || []);
        setBlockedIds(who.blocked || []);
        if (who.people) setPresence((all) => ({ ...all, ...Object.fromEntries(who.people.map((p) => [p.id, p])) }));
        const box = await messagesCall("GET", "?inbox");
        if (cancelled) return;
        setInbox(box.threads || []);
        setUnreadMessages(box.unread || 0);
        setListError("");
      } catch (err) {
        if (cancelled) return;
        setInbox([]);
        setListError(String(err.message || err));
      }
    })();
    return () => { cancelled = true; };
  }, [listOpen, hasChats]);

  /* While the friends list is open, it keeps its order current: whenever the
     unread count moves, the conversations are asked for again, so whoever just
     wrote rises to the top without the list being closed and opened. Sending,
     reading and taking back already ask for it themselves. */
  useEffect(() => {
    if (listOpen) refreshInbox();
  }, [unreadMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Opening a chat puts it nearest the friends list, open. Past what the
     screen has room for, the chats furthest from the list are minimised, and
     past MAX_CHATS the furthest is closed. On a phone an open chat takes the
     screen, so the friends list folds away. */
  const openChat = (id, name) => {
    const room = roomForChats();
    if (room === 1) setListOpen(false);
    setChats((all) => {
      const known = all.find((c) => c.id === id);
      const next = [
        { id, name: name || known?.name || "", minimized: false, focusAt: Date.now() },
        ...all.filter((c) => c.id !== id),
      ].slice(0, MAX_CHATS);
      let open = 0;
      return next.map((c) => (!c.minimized && ++open > room ? { ...c, minimized: true } : c));
    });
  };
  /* A minimised chat opens again where it sat, rather than jumping places. */
  const restoreChat = (id) => {
    const room = roomForChats();
    if (room === 1) setListOpen(false);
    setChats((all) => {
      let open = 1;
      return all.map((c) =>
        c.id === id ? { ...c, minimized: false, focusAt: Date.now() }
          : !c.minimized && ++open > room ? { ...c, minimized: true }
            : c);
    });
  };
  const minimizeChat = (id) => setChats((all) => all.map((c) => (c.id === id ? { ...c, minimized: true } : c)));
  const closeChat = (id) => setChats((all) => all.filter((c) => c.id !== id));
  const toggleList = () => {
    const next = !listOpen;
    if (next && roomForChats() === 1) setChats((all) => all.map((c) => (c.minimized ? c : { ...c, minimized: true })));
    setListOpen(next);
  };

  /* Blocking somebody closes their chat: it is a conversation that has ended,
     and the list still offers Unblock through their name. */
  const blockPerson = async (id, blocked) => {
    try {
      const data = await messagesCall("POST", "", blocked ? { block: id } : { unblock: id });
      setBlockedIds(data.blocked || []);
      if (blocked) closeChat(id);
      refreshInbox();
      flash(blocked ? `${personLabel(id)} can no longer message you` : `${personLabel(id)} can message you again`, 5000);
    } catch (err) {
      flash(String(err.message || err), 5000);
    }
  };

  /* A name for an id, from whichever list already holds it. */
  const personLabel = (id) =>
    messagePeople.find((p) => p.id === id)?.name || (inbox || []).find((t) => t.with === id)?.name || id;

  /* Green if they have used the site in the last five minutes, unlit
     otherwise — and said in words too, because a colour on its own is no use
     to somebody who cannot see it. */
  const lightOn = (id) => !!presence[id]?.online;
  const lastSeenOf = (id) => presence[id]?.seen || null;
  const statusFor = (id) => {
    if (lightOn(id)) return <>Online now</>;
    const seen = lastSeenOf(id);
    return seen ? <>Last seen <When iso={seen} /></> : null;
  };

  /* A person's picture, or their initials when they haven't chosen one. It
     always sits beside their name written out, so to a screen reader it is
     decoration. The version in the address changes with the picture, which is
     what lets the browser keep each one for good. */
  const face = (id, name, size = 28) => {
    const v = id ? faces[id] : null;
    const style = { "--face": `${size}px` };
    return v ? (
      <img
        className="rb-face"
        src={`${PROFILE_API}?face=${encodeURIComponent(id)}&v=${encodeURIComponent(v)}`}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        style={style}
      />
    ) : (
      <span className="rb-face rb-face-blank" aria-hidden style={style}>{initialsOf(name)}</span>
    );
  };
  /* In the messenger the online light sits on the corner of the face. */
  const faceWithLight = (id, name, size) => (
    <span className="rb-face-wrap">
      {face(id, name, size)}
      <span className={`rb-chat-light${lightOn(id) ? " is-on" : ""}`} aria-hidden />
    </span>
  );

  const chooseFace = async (file) => {
    if (!file || !profile) return;
    setFaceBusy(true);
    setFaceError("");
    try {
      let picture;
      try { picture = await prepFace(file); } catch { throw new Error("That file didn't look like a photo"); }
      const { face: v } = await profileCall("PUT", "", { face: picture });
      setFaces((all) => ({ ...all, [profile.id]: v }));
      setProfile((p) => ({ ...p, face: v }));
    } catch (err) {
      setFaceError(String(err.message || err));
    } finally {
      setFaceBusy(false);
    }
  };

  const removeFace = async () => {
    if (!profile) return;
    setFaceBusy(true);
    setFaceError("");
    try {
      await profileCall("DELETE");
      setFaces((all) => {
        const next = { ...all };
        delete next[profile.id];
        return next;
      });
      setProfile((p) => ({ ...p, face: null }));
    } catch (err) {
      setFaceError(String(err.message || err));
    } finally {
      setFaceBusy(false);
    }
  };

  /* A heart on somebody else's note, which everybody reading the recipe sees. */
  const loveNote = async (entry) => {
    setNotesError("");
    try {
      const res = await notesCall("POST", "", { love: entry.id, on: !entry.loved });
      setNotes((list) => (list || []).map((e) => (e.id === res.id ? { ...e, loves: res.loves, loved: res.loved } : e)));
    } catch (err) {
      setNotesError(String(err.message || err));
    }
  };

  const addReply = async (parent) => {
    const text = replyText.trim();
    if (!text) return;
    if (hasHate(text)) { setNotesError(HATE_MESSAGE); return; }
    setNotesBusy(true);
    setNotesError("");
    try {
      const { entry } = await notesCall("POST", "", { recipe: openId, kind: "note", text, parent });
      setNotes((list) => [...(list || []), entry]);
      setReplyTo(null);
      setReplyText("");
      flash("Reply added");
    } catch (err) {
      setNotesError(String(err.message || err));
    } finally {
      setNotesBusy(false);
    }
  };

  /* The server says what actually went: the entry itself, any placeholders
     above it left with nothing under them — or nothing at all, when it had
     replies and was turned into a placeholder instead. */
  const removeEntry = async (id) => {
    setNotesBusy(true);
    try {
      const res = await notesCall("DELETE", `?id=${encodeURIComponent(id)}`);
      const placeholder = res?.placeholder || null;
      const gone = new Set(Array.isArray(res?.removed) ? res.removed : placeholder ? [] : [id]);
      setNotes((list) => (list || [])
        .filter((e) => !gone.has(e.id))
        .map((e) => (e.id === placeholder
          ? { ...e, deleted: true, text: "", name: "", who: null, mine: false, canRemove: false, shot: null, hasPhoto: false }
          : e)));
      if (replyTo && (gone.has(replyTo) || replyTo === placeholder)) setReplyTo(null);
    } catch (err) {
      setNotesError(String(err.message || err));
    } finally {
      setNotesBusy(false);
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
    /* A recipe opened from a tool page goes back to it, like one from the plan. */
    if (view === "plan" || view === "shopping" || view === "today") {
      toolTrail.current = trailTo(toolTrail.current, view, "detail");
    }
    listStateRef.current = { query, scope, tagFilter, activeBox };
    listScrollRef.current = window.scrollY;
    setOpenId(id);
    setFactor(1);
    setView("detail");
    window.scrollTo(0, 0);
  };

  /* A Lately entry opens its recipe at the conversation rather than at the top:
     a reply at the note it answers, with the reply just beneath, and anything
     else at itself. */
  const openFromFeed = (entry, recipe) => {
    setNoteFocus({ target: entry.parent || entry.id, ids: [entry.parent, entry.id].filter(Boolean) });
    openCard(recipe.id);
  };

  const goBack = () => {
    const from = listStateRef.current;
    setQuery(from.query);
    setScope(from.scope);
    setTagFilter(from.tagFilter);
    setActiveBox(from.activeBox);
    setView("list");
    restoreScrollRef.current = listScrollRef.current;
  };

  /* A recipe opened from a tool page — a planned meal, say — goes back there;
     one opened from the recipes goes back to the list as it was left. */
  const backFromRecipe = () => (toolTrail.current.length ? leaveShopping() : goBack());

  /* After the list is back on screen, not before — the page cannot be scrolled
     to a position the content does not occupy yet. Laid out rather than merely
     effected, so the jump happens before the browser paints and nobody sees the
     top of the list first. */
  useLayoutEffect(() => {
    if (view !== "list" || restoreScrollRef.current == null) return;
    const y = restoreScrollRef.current;
    restoreScrollRef.current = null;
    window.scrollTo(0, y);
  }, [view]);

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
    if (hasHate(name)) { flash(HATE_MESSAGE, 6000); return; }
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
      const stepPhotos = {};
      await Promise.all(box.recipes.flatMap((r) => stepPhotoIds(r.steps)).map(async (id) => {
        try {
          const res = await window.storage?.get(stepImageKey(id), true);
          if (res?.value) stepPhotos[id] = res.value;
        } catch { /* not stored */ }
      }));
      const payload = { ...box, photos, stepPhotos, exported: new Date().toISOString() };
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

  /* ── Favorites ──────────────────────────────────────────────────────
     Each person's own stars. Saved to the device at once and to the account
     a moment later, read-merge-write like the shopping list above, so a star
     made on the phone is on the laptop too — and never lost to a device that
     was asleep when it happened. */
  const [favorites, setFavorites] = useState(() => {
    try { return asFavorites(JSON.parse(localStorage.getItem(FAV_KEY) || "null")) || emptyFavorites(); }
    catch { return emptyFavorites(); }
  });
  const favRef = useRef(favorites);
  const favTimer = useRef(null);
  const favSyncing = useRef(false);
  const favAgain = useRef(false);
  const writeFavLocal = (f) => {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch { /* the account's copy still follows */ }
  };

  const syncFavorites = useCallback(async () => {
    if (favSyncing.current) { favAgain.current = true; return; }
    favSyncing.current = true;
    try {
      let theirs = null;
      try {
        theirs = asFavorites(JSON.parse((await window.storage.get(FAV_SYNC_KEY)).value));
      } catch (err) {
        if (!/not found/i.test(String(err && err.message))) throw err;
      }
      const mine = favRef.current;
      const merged = theirs ? mergeFavorites(mine, theirs) : mine;
      if (JSON.stringify(merged) !== JSON.stringify(mine)) {
        favRef.current = merged;
        setFavorites(merged);
        writeFavLocal(merged);
      }
      /* Nothing is written for somebody who has never starred anything, and
         nothing when the account already says the same. */
      const differs = theirs ? JSON.stringify(merged) !== JSON.stringify(theirs) : Object.keys(merged.stars).length > 0;
      if (differs) await window.storage.set(FAV_SYNC_KEY, JSON.stringify(merged));
    } catch {
      /* Offline, or not signed in: this device's stars stand, and the next
         change or the next visit tries again. */
    } finally {
      favSyncing.current = false;
      if (favAgain.current) { favAgain.current = false; syncFavorites(); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncFavorites();
    const onWake = () => { if (document.visibilityState === "visible") syncFavorites(); };
    /* two tabs on one device share the stars, so a star in one shows in the other */
    const onStorage = (e) => {
      if (e.key !== FAV_KEY) return;
      let next = null;
      try { next = asFavorites(JSON.parse(e.newValue || "null")); } catch { next = null; }
      if (next) { favRef.current = next; setFavorites(next); }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("storage", onStorage);
      clearTimeout(favTimer.current);
    };
  }, [syncFavorites]);

  const toggleFavorite = (recipe) => {
    const on = !isFavorite(favRef.current, recipe.id);
    const next = setFavorite(favRef.current, recipe.id, on);
    favRef.current = next;
    setFavorites(next);
    writeFavLocal(next);
    clearTimeout(favTimer.current);
    favTimer.current = setTimeout(syncFavorites, SYNC_DEBOUNCE);
    flash(on ? "Added to favorites" : "Removed from favorites");
  };

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

  /* ── The day ──────────────────────────────────────────────────────── */
  const [dayLog, setDayLog] = useState(() => asLog(readStore(DAY_KEY, null)));
  const [plan, setPlan] = useState(() => asLog(readStore(PLAN_KEY, null)));
  const planRef = useRef(null);
  const [daySync, setDaySync] = useState("unknown");   // unknown | synced | device
  const logRef = useRef(null);
  const bodyRef = useRef(null);
  const [today, setToday] = useState(dayId);
  const [body, setBody] = useState(() => readStore(BODY_KEY, null));
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(null);
  const [addTo, setAddTo] = useState(null);          // which meal is being added to
  const [addPick, setAddPick] = useState("");
  const [addServings, setAddServings] = useState("1");

  /* Which week the planner is showing, as the date of its Monday. */
  const [weekOf, setWeekOf] = useState(() => weekStart(dayId()));
  const [planTo, setPlanTo] = useState(null);      // { date, meal } being added to
  const [planPick, setPlanPick] = useState("");
  const [planServes, setPlanServes] = useState("");

  /* Which day is on screen. Usually today, but the picker can send it back up to
     a month. Kept apart from `today` deliberately: `today` is what the calendar
     says and must stay that way for the rollover below to mean anything. */
  const [viewDay, setViewDay] = useState(today);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (ev) => { if (ev.key === "Escape") setLightbox(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* A tab left open overnight should be showing the new day by the time
     somebody comes back to it, not still totalling yesterday's dinner. */
  useEffect(() => {
    const check = () => setToday(dayId());
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);

  /* When the date turns over, a screen that was showing today follows it. One
     that was deliberately parked on an older day stays where it was put — the
     rollover is not a reason to lose somebody's place. */
  const wasToday = useRef(today);
  useEffect(() => {
    if (viewDay === wasToday.current) setViewDay(today);
    wasToday.current = today;
  }, [today]);           // eslint-disable-line react-hooks/exhaustive-deps

  logRef.current = dayLog;
  bodyRef.current = body;
  planRef.current = plan;

  const day = dayLog.days[viewDay] || emptyDay();
  /* Separate from `day` on purpose. The chip in the header answers "how am I
     doing today", which is not the question the tracker is showing while
     somebody is looking back at last Tuesday. */
  const todayTotals = dayTotals(dayLog.days[today] || emptyDay(), box.recipes);
  const targets = body ? dailyTargets(body) : null;
  const shape = body ? bmi(body) : null;
  const totals = dayTotals(day, box.recipes);
  const oldestDay = earliestDay(today);
  const thisWeek = weekStart(today);
  const planned = planCount(plan, weekDays(weekOf));
  /* The chip in the header is about this week, always, however far ahead the
     planner itself has been scrolled. */
  const thisWeekPlanned = planCount(plan, weekDays(thisWeek));
  const onToday = viewDay === today;

  /* Writes land on the day being looked at, not on today. That is what makes
     "I forgot to log yesterday's dinner" work, and it costs nothing — the same
     code path, one key along. */
  const saveDay = (next, removedIds = []) => {
    const removed = { ...dayLog.removed };
    for (const id of removedIds) removed[id] = Date.now();
    const log = pruneDays({ days: { ...dayLog.days, [viewDay]: next }, removed });
    logRef.current = log;
    setDayLog(log);
    if (!writeStore(DAY_KEY, log)) flash("Couldn't save that day on this device — its storage may be full or switched off", 7000);
    queueDaySync();
  };

  /* Adding to, or taking off, the plan. Same tombstone bookkeeping as the day
     log, for the same reason: without it, taking something off on a phone is
     undone the moment a laptop that still remembers it syncs. */
  const savePlan = (date, next, removedIds = []) => {
    const removed = { ...plan.removed };
    for (const id of removedIds) removed[id] = Date.now();
    const updated = prunePlan({ days: { ...plan.days, [date]: next }, removed }, today);
    planRef.current = updated;
    setPlan(updated);
    if (!writeStore(PLAN_KEY, updated)) flash("Couldn't save the plan on this device — its storage may be full or switched off", 7000);
    queueDaySync();
  };

  const planFor = (date) => plan.days[date] || emptyDay();

  const addToPlan = (date, mealId, recipeId, servings) => {
    const day = planFor(date);
    const entry = {
      id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      recipeId,
      servings: Math.max(1, Number(servings) || 1),
    };
    savePlan(date, { ...day, [mealId]: [...(day[mealId] || []), entry] });
  };

  const removeFromPlan = (date, mealId, entryId) => {
    const day = planFor(date);
    savePlan(date, { ...day, [mealId]: (day[mealId] || []).filter((e) => e.id !== entryId) }, [entryId]);
  };

  /* Three ways into a meal: something from the box, something looked up, or
     numbers typed straight off a wrapper. The third exists because the second
     will not always have what somebody ate — a named item from a named chain is
     where any food database is thinnest, and the chains publish the figures
     themselves. */
  const [addMode, setAddMode] = useState("box");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState(null);
  const [foodBusy, setFoodBusy] = useState(false);
  const [foodError, setFoodError] = useState("");
  const [foodPick, setFoodPick] = useState(null);
  const [byHand, setByHand] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });

  const resetAdd = () => {
    setAddTo(null);
    setAddPick("");
    setAddServings("1");
    setFoodQuery("");
    setFoodResults(null);
    setFoodError("");
    setFoodPick(null);
    setByHand({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  };

  const searchFoods = async () => {
    const q = foodQuery.trim();
    if (q.length < 2) return;
    setFoodBusy(true);
    setFoodError("");
    setFoodPick(null);
    try {
      const res = await fetch(`/api/food?q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
      /* Read it once as text, then try it as JSON. A reply that is not JSON is
         not the endpoint talking — it is Cloudflare's own error page — and
         "couldn't search (502)" on its own gives nobody anything to act on, so
         the first line of whatever arrived is shown instead. */
      const body = await res.text();
      let data = null;
      try { data = JSON.parse(body); } catch { data = null; }

      if (data && data.error) throw new Error(data.error);
      if (!res.ok) {
        const clue = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        throw new Error(`The food search failed (${res.status})${clue ? ` — ${clue}` : ""}`);
      }
      if (!data) throw new Error("Food search isn't available here — this needs the deployed site");
      setFoodResults(data.results || []);
    } catch (err) {
      setFoodResults([]);
      setFoodError(String(err.message || err));
    } finally {
      setFoodBusy(false);
    }
  };

  /* Whatever is added, the numbers are written onto the entry rather than looked
     up later. A recipe is ours and can be read again; a food from elsewhere is a
     reading taken at a moment, and the day it was eaten should not change
     because a database was edited afterwards. */
  const addFromFood = (meal, food, servings) => {
    saveDay({
      ...day,
      [meal]: [...(day[meal] || []), {
        id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        food: { name: food.name, brand: food.brand || null, portion: food.portion },
        per: food.per,
        servings,
      }],
    });
    resetAdd();
  };

  const addByHand = (meal) => {
    const name = byHand.name.trim();
    const calories = Math.max(0, parseFloat(byHand.calories) || 0);
    if (!name || !calories) {
      flash("A name and a calorie figure are the least it needs", 5000);
      return;
    }
    if (hasHate(name)) { flash(HATE_MESSAGE, 6000); return; }
    addFromFood(meal, {
      name,
      brand: null,
      portion: "as entered",
      per: {
        calories: Math.round(calories),
        protein: Math.round(parseFloat(byHand.protein) || 0),
        carbs: Math.round(parseFloat(byHand.carbs) || 0),
        fat: Math.round(parseFloat(byHand.fat) || 0),
      },
    }, Math.max(0.25, Math.min(20, parseFloat(addServings) || 1)));
  };
  const logEntry = (meal) => {
    const recipe = box.recipes.find((r) => r.id === addPick);
    const servings = Math.max(0.25, Math.min(20, parseFloat(addServings) || 1));
    if (!recipe) return;
    saveDay({
      ...day,
      [meal]: [...(day[meal] || []), { id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, recipeId: recipe.id, servings }],
    });
    resetAdd();
  };

  /* The id is remembered as removed, not merely dropped: another device still
     holding the entry would otherwise put it back at the next sync. */
  const dropEntry = (meal, id) =>
    saveDay({ ...day, [meal]: (day[meal] || []).filter((e) => e.id !== id) }, [id]);

  /* The form is filled in the units people think in and stored in the ones the
     formulas use, so the conversion happens at these two edges only. */
  const startBody = () => {
    const h = body ? cmToFeetInches(body.cm) : { feet: "", inches: "" };
    setBodyDraft({
      sex: body?.sex ?? "",
      feet: String(h.feet ?? ""),
      inches: String(h.inches ?? ""),
      pounds: body ? String(Math.round(kgToLb(body.kg))) : "",
      age: body ? String(body.age) : "",
      activity: body?.activity ?? "light",
      goal: body?.goal ?? "maintain",
    });
    setEditingBody(true);
  };

  const commitBody = () => {
    const d = bodyDraft || {};
    const cm = feetInchesToCm(d.feet, d.inches);
    const kg = lbToKg(d.pounds);
    const age = parseInt(d.age, 10) || 0;
    if (!(cm > 0) || !(kg > 0) || !(age > 0)) {
      flash("Height, weight and age are all needed before a day can be estimated", 5000);
      return;
    }
    saveBody({ sex: d.sex, cm, kg, age, activity: d.activity, goal: d.goal });
  };

  const saveBody = (next) => {
    const stamped = next ? { ...next, at: Date.now() } : null;
    bodyRef.current = stamped;
    setBody(stamped);
    writeStore(BODY_KEY, stamped);
    setEditingBody(false);
    queueDaySync();
  };

  /* ── The same day on this person's other devices ───────────────────
     Kept under a key the server namespaces to the verified email, so it is
     readable by its owner and by nobody else in the family. Same shape of sync
     as the shopping list: the device writes first and instantly, the account
     follows a couple of seconds behind, and a read is folded in rather than
     overwritten so a phone waking up cannot undo a laptop's lunch. */
  const DAY_SYNC = "day-log";
  const BODY_SYNC = "body";
  /* The plan rides the same channel. It is the same person, the same debounce
     and the same wake-up, so a third key costs one more round trip rather than
     a second set of everything. */
  const PLAN_SYNC = "meal-plan";
  const daySyncTimer = useRef(null);
  const daySyncing = useRef(false);
  const daySyncAgain = useRef(false);

  const syncDay = useCallback(async () => {
    if (daySyncing.current) { daySyncAgain.current = true; return; }
    daySyncing.current = true;
    try {
      let theirLog = null;
      let theirBody = null;
      try { theirLog = asLog(JSON.parse((await window.storage.get(DAY_SYNC)).value)); }
      catch (err) { if (!/not found/i.test(String(err && err.message))) throw err; }
      try { theirBody = JSON.parse((await window.storage.get(BODY_SYNC)).value); }
      catch (err) { if (!/not found/i.test(String(err && err.message))) throw err; }
      let theirPlan = null;
      try { theirPlan = asLog(JSON.parse((await window.storage.get(PLAN_SYNC)).value)); }
      catch (err) { if (!/not found/i.test(String(err && err.message))) throw err; }

      const mineLog = logRef.current;
      const mergedLog = theirLog ? mergeLogs(mineLog, theirLog) : mineLog;
      if (JSON.stringify(mergedLog) !== JSON.stringify(mineLog)) {
        logRef.current = mergedLog;
        setDayLog(mergedLog);
        writeStore(DAY_KEY, mergedLog);
      }
      if (!theirLog || JSON.stringify(mergedLog) !== JSON.stringify(theirLog)) {
        await window.storage.set(DAY_SYNC, JSON.stringify(mergedLog));
      }

      /* mergeLogs whole, because a plan has the same shape and the same
         question to settle: is this entry still there, on either device. */
      const minePlan = planRef.current;
      const mergedPlan = theirPlan ? mergeLogs(minePlan, theirPlan) : minePlan;
      if (JSON.stringify(mergedPlan) !== JSON.stringify(minePlan)) {
        planRef.current = mergedPlan;
        setPlan(mergedPlan);
        writeStore(PLAN_KEY, mergedPlan);
      }
      if (!theirPlan || JSON.stringify(mergedPlan) !== JSON.stringify(theirPlan)) {
        await window.storage.set(PLAN_SYNC, JSON.stringify(mergedPlan));
      }

      const mineBody = bodyRef.current;
      const mergedBody = newerBody(mineBody, theirBody);
      if (JSON.stringify(mergedBody) !== JSON.stringify(mineBody)) {
        bodyRef.current = mergedBody;
        setBody(mergedBody);
        writeStore(BODY_KEY, mergedBody);
      }
      if (JSON.stringify(mergedBody) !== JSON.stringify(theirBody)) {
        await window.storage.set(BODY_SYNC, JSON.stringify(mergedBody));
      }
      setDaySync("synced");
    } catch {
      /* Offline, or Access could not vouch for us. What is on the device is
         untouched and the next change or visit tries again. */
      setDaySync("device");
    } finally {
      daySyncing.current = false;
      if (daySyncAgain.current) { daySyncAgain.current = false; syncDay(); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const queueDaySync = () => {
    clearTimeout(daySyncTimer.current);
    daySyncTimer.current = setTimeout(syncDay, 2000);
  };

  useEffect(() => {
    syncDay();
    const onWake = () => { if (document.visibilityState === "visible") syncDay(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearTimeout(daySyncTimer.current);
    };
  }, [syncDay]);
  /* The tool pages keep a path back rather than one remembered page. With one
     page, recipes → meal plan → shopping list → back left the meal plan
     remembering it came from itself, and its back button went nowhere. */
  const openTool = (to) => {
    toolTrail.current = trailTo(toolTrail.current, view, to);
    setView(to);
    window.scrollTo(0, 0);
  };
  const openToday = () => openTool("today");
  const openPlan = () => openTool("plan");
  const openShopping = () => {
    setConfirmClear(false);
    openTool("shopping");
  };
  const leaveShopping = () => {
    const { to, trail } = backFrom(toolTrail.current);
    toolTrail.current = trail;
    setView(to === "detail" && !openRecipe ? "list" : to);
  };
  const BACK_TO = {
    list: "Back to recipes", detail: "Back to the recipe", form: "Back to editing", import: "Back to the import",
    plan: "Back to the meal plan", shopping: "Back to the shopping list", today: "Back to the tracker",
  };
  /* what a tool page's back button will say: wherever the path actually leads */
  const toolBackLabel = () => {
    const { to } = backFrom(toolTrail.current);
    return to === "detail" && !openRecipe ? BACK_TO.list : BACK_TO[to] || BACK_TO.list;
  };
  /* Arriving at the recipes is arriving home. There is nothing further back,
     and a path left over from before would only send a later back button
     somewhere stale. */
  useEffect(() => {
    if (view === "list") toolTrail.current = [];
  }, [view]);

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

  /* The week, turned into a shop.
     One pass, one write: every recipe planned that week arrives at the total
     servings the week asks for, which is why planShopping totals by recipe
     first. Going slot by slot would replace each recipe's share six times over
     and leave only the last one standing. */
  const planToList = () => {
    const wanted = planShopping(plan, weekDays(weekOf));
    if (!wanted.length) {
      flash("Nothing is planned for this week yet");
      return;
    }
    let put = 0;
    let gone = 0;
    updateList((l) => {
      let next = l;
      for (const { recipeId, servings } of wanted) {
        const recipe = box.recipes.find((r) => r.id === recipeId);
        /* A recipe somebody deleted after planning it. The plan keeps the slot
           so it is visible and can be cleared, but there is nothing to buy. */
        if (!recipe) { gone += 1; continue; }
        const base = servingsCount(recipe.servings);
        const lines = recipe.ingredients.map((ing) => scaleLine(ing, base ? servings / base : 1));
        next = withRecipe(next, recipe, lines, servings);
        put += 1;
      }
      return next;
    });
    flash(
      put
        ? `${put} ${put === 1 ? "recipe is" : "recipes are"} on the shopping list${gone ? `, and ${gone} could not be found` : ""}`
        : "None of this week's recipes are in the box any more",
      gone ? 7000 : 4000,
    );
  };

  /* Tapping a planned meal opens the recipe, and Back comes here rather than to
     the list — somebody checking what Thursday needs is still planning. */
  const openFromPlan = (recipe) => {
    toolTrail.current = trailTo(toolTrail.current, "plan", "detail");
    setOpenId(recipe.id);
    setFactor(1);
    setView("detail");
    window.scrollTo(0, 0);
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

  const choosePackCountry = (value) => {
    const v = value === "US" || value === "NZ" ? value : "";
    setPackCountry(v);
    setPacksNote("");
    try { if (v) localStorage.setItem(PACK_COUNTRY_KEY, v); else localStorage.removeItem(PACK_COUNTRY_KEY); } catch { /* this visit only */ }
  };

  /* Asks for everything still to buy that has an amount. The server answers
     what it already knows from its cache and asks the model about the rest. */
  const suggestPacks = async () => {
    const asking = list.items.filter((i) => !i.checked).map((i) => ({ item: i, need: packNeed(i) })).filter((x) => x.need);
    if (!asking.length || packsBusy) return;
    setPacksBusy(true);
    setPacksNote("");
    try {
      const res = await fetch("/api/packs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: packCountry || undefined, items: asking.map(({ item, need }) => ({ id: item.id, ...need })) }),
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) throw new Error((data && data.error) || `Couldn't get suggestions (${res.status})`);
      if (!data || !data.country) throw new Error("Suggestions aren't available here — this needs the deployed site");
      setPackFor(data.country);
      try { localStorage.setItem(PACK_SEEN_KEY, data.country); } catch { /* this visit only */ }
      setPacks((old) => {
        const next = { ...old };
        for (const { item, need } of asking) {
          const key = packKey(data.country, need);
          delete next[key];
          next[key] = data.packs?.[item.id] || null;
        }
        return next;
      });
      const without = asking.filter(({ item }) => !data.packs?.[item.id]).length;
      if (without) setPacksNote(`No sensible package for ${without} ${without === 1 ? "item" : "items"}, so buy ${without === 1 ? "it" : "those"} by the amount shown.`);
    } catch (err) {
      setPacksNote(String(err.message || err));
    } finally {
      setPacksBusy(false);
    }
  };
  const clearAll = () => updateList(() => ({ items: [], recipes: {} }));
  const addTyped = () => {
    const text = newItem.trim();
    if (!text) return;
    if (hasHate(text)) { flash(HATE_MESSAGE, 6000); return; }
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
    return hitQ && (!tagFilter || (r.tags || []).includes(tagFilter)) && (!favOnly || isFavorite(favorites, r.id)) && inBox;
  });
  /* how many recipes still in the box are starred — a star on a recipe since
     removed is not counted */
  const favCount = box.recipes.filter((r) => isFavorite(favorites, r.id)).length;

  /* Spam-clicking otherwise stacks identical countdowns. A second press on a
     step that is already counting does nothing; a different step is free to
     run alongside it. */
  const startTimer = (label, seconds, key) => {
    /* Opening it here, inside the tap, is what lets it make a sound later. */
    audio();
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
    const onKey = (e) => { if (e.key === "Escape") backFromRecipe(); };
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
    const refused = additions.filter(hasHate);
    if (refused.length) {
      flash(`${refused.length === 1 ? "One of those recipes has" : `${refused.length} of those recipes have`} language this site doesn't allow — nothing was added`, 8000);
      return;
    }
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
    importRun.current += 1;
    photoPickRun.current += 1;
    setStepPicking(null);
    setView("form");
  };
  const startEdit = (r) => {
    setForm({
      thumb: r.thumb || "", full: null, photoTouched: false,
      title: r.title, contributor: r.contributor || "", description: r.description || "",
      servings: r.servings || "", time: r.time || "", tagText: (r.tags || []).join(", "),
      ingredientText: r.ingredients.join("\n"), equipmentText: (r.equipment || []).join("\n"),
      stepText: r.steps.map(stepLine).join("\n"), notes: r.notes || "", nutrition: r.nutrition || null,
      stepPhotos: r.steps.map((s) => stepPhotoIds([s]).map((id) => ({ id }))),
    });
    setStepPicking(null);
    setEditingId(r.id); importRun.current += 1; photoPickRun.current += 1; setView("form");
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
      stepPhotos: p.steps.length
        ? carryStepPhotos(stepLines(f.stepText), stepLines(p.steps.map(stepLine).join("\n")), f.stepPhotos || [])
        : f.stepPhotos,
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
    const run = ++importRun.current;
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
      /* The photo is optional: a recipe without one is still worth having. The
         page's first photo goes in straight away, and every photo it offers is
         kept beside the form so somebody can pick a better one. */
      const choices = Array.isArray(data.photos)
        ? data.photos.filter((ph) => ph && typeof ph.src === "string" && ph.src)
        : [];
      setForm((f) => ({ ...f, photoChoices: choices, photoPick: "" }));
      const src = choices[0]?.src || schemaImage(data.recipe.image, from);
      const gotPhoto = src ? (await takePagePhoto(src)) !== false : false;
      const host = new URL(from).hostname.replace(/^www\./, "");
      flash(`Filled in from ${host}${src && !gotPhoto ? " (the photo wouldn't come through)" : ""} — check it over, then add it`, 5000);
      const missing = [!p.steps.length && "steps", !p.equipment.length && "equipment"].filter(Boolean);
      if (missing.length) suggestGaps(from, run, missing);
    } catch {
      flash("Couldn't reach that page — check the link and your connection", 7000);
    } finally {
      setLinkBusy(false);
    }
  };

  /* Steps and equipment the page didn't label, suggested by Workers AI and
     checked against the page on the server. The form is already filled by the
     time this starts, so a slow or failed answer costs only the suggestion; and
     it fills only a field that is still empty, never one somebody has started
     typing in. */
  const suggestGaps = async (url, run, missing) => {
    setSuggesting(run);
    try {
      const res = await fetch("/api/fetch-recipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, kind: "fill" }), credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (run !== importRun.current) return;
      if (res.status === 501) return;                 // not switched on for this deployment: say nothing
      if (!res.ok) return flash(data.error || `Couldn't suggest the ${missing.join(" or ")} for this one`, 6000);
      const lines = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()) : []);
      const steps = missing.includes("steps") ? lines(data.steps) : [];
      const equipment = missing.includes("equipment") ? lines(data.equipment) : [];
      if (!steps.length && !equipment.length) return;
      setForm((f) => ({
        ...f,
        stepText: steps.length && !f.stepText.trim() ? steps.join("\n") : f.stepText,
        equipmentText: equipment.length && !f.equipmentText.trim() ? equipment.join("\n") : f.equipmentText,
      }));
      const what = [steps.length && "steps", equipment.length && "equipment"].filter(Boolean).join(" and ");
      flash(`Suggested the ${what} from the page — check ${steps.length ? "them" : "it"} over`, 6000);
    } catch {
      /* the recipe is already in the form; a suggestion was only ever extra */
    } finally {
      setSuggesting((s) => (s === run ? 0 : s));
    }
  };

  /* One of an imported page's photos, fetched through the importer (a browser
     may show another site's picture, but not read its pixels to shrink them)
     and shrunk like any upload. True when it went in, false when it couldn't
     be fetched or read, null when a newer choice overtook it. */
  const takePagePhoto = async (src) => {
    const run = ++photoPickRun.current;
    setPhotoChoosing(src);
    try {
      const res = await fetch("/api/fetch-recipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: src, kind: "image" }), credentials: "same-origin",
      });
      if (!res.ok) return run === photoPickRun.current ? false : null;
      const { full, thumb } = await prepPhoto(await res.blob());
      if (run !== photoPickRun.current) return null;
      setForm((f) => ({ ...f, thumb, full, photoTouched: true, photoPick: src }));
      return true;
    } catch {
      return run === photoPickRun.current ? false : null;
    } finally {
      if (run === photoPickRun.current) setPhotoChoosing("");
    }
  };

  /* ── step photos in the form ──
     Kept on the form as { id, data, from } per step, lined up with the step
     lines. data is the picture itself for one not yet saved; from is the page
     address it was picked from, so the same one isn't added to a step twice. */
  const addStepPhoto = (i, data, from) =>
    setForm((f) => {
      const lines = stepLines(f.stepText);
      if (i >= lines.length) return f;
      const all = lines.map((_, k) => f.stepPhotos?.[k] || []);
      if (all[i].length >= STEP_PHOTO_MAX || (from && all[i].some((p) => p.from === from))) return f;
      all[i] = [...all[i], { id: newStepPhotoId(), data, ...(from ? { from } : {}) }];
      return { ...f, stepPhotos: all };
    });

  const addStepUpload = async (i, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return flash("That file isn't an image");
    setStepPhotoBusy(i);
    try {
      addStepPhoto(i, await prepStepPhoto(file));
    } catch {
      flash("Couldn't read that image");
    } finally {
      setStepPhotoBusy(null);
    }
  };

  /* One of the imported page's photos, fetched through the importer for the
     same reason as the recipe photo: a browser can show it, but not read it. */
  const addStepFromPage = async (i, src) => {
    setStepPhotoBusy(i);
    try {
      const res = await fetch("/api/fetch-recipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: src, kind: "image" }), credentials: "same-origin",
      });
      if (!res.ok) throw new Error("no photo");
      addStepPhoto(i, await prepStepPhoto(await res.blob()), src);
    } catch {
      flash("That photo wouldn't come through — try another", 5000);
    } finally {
      setStepPhotoBusy(null);
    }
  };

  const removeStepPhoto = (i, id) =>
    setForm((f) => ({
      ...f,
      stepPhotos: stepLines(f.stepText).map((_, k) => {
        const list = f.stepPhotos?.[k] || [];
        return k === i ? list.filter((p) => p.id !== id) : list;
      }),
    }));

  const pickPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return flash("That file isn't an image");
    photoPickRun.current += 1;
    setPhotoChoosing("");
    setPhotoBusy(true);
    try {
      const { full, thumb } = await prepPhoto(file);
      setForm((f) => ({ ...f, thumb, full, photoTouched: true, photoPick: "" }));
    } catch {
      flash("Couldn't read that image");
    } finally {
      setPhotoBusy(false);
    }
  };

  const dropPhoto = () => {
    photoPickRun.current += 1;
    setPhotoChoosing("");
    setForm((f) => ({ ...f, thumb: "", full: null, photoTouched: true, photoPick: "" }));
  };

  const saveRecipe = () => {
    if (!form.title.trim()) return;
    /* Named field by field, because "somewhere in this recipe" is no help to
       somebody who has just written three hundred words of method. */
    const refused = [
      ["name", form.title], ["author", form.contributor], ["line about it", form.description],
      ["servings", form.servings], ["time", form.time], ["tags", form.tagText],
      ["ingredients", form.ingredientText], ["equipment", form.equipmentText],
      ["steps", form.stepText], ["notes", form.notes],
    ].find(([, text]) => hasHate(text));
    if (refused) {
      flash(`There's language this site doesn't allow in the ${refused[0]} — take it out and try again`, 8000);
      return;
    }
    importRun.current += 1;
    photoPickRun.current += 1;
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
      steps: stepLines(form.stepText).map((line, i) => {
        const step = stepParts(line);
        const ids = (form.stepPhotos?.[i] || []).slice(0, STEP_PHOTO_MAX).map((p) => p.id);
        return ids.length ? { ...step, photos: ids } : step;
      }),
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

    /* Step photos: new ones uploaded, and any the edit let go of deleted, so a
       removed picture doesn't sit in the account unreachable but still counted.
       One at a time rather than all at once, and a failure is said out loud. */
    const kept = new Set(stepPhotoIds(recipe.steps));
    const before = editingId ? stepPhotoIds(box.recipes.find((r) => r.id === editingId)?.steps) : [];
    const fresh = stepLines(form.stepText)
      .flatMap((_, i) => (form.stepPhotos?.[i] || []).slice(0, STEP_PHOTO_MAX))
      .filter((p) => p.data && kept.has(p.id));
    const dropped = before.filter((id) => !kept.has(id));
    if (fresh.length) setFreshStepPhotos((m) => ({ ...m, ...Object.fromEntries(fresh.map((p) => [p.id, p.data])) }));
    if (fresh.length || dropped.length) {
      (async () => {
        let failed = 0;
        for (const p of fresh) {
          try { await window.storage?.set(stepImageKey(p.id), p.data, true); } catch { failed += 1; }
        }
        for (const id of dropped) {
          try { await window.storage?.delete(stepImageKey(id), true); } catch { /* left behind; harmless */ }
        }
        if (failed) {
          flash(`${failed === 1 ? "A step photo" : `${failed} step photos`} didn't save — edit the recipe and add ${failed === 1 ? "it" : "them"} again`, 7000);
        }
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
      --cal-icon: none;
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
      --cal-icon: invert(1);
    }
    .rb * { box-sizing: border-box; }
    .rb ::selection { background: var(--page-accent); color: var(--on-accent); }
    .rb-focus:focus-visible { outline: 2px solid var(--page-accent); outline-offset: 3px; }
    /* !important is doing real work here: menuRow sets background inline, and
       an inline declaration beats a stylesheet rule whatever its specificity. */
    .rb [role="dialog"] > button:hover:not(:disabled) { background: var(--card-lift) !important; }
    /* A settings row is a label and its control, held apart across the full
       width. The row itself is not a button: only the control on the right is,
       so the stretch of nothing between them does nothing when clicked — and,
       unlike making the row ignore pointer events, a click there is swallowed
       here rather than passed through to whatever sits behind the menu. The
       control's negative margin buys it a comfortable target without pushing
       the row out of line with the rest of the menu. */
    .rb-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 9px 10px; font: 500 14px/1.3 ${UI}; color: var(--card-text); }
    .rb-setctl { display: inline-flex; align-items: center; gap: 8px; flex: none; background: transparent; border: 0; border-radius: 3px; padding: 7px 9px; margin: -7px -9px -7px 0; cursor: pointer; font: 500 12px/1 ${UI}; color: var(--card-muted); }
    .rb-setctl:hover:not(:disabled) { background: var(--card-lift); color: var(--card-text); }
    .rb-setctl:disabled { cursor: default; opacity: .55; }
    /* Out is quicker than in — leaving should feel decisive and arriving should
       feel settled, which is what keeps a crossfade from reading as a lag. The
       heading rises a little as it goes and comes back to rest, so the change
       has a direction rather than just blinking. */
    .rb-heading { opacity: 1; transform: none; transition: opacity 210ms cubic-bezier(.2,.7,.3,1), transform 210ms cubic-bezier(.2,.7,.3,1); }
    .rb-heading.is-settling { opacity: 0; transform: translateY(-5px); transition-duration: 130ms; }
    @media (prefers-reduced-motion: reduce) { .rb-heading, .rb-heading.is-settling { transition: none; opacity: 1; transform: none; } }    /* Notes are a conversation, so they sit apart from the recipe rather than
       inside its two columns. A "made it" entry has no words of its own, so it
       gets the accent rule to mark it as an event rather than a remark. */
    .rb-family { margin-top: 38px; padding-top: 26px; border-top: 1px solid var(--card-edge); }
    /* The family talking to each other — notes, replies, Lately and the messenger — is set in Nunito Sans, apart from the recipe itself. */
    .rb-family .rb-btn, .rb-messenger .rb-btn { font-family: ${SOCIAL}; }
    .rb-entry { padding-left: 13px; border-left: 2px solid var(--card-edge); }
    .rb-entry-made { border-left-color: var(--card-accent); }
    .rb-entry-who { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; margin: 0; font: 500 12.5px/1.4 ${SOCIAL}; color: var(--card-muted); }
    .rb-entry-who > .rb-entry-name { color: var(--card-text); font-weight: 600; }
    .rb-entry-text { margin: 5px 0 0; font: 400 15px/1.7 ${SOCIAL}; color: var(--card-text); white-space: pre-wrap; }
    /* The photos an imported page offers: a row that scrolls rather than wraps,
       so a dozen of them never push the rest of the form down the page. */
    .rb-photo-choices { display: flex; gap: 8px; overflow-x: auto; padding: 3px 3px 8px; }
    .rb-photo-choice { flex: 0 0 auto; width: 96px; height: 72px; padding: 0; border: 1px solid var(--card-edge); border-radius: 2px; background: var(--card-lift); cursor: pointer; overflow: hidden; }
    .rb-photo-choice img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .rb-photo-choice[aria-pressed="true"] { border-color: var(--card-accent); box-shadow: 0 0 0 2px var(--card-accent); }
    .rb-photo-choice:disabled { cursor: progress; opacity: .55; }
    .rb-entry-x { background: none; border: 0; padding: 0; cursor: pointer; font: 500 12px/1.4 ${SOCIAL}; color: var(--card-accent); text-decoration: underline; text-underline-offset: 2px; }
    .rb-entry-x:disabled { cursor: default; opacity: .5; }
    /* Replies sit inside the entry they answer, so the entry's own left rule
       runs down beside them as the thread line. Each level steps in a little;
       past REPLY_INDENTS the step is taken back out, cancelling the entry's
       padding and rule, so a long exchange never runs off a phone. */
    .rb-entry-actions { display: flex; gap: 14px; margin-top: 6px; }
    .rb-replies { list-style: none; margin: 12px 0 0; padding: 0 0 0 10px; display: flex; flex-direction: column; gap: 12px; }
    .rb-replies-flat { padding-left: 0; margin-left: -15px; }
    .rb-entry-gone { border-left-style: dashed; }
    .rb-entry-who > .rb-entry-removed { font-weight: 500; font-style: italic; color: var(--card-muted); }
    .rb-reply-box { margin-top: 10px; max-width: 540px; }
    /* The note somebody arrived at from Lately, lit for a moment. Only its own
       lines are lit, not the replies nested inside it, so the eye lands on the
       note and the reply rather than on the whole thread. */
    .rb-entry-flash { border-left-color: var(--card-accent); }
    .rb-entry-flash > .rb-entry-who, .rb-entry-flash > .rb-entry-text { animation: rb-note-flash 2.6s ease-out; }
    @keyframes rb-note-flash {
      0%, 40% { background: color-mix(in srgb, var(--card-accent) 18%, transparent); }
      100% { background: transparent; }
    }
    @media (prefers-reduced-motion: reduce) {
      .rb-entry-flash > .rb-entry-who, .rb-entry-flash > .rb-entry-text { animation: none; background: color-mix(in srgb, var(--card-accent) 14%, transparent); }
    }
    /* Something you can catch from the other side of the room without it
       covering what you are reading: a band of the theme's accent around the
       edge of the window, breathing rather than blinking.

       The rate matters. Anything at or above three flashes a second is a
       seizure risk, so this cycle is 1.6s — under one a second — and swings
       between faint and firm rather than between nothing and full. Somebody
       who has asked for less movement gets it held steady instead, which is
       just as visible and does not move at all. */
    .rb-flash { position: fixed; inset: 0; z-index: 60; pointer-events: none; box-shadow: inset 0 0 0 7px var(--page-accent); animation: rb-pulse 1.6s ease-in-out infinite; }
    @keyframes rb-pulse { 0%, 100% { opacity: .18; } 50% { opacity: .9; } }
    .rb-chip-done { animation: rb-chip 1.6s ease-in-out infinite; }
    /* Timers: a small stack in the top right corner, above everything but
       out of the messenger's way. Only as wide as a clock and two buttons. */
    .rb-timers { position: fixed; top: 12px; right: 12px; z-index: 70; width: 250px; display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 72px); overflow-y: auto; }
    .rb-timer { padding: 7px 10px 6px; border: 1px solid rgba(var(--on-page), calc(.24 * var(--ink-k))); border-radius: 8px; background: rgba(var(--deep-rgb), .96); box-shadow: 0 12px 30px -14px rgba(0, 0, 0, .6); }
    .rb-timer.is-done { border-color: var(--page-accent); background: linear-gradient(rgba(var(--accent-rgb), .16), rgba(var(--accent-rgb), .16)), rgba(var(--deep-rgb), .96); }
    .rb-timer-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .rb-timer-clock { font-size: 22px; line-height: 1.15; color: rgb(var(--on-page)); }
    .rb-timer.is-done .rb-timer-clock { color: var(--page-accent); }
    .rb-timer-btns { display: inline-flex; gap: 6px; }
    .rb-timer-label { margin: 2px 0 0; font: 400 12px/1.35 ${UI}; color: rgba(var(--on-page), calc(.7 * var(--ink-k))); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    @keyframes rb-chip { 0%, 100% { border-color: var(--page-accent); } 50% { border-color: rgba(var(--accent-rgb), .35); } }
    @media (prefers-reduced-motion: reduce) {
      .rb-flash { animation: none; opacity: .7; }
      .rb-chip-done { animation: none; }
    }    /* The newest thing said gets the room; the ones under it are a list you
       skim. Both are one button each, because the useful thing to do with any
       of them is open the recipe they are about. */
    .rb-lately { margin-top: 54px; padding-top: 26px; border-top: 1px solid rgba(var(--on-page), calc(.16 * var(--ink-k))); }
    .rb-lately-open { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 11px 0; cursor: pointer; border-bottom: 1px solid rgba(var(--on-page), calc(.1 * var(--ink-k))); }
    .rb-lately-open:disabled { cursor: default; opacity: .6; }
    .rb-lately-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font: 400 12.5px/1.5 ${SOCIAL}; color: rgba(var(--on-page), calc(.6 * var(--ink-k))); }
    .rb-lately-name { font-weight: 600; color: rgb(var(--on-page)); }
    .rb-lately-what { color: var(--page-accent); font-weight: 600; }
    /* whose note a reply answers: styled as the link it is, since tapping the
       row lands on that note */
    .rb-lately-to { color: var(--page-accent); text-decoration: underline; text-underline-offset: 2px; }
    .rb-lately-text { display: block; margin-top: 5px; font: 400 14.5px/1.65 ${SOCIAL}; color: rgba(var(--on-page), calc(.88 * var(--ink-k))); }
    /* The feed's own copy of a photograph. Tapping it opens the recipe rather
       than the picture: the row is one target, and somebody who has just seen
       what it looked like wants the thing that made it. */
    .rb-lately-shot { display: block; margin-top: 8px; line-height: 0; }
    .rb-lately-shot img {
      display: block; width: 100%; max-width: 200px; height: auto; border-radius: 2px;
      border: 1px solid rgba(var(--on-page), calc(.16 * var(--ink-k)));
    }
    .rb-lately-lead .rb-lately-shot img { max-width: 320px; }
    .rb-lately-lead .rb-lately-text { font-size: 17px; line-height: 1.7; }
    .rb-lately-lead .rb-lately-open { padding-top: 0; padding-bottom: 16px; }
    .rb-lately-open:hover .rb-lately-what { text-decoration: underline; text-underline-offset: 2px; }    /* The day's tally: four figures across the top, each with how far through
       its target the day has got. Over the target turns the bar, rather than
       letting it run past the end where it would say nothing. */
    /* A photograph on a made-it. Shown at a size the page can spare, opening to
       whatever the picture really is.

       NOT .rb-shot: that is already the photo frame on a recipe tile, further
       down this stylesheet, and naming this the same thing leaked a 220px
       max-width onto every tile in the box — which is how the grid on a phone
       ended up half the width of its column. */
    .rb-madeshot {
      display: block; margin: 9px 0 0; padding: 0; border: 1px solid var(--card-edge);
      border-radius: 2px; background: var(--card-bg); cursor: zoom-in; overflow: hidden; line-height: 0;
      max-width: 220px;
    }
    .rb-madeshot:disabled { cursor: default; }
    .rb-madeshot img { display: block; width: 100%; height: auto; }
    .rb-madeshot:hover:not(:disabled) { border-color: var(--card-accent); }

    .rb-shotpick { display: flex; gap: 12px; align-items: flex-start; margin-top: 12px; }
    .rb-shotpick img { width: 92px; height: 92px; object-fit: cover; border: 1px solid var(--card-edge); border-radius: 2px; }
    .rb-shotpick-note { margin: 0 0 8px; font: 400 12.5px/1.5 ${UI}; color: var(--card-muted); }
    /* Sized to its own words. A label that stretches turns the gap beside it
       into a file picker, which is the bug the recipe photo button already had. */
    .rb-shotbtn { display: inline-flex; align-items: center; width: auto; flex: none; }

    .rb-lightbox {
      position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px; padding: 24px;
      background: rgba(10, 10, 12, .92); cursor: zoom-out;
    }
    .rb-lightbox img {
      max-width: min(100%, 1200px); max-height: calc(100vh - 120px);
      object-fit: contain; cursor: default; border-radius: 2px;
    }
    .rb-lightbox-who { margin: 0; font: 400 13px/1.5 ${UI}; color: rgba(255, 255, 255, .8); }
    .rb-lightbox-x {
      position: absolute; top: 14px; right: 16px; width: 40px; height: 40px;
      border: 1px solid rgba(255, 255, 255, .3); border-radius: 2px; background: transparent;
      color: #fff; font: 400 22px/1 ${UI}; cursor: pointer;
    }
    .rb-lightbox-x:hover { border-color: #fff; }

    /* Step photos: a row under a step on the recipe, larger in cooking mode,
       and a row for each step in the form where they are added. */
    /* The row spans the step's text, one equal column per photo, so two photos
       share the width rather than sitting small at its start. One photo on its
       own is kept wide and short, or it would stand taller than the step. */
    .rb-stepshots { display: grid; gap: 10px; margin-top: 14px; }
    .rb-stepshot { display: block; width: 100%; padding: 0; border: 1px solid var(--card-edge); border-radius: 2px; background: var(--card-lift); cursor: zoom-in; line-height: 0; overflow: hidden; }
    .rb-stepshot img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }
    .rb-stepshots[data-count="1"] .rb-stepshot img { aspect-ratio: 16 / 9; }
    .rb-stepshots[data-count="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rb-stepshots[data-count="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    /* Three across a phone is three thumbnails. There, the first takes the
       width and the other two share the row beneath it. */
    @media (max-width: 560px) {
      .rb-stepshots[data-count="3"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .rb-stepshots[data-count="3"] .rb-stepshot:first-child { grid-column: 1 / -1; }
      .rb-stepshots[data-count="3"] .rb-stepshot:first-child img { aspect-ratio: 16 / 9; }
    }
    .rb-cookshots { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    .rb-cookshot { padding: 0; border: 0; border-radius: 3px; background: rgba(0, 0, 0, .18); cursor: zoom-in; line-height: 0; overflow: hidden; }
    .rb-cookshot img { display: block; height: clamp(120px, 26vh, 240px); width: auto; max-width: 100%; object-fit: cover; }
    .rb-stepphoto-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .rb-stepphoto-row { padding-bottom: 12px; border-bottom: 1px solid var(--card-edge); }
    .rb-stepphoto-step { display: flex; gap: 8px; margin: 0 0 8px; font: 400 13.5px/1.5 ${UI}; color: var(--card-text); }
    .rb-stepphoto-step .rb-num { flex: none; color: var(--card-accent); }
    .rb-stepphoto-items { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .rb-stepphoto-item { position: relative; width: 84px; height: 63px; border: 1px solid var(--card-edge); border-radius: 2px; overflow: hidden; background: var(--card-lift); }
    .rb-stepphoto-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .rb-stepphoto-x { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .62); color: #fff; font: 600 14px/22px ${UI}; cursor: pointer; }
    .rb-stepphoto-full { font: 400 12.5px/1.4 ${UI}; color: var(--card-muted); }
    .rb-stepphoto-row .rb-photo-choices { margin-top: 10px; }

    /* Messages: who on the left, the conversation on the right, and one column
       on a phone, where a list beside a thread would be two half-widths of
       nothing. */
    .rb-chat { display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 760px) { .rb-chat { grid-template-columns: 230px minmax(0, 1fr); gap: 30px; } }
    .rb-chat-side { min-width: 0; }
    .rb-chat-heading { margin: 18px 0 6px; font: 600 9.5px/1 ${SOCIAL}; letter-spacing: .12em; text-transform: uppercase; color: var(--card-muted); }
    .rb-chat-list { list-style: none; margin: 0; padding: 0; }
    .rb-chat-person { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--card-edge); padding: 10px 2px; cursor: pointer; }
    .rb-chat-person.is-open { box-shadow: inset 3px 0 0 var(--card-accent); }
    .rb-chat-who { display: flex; align-items: baseline; gap: 8px; font: 600 14px/1.3 ${SOCIAL}; color: var(--card-text); }
    .rb-chat-unread { flex: none; min-width: 18px; padding: 1px 6px; border-radius: 999px; background: var(--card-accent); color: var(--on-accent); font: 600 11px/1.5 ${SOCIAL}; text-align: center; }
    .rb-chat-last { display: block; margin-top: 3px; font: 400 12.5px/1.45 ${SOCIAL}; color: var(--card-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rb-chat-blocked { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--card-edge); font: 400 13.5px/1.4 ${SOCIAL}; color: var(--card-muted); }
    .rb-chat-main { min-width: 0; display: flex; flex-direction: column; }
    .rb-chat-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--card-edge); }
    .rb-chat-name { font: 400 19px/1.2 ${SOCIAL}; color: var(--card-text); }
    .rb-chat-empty { font: 400 14px/1.6 ${SOCIAL}; color: var(--card-muted); margin: 0; }
    .rb-chat-thread { list-style: none; margin: 0; padding: 14px 0 0; display: flex; flex-direction: column; gap: 12px; max-height: 52vh; overflow-y: auto; }
    .rb-msg { max-width: min(78%, 520px); padding: 9px 12px; border: 1px solid var(--card-edge); border-radius: 3px; background: var(--card-lift); }
    .rb-msg.is-mine { margin-left: auto; border-color: var(--card-accent); }
    .rb-msg-text { margin: 0; font: 400 15px/1.65 ${SOCIAL}; color: var(--card-text); white-space: pre-wrap; }
    .rb-msg-gone { font-style: italic; color: var(--card-muted); }
    .rb-msg-when { display: flex; align-items: baseline; gap: 10px; margin: 5px 0 0; font: 400 11.5px/1.4 ${SOCIAL}; color: var(--card-muted); }
    .rb-chat-compose { display: flex; gap: 10px; align-items: flex-end; margin-top: 14px; }

    /* The messenger docks along the bottom of every page, the way Facebook's
       chat does: the friends list in the corner, each open conversation
       beside it, newest nearest, and a minimised one only its title bar. The
       dock itself lets clicks through, so the page between windows still
       works. Under cooking mode's z-index on purpose, and out of print. */
    .rb-messenger { position: fixed; right: 16px; bottom: 0; z-index: 55; display: flex; flex-direction: row-reverse; align-items: flex-end; gap: 10px; max-width: calc(100vw - 16px); pointer-events: none; }
    .rb-messenger > * { pointer-events: auto; }
    .rb-dock-list { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .rb-messenger-open { display: inline-flex; align-items: center; gap: 8px; width: 240px; box-sizing: border-box; border: 1px solid var(--card-edge); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--card-bg); color: var(--card-text); padding: 12px 14px; font: 600 13.5px/1 ${SOCIAL}; cursor: pointer; box-shadow: 0 -6px 22px -14px rgba(0, 0, 0, .55); }
    .rb-messenger-open:hover { background: var(--card-lift); }
    .rb-messenger-count { margin-left: auto; min-width: 18px; padding: 1px 6px; border-radius: 999px; background: var(--card-accent); color: var(--on-accent); font: 600 11px/1.5 ${SOCIAL}; text-align: center; }
    /* A name waiting to be read, flashing on and off every two seconds — a
       step rather than a fade, so it reads as a light rather than a throb. */
    .rb-messenger-chips { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .rb-messenger-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--card-accent); border-radius: 999px; padding: 4px 13px 4px 4px; font: 600 12.5px/1 ${SOCIAL}; cursor: pointer; box-shadow: 0 8px 20px -12px rgba(0, 0, 0, .5); animation: rb-chip-waiting 2s steps(1, end) infinite; }
    @keyframes rb-chip-waiting {
      0%, 49.9% { background: var(--card-accent); color: var(--on-accent); }
      50%, 100% { background: var(--card-bg); color: var(--card-text); }
    }
    @media (prefers-reduced-motion: reduce) {
      .rb-messenger-chip { animation: none; background: var(--card-accent); color: var(--on-accent); }
      .rb-chatwin.is-min.has-unread .rb-chatwin-head { animation: none; background: var(--card-accent); color: var(--on-accent); }
    }
    .rb-messenger-panel { width: 280px; height: min(72vh, 480px); display: flex; flex-direction: column; box-sizing: border-box; border: 1px solid var(--card-edge); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--card-bg); box-shadow: 0 -8px 30px -16px rgba(0, 0, 0, .6); overflow: hidden; }
    .rb-messenger-head { display: flex; align-items: center; gap: 2px; padding: 5px 5px 5px 4px; border-bottom: 1px solid var(--card-edge); background: var(--card-lift); color: var(--card-text); }
    .rb-messenger-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; font: 600 13.5px/1.3 ${SOCIAL}; color: inherit; }
    .rb-messenger-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 12px 10px; }
    .rb-messenger-error { margin: 10px 0 0; font: 400 12.5px/1.5 ${SOCIAL}; color: var(--card-danger); }

    /* One chat window. Its title bar minimises it, as the _ beside it does. */
    .rb-chatwin { flex: none; width: 310px; height: min(72vh, 440px); display: flex; flex-direction: column; box-sizing: border-box; border: 1px solid var(--card-edge); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--card-bg); box-shadow: 0 -8px 30px -16px rgba(0, 0, 0, .6); overflow: hidden; }
    .rb-chatwin.is-min { flex: 0 1 200px; width: 200px; min-width: 58px; height: auto; }
    .rb-chatwin-head { display: flex; align-items: center; gap: 2px; padding: 5px 5px 5px 4px; background: var(--card-lift); border-bottom: 1px solid var(--card-edge); color: var(--card-text); }
    .rb-chatwin.is-min .rb-chatwin-head { border-bottom: 0; }
    /* a minimised chat with something unread in it flashes, like a name waiting */
    .rb-chatwin.is-min.has-unread .rb-chatwin-head { animation: rb-chip-waiting 2s steps(1, end) infinite; }
    .rb-chatwin-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; background: none; border: 0; border-radius: 6px; padding: 4px 6px; cursor: pointer; text-align: left; color: inherit; font: 600 13.5px/1.25 ${SOCIAL}; }
    .rb-chatwin-title:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
    .rb-chatwin-lines { min-width: 0; display: flex; flex-direction: column; }
    .rb-chatwin-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; }
    .rb-chatwin-lines .rb-chat-seen { margin-top: 1px; font-size: 11px; }
    .rb-person-wrap { position: relative; flex: 1; min-width: 0; display: flex; }
    .rb-chatwin-nameline { min-width: 0; display: flex; align-items: center; gap: 5px; }
    .rb-chatwin-caret { flex: none; font-size: 10px; opacity: .7; }
    .rb-person-menu { position: absolute; left: 2px; top: calc(100% + 4px); z-index: 3; min-width: 170px; padding: 4px; border: 1px solid var(--card-edge); border-radius: 8px; background: var(--card-bg); box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .55); }
    .rb-person-menu button { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 5px; background: none; text-align: left; cursor: pointer; color: var(--card-text); font: 500 13.5px/1.3 ${SOCIAL}; }
    .rb-person-menu button:hover, .rb-person-menu button:focus-visible { background: var(--card-lift); outline: none; }
    .rb-chatwin-ctl { flex: none; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; border-radius: 50%; cursor: pointer; color: inherit; opacity: .7; font: 600 18px/1 ${SOCIAL}; }
    .rb-chatwin-ctl:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
    /* an underscore sits on the baseline; lifted, it reads as a minimise bar */
    .rb-chatwin-ctl.is-minimise > span { transform: translateY(-5px); }
    .rb-chatwin-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; }
    .rb-chatwin-body .rb-chat-thread { max-height: none; padding-top: 0; gap: 8px; }
    .rb-chatwin .rb-msg { padding: 7px 10px; }
    .rb-chatwin .rb-msg-text { font-size: 14px; line-height: 1.5; }
    .rb-chatwin-compose { display: flex; flex-direction: column; gap: 7px; padding: 8px 10px 10px; border-top: 1px solid var(--card-edge); }
    .rb-chatwin-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .rb-chatwin-tools { display: inline-flex; align-items: center; gap: 6px; }
    .rb-chatwin-ctl:disabled { cursor: default; opacity: .35; }
    /* Attachments: a photo as itself, a file as a card to download, and one
       waiting to be sent shown above the box. */
    .rb-chatwin .rb-msg.has-photo { padding: 4px; }
    .rb-chatwin .rb-msg.has-photo > .rb-msg-text, .rb-chatwin .rb-msg.has-photo > .rb-msg-when { padding: 0 6px; }
    .rb-chatwin .rb-msg.has-photo > .rb-msg-when { padding-bottom: 3px; }
    .rb-msg-photo { display: block; padding: 0; border: 0; background: none; cursor: zoom-in; line-height: 0; border-radius: 2px; overflow: hidden; }
    .rb-msg-photo img { display: block; max-width: 100%; max-height: 240px; width: auto; height: auto; object-fit: contain; }
    .rb-msg-photo + .rb-msg-text { margin-top: 6px; }
    .rb-msg-file { display: flex; align-items: center; gap: 9px; margin: 0 0 6px; padding: 7px 9px; border: 1px solid var(--card-edge); border-radius: 3px; background: var(--card-bg); color: var(--card-text); text-decoration: none; }
    .rb-msg-file:hover { border-color: var(--card-accent); }
    .rb-msg-file-name { min-width: 0; display: flex; flex-direction: column; font: 600 13px/1.3 ${SOCIAL}; overflow-wrap: anywhere; }
    .rb-msg-file-name > span { font: 400 11.5px/1.3 ${SOCIAL}; color: var(--card-muted); }
    .rb-chat-fileicon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: var(--card-lift); color: var(--card-accent); }
    .rb-chat-pending { display: flex; align-items: center; gap: 9px; padding: 5px 3px 5px 5px; border: 1px dashed var(--card-edge); border-radius: 4px; color: var(--card-text); }
    .rb-chat-pending img { flex: none; width: 40px; height: 40px; object-fit: cover; border-radius: 3px; }
    .rb-chat-pending-name { flex: 1; min-width: 0; display: flex; flex-direction: column; font: 600 12.5px/1.3 ${SOCIAL}; overflow-wrap: anywhere; }
    .rb-chat-pending-name > span { font: 400 11px/1.3 ${SOCIAL}; color: var(--card-muted); }
    /* A message that is only an emoji or three is shown large, without a
       bubble, as messengers do. */
    .rb-chatwin .rb-msg.is-emoji { padding: 0 2px; border-color: transparent; background: transparent; }
    .rb-chatwin .rb-msg.is-emoji > .rb-msg-text { font-size: 34px; line-height: 1.15; }
    /* The quick emoji beside Send, and the small menu that a press and hold
       opens above it. The button can't be selected or called up as a
       phone's own long-press menu, or holding it would do that instead. */
    .rb-chatwin-send { display: inline-flex; align-items: center; gap: 6px; }
    .rb-emoji-wrap { position: relative; display: inline-flex; }
    .rb-emoji-btn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; font-size: 21px; line-height: 1; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; transition: transform 120ms ease; }
    .rb-emoji-btn:hover:not(:disabled) { transform: scale(1.12); background: color-mix(in srgb, var(--card-text) 8%, transparent); }
    .rb-emoji-btn:active:not(:disabled) { transform: scale(.92); }
    .rb-emoji-btn:disabled { cursor: default; opacity: .4; }
    .rb-emoji-menu { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 2; display: grid; grid-template-columns: repeat(4, 38px); gap: 2px; padding: 6px; border: 1px solid var(--card-edge); border-radius: 12px; background: var(--card-bg); box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .55); }
    .rb-emoji-menu button { width: 38px; height: 38px; padding: 0; border: 0; border-radius: 8px; background: none; cursor: pointer; font-size: 22px; line-height: 1; }
    .rb-emoji-menu button:hover, .rb-emoji-menu button:focus-visible { background: var(--card-lift); outline: none; }
    .rb-emoji-menu button[aria-checked="true"] { background: color-mix(in srgb, var(--card-accent) 24%, transparent); }
    .rb-msg.has-love { position: relative; margin-bottom: 10px; }
    .rb-love-badge { position: absolute; right: -5px; bottom: -11px; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid var(--card-edge); border-radius: 50%; background: var(--card-bg); font-size: 11.5px; line-height: 1; box-shadow: 0 2px 6px -3px rgba(0, 0, 0, .5); }
    .rb-packs-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 0 0 18px; }
    .rb-packs-where { display: inline-flex; align-items: center; gap: 8px; font: 500 13px/1.3 ${UI}; color: var(--card-muted); }
    .rb-packs-note { flex-basis: 100%; margin: 0; font: 400 12.5px/1.5 ${UI}; color: var(--card-muted); }
    .rb-pack-line { display: block; font: 500 13px/1.5 ${UI}; color: var(--card-accent); }
    .rb-pack-est { font-weight: 400; color: var(--card-muted); }
    .rb-love-line { margin: 5px 0 0; font: 500 12.5px/1.4 ${SOCIAL}; color: var(--card-muted); }
    .rb-entry-actions .rb-entry-x + .rb-entry-x { margin-left: 14px; }
    .rb-gif-btn { width: auto; padding: 0 7px; border-radius: 6px; font: 700 11.5px/1 ${SOCIAL}; letter-spacing: .06em; }
    .rb-gif-panel { display: flex; flex-direction: column; gap: 6px; }
    .rb-gif-search { display: flex; align-items: center; gap: 4px; }
    .rb-gif-grid { height: min(150px, 28vh); overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 92px; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .rb-gif-grid button { display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 4px; overflow: hidden; background: var(--card-lift); cursor: pointer; }
    .rb-gif-grid button:disabled { cursor: default; opacity: .5; }
    .rb-gif-grid img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .rb-gif-note { margin: 0; padding: 12px 4px; font: 400 12.5px/1.45 ${SOCIAL}; color: var(--card-muted); }
    .rb-gif-credit { margin: 0; text-align: right; font: 600 10.5px/1.2 ${SOCIAL}; letter-spacing: .04em; color: var(--card-muted); }
    .rb-emoji-hint { grid-column: 1 / -1; margin: 2px 4px 4px; font: 600 10.5px/1.2 ${SOCIAL}; letter-spacing: .04em; color: var(--card-muted); }
    @media (prefers-reduced-motion: reduce) { .rb-emoji-btn { transition: none; } .rb-emoji-btn:hover:not(:disabled), .rb-emoji-btn:active:not(:disabled) { transform: none; } }
    /* On a phone an open chat takes the width of the screen above the dock,
       and a minimised one gives up its name and keeps its face. */
    @media (max-width: 699px) {
      .rb-messenger { right: 8px; gap: 6px; }
      .rb-messenger-open { width: auto; }
      .rb-messenger-panel { width: min(92vw, 340px); }
      .rb-chatwin:not(.is-min) { position: fixed; left: 8px; right: 8px; bottom: 50px; width: auto; height: min(70vh, 460px); border-bottom: 1px solid var(--card-edge); border-radius: 8px; }
      .rb-chatwin.is-min { flex: 0 0 auto; width: auto; min-width: 0; }
      .rb-chatwin.is-min .rb-chatwin-name, .rb-chatwin.is-min .rb-chatwin-ctl { display: none; }
    }
    /* The light: lit for somebody who has used the site in the last five
       minutes, and unlit rather than red for somebody who has not — they are
       not away, they are simply not here. */
    .rb-chat-light { flex: none; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: transparent; border: 1px solid var(--card-edge); }
    .rb-chat-light.is-on { background: #3FA45B; border-color: #2F8247; box-shadow: 0 0 0 2px rgba(63, 164, 91, .2); }
    .rb-chat-seen { display: block; margin-top: 2px; font: 400 11.5px/1.4 ${SOCIAL}; color: var(--card-muted); }
    .rb-chat-name .rb-chat-light { margin-right: 8px; }
    .rb-chat-name .rb-chat-seen { font-size: 11.5px; }

    /* A face: the picture somebody chose, or their initials on a wash of the
       accent when they haven't. Sized by --face, set where it is used, so one
       rule serves the menu, the messenger, notes and Lately. */
    .rb-face { --face: 28px; flex: none; align-self: center; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: var(--face); height: var(--face); border-radius: 50%; object-fit: cover; overflow: hidden; border: 1px solid var(--card-edge); background: var(--card-lift); }
    .rb-face-blank { background: color-mix(in srgb, var(--card-accent) 24%, var(--card-bg)); color: var(--card-text); font: 700 calc(var(--face) * .38)/1 ${SOCIAL}; letter-spacing: .02em; }
    .rb-lately .rb-face { border-color: rgba(var(--on-page), calc(.2 * var(--ink-k))); }
    .rb-lately .rb-face-blank { background: rgba(var(--on-page), calc(.12 * var(--ink-k))); color: rgb(var(--on-page)); }
    /* where a face would be, in a run of messages that shows it only on the last */
    .rb-face-gap { flex: none; width: 24px; }
    /* The online light, moved onto the corner of the face. Unlit is a ring
       rather than nothing, so the corner never looks like a missing piece. */
    .rb-face-wrap { position: relative; flex: none; display: inline-flex; }
    .rb-face-wrap > .rb-chat-light { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; box-sizing: border-box; border: 2px solid var(--card-bg); }
    .rb-face-wrap > .rb-chat-light:not(.is-on) { background: var(--card-bg); box-shadow: inset 0 0 0 1.5px var(--card-muted); }
    .rb-chat-lines { flex: 1; min-width: 0; }
    .rb-msg-row { display: flex; align-items: flex-end; gap: 7px; }
    .rb-msg-row.is-mine { justify-content: flex-end; }
    .rb-profile { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6px 8px 4px; }
    .rb-profile-name { margin: 10px 0 12px; font: 600 15px/1.3 ${SOCIAL}; color: var(--card-text); }
    .rb-profile-actions { display: flex; align-items: center; gap: 14px; }
    .rb-profile-note { margin: 12px 0 0; font: 400 12px/1.5 ${SOCIAL}; color: var(--card-muted); }
    .rb-profile-error { margin: 10px 0 0; font: 400 12.5px/1.5 ${SOCIAL}; color: var(--card-danger); }

    /* The week. Seven columns where there is room, and a single column of days
       on a phone — a 7-wide grid on a 375px screen gives each day 40 pixels,
       which is not a column, it is a stripe. */
    .rb-week { display: grid; gap: 10px; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    @media (max-width: 900px) { .rb-week { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .rb-weekday {
      display: flex; flex-direction: column; min-width: 0;
      border: 1px solid var(--card-edge); border-radius: 2px; background: var(--card-bg);
    }
    .rb-weekday.is-today { border-color: var(--card-accent); }
    .rb-weekday-head {
      display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
      padding: 9px 10px 7px; border-bottom: 1px solid var(--card-edge);
    }
    .rb-weekday-name { font: 600 9.5px/1 ${UI}; letter-spacing: .12em; text-transform: uppercase; color: var(--card-muted); }
    .rb-weekday.is-today .rb-weekday-name { color: var(--card-accent); }
    .rb-weekday-num { font: 400 15px/1 ${DISPLAY}; color: var(--card-text); }
    .rb-weekday-body { flex: 1; padding: 8px 10px; display: flex; flex-direction: column; gap: 10px; min-height: 64px; }
    .rb-weekday-empty { margin: 0; font: 400 12px/1.5 ${UI}; color: var(--card-muted); opacity: .7; }
    .rb-weekday-add {
      margin: 0 8px 8px; padding: 6px 8px; border: 1px dashed var(--card-edge); border-radius: 2px;
      background: transparent; color: var(--card-muted); font: 600 11.5px/1 ${UI}; cursor: pointer;
    }
    .rb-weekday-add:hover { border-color: var(--card-accent); color: var(--card-accent); border-style: solid; }

    .rb-planmeal { display: flex; flex-direction: column; gap: 4px; }
    .rb-planmeal-label { margin: 0; font: 600 9px/1 ${UI}; letter-spacing: .11em; text-transform: uppercase; color: var(--card-muted); }
    .rb-planitem { display: flex; align-items: flex-start; gap: 4px; }
    .rb-planitem-name {
      flex: 1; min-width: 0; text-align: left; background: transparent; border: none; padding: 2px 0;
      color: var(--card-text); font: 400 13px/1.35 ${UI}; cursor: pointer;
    }
    .rb-planitem-name:disabled { color: var(--card-muted); cursor: default; font-style: italic; }
    .rb-planitem-name:hover:not(:disabled) { color: var(--card-accent); }
    .rb-planitem-serves { display: block; font: 400 11px/1.4 ${UI}; color: var(--card-muted); }
    .rb-planitem-off {
      flex: none; background: transparent; border: none; padding: 0 2px; line-height: 1;
      color: var(--card-muted); font-size: 15px; cursor: pointer;
    }
    .rb-planitem-off:hover { color: var(--card-danger); }

    .rb-planadd { padding: 0 8px 10px; display: flex; flex-direction: column; gap: 7px; }
    .rb-planadd-meals { display: flex; flex-wrap: wrap; gap: 4px; }
    .rb-planadd-meal {
      border: 1px solid var(--card-edge); border-radius: 999px; background: transparent;
      padding: 4px 9px; color: var(--card-muted); font: 600 10.5px/1 ${UI}; cursor: pointer;
    }
    .rb-planadd-meal.is-on { border-color: var(--card-accent); color: var(--card-accent); }
    .rb-planadd-pick, .rb-planadd-serves input {
      width: 100%; box-sizing: border-box; border: 1px solid var(--card-edge); border-radius: 2px;
      background: var(--card-bg); color: var(--card-text); font: 400 12.5px/1.4 ${UI}; padding: 6px 7px;
    }
    .rb-planadd-row { display: flex; align-items: flex-end; gap: 6px; }
    .rb-planadd-serves { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .rb-planadd-serves span { font: 600 9px/1 ${UI}; letter-spacing: .11em; text-transform: uppercase; color: var(--card-muted); }

    /* One day per row on a phone. The min-height that gives a column some body
       on a wide screen just makes seven tall empty boxes to scroll past here,
       so an untouched day shrinks to its own height. */
    @media (max-width: 560px) {
      .rb-week { grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .rb-weekday-body { min-height: 0; padding: 7px 10px; }
      .rb-weekday-head { padding: 7px 10px 6px; }
    }

    .rb-daybar-sub { margin: 0; font: 400 12.5px/1.4 ${UI}; color: var(--card-muted); }

    /* The day picker. Arrows either side of the date so a thumb can walk back
       through the week without aiming, and the calendar underneath for the jump
       somebody has in mind. */
    .rb-daybar { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; margin: 0 0 20px; }
    /* The arrows belong either side of the date, on every width. Left to wrap
       on its own, the forward one lands on the next line looking like a control
       for something else entirely. */
    .rb-daynav { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .rb-daystep {
      flex: none; width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--card-edge); border-radius: 2px; background: var(--card-bg);
      color: var(--card-text); font: 400 16px/1 ${UI}; cursor: pointer;
    }
    .rb-daystep:hover:not(:disabled) { border-color: var(--card-accent); color: var(--card-accent); }
    .rb-daystep:disabled { opacity: .35; cursor: default; }
    .rb-daybar-when { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rb-daybar-name { margin: 0; font: 400 19px/1.2 ${DISPLAY}; color: var(--card-text); }
    .rb-daybar-date {
      border: none; background: transparent; padding: 0; color: var(--card-muted);
      font: 400 12.5px/1.4 ${UI}; cursor: pointer; max-width: 100%;
    }
    /* Chromium hands the whole field a picker cursor but only the icon opens it;
       colouring the icon to match the text keeps it legible in dark mode, where
       the default is a black glyph on a dark ground. */
    .rb-daybar-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: .65; filter: var(--cal-icon); }
    .rb-daybar-date:hover { color: var(--card-accent); }
    .rb-dayback {
      margin-left: auto; background: transparent; border: none; padding: 6px 0;
      white-space: nowrap;
      color: var(--card-accent); font: 600 13px/1 ${UI}; cursor: pointer;
    }
    .rb-tally { display: grid; gap: 1px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); background: var(--card-edge); border: 1px solid var(--card-edge); border-radius: 2px; overflow: hidden; }
    .rb-tally-cell { background: var(--card-bg); padding: 12px 14px; }
    .rb-tally-label { font: 600 9.5px/1 ${UI}; letter-spacing: .12em; text-transform: uppercase; color: var(--card-muted); margin: 0 0 6px; }
    .rb-tally-value { font: 400 20px/1 ${DISPLAY}; color: var(--card-text); margin: 0; }
    .rb-tally-of { font: 400 12px/1 ${UI}; color: var(--card-muted); }
    .rb-tally-bar { display: block; height: 3px; margin-top: 9px; background: var(--card-edge); border-radius: 999px; overflow: hidden; }
    .rb-tally-bar > span { display: block; height: 100%; }

    .rb-meal { padding: 16px 0; border-bottom: 1px solid var(--card-edge); }
    .rb-meal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .rb-meal-add { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
    .rb-add-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .rb-add-modes { display: flex; gap: 6px; flex-wrap: wrap; }
    .rb-add-mode { font: 600 11.5px/1 ${UI}; padding: 7px 11px; border-radius: 999px; cursor: pointer; background: transparent; color: var(--card-muted); border: 1px solid var(--card-edge); }
    .rb-add-mode[aria-pressed="true"] { background: var(--card-accent); border-color: var(--card-accent); color: var(--on-accent); }
    .rb-add-note { font: 400 12px/1.55 ${UI}; color: var(--card-muted); margin: 0; max-width: 60ch; }
    .rb-food-results { list-style: none; margin: 0; padding: 0; max-height: 250px; overflow-y: auto; border: 1px solid var(--card-edge); border-radius: 2px; }
    .rb-food-hit { display: block; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--card-edge); padding: 9px 12px; cursor: pointer; }
    .rb-food-results li:last-child .rb-food-hit { border-bottom: 0; }
    .rb-food-hit:hover, .rb-food-hit[aria-pressed="true"] { background: var(--card-lift); }
    .rb-food-hit[aria-pressed="true"] { box-shadow: inset 3px 0 0 var(--card-accent); }
    .rb-food-name { display: block; font: 400 14px/1.4 ${PROSE}; color: var(--card-text); }
    .rb-food-meta { display: block; font: 400 11.5px/1.4 ${UI}; color: var(--card-muted); margin-top: 2px; }
    .rb-meal-empty { font: 400 13.5px/1.6 ${UI}; color: var(--card-muted); margin: 8px 0 0; }
    .rb-meal-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .rb-meal-list li { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .rb-meal-name { font: 400 15px/1.4 ${PROSE}; color: var(--card-text); }
    .rb-meal-serves { font: 400 12.5px/1.4 ${UI}; color: var(--card-muted); }
    .rb-meal-list .rb-entry-x { margin-left: auto; font-family: ${UI}; }

    .rb-body-panel { margin-top: 30px; padding-top: 24px; border-top: 2px solid var(--card-text); }
    .rb-body-figures { display: flex; flex-wrap: wrap; gap: 0; margin: 0 0 14px; padding: 0; border: 1px solid var(--card-edge); border-radius: 2px; }
    .rb-body-figures > div { flex: 1 1 110px; padding: 11px 14px; border-right: 1px solid var(--card-edge); }
    .rb-body-figures > div:last-child { border-right: 0; }
    .rb-body-figures dt { font: 600 9.5px/1 ${UI}; letter-spacing: .12em; text-transform: uppercase; color: var(--card-muted); margin: 0 0 6px; }
    .rb-body-figures dd { font: 400 17px/1 ${DISPLAY}; margin: 0; color: var(--card-text); }
    .rb-body-form { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); align-items: end; }
    .rb-body-form label { display: block; }
    .rb-body-form label > span:first-child { display: block; font: 600 12px/1.4 ${UI}; color: var(--card-text); margin-bottom: 5px; }
    .rb-body-note { grid-column: 1 / -1; font: 400 12px/1.6 ${UI}; color: var(--card-muted); margin: 0; max-width: 62ch; }    .rb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 22px; }
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
    /* The favorite star. On a tile it sits over the corner of the photo, on a
       dark wash so it reads on any picture, and it is always shown, because a
       phone has no hover to reveal it. Gold when starred. */
    .rb-tile-wrap { position: relative; }
    .rb-star { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border-radius: 50%; cursor: pointer; border: 1px solid rgba(255, 255, 255, .28); background: rgba(12, 16, 18, .42); color: rgba(255, 255, 255, .92); backdrop-filter: blur(3px); transition: transform 120ms ease, background-color 120ms ease; }
    .rb-tile-wrap > .rb-star { position: absolute; top: 9px; right: 9px; }
    .rb-star:hover { background-color: rgba(12, 16, 18, .6); transform: scale(1.06); }
    .rb-star.is-on { color: #F2B632; }
    /* beside a recipe's title, on the card rather than over a photo */
    .rb-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin: 0 0 10px; }
    .rb-star-title { flex: none; width: 40px; height: 40px; margin-top: 2px; border-color: var(--card-edge); background: transparent; color: var(--card-muted); backdrop-filter: none; }
    .rb-star-title:hover { background-color: var(--card-lift); color: var(--card-text); }
    .rb-star-title.is-on { color: #E0A21B; }
    @media (prefers-reduced-motion: reduce) { .rb-star { transition: none; } .rb-star:hover { transform: none; } }
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

      .rb-timers { top: 48px; right: 8px; width: min(250px, calc(100vw - 16px)); }
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
        paddingBottom: 80,
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
          units={units}
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
          photoSrc={stepPhotoSrc}
          onOpenPhoto={(id) => setLightbox({
            src: stepPhotoSrc(id),
            alt: `Step ${stepIndex + 1} of ${openRecipe.title}`,
            caption: `${openRecipe.title} · step ${stepIndex + 1}`,
          })}
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
            ) : menuPane === "profile" ? (
              <>
                <button className="rb-focus" onClick={() => setMenuPane("main")} style={{ ...menuRow(false), color: "var(--card-accent)", fontWeight: 600, marginBottom: 4 }}>
                  <span>‹ Back</span>
                </button>
                <p style={menuLabel}>Profile</p>
                {!profile ? (
                  <p className="rb-profile-note" style={{ margin: "0 4px 4px" }}>Profiles aren&apos;t available here — this needs the deployed site.</p>
                ) : (
                  <div className="rb-profile">
                    {face(profile.id, profile.name, 72)}
                    <p className="rb-profile-name">{profile.name}</p>
                    {profile.canHaveFace ? (
                      <>
                        <div className="rb-profile-actions">
                          {/* A label wrapping a hidden input, sized to its words, like the
                              note photo button beside "I made this". */}
                          <label className="rb-btn rb-focus rb-shotbtn" style={{ ...btnQuiet, padding: "7px 13px", fontSize: 12.5, cursor: faceBusy ? "progress" : "pointer" }}>
                            {faceBusy ? "Working…" : faces[profile.id] ? "Change picture" : "Choose a picture"}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={faceBusy}
                              onChange={(ev) => { chooseFace(ev.target.files?.[0]); ev.target.value = ""; }}
                            />
                          </label>
                          {faces[profile.id] && !faceBusy && (
                            <button type="button" className="rb-entry-x rb-focus" onClick={removeFace}>Remove</button>
                          )}
                        </div>
                        <p className="rb-profile-note">Everyone in the family sees it beside your notes, replies and messages.</p>
                      </>
                    ) : (
                      <p className="rb-profile-note">Your address isn&apos;t on the family list yet, so there&apos;s nowhere to keep a picture for you.</p>
                    )}
                    {faceError && <p className="rb-profile-error">{faceError}</p>}
                  </div>
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
                <div className="rb-setting">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {face(profile?.id, profile?.name, 22)}
                    Profile
                  </span>
                  <button className="rb-focus rb-setctl" onClick={() => { setFaceError(""); setMenuPane("profile"); }} aria-label="Profile">
                    <span aria-hidden>{profile?.name ? `${profile.name.split(" ")[0]} ›` : "›"}</span>
                  </button>
                </div>
                <div className="rb-setting">
                  <span>Dark mode</span>
                  <button
                    className="rb-focus rb-setctl"
                    onClick={flipTheme}
                    aria-pressed={theme === "dark"}
                    aria-label="Dark mode"
                  >
                    <span aria-hidden style={{ position: "relative", flex: "none", width: 34, height: 20, borderRadius: 999, background: theme === "dark" ? "var(--card-accent)" : "var(--card-edge)" }}>
                      <span style={{ position: "absolute", top: 3, left: theme === "dark" ? 17 : 3, width: 14, height: 14, borderRadius: "50%", background: "var(--card-bg)", transition: "left 120ms ease" }} />
                    </span>
                  </button>
                </div>
                <div className="rb-setting">
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
                  <button className="rb-focus rb-setctl" onClick={() => setMenuPane("theme")} aria-label="Choose colours">
                    <span aria-hidden>Choose ›</span>
                  </button>
                </div>
                <div className="rb-setting">
                  <span>Units</span>
                  {/* Cycled rather than given a pane of its own: three choices
                      is a short enough loop that a tap to see the next one
                      costs less than opening something. */}
                  <button
                    className="rb-focus rb-setctl"
                    onClick={() => {
                      const at = SYSTEMS.findIndex((u) => u.id === units);
                      setUnits(SYSTEMS[(at + 1) % SYSTEMS.length].id);
                    }}
                    aria-label={`Units: ${SYSTEMS.find((u) => u.id === units)?.label}. Change`}
                    title={SYSTEMS.find((u) => u.id === units)?.hint}
                  >
                    <span aria-hidden>{SYSTEMS.find((u) => u.id === units)?.label} ›</span>
                  </button>
                </div>
                <div className="rb-setting">
                  <span>{exporting ? "Exporting…" : "Export all recipes"}</span>
                  <button className="rb-focus rb-setctl" onClick={() => { exportAll(); close(); }} disabled={exporting} aria-label="Export all recipes">
                    <span aria-hidden>backup</span>
                  </button>
                </div>
                <div className="rb-setting">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    What&apos;s new
                    {unreadNews && <span role="img" aria-label="unread" style={newsDot("var(--card-accent)", 6)} />}
                  </span>
                  <button className="rb-focus rb-setctl" onClick={() => { setMenuPane("news"); markNewsRead(); }} aria-label="What's new">
                    <span aria-hidden>{CHANGELOG.length ? prettyDate(CHANGELOG[0].date) : ""} ›</span>
                  </button>
                </div>
              </>
            )}
          </Popover>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ minWidth: 260 }}>
            <div className={`rb-heading${titleSettling ? " is-settling" : ""}`}>
              <h1 style={{ font: `300 clamp(34px, 6vw, 52px)/1.02 ${DISPLAY}`, margin: 0, letterSpacing: "-0.015em", color: "rgb(var(--on-page))" }}>
                {shownBox ? `${shownBox}'s Recipes` : SITE_NAME}
              </h1>
              <p style={{ font: `400 14.5px/1.6 ${UI}`, color: "rgba(var(--on-page), calc(.58 * var(--ink-k)))", margin: "12px 0 0", maxWidth: "46ch" }}>
                {shownBox
                  ? `${boxCount(shownBox)} ${boxCount(shownBox) === 1 ? "recipe" : "recipes"} from ${shownBox}.`
                  : `${box.recipes.length} ${box.recipes.length === 1 ? "recipe" : "recipes"} kept here, for whoever asks next.`}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="rb-btn rb-focus" style={btnGhost} onClick={openPlan}>
              <span aria-hidden style={{ marginRight: 7 }}>🗓</span>Meal plan{thisWeekPlanned ? ` (${thisWeekPlanned})` : ""}
            </button>
            <button className="rb-btn rb-focus" style={btnGhost} onClick={openShopping}>
              <span aria-hidden style={{ marginRight: 7 }}>🛒</span>Shopping list{toBuy ? ` (${toBuy})` : ""}
            </button>

            <button className="rb-btn rb-focus" style={btnGhost} onClick={openToday}>
              <span aria-hidden style={{ marginRight: 7 }}>◷</span>Daily nutrition{todayTotals.calories ? ` (${todayTotals.calories})` : ""}
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
              const activeFilters = (scope !== "all" ? 1 : 0) + (tagFilter ? 1 : 0) + (favOnly ? 1 : 0);
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
                          <p style={menuLabel}>Show</p>
                          <button
                            className="rb-focus"
                            aria-pressed={favOnly}
                            onClick={() => setFavOnly(!favOnly)}
                            style={{ ...menuRow(favOnly), marginBottom: 12 }}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                              <span style={{ display: "inline-flex", color: favOnly ? "#E0A21B" : "var(--card-muted)" }}>
                                <Star on={favOnly} size={16} />
                              </span>
                              Favorites only
                            </span>
                            <span style={{ font: `500 12px/1 ${UI}`, color: "var(--card-muted)" }}>{favCount}</span>
                          </button>
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
                            <button className="rb-focus" onClick={() => { setScope("all"); setTagFilter(null); setFavOnly(false); }} style={{ ...linkButton, margin: "14px 4px 2px", fontSize: 13 }}>
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
                      {favOnly && chip("fav", "★ Favorites", () => setFavOnly(false))}
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
                <p style={{ font: `300 26px/1.35 ${DISPLAY}`, margin: "0 0 10px" }}>
                  {favOnly && box.recipes.length > 0 ? "No favorites here yet." : "Nothing in the box yet."}
                </p>
                <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "rgba(var(--on-page), calc(.62 * var(--ink-k)))", margin: "0 0 22px" }}>
                  {box.recipes.length === 0
                    ? "Add one by hand, or drag a folder of .md or .json files anywhere on this page."
                    : favOnly && favCount === 0
                    ? "You haven't starred any recipes yet. Tap the star on a recipe to keep it here."
                    : favOnly
                    ? "None of your favorites match that."
                    : activeBox && activeBox !== UNFILED && !query && !tagFilter
                    ? `${activeBox} hasn't added a recipe yet. Anything you add from here gets filed to this box.`
                    : "No recipe matches that search."}
                </p>
                <button className="rb-btn rb-focus" style={btnPrimary} onClick={startAdd}>Add a recipe</button>
              </div>
            ) : (
              <div className="rb-grid">
                {visible.map((r) => {
                  const fav = isFavorite(favorites, r.id);
                  return (
                    /* The star is a button beside the tile rather than inside it,
                       because the tile is itself a button. */
                    <div key={r.id} className="rb-tile-wrap">
                      <article
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
                      <button
                        type="button"
                        className={`rb-star rb-focus rb-noprint${fav ? " is-on" : ""}`}
                        onClick={() => toggleFavorite(r)}
                        aria-pressed={fav}
                        aria-label={fav ? `Remove ${r.title} from favorites` : `Add ${r.title} to favorites`}
                        title={fav ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star on={fav} size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {lately.length > 0 && (
              <section className="rb-noprint rb-lately">
                <h2 style={{ font: `300 26px/1.15 ${DISPLAY}`, margin: "0 0 4px", color: "rgb(var(--on-page))", letterSpacing: "-0.01em" }}>
                  Lately
                </h2>
                <p style={{ font: `400 13.5px/1.6 ${SOCIAL}`, color: "rgba(var(--on-page), calc(.55 * var(--ink-k)))", margin: "0 0 20px" }}>
                  What people have been cooking, and what they said about it.
                </p>

                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {lately.map((e, i) => {
                    const r = box.recipes.find((x) => x.id === e.recipe);
                    return (
                      <li key={e.id} className={i === 0 ? "rb-lately-lead" : undefined}>
                        <button
                          type="button"
                          className="rb-focus rb-lately-open"
                          onClick={() => r && openFromFeed(e, r)}
                          disabled={!r}
                          aria-label={
                            !r ? "That recipe is no longer in the box"
                              : e.parent ? `Open ${r.title} at the note ${e.name} replied to`
                              : `Open ${r.title} at what ${e.name} wrote`
                          }
                        >
                          <span className="rb-lately-who">
                            {face(e.who, e.name, 24)}
                            <span className="rb-lately-name">{e.name}</span>
                            <span aria-hidden>·</span>
                            <span>
                              {e.kind === "made" ? "made"
                                : e.parent ? (
                                  <>
                                    replied to{" "}
                                    <span className="rb-lately-to">
                                      {e.parentName ? `${e.parentName}'s note` : e.parentName === "" ? "a removed note" : "a note"}
                                    </span>{" "}
                                    on
                                  </>
                                )
                                : "wrote about"}
                            </span>
                            <span className="rb-lately-what">{r ? r.title : "a recipe since removed"}</span>
                            <span aria-hidden>·</span>
                            <span><When iso={e.at} /></span>
                          </span>
                          {e.kind === "note" && e.text && <span className="rb-lately-text">{e.text}</span>}
                          {e.shot && <span className="rb-lately-shot"><img src={e.shot} alt="" loading="lazy" /></span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
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

        {/* ═══════ THE WEEK'S PLAN ═══════ */}
        {!loading && view === "plan" && (
          <article className="rb-sheet" style={{ ...sheet, maxWidth: 1040 }}>
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
                {toolBackLabel()}
              </button>

              <h2 style={{ font: `300 30px/1.2 ${DISPLAY}`, margin: "0 0 6px", color: "var(--card-text)" }}>Meal plan</h2>
              <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 18px", maxWidth: "62ch" }}>
                What you mean to cook this week. When it looks right, send the whole week to your shopping list in one go.
                {daySync === "synced"
                  ? " It follows you between your own devices, and nobody else in the family can see it."
                  : daySync === "device"
                  ? " Saved on this device. It couldn't reach your account just now, so it will catch up later."
                  : ""}
              </p>

              {/* ── which week ── */}
              <div className="rb-daybar">
                <div className="rb-daynav">
                  <button
                    type="button"
                    className="rb-daystep rb-focus"
                    aria-label="The week before"
                    onClick={() => setWeekOf(shiftDay(weekOf, -7))}
                  >
                    <span aria-hidden>←</span>
                  </button>
                  <div className="rb-daybar-when">
                    <p className="rb-daybar-name">{weekLabel(weekOf)}</p>
                    <p className="rb-daybar-sub">
                      {weekOf === thisWeek ? "This week" : weekOf === shiftDay(thisWeek, 7) ? "Next week" : weekOf < thisWeek ? "Gone by" : "Ahead"}
                      {planned ? ` · ${planned} ${planned === 1 ? "meal" : "meals"}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rb-daystep rb-focus"
                    aria-label="The week after"
                    onClick={() => setWeekOf(shiftDay(weekOf, 7))}
                  >
                    <span aria-hidden>→</span>
                  </button>
                </div>

                {weekOf !== thisWeek && (
                  <button type="button" className="rb-dayback rb-focus" onClick={() => setWeekOf(thisWeek)}>
                    Back to this week
                  </button>
                )}
              </div>

              {/* ── the week ── */}
              <div className="rb-week">
                {weekDays(weekOf).map((date) => {
                  const dayPlan = planFor(date);
                  const isToday = date === today;
                  const count = MEALS.reduce((n, meal) => n + (dayPlan[meal.id] || []).length, 0);
                  return (
                    <section key={date} className={`rb-weekday${isToday ? " is-today" : ""}`}>
                      <header className="rb-weekday-head">
                        <span className="rb-weekday-name">{weekdayShort(date)}</span>
                        <span className="rb-weekday-num rb-num">{dayNumber(date)}</span>
                      </header>

                      <div className="rb-weekday-body">
                        {MEALS.map((meal) => {
                          const entries = dayPlan[meal.id] || [];
                          if (!entries.length) return null;
                          return (
                            <div key={meal.id} className="rb-planmeal">
                              <p className="rb-planmeal-label">{meal.label}</p>
                              {entries.map((entry) => {
                                const recipe = box.recipes.find((r) => r.id === entry.recipeId);
                                return (
                                  <div key={entry.id} className="rb-planitem">
                                    <button
                                      type="button"
                                      className="rb-planitem-name rb-focus"
                                      disabled={!recipe}
                                      title={recipe ? "Open this recipe" : "This recipe is no longer in the box"}
                                      onClick={() => recipe && openFromPlan(recipe)}
                                    >
                                      {recipe ? recipe.title : "No longer in the box"}
                                      <span className="rb-planitem-serves">
                                        {entry.servings} {entry.servings === 1 ? "serving" : "servings"}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      className="rb-planitem-off rb-focus"
                                      aria-label={`Take ${recipe ? recipe.title : "this"} off ${meal.label} on ${date}`}
                                      onClick={() => removeFromPlan(date, meal.id, entry.id)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                        {!count && <p className="rb-weekday-empty">Nothing yet</p>}
                      </div>

                      <button
                        type="button"
                        className="rb-weekday-add rb-focus"
                        onClick={() => { setPlanTo(planTo && planTo.date === date ? null : { date, meal: "dinner" }); setPlanPick(""); setPlanServes(""); }}
                      >
                        {planTo && planTo.date === date ? "Close" : "Add"}
                      </button>

                      {planTo && planTo.date === date && (
                        <div className="rb-planadd">
                          <div className="rb-planadd-meals">
                            {MEALS.map((meal) => (
                              <button
                                key={meal.id}
                                type="button"
                                className={`rb-planadd-meal rb-focus${planTo.meal === meal.id ? " is-on" : ""}`}
                                onClick={() => setPlanTo({ date, meal: meal.id })}
                              >
                                {meal.label}
                              </button>
                            ))}
                          </div>
                          <select
                            className="rb-planadd-pick rb-focus"
                            aria-label="Which recipe"
                            value={planPick}
                            onChange={(e) => {
                              setPlanPick(e.target.value);
                              /* Default to what the recipe itself makes, so the
                                 common case is one tap and the shopping list
                                 gets a sensible number without being told. */
                              const r = box.recipes.find((x) => x.id === e.target.value);
                              setPlanServes(String(servingsCount(r?.servings) || 1));
                            }}
                          >
                            <option value="">Pick a recipe…</option>
                            {[...box.recipes].sort((a, b) => a.title.localeCompare(b.title)).map((r) => (
                              <option key={r.id} value={r.id}>{r.title}</option>
                            ))}
                          </select>
                          <div className="rb-planadd-row">
                            <label className="rb-planadd-serves">
                              <span>Servings</span>
                              <input
                                className="rb-focus"
                                type="number"
                                min="1"
                                max="99"
                                inputMode="numeric"
                                value={planServes}
                                onChange={(e) => setPlanServes(e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="rb-btn rb-focus"
                              style={{ ...btnPrimary, padding: "8px 14px", fontSize: 13 }}
                              disabled={!planPick}
                              onClick={() => {
                                addToPlan(date, planTo.meal, planPick, planServes);
                                setPlanTo(null);
                                setPlanPick("");
                                setPlanServes("");
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* ── the shop ── */}
              <div className="rb-actbar" style={{ marginTop: 26 }}>
                <button
                  className="rb-btn rb-focus"
                  style={btnPrimary}
                  disabled={!planned}
                  onClick={planToList}
                >
                  Send this week to the shopping list
                </button>
                <button className="rb-btn rb-focus" style={btnQuiet} onClick={openShopping}>
                  Open the shopping list{toBuy ? ` (${toBuy})` : ""}
                </button>
              </div>
              <p style={{ font: `400 12.5px/1.6 ${UI}`, color: "var(--card-muted)", margin: "10px 0 0", maxWidth: "62ch" }}>
                A recipe planned more than once this week is added at the total the week asks for, not once per night.
                Anything already on the list from that recipe is replaced rather than doubled.
              </p>
            </div>
          </article>
        )}

        {/* ═══════ DETAIL ═══════ */}
        {!loading && view === "today" && (
          <article className="rb-sheet" style={{ ...sheet, maxWidth: 860 }}>
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
                {toolBackLabel()}
              </button>

              <h2 style={{ font: `300 30px/1.2 ${DISPLAY}`, margin: "0 0 6px", color: "var(--card-text)" }}>Daily nutrition tracker</h2>
              <p style={{ font: `400 14.5px/1.65 ${UI}`, color: "var(--card-muted)", margin: "0 0 18px", maxWidth: "60ch" }}>
                What you have eaten, and roughly what it came to. The last {HISTORY_DAYS} days are kept.
                {daySync === "synced"
                  ? " It follows you between your own devices, and nobody else in the family can see it."
                  : daySync === "device"
                  ? " Saved on this device. It couldn't reach your account just now, so it will catch up later."
                  : ""}
              </p>

              {/* ── which day ── */}
              <div className="rb-daybar">
                <div className="rb-daynav">
                <button
                  type="button"
                  className="rb-daystep rb-focus"
                  aria-label="The day before"
                  disabled={viewDay <= oldestDay}
                  onClick={() => setViewDay(shiftDay(viewDay, -1))}
                >
                  <span aria-hidden>←</span>
                </button>

                <div className="rb-daybar-when">
                  <p className="rb-daybar-name">{dayLabel(viewDay, today)}</p>
                  {/* The calendar itself. A native date input because every
                      platform already has one its owner knows how to drive, and
                      min/max stop it offering days that are not kept. */}
                  <input
                    type="date"
                    className="rb-daybar-date rb-focus"
                    aria-label="Pick a day"
                    value={viewDay}
                    min={oldestDay}
                    max={today}
                    onChange={(e) => {
                      const picked = e.target.value;
                      if (!picked) return;
                      /* Clamped rather than trusted: a date field can be typed
                         into as well as picked from, and min/max do not stop
                         that on every browser. */
                      setViewDay(picked > today ? today : picked < oldestDay ? oldestDay : picked);
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="rb-daystep rb-focus"
                  aria-label="The day after"
                  disabled={onToday}
                  onClick={() => setViewDay(shiftDay(viewDay, 1))}
                >
                  <span aria-hidden>→</span>
                </button>
                </div>

                {!onToday && (
                  <button type="button" className="rb-dayback rb-focus" onClick={() => setViewDay(today)}>
                    Back to today
                  </button>
                )}
              </div>

              {/* ── the tally ── */}
              <div className="rb-tally">
                {MACROS.map((m) => {
                  const have = totals[m.key];
                  const want = targets ? targets[m.target] : null;
                  const share = want ? Math.min(100, Math.round((have / want) * 100)) : 0;
                  return (
                    <div key={m.key} className="rb-tally-cell">
                      <p className="rb-tally-label">{m.label}</p>
                      <p className="rb-tally-value rb-num">
                        {have}{m.unit}
                        {want ? <span className="rb-tally-of"> of {want}{m.unit}</span> : null}
                      </p>
                      {want ? (
                        <span className="rb-tally-bar" aria-hidden>
                          <span style={{ width: `${share}%`, background: have > want ? "var(--card-danger)" : "var(--card-accent)" }} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {totals.unknown > 0 && (
                <p style={{ font: `400 12.5px/1.6 ${UI}`, color: "var(--card-muted)", margin: "10px 0 0" }}>
                  {totals.unknown} {totals.unknown === 1 ? "thing is" : "things are"} not counted — the recipe carries no nutrition.
                </p>
              )}

              {dayIsEmpty(day) && !onToday && (
                <p style={{ font: `400 13px/1.6 ${UI}`, color: "var(--card-muted)", margin: "12px 0 0" }}>
                  Nothing was logged on this day. You can still add to it.
                </p>
              )}

              {/* ── the meals ── */}
              <div style={{ marginTop: 30 }}>
                {MEALS.map((meal) => {
                  const entries = day[meal.id] || [];
                  return (
                    <section key={meal.id} className="rb-meal">
                      <div className="rb-meal-head">
                        <h3 style={{ font: `400 19px/1.2 ${DISPLAY}`, margin: 0, color: "var(--card-text)" }}>{meal.label}</h3>
                        <button
                          className="rb-btn rb-focus"
                          style={{ ...btnQuiet, padding: "6px 12px", fontSize: 12.5 }}
                          onClick={() => { const open = addTo === meal.id; resetAdd(); if (!open) setAddTo(meal.id); }}
                        >
                          {addTo === meal.id ? "Cancel" : "Add"}
                        </button>
                      </div>

                      {addTo === meal.id && (
                        <div className="rb-meal-add">
                          <div className="rb-add-modes" role="group" aria-label="Where this came from">
                            {[["box", "From the box"], ["search", "Look it up"], ["hand", "Type it in"]].map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                className="rb-focus rb-add-mode"
                                aria-pressed={addMode === id}
                                onClick={() => setAddMode(id)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          {addMode === "box" && (
                            <div className="rb-add-row">
                              <select
                                className="rb-focus"
                                value={addPick}
                                onChange={(e) => setAddPick(e.target.value)}
                                aria-label={`Which recipe for ${meal.label.toLowerCase()}`}
                                style={{ ...input, flex: "1 1 220px", padding: "9px 10px" }}
                              >
                                <option value="">Pick a recipe…</option>
                                {box.recipes.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.title}{r.nutrition?.calories ? ` — ${numOf(r.nutrition.calories)} cal a serving` : " — no nutrition"}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rb-focus" type="number" min="0.25" max="20" step="0.25"
                                value={addServings} onChange={(e) => setAddServings(e.target.value)}
                                aria-label="How many servings" style={{ ...input, width: 92, padding: "9px 10px" }}
                              />
                              <button className="rb-btn rb-focus" style={{ ...btnPrimary, padding: "10px 16px" }} onClick={() => logEntry(meal.id)} disabled={!addPick}>
                                Add
                              </button>
                            </div>
                          )}

                          {addMode === "search" && (
                            <>
                              <form
                                className="rb-add-row"
                                onSubmit={(e) => { e.preventDefault(); searchFoods(); }}
                              >
                                <input
                                  className="rb-focus"
                                  value={foodQuery}
                                  onChange={(e) => setFoodQuery(e.target.value)}
                                  placeholder="celery, peanut butter, cheeseburger…"
                                  aria-label="Search for a food"
                                  style={{ ...input, flex: "1 1 220px", padding: "9px 10px" }}
                                />
                                <button className="rb-btn rb-focus" style={{ ...btnPrimary, padding: "10px 16px" }} disabled={foodBusy || foodQuery.trim().length < 2}>
                                  {foodBusy ? "Looking…" : "Search"}
                                </button>
                              </form>

                              {foodError && <p className="rb-add-note" style={{ color: "var(--card-danger)" }}>{foodError}</p>}
                              {foodResults !== null && foodResults.length === 0 && !foodError && (
                                <p className="rb-add-note">Nothing found. Try fewer words, or type the numbers in.</p>
                              )}

                              {foodResults !== null && foodResults.length > 0 && (
                                <ul className="rb-food-results">
                                  {foodResults.map((f) => (
                                    <li key={f.id}>
                                      <button
                                        type="button"
                                        className="rb-focus rb-food-hit"
                                        aria-pressed={foodPick?.id === f.id}
                                        onClick={() => setFoodPick(f)}
                                      >
                                        <span className="rb-food-name">{f.name}</span>
                                        <span className="rb-food-meta">
                                          {f.brand ? `${f.brand} · ` : ""}{f.per.calories} cal per {f.portion}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {foodPick && (
                                <div className="rb-add-row">
                                  <span className="rb-add-note" style={{ flex: "1 1 160px", margin: 0 }}>
                                    How many × {foodPick.portion}?
                                  </span>
                                  <input
                                    className="rb-focus" type="number" min="0.25" max="20" step="0.25"
                                    value={addServings} onChange={(e) => setAddServings(e.target.value)}
                                    aria-label="How many portions" style={{ ...input, width: 92, padding: "9px 10px" }}
                                  />
                                  <button
                                    className="rb-btn rb-focus" style={{ ...btnPrimary, padding: "10px 16px" }}
                                    onClick={() => addFromFood(meal.id, foodPick, Math.max(0.25, Math.min(20, parseFloat(addServings) || 1)))}
                                  >
                                    Add
                                  </button>
                                </div>
                              )}

                              <p className="rb-add-note">
                                Food figures come from USDA FoodData Central, which is public domain.
                              </p>
                            </>
                          )}

                          {addMode === "hand" && (
                            <>
                              <div className="rb-add-row">
                                <input
                                  className="rb-focus" value={byHand.name}
                                  onChange={(e) => setByHand({ ...byHand, name: e.target.value })}
                                  placeholder="What was it?" aria-label="What was it"
                                  style={{ ...input, flex: "1 1 200px", padding: "9px 10px" }}
                                />
                                <input
                                  className="rb-focus" type="number" min="0" value={byHand.calories}
                                  onChange={(e) => setByHand({ ...byHand, calories: e.target.value })}
                                  placeholder="cal" aria-label="Calories"
                                  style={{ ...input, width: 92, padding: "9px 10px" }}
                                />
                              </div>
                              <div className="rb-add-row">
                                {[["protein", "protein g"], ["carbs", "carbs g"], ["fat", "fat g"]].map(([k, label]) => (
                                  <input
                                    key={k} className="rb-focus" type="number" min="0" value={byHand[k]}
                                    onChange={(e) => setByHand({ ...byHand, [k]: e.target.value })}
                                    placeholder={label} aria-label={label}
                                    style={{ ...input, width: 104, padding: "9px 10px" }}
                                  />
                                ))}
                                <input
                                  className="rb-focus" type="number" min="0.25" max="20" step="0.25"
                                  value={addServings} onChange={(e) => setAddServings(e.target.value)}
                                  aria-label="How many portions" style={{ ...input, width: 92, padding: "9px 10px" }}
                                />
                                <button className="rb-btn rb-focus" style={{ ...btnPrimary, padding: "10px 16px" }} onClick={() => addByHand(meal.id)}>
                                  Add
                                </button>
                              </div>
                              <p className="rb-add-note">
                                Straight off the packet or the chain's own nutrition page. Only a name and
                                a calorie figure are needed; the macros are worth having if you have them.
                              </p>
                            </>
                          )}
                        </div>
                      )}

                      {entries.length === 0 ? (
                        <p className="rb-meal-empty">Nothing yet.</p>
                      ) : (
                        <ul className="rb-meal-list">
                          {entries.map((e) => {
                            const r = e.per ? null : box.recipes.find((x) => x.id === e.recipeId);
                            const label = e.per ? e.food?.name || "something" : r ? r.title : "a recipe since removed";
                            const per = e.per?.calories ?? (r?.nutrition?.calories ? numOf(r.nutrition.calories) : null);
                            const cal = per == null ? null : Math.round(per * e.servings);
                            const portion = e.per ? e.food?.portion || "portion" : "serving";
                            return (
                              <li key={e.id}>
                                <span className="rb-meal-name">{label}</span>
                                <span className="rb-meal-serves">
                                  {e.servings === 1 ? `1 × ${portion}` : `${e.servings} × ${portion}`}
                                  {cal == null ? " · not counted" : ` · ${cal} cal`}
                                </span>
                                <button
                                  className="rb-focus rb-entry-x"
                                  onClick={() => dropEntry(meal.id, e.id)}
                                  aria-label={`Take ${label} off ${meal.label.toLowerCase()}`}
                                >
                                  Remove
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* ── the estimate ── */}
              <section className="rb-body-panel">
                <h3 style={{ font: `400 19px/1.2 ${DISPLAY}`, margin: "0 0 4px", color: "var(--card-text)" }}>What a day needs</h3>
                <p style={{ font: `400 12.5px/1.6 ${UI}`, color: "var(--card-muted)", margin: "0 0 16px", maxWidth: "62ch" }}>
                  An estimate from height, weight, age and how much you move. Two people with
                  identical numbers can differ by several hundred calories a day, so treat it as
                  a starting point rather than an instruction — and as nothing at all if a doctor
                  has told you otherwise.
                </p>

                {!editingBody && targets && (
                  <>
                    <dl className="rb-body-figures">
                      <div><dt>Resting</dt><dd className="rb-num">{targets.rest}</dd></div>
                      <div><dt>With movement</dt><dd className="rb-num">{targets.burn}</dd></div>
                      <div><dt>Aiming at</dt><dd className="rb-num">{targets.calories}</dd></div>
                      {shape && <div><dt>BMI</dt><dd className="rb-num">{shape.value}</dd></div>}
                    </dl>
                    {shape && (
                      <p style={{ font: `400 12.5px/1.6 ${UI}`, color: "var(--card-muted)", margin: "0 0 14px", maxWidth: "62ch" }}>
                        That BMI is {shape.band}. It compares weight to height and nothing else —
                        it cannot tell muscle from fat, and it reads differently across builds. One
                        number among several, not a verdict.
                      </p>
                    )}
                    <button className="rb-btn rb-focus" style={{ ...btnQuiet, padding: "8px 14px", fontSize: 12.5 }} onClick={startBody}>
                      Change these
                    </button>
                  </>
                )}

                {!editingBody && !targets && (
                  <button className="rb-btn rb-focus" style={btnPrimary} onClick={startBody}>
                    Work out a daily target
                  </button>
                )}

                {editingBody && bodyDraft && (
                  <div className="rb-body-form">
                    <label>
                      <span>Height</span>
                      <span style={{ display: "flex", gap: 8 }}>
                        <input className="rb-focus" type="number" min="0" max="8" value={bodyDraft.feet}
                          onChange={(e) => setBodyDraft({ ...bodyDraft, feet: e.target.value })}
                          aria-label="Height in feet" placeholder="ft" style={{ ...input, padding: "9px 10px" }} />
                        <input className="rb-focus" type="number" min="0" max="11" value={bodyDraft.inches}
                          onChange={(e) => setBodyDraft({ ...bodyDraft, inches: e.target.value })}
                          aria-label="Height in inches" placeholder="in" style={{ ...input, padding: "9px 10px" }} />
                      </span>
                    </label>
                    <label>
                      <span>Weight</span>
                      <input className="rb-focus" type="number" min="0" value={bodyDraft.pounds}
                        onChange={(e) => setBodyDraft({ ...bodyDraft, pounds: e.target.value })}
                        aria-label="Weight in pounds" placeholder="lb" style={{ ...input, padding: "9px 10px" }} />
                    </label>
                    <label>
                      <span>Age</span>
                      <input className="rb-focus" type="number" min="1" max="120" value={bodyDraft.age}
                        onChange={(e) => setBodyDraft({ ...bodyDraft, age: e.target.value })}
                        aria-label="Age in years" placeholder="years" style={{ ...input, padding: "9px 10px" }} />
                    </label>
                    <label>
                      <span>Sex</span>
                      <select className="rb-focus" value={bodyDraft.sex} onChange={(e) => setBodyDraft({ ...bodyDraft, sex: e.target.value })}
                        aria-label="Sex, as the formula uses it" style={{ ...input, padding: "9px 10px" }}>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="">Rather not say</option>
                      </select>
                    </label>
                    <label>
                      <span>Movement</span>
                      <select className="rb-focus" value={bodyDraft.activity} onChange={(e) => setBodyDraft({ ...bodyDraft, activity: e.target.value })}
                        aria-label="How much you move" style={{ ...input, padding: "9px 10px" }}>
                        {ACTIVITY.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.note}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Aim</span>
                      <select className="rb-focus" value={bodyDraft.goal} onChange={(e) => setBodyDraft({ ...bodyDraft, goal: e.target.value })}
                        aria-label="What you are aiming at" style={{ ...input, padding: "9px 10px" }}>
                        {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}{g.note ? ` — ${g.note}` : ""}</option>)}
                      </select>
                    </label>

                    <p className="rb-body-note">
                      Sex is here because the equation carries a term for it and nothing else would
                      be honest. Rather not say gives the midpoint of the two it knows.
                    </p>

                    <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1" }}>
                      <button className="rb-btn rb-focus" style={btnPrimary} onClick={commitBody}>Save</button>
                      <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => setEditingBody(false)}>Cancel</button>
                      {body && (
                        <button className="rb-btn rb-focus" style={{ ...btnQuiet, marginLeft: "auto", color: "var(--card-danger)" }}
                          onClick={() => saveBody(null)}>
                          Forget these
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </article>
        )}
        {!loading && view === "shopping" && (() => {
          const needed = list.items.filter((i) => !i.checked);
          const got = list.items.filter((i) => i.checked);
          const onList = Object.entries(list.recipes);
          const backLabel = toolBackLabel();
          const packPlace = packCountry || packFor || "US";
          const sizable = needed.some((i) => packNeed(i));
          const row = (item) => {
            const described = describeItem(item);
            /* Converted here rather than when the item was added: the stored
               line stays as the recipe wrote it, so changing this setting
               re-reads the whole list instead of leaving yesterday's cups
               sitting next to today's millilitres. */
            const qty = convertText(described.qty, units);
            const name = described.name;
            const from = itemRecipes(item, list);
            const need = item.checked ? null : packNeed(item);
            const pack = need ? packs[packKey(packPlace, need)] : null;
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
                  {pack && (
                    <span className="rb-pack-line">
                      Buy {packLabel(pack)}
                      {pack.estimate && <span className="rb-pack-est"> · estimated</span>}
                    </span>
                  )}
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

                {sizable && (
                  <div className="rb-noprint rb-packs-bar">
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={suggestPacks} disabled={packsBusy}>
                      {packsBusy ? "Asking…" : "Suggest what to buy"}
                    </button>
                    <label className="rb-packs-where">
                      <span>Shopping in</span>
                      <select
                        className="rb-focus"
                        value={packCountry}
                        onChange={(e) => choosePackCountry(e.target.value)}
                        style={{ ...input, width: "auto", padding: "7px 10px", fontSize: 13.5 }}
                      >
                        <option value="">{packFor ? `Where I am (${COUNTRY_NAMES[packFor]})` : "Where I am"}</option>
                        <option value="US">United States</option>
                        <option value="NZ">New Zealand</option>
                      </select>
                    </label>
                    <p className="rb-packs-note" role="status">
                      {packsNote || "Typical supermarket sizes, suggested by AI. Check the shelf."}
                    </p>
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
                onClick={backFromRecipe}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18,
                  background: "transparent", border: "none", padding: "4px 0",
                  color: "var(--card-accent)", font: `600 13.5px/1 ${UI}`,
                }}
              >
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
                {toolTrail.current.length ? toolBackLabel() : backLabel()}
              </button>
              <div className="rb-title-row">
                <h2 style={{ font: `300 clamp(30px, 4.6vw, 42px)/1.08 ${DISPLAY}`, margin: 0, letterSpacing: "-0.02em", color: "var(--card-text)" }}>
                  {openRecipe.title}
                </h2>
                {(() => {
                  const fav = isFavorite(favorites, openRecipe.id);
                  return (
                    <button
                      type="button"
                      className={`rb-star rb-star-title rb-focus rb-noprint${fav ? " is-on" : ""}`}
                      onClick={() => toggleFavorite(openRecipe)}
                      aria-pressed={fav}
                      aria-label={fav ? `Remove ${openRecipe.title} from favorites` : `Add ${openRecipe.title} to favorites`}
                      title={fav ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star on={fav} size={22} />
                    </button>
                  );
                })()}
              </div>
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
                      const [qty, rest] = splitQty(showLine(ing, factor, units));
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
                            {/* in the reader's units, but never scaled: the pan is the pan at any number of servings */}
                            {convertText(tool, units)}
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
                            <p style={{ font: `400 16.5px/1.75 ${PROSE}`, color: "var(--card-text)", margin: 0 }}>{showText(text, factor, units)}</p>
                            {Array.isArray(s?.photos) && s.photos.length > 0 && (
                              <div
                                className="rb-stepshots rb-noprint"
                                data-count={Math.min(s.photos.length, STEP_PHOTO_MAX)}
                              >
                                {s.photos.slice(0, STEP_PHOTO_MAX).map((id, k) => (
                                  <button
                                    key={id}
                                    type="button"
                                    className="rb-stepshot rb-focus"
                                    onClick={() => setLightbox({
                                      src: stepPhotoSrc(id),
                                      alt: `Step ${i + 1}${title ? `: ${title}` : ""}`,
                                      caption: `${openRecipe.title} · step ${i + 1}`,
                                    })}
                                    aria-label={`See photo ${k + 1} of step ${i + 1} full size`}
                                  >
                                    <img src={stepPhotoSrc(id)} alt="" loading="lazy" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
                                  </button>
                                ))}
                              </div>
                            )}
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

              <section className="rb-family">
                <h3 style={{ font: `400 21px/1.2 ${DISPLAY}`, margin: "0 0 4px", color: "var(--card-text)" }}>From the family</h3>
                <p style={{ font: `400 12.5px/1.5 ${SOCIAL}`, color: "var(--card-muted)", margin: "0 0 16px" }}>
                  What anyone learned the last time they cooked it.
                </p>

                {notes === null && (
                  <p style={{ font: `400 14px/1.6 ${SOCIAL}`, color: "var(--card-muted)", margin: 0 }}>Looking…</p>
                )}

                {notes !== null && notes.length === 0 && !notesError && (
                  <p style={{ font: `400 14px/1.6 ${SOCIAL}`, color: "var(--card-muted)", margin: 0 }}>
                    Nobody has written anything yet.
                  </p>
                )}

                {notes !== null && notes.length > 0 && (() => {
                  const { roots, kids } = threadNotes(notes);
                  /* One entry and, nested inside it, everything that answers
                     it. Nesting the replies inside the entry's own left rule is
                     what draws the thread line down beside them. */
                  const entry = (e, depth, parent) => {
                    const replies = kids.get(e.id) || [];
                    const beyondIndent = depth > REPLY_INDENTS;
                    return (
                      <li
                        key={e.id}
                        id={`note-${e.id}`}
                        className={`${e.deleted ? "rb-entry rb-entry-gone" : e.kind === "made" ? "rb-entry rb-entry-made" : "rb-entry"}${noteFocus?.ids.includes(e.id) ? " rb-entry-flash" : ""}`}
                      >
                        {e.deleted ? (
                          <p className="rb-entry-who">
                            <span className="rb-entry-removed">Removed</span>
                            <span aria-hidden>·</span>
                            <span><When iso={e.at} /></span>
                          </p>
                        ) : (
                          <>
                            <p className="rb-entry-who">
                              {face(e.who, e.name, 24)}
                              <span className="rb-entry-name">{e.name}</span>
                              <span aria-hidden>·</span>
                              <span>{e.kind === "made" ? <>made this <When iso={e.at} inSentence /></> : <When iso={e.at} />}</span>
                              {beyondIndent && parent && (
                                <span>to {parent.deleted ? "a removed note" : parent.name}</span>
                              )}
                              {(e.mine || e.canRemove) && (
                                <button
                                  type="button"
                                  className="rb-focus rb-entry-x"
                                  /* The owner removing somebody else's is asked first:
                                     it is for good, and it is not theirs. */
                                  onClick={() => {
                                    if (!e.mine && !window.confirm(`Remove ${e.name}'s ${e.kind === "made" ? "entry" : "note"}? This can't be undone.`)) return;
                                    removeEntry(e.id);
                                  }}
                                  disabled={notesBusy}
                                  aria-label={e.mine ? "Remove what you wrote" : `Remove ${e.name}'s ${e.kind === "made" ? "entry" : "note"}`}
                                >
                                  Remove
                                </button>
                              )}
                            </p>
                            {e.kind === "note" && e.text && <p className="rb-entry-text">{e.text}</p>}
                            {e.shot && (
                              <button
                                type="button"
                                className="rb-madeshot rb-focus"
                                onClick={() => e.hasPhoto && setLightbox(e)}
                                aria-label={`See ${e.name}'s photo full size`}
                                disabled={!e.hasPhoto}
                              >
                                <img src={e.shot} alt={`Cooked by ${e.name}`} loading="lazy" />
                              </button>
                            )}
                            {e.loves?.length > 0 && (
                              <p className="rb-love-line">
                                <span aria-hidden>❤️</span> Loved by {lovedBy(e.loves)}
                              </p>
                            )}
                            {replyTo !== e.id && (
                              <div className="rb-entry-actions rb-noprint">
                                {e.canLove && (
                                  <button
                                    type="button"
                                    className="rb-focus rb-entry-x"
                                    onClick={() => loveNote(e)}
                                    aria-pressed={!!e.loved}
                                    aria-label={`${e.loved ? "Unlove" : "Love"} ${e.name}'s ${e.kind === "made" ? "entry" : "note"}`}
                                  >
                                    {e.loved ? "Unlove" : "Love"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="rb-focus rb-entry-x"
                                  onClick={() => { setReplyTo(e.id); setReplyText(""); }}
                                  disabled={notesBusy}
                                  aria-label={`Reply to ${e.name}`}
                                >
                                  Reply
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {replyTo === e.id && !e.deleted && (
                          <div className="rb-reply-box rb-noprint">
                            <textarea
                              className="rb-focus"
                              value={replyText}
                              onChange={(ev) => setReplyText(ev.target.value)}
                              rows={2}
                              maxLength={2000}
                              autoFocus
                              placeholder={`Reply to ${e.name}`}
                              aria-label={`Reply to ${e.name}`}
                              style={{ ...input, resize: "vertical", font: `400 14px/1.6 ${SOCIAL}` }}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                              <button
                                className="rb-btn rb-focus"
                                style={{ ...btnPrimary, padding: "7px 14px", fontSize: 13 }}
                                onClick={() => addReply(e.id)}
                                disabled={notesBusy || !replyText.trim()}
                              >
                                Post reply
                              </button>
                              <button
                                className="rb-btn rb-focus"
                                style={{ ...btnQuiet, padding: "7px 14px", fontSize: 13 }}
                                onClick={() => { setReplyTo(null); setReplyText(""); }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {replies.length > 0 && (
                          <ul className={depth + 1 > REPLY_INDENTS ? "rb-replies rb-replies-flat" : "rb-replies"}>
                            {replies.map((r) => entry(r, depth + 1, e))}
                          </ul>
                        )}
                      </li>
                    );
                  };
                  return (
                    <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                      {roots.map((e) => entry(e, 0, null))}
                    </ul>
                  );
                })()}

                {notesError && (
                  <p style={{ font: `400 13px/1.6 ${SOCIAL}`, color: "var(--card-danger)", margin: "12px 0 0" }}>{notesError}</p>
                )}

                <div className="rb-noprint" style={{ marginTop: 18 }}>
                  <textarea
                    className="rb-focus"
                    value={noteText}
                    onChange={(ev) => setNoteText(ev.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Anything worth knowing next time — what you changed, what to watch for"
                    aria-label="Add a note"
                    style={{ ...input, resize: "vertical", font: `400 14.5px/1.6 ${SOCIAL}` }}
                  />
                  {notePhoto && (
                    <div className="rb-shotpick">
                      <img src={notePhoto.shot} alt="The photo you picked" />
                      <div>
                        <p className="rb-shotpick-note">This goes on whichever you post next.</p>
                        <button type="button" className="rb-btn rb-focus" style={{ ...btnQuiet, padding: "6px 12px", fontSize: 12.5 }} onClick={() => setNotePhoto(null)}>
                          Remove photo
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <button className="rb-btn rb-focus" style={btnPrimary} onClick={() => addEntry("note")} disabled={notesBusy || (!noteText.trim() && !notePhoto)}>
                      Add note
                    </button>
                    <button className="rb-btn rb-focus" style={btnQuiet} onClick={() => addEntry("made")} disabled={notesBusy}>
                      I made this
                    </button>
                    {/* A label wrapping a hidden input, sized to the words
                        inside it — the same shape as the recipe photo button,
                        which had to be fixed once for exactly this reason: a
                        stretched label makes the empty space beside it open a
                        file picker. */}
                    <label className="rb-btn rb-focus rb-shotbtn" style={{ ...btnQuiet, cursor: "pointer" }}>
                      {photoBusyNote ? "Working…" : notePhoto ? "Change photo" : "Add a photo"}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(ev) => { chooseNotePhoto(ev.target.files?.[0]); ev.target.value = ""; }}
                      />
                    </label>
                    {/* Not a choice any more: the name comes from the roster in
                        shared/access.js, against the address Access verified. */}
                    <span style={{ font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", marginLeft: "auto" }}>
                      {myName ? `Posting as ${myName}` : ""}
                    </span>
                  </div>
                </div>
              </section>

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
                        stepPhotoIds(openRecipe.steps).forEach((id) => window.storage?.delete(stepImageKey(id), true).catch(() => {}));
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
                  {suggesting > 0 && suggesting === importRun.current && (
                    <p role="status" style={{ font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", margin: "10px 0 0" }}>
                      Looking over the page for anything it left out…
                    </p>
                  )}
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
                {form.photoChoices?.length > 1 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ font: `400 12.5px/1.5 ${UI}`, color: "var(--card-muted)", margin: "0 0 8px" }}>
                      Photos from the page. Tap one to use it instead.
                    </p>
                    <div className="rb-photo-choices" role="group" aria-label="Photos from the recipe page">
                      {form.photoChoices.map((ph) => (
                        <button
                          key={ph.src}
                          type="button"
                          className="rb-photo-choice rb-focus"
                          aria-pressed={form.photoPick === ph.src}
                          aria-label={ph.alt ? `Use this photo: ${ph.alt}` : "Use this photo"}
                          disabled={photoChoosing === ph.src}
                          onClick={async () => {
                            if ((await takePagePhoto(ph.src)) === false) flash("That photo wouldn't come through — try another", 5000);
                          }}
                        >
                          {/* shown straight from the recipe site, which never learns which page asked */}
                          <img
                            src={ph.thumb || ph.src}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                <textarea
                  className="rb-focus"
                  rows={8}
                  style={input}
                  value={form.stepText}
                  onChange={(e) => {
                    const value = e.target.value;
                    /* photos belong to steps, so they follow each step's line through the edit */
                    setForm((f) => ({
                      ...f,
                      stepText: value,
                      stepPhotos: carryStepPhotos(stepLines(f.stepText), stepLines(value), f.stepPhotos || []),
                    }));
                  }}
                />
              </Field>

              {stepLines(form.stepText).length > 0 && (
                <Field
                  label="Step photos"
                  group
                  hint={`Optional — up to ${STEP_PHOTO_MAX} for any step, to show how it should look.${form.photoChoices?.length > 0 ? " Upload your own, or pick from the photos on the page you imported." : ""}`}
                >
                  <ol className="rb-stepphoto-list">
                    {stepLines(form.stepText).map((line, i) => {
                      const photos = form.stepPhotos?.[i] || [];
                      const room = photos.length < STEP_PHOTO_MAX;
                      const { title, text } = stepParts(line);
                      const name = title || text;
                      return (
                        <li key={i} className="rb-stepphoto-row">
                          <p className="rb-stepphoto-step">
                            <span className="rb-num">{i + 1}</span>
                            <span>{name.length > 90 ? `${name.slice(0, 90)}…` : name}</span>
                          </p>
                          <div className="rb-stepphoto-items">
                            {photos.map((ph) => (
                              <span key={ph.id} className="rb-stepphoto-item">
                                <img src={ph.data || stepPhotoSrc(ph.id)} alt="" />
                                <button
                                  type="button"
                                  className="rb-stepphoto-x rb-focus"
                                  onClick={() => removeStepPhoto(i, ph.id)}
                                  aria-label={`Remove this photo from step ${i + 1}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {room ? (
                              <>
                                {/* a label around a hidden input, sized to its words, like the other photo buttons */}
                                <label className="rb-btn rb-focus rb-shotbtn" style={{ ...btnQuiet, padding: "6px 12px", fontSize: 12.5 }}>
                                  {stepPhotoBusy === i ? "Working…" : "Upload a photo"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    disabled={stepPhotoBusy !== null}
                                    onChange={(e) => { addStepUpload(i, e.target.files?.[0]); e.target.value = ""; }}
                                    style={{ display: "none" }}
                                  />
                                </label>
                                {form.photoChoices?.length > 0 && (
                                  <button
                                    type="button"
                                    className="rb-btn rb-focus"
                                    style={{ ...btnQuiet, padding: "6px 12px", fontSize: 12.5 }}
                                    aria-expanded={stepPicking === i}
                                    onClick={() => setStepPicking(stepPicking === i ? null : i)}
                                  >
                                    {stepPicking === i ? "Hide the page's photos" : "From the page"}
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="rb-stepphoto-full">That's {STEP_PHOTO_MAX}, the most a step can have.</span>
                            )}
                          </div>
                          {room && stepPicking === i && form.photoChoices?.length > 0 && (
                            <div className="rb-photo-choices" role="group" aria-label={`Photos from the page for step ${i + 1}`}>
                              {form.photoChoices.map((ph) => (
                                <button
                                  key={ph.src}
                                  type="button"
                                  className="rb-photo-choice rb-focus"
                                  disabled={stepPhotoBusy !== null || photos.some((p) => p.from === ph.src)}
                                  aria-label={ph.alt ? `Add to step ${i + 1}: ${ph.alt}` : `Add this photo to step ${i + 1}`}
                                  onClick={() => addStepFromPage(i, ph.src)}
                                >
                                  <img
                                    src={ph.thumb || ph.src}
                                    alt=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </Field>
              )}

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

      {/* ═══════ MESSENGER ═══════
          A corner of every page rather than a page of its own: the button sits
          in the bottom right, names flash above it when somebody has written,
          and the conversation opens in a small window docked to the button.
          Cooking mode covers it deliberately — a recipe being cooked is not
          the moment for a chat window. */}
      <div className="rb-messenger rb-noprint">
        {/* The corner: names flashing above, then the friends list or its tab. */}
        <div className="rb-dock-list">
          {!listOpen && (() => {
            /* A name flashes here only for somebody with no chat in the dock;
               a minimised chat flashes its own title bar instead. */
            const names = waiting.filter((w) => !chats.some((c) => c.id === w.id));
            return names.length > 0 && (
              <div className="rb-messenger-chips">
                {names.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="rb-messenger-chip rb-focus"
                    onClick={() => openChat(w.id, w.name)}
                    aria-label={`${w.name} has written to you — open the conversation`}
                  >
                    {face(w.id, w.name, 24)}
                    <span>{w.name}{w.unread > 1 ? ` (${w.unread})` : ""}</span>
                  </button>
                ))}
              </div>
            );
          })()}

          {listOpen ? (
            <section className="rb-messenger-panel" aria-label="Friends list">
              <div className="rb-messenger-head">
                <button type="button" className="rb-chatwin-title rb-focus" onClick={toggleList} aria-label="Minimise the friends list">
                  <span className="rb-messenger-title">
                    Friends list
                    {unreadMessages ? <span className="rb-messenger-count">{unreadMessages}</span> : null}
                  </span>
                </button>
                <button type="button" className="rb-chatwin-ctl is-minimise rb-focus" onClick={toggleList} aria-label="Minimise the friends list" title="Minimise">
                  <span aria-hidden>_</span>
                </button>
              </div>
              <div className="rb-messenger-body">
                {inbox === null && !listError && <p className="rb-chat-empty" style={{ marginTop: 10 }}>Looking…</p>}
                {inbox !== null && (() => {
                  /* Everybody in one list, split by whether they are about, and
                     within each half the most recent conversation first. Somebody
                     never written to comes after everybody who has, by name. */
                  const isOpen = (id) => chats.some((c) => c.id === id && !c.minimized);
                  const threads = new Map((inbox || []).map((t) => [t.with, t]));
                  const latest = (id) => threads.get(id)?.last?.id || 0;
                  const everyone = [
                    ...(inbox || []).map((t) => ({ id: t.with, name: t.name })),
                    ...messagePeople.filter((p) => !threads.has(p.id)),
                  ].sort((a, b) => latest(b.id) - latest(a.id) || a.name.localeCompare(b.name));
                  const online = everyone.filter((p) => lightOn(p.id));
                  const offline = everyone.filter((p) => !lightOn(p.id));
                  const row = (p) => {
                    const t = threads.get(p.id);
                    /* The section already says who is on, so only the offline
                       half needs "Last seen" underneath. */
                    const seen = !lightOn(p.id) && statusFor(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`rb-chat-person rb-focus${isOpen(p.id) ? " is-open" : ""}`}
                          onClick={() => openChat(p.id, p.name)}
                        >
                          {faceWithLight(p.id, p.name, 36)}
                          <span className="rb-chat-lines">
                            <span className="rb-chat-who">
                              {p.name}
                              {t?.unread ? <span className="rb-chat-unread">{t.unread}</span> : null}
                            </span>
                            {blockedIds.includes(p.id) ? (
                              <span className="rb-chat-last">Blocked</span>
                            ) : t?.last ? (
                              <span className="rb-chat-last">
                                {t.last.mine ? "You: " : ""}
                                {t.last.deleted ? (t.last.removed ? "message removed" : "message taken back")
                                  : (isGifMessage(t.last.text) ? "Sent a GIF" : t.last.text) || (t.last.attachment ? (t.last.attachment.picture ? "Sent a photo" : `Sent ${t.last.attachment.name}`) : "")}
                              </span>
                            ) : null}
                            {seen ? <span className="rb-chat-seen">{seen}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  };
                  return (
                    <>
                      <p className="rb-chat-heading" id="rb-friends-online" style={{ marginTop: 12 }}>Online ({online.length})</p>
                      {online.length > 0 ? (
                        <ul className="rb-chat-list" aria-labelledby="rb-friends-online">{online.map(row)}</ul>
                      ) : (
                        <p className="rb-chat-empty" style={{ fontSize: 12.5, margin: "2px 0 4px" }}>Nobody else is on right now.</p>
                      )}
                      {offline.length > 0 && (
                        <>
                          <p className="rb-chat-heading" id="rb-friends-offline">Offline ({offline.length})</p>
                          <ul className="rb-chat-list" aria-labelledby="rb-friends-offline">{offline.map(row)}</ul>
                        </>
                      )}
                    </>
                  );
                })()}
                {listError && <p className="rb-messenger-error">{listError}</p>}
              </div>
            </section>
          ) : (
            <button type="button" className="rb-messenger-open rb-focus" onClick={toggleList} aria-expanded={false}>
              <span aria-hidden>✉</span>
              Messenger
              {unreadMessages ? <span className="rb-messenger-count">{unreadMessages}</span> : null}
            </button>
          )}
        </div>

        {/* The chats, nearest the list first; the dock runs right to left. */}
        {chats.map((c) => (
          <ChatWindow
            key={c.id}
            id={c.id}
            name={c.name || personLabel(c.id)}
            minimized={c.minimized}
            focusAt={c.focusAt}
            unread={waiting.find((w) => w.id === c.id)?.unread || 0}
            blocked={blockedIds.includes(c.id)}
            owner={!!profile?.owner}
            onOpenPhoto={setLightbox}
            quickEmoji={quickEmoji}
            onQuickEmoji={chooseQuickEmoji}
            face={face}
            faceWithLight={faceWithLight}
            statusFor={statusFor}
            onMinimize={() => minimizeChat(c.id)}
            onRestore={() => restoreChat(c.id)}
            onClose={() => closeChat(c.id)}
            onBlock={(b) => blockPerson(c.id, b)}
            onRead={markRead}
            onSent={refreshInbox}
          />
        ))}
      </div>

      {/* ═══════ A PHOTO, FULL SIZE ═══════ */}
      {lightbox && (
        <div
          className="rb-lightbox rb-noprint"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption || `Photo from ${lightbox.name}`}
          onClick={() => setLightbox(null)}
        >
          {/* The full-size picture is a plain address rather than something
              fetched and held in memory, so the browser does the loading, the
              caching and the decoding, and the small version already on screen
              stands in until it arrives. */}
          <img
            src={lightbox.src || `${NOTES_API}?photo=${encodeURIComponent(lightbox.id)}`}
            alt={lightbox.alt ?? `Cooked by ${lightbox.name}`}
            onClick={(ev) => ev.stopPropagation()}
          />
          <p className="rb-lightbox-who">
            {lightbox.caption ?? <>{lightbox.name}{lightbox.at ? <> · <When iso={lightbox.at} /></> : null}</>}
          </p>
          <button type="button" className="rb-lightbox-x rb-focus" onClick={() => setLightbox(null)} aria-label="Close the photo">
            ×
          </button>
        </div>
      )}

      {/* ═══════ TIMER TRAY ═══════ */}
      {ringing && <div className="rb-flash rb-noprint" aria-hidden />}

      {timers.length > 0 && (
        <div
          role="status"
          aria-label="Timers"
          className="rb-noprint rb-timers"
          style={timerSpot || undefined}
        >
          {timers.map((t) => {
            const done = t.remaining === 0;
            const label = `${done ? "Time's up — " : ""}${t.label}`;
            return (
              <div key={t.id} className={`rb-timer${done ? " is-done rb-chip-done" : ""}`}>
                <div className="rb-timer-row">
                  <span className="rb-num rb-timer-clock">{clock(t.remaining)}</span>
                  <span className="rb-timer-btns">
                    {!done && (
                      <button className="rb-btn rb-focus" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => toggleTimer(t.id)}>
                        {t.running ? "Pause" : "Resume"}
                      </button>
                    )}
                    <button className="rb-btn rb-focus" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => dropTimer(t.id)}>
                      {done ? "Clear" : "Stop"}
                    </button>
                  </span>
                </div>
                <p className="rb-timer-label" title={label}>{label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
