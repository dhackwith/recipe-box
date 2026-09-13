/**
 * Fetches a recipe page on the reader's behalf and hands back the schema.org
 * Recipe it publishes. The browser cannot do this itself — other sites do not
 * allow a page on this domain to read theirs — so this is the one place the
 * page is fetched.
 *
 * POST { url }                 -> { recipe, url }   the Recipe node, and where it was found
 *
 * A page can describe its recipe three ways: a block of ld+json, microdata
 * attributes hung on the visible markup, or h-recipe class names. All are
 * read, and what comes back is the same shape either way, so nothing
 * downstream has to care which it was.
 * POST { url, kind: "image" }  -> the image bytes, for the recipe's photo
 * POST { url, kind: "fill" }   -> { steps, equipment }  what the page didn't label, suggested by Workers AI
 *
 * It is deliberately not a general proxy: pages come back only as the parsed
 * recipe, never as HTML, and the image mode refuses anything that is not an
 * image. Cloudflare Access sits in front, so only the family can reach it.
 */

import { findMicrodataRecipe } from "../../shared/microdata.js";
import { findHRecipe } from "../../shared/hrecipe.js";
import { suggest } from "../../shared/fill.js";

const MAX_PAGE = 5 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const TIMEOUT_MS = 12000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Recipe sites only. Nothing on a local network and nothing addressed by bare
   IP — there is no recipe there, and refusing them keeps this from being
   pointed at things it has no business reaching. */
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")
  ) return null;
  return u;
}

/* Several recipe sites turn away requests that do not look like a browser. */
const fetchFrom = (url, accept) =>
  fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.8",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

/* Stop reading once the cap is passed rather than buffering whatever arrives. */
async function readCapped(res, limit) {
  if (Number(res.headers.get("content-length") || 0) > limit) throw new Error("too large");
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("too large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/* Every ld+json block on the page. Some are wrapped in HTML comments or CDATA
   by older CMSs, and one malformed block must not sink the others. */
export function ldBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1]
      .trim()
      .replace(/^<!--/, "").replace(/-->$/, "")
      .replace(/^\/\/\s*<!\[CDATA\[/, "").replace(/\/\/\s*\]\]>$/, "")
      .trim();
    try { out.push(JSON.parse(raw)); } catch { /* skip it */ }
  }
  return out;
}

const isRecipe = (n) =>
  n && typeof n === "object" && [].concat(n["@type"] || []).some((t) => String(t).toLowerCase() === "recipe");

/* The Recipe is often not at the top: WordPress plugins nest it inside @graph,
   news sites under mainEntity, list pages inside itemListElement. Search the
   whole structure rather than guessing which of those a site used. */
export function findRecipe(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const x of node) { const hit = findRecipe(x, depth + 1); if (hit) return hit; }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const v of Object.values(node)) {
    const hit = findRecipe(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* Microdata as found, with h-recipe supplying only what it left empty. On a
   Jetpack page that is the directions and the notes: the name, yield and
   ingredients are labelled both ways, and must not be read twice. */
export function fillGaps(recipe, extra) {
  if (!recipe || !extra) return recipe || extra;
  const out = { ...recipe };
  const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  for (const [k, v] of Object.entries(extra)) if (empty(out[k])) out[k] = v;
  return out;
}

/* The page and the recipe on it, or a Response explaining why not. */
async function load(url) {
  let res;
  try { res = await fetchFrom(url, "text/html,application/xhtml+xml"); }
  catch (err) {
    return err && err.name === "TimeoutError"
      ? json({ error: "That site took too long to answer" }, 504)
      : json({ error: "Couldn't reach that site" }, 502);
  }
  if (!res.ok) {
    const blocked = res.status === 401 || res.status === 403;
    return json({
      error: blocked
        ? `That site refused the request (${res.status}) — some sites block imports, and paywalled pages can't be read`
        : `That site answered with an error (${res.status})`,
    }, 502);
  }
  let html;
  try { html = new TextDecoder().decode(await readCapped(res, MAX_PAGE)); }
  catch { return json({ error: "That page is too large to read" }, 502); }

  /* JSON-LD first, because when a page has it, it is the tidiest and most
     complete of the three. Microdata and h-recipe are the fallback, not a
     second opinion: they are read only when there is no ld+json at all, so the
     cost lands on the pages that would otherwise have failed outright. */
  const recipe = findRecipe(ldBlocks(html)) || fillGaps(findMicrodataRecipe(html), findHRecipe(html));
  if (!recipe) {
    return json({ error: "That page doesn't publish a recipe this can read — try copying the recipe text into the paste box instead" }, 422);
  }
  return { recipe, html, from: res.url || url.toString() };
}

async function page(url) {
  const got = await load(url);
  return got instanceof Response ? got : json({ recipe: got.recipe, url: got.from });
}

/* Steps and equipment the page didn't label, suggested and checked against the
   page by shared/fill.js. It needs a Workers AI binding named AI; without one
   it says so, and the importer carries on without suggestions. The page is
   fetched again rather than taken from the browser, so this can only ever be
   pointed at a real recipe page and never used as a general-purpose model. */
async function fill(url, env) {
  if (!env || !env.AI) return json({ error: "Suggestions aren't switched on for this site" }, 501);
  const got = await load(url);
  if (got instanceof Response) return got;
  try {
    return json(await suggest(env.AI, got.recipe, got.html));
  } catch (err) {
    const why = String((err && err.message) || err);
    return /4006|daily free allocation|neurons/i.test(why)
      ? json({ error: "Today's free suggestions are used up — they come back at midnight UTC" }, 429)
      : json({ error: "The suggestion service didn't give a usable answer" }, 502);
  }
}

async function image(url) {
  let res;
  try { res = await fetchFrom(url, "image/avif,image/webp,image/png,image/jpeg,image/*"); }
  catch { return json({ error: "Couldn't fetch the photo" }, 502); }
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!res.ok || !type.startsWith("image/")) return json({ error: "That address isn't an image" }, 502);
  let bytes;
  try { bytes = await readCapped(res, MAX_IMAGE); }
  catch { return json({ error: "That photo is too large" }, 502); }
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send the address as JSON" }, 400); }
  const url = checkUrl(body && body.url);
  if (!url) return json({ error: "That doesn't look like a recipe page address" }, 400);
  if (body.kind === "image") return image(url);
  if (body.kind === "fill") return fill(url, env);
  return page(url);
}
