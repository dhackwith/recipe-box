/**
 * Every photograph on a recipe page that could be the recipe's photo, best
 * first, so the importer can offer a choice instead of taking whatever the
 * structured data happened to name.
 *
 * A recipe page is mostly not the recipe: sidebars of popular posts, cookbook
 * covers, author headshots, share buttons, comment avatars, related-recipe
 * cards. So the search stays inside the article and throws out anything
 * marked as one of those, anything too small to be a photo, and anything that
 * is an icon, a logo or an SVG. The same picture turns up several times at
 * different sizes — as the structured-data image, the link-preview image, the
 * header, a lazy-loaded <img> and its <noscript> twin — and is offered once.
 *
 * Each photo comes back as { src, thumb, alt }: src is a size worth keeping,
 * thumb a small one for the picker, both absolute.
 */

import { elements } from "./hrecipe.js";

const MAX_PHOTOS = 12;
const FULL_WIDTH = 1400;   // what the site keeps (FULL_MAX in RecipeBox.jsx); nothing larger is worth fetching
const THUMB_WIDTH = 240;   // a choice is shown about 100px wide, twice that on a sharp screen
const MIN_SIDE = 300;

/* Words in class names and ids that mark the things around a recipe rather
   than the recipe itself. Checked on the image and everything between it and
   the article, never on the article's own classes, which WordPress fills with
   the post's tags and categories.

   Whole words, not substrings. Simply Recipes wraps every real photo in
   "img-placeholder", and plenty of blogs put a Pinterest "share" overlay around
   theirs, so words like those would hide exactly the photos worth offering.
   Share buttons and icons are caught anyway, by size and by file. */
const FURNITURE = new Set([
  "author", "avatar", "gravatar", "headshot", "logo", "icon", "emoji", "badge", "sprite", "spinner",
  "related", "relatedposts", "widget", "sidebar", "comment", "newsletter", "advert", "advertisement", "promo",
]);
const isFurniture = (label) =>
  String(label).toLowerCase().split(/[^a-z0-9]+/).some((w) => FURNITURE.has(w) || FURNITURE.has(w.replace(/s$/, "")));
const OFF_PAGE = new Set(["aside", "nav", "footer", "form"]);
const META_IMAGES = new Set(["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]);
const GENERIC_NAME = /^(image|img|photo|picture|original|large|medium|small|thumb|thumbnail|default|full|\d+)$/;

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

function resolve(raw, base) {
  const s = tidy(raw);
  if (!s || /^data:/i.test(s)) return null;
  try {
    /* URL() refuses a bad base even for an address that doesn't need one */
    let u;
    try { u = new URL(s); } catch { u = new URL(s, base); }
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/* "a.jpg 300w, b.jpg 1024w" as [{ url, w }]. Only width descriptors say how
   big a candidate is, so "2x" ones are left to the plain src. */
function srcsetOf(v, base) {
  return String(v ?? "")
    .split(/,\s+/)
    .map((part) => {
      const [url, desc = ""] = part.trim().split(/\s+/);
      return { url: resolve(url, base), w: /^\d+w$/i.test(desc) ? parseInt(desc, 10) : 0 };
    })
    .filter((c) => c.url && c.w);
}

/* The smallest candidate at least `want` wide, or else the widest there is. */
function sized(candidates, want) {
  const byWidth = [...candidates].sort((a, b) => a.w - b.w);
  return byWidth.find((c) => c.w >= want) || byWidth[byWidth.length - 1] || null;
}

/* Icons, logos and the like, judged by the file itself. Whole words only:
   "silicone-mat.jpg" has "icon" in it and is a photograph. */
function notAPhoto(url) {
  const u = new URL(url);
  const file = u.pathname.split("/").pop().toLowerCase();
  return /\.(svg|gif)$/.test(file) ||
    /(^|\.)gravatar\.com$/.test(u.hostname) ||
    /(^|[-_.])(logo|icon|favicon|avatar|sprite|emoji|spacer)s?([-_.]|$)/.test(file);
}

/* What makes two addresses the same picture. CDNs rename the path and the
   query for every size (WordPress adds -1024x683, Dotdash a fresh hash), but
   the file name survives, so that is the key — unless it is too short or too
   generic to trust, when the whole address is. */
function samePicture(url) {
  const u = new URL(url);
  let file = u.pathname.split("/").pop() || "";
  try { file = decodeURIComponent(file); } catch { /* keep it as it is */ }
  file = file.toLowerCase().replace(/\.(jpe?g|png|webp|avif)$/, "").replace(/-\d+x\d+$/, "").replace(/-scaled$/, "");
  return file.length >= 8 && !GENERIC_NAME.test(file) ? file : u.host + u.pathname;
}

function inside(el, ancestor) {
  for (let p = el.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/* Whether the image, or anything between it and the scope, is page furniture. */
function aroundTheRecipe(el, scope) {
  for (let p = el; p && p !== scope; p = p.parent) {
    if (OFF_PAGE.has(p.tag)) return true;
    if (isFurniture(`${p.attrs.class || ""} ${p.attrs.id || ""}`)) return true;
  }
  return false;
}

/**
 * The photos a page offers, in the order worth offering them: the recipe's
 * own image, then the page's link-preview image, then the article's photos in
 * the order they appear.
 */
export function pagePhotos(html, recipe, base) {
  const { all } = elements(html);
  const photos = [];
  const byKey = new Map();

  const add = (src, thumb, alt) => {
    if (!src) return;
    let key;
    try {
      if (notAPhoto(src)) return;
      key = samePicture(src);
    } catch {
      return;
    }
    const had = byKey.get(key);
    if (had) {
      /* the first sighting keeps its place; a later one can still lend it a
         lighter thumbnail or a description */
      if (had.thumb === had.src && thumb && thumb !== src) had.thumb = thumb;
      if (!had.alt && alt) had.alt = alt;
      return;
    }
    const photo = { src, thumb: thumb || src, alt: alt || "" };
    byKey.set(key, photo);
    photos.push(photo);
  };

  for (const img of [].concat(recipe?.image ?? [])) {
    add(resolve(typeof img === "string" ? img : img?.url || img?.contentUrl, base));
  }

  for (const el of all) {
    if (el.tag === "meta" && META_IMAGES.has((el.attrs.property || el.attrs.name || "").toLowerCase())) {
      add(resolve(el.attrs.content, base));
    }
  }

  /* The article with the most in it is the post; smaller ones are cards for
     other recipes. Without an article, the main content, then the page. */
  const scope =
    all.filter((el) => el.tag === "article").sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] ||
    all.find((el) => el.tag === "main") ||
    all.find((el) => el.tag === "body") ||
    null;

  for (const el of all) {
    if (el.tag !== "img") continue;
    if (scope && !inside(el, scope)) continue;
    if (aroundTheRecipe(el, scope)) continue;

    const side = Math.max(num(el.attrs.width), num(el.attrs.height));
    if (side && side < MIN_SIDE) continue;

    const set = [
      ...srcsetOf(el.attrs["data-srcset"] || el.attrs["data-lazy-srcset"], base),
      ...srcsetOf(el.attrs.srcset, base),
    ];
    if (!side && set.length && Math.max(...set.map((c) => c.w)) < MIN_SIDE) continue;

    /* Lazy loaders park the real address in a data attribute and put a
       placeholder in src, which resolve() already refuses when it's inline. */
    const plain = [el.attrs["data-src"], el.attrs["data-lazy-src"], el.attrs["data-original"], el.attrs.src]
      .map((u) => resolve(u, base))
      .find(Boolean);
    const src = sized(set, FULL_WIDTH)?.url || plain;
    const thumb = sized(set, THUMB_WIDTH)?.url || src;
    add(src, thumb, tidy(el.attrs.alt));
  }

  return photos.slice(0, MAX_PHOTOS);
}
