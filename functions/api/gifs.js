/**
 * Searching for a GIF to send in the messenger.
 *
 * A thin proxy onto KLIPY, the free GIF library that took over from Tenor when
 * Google shut Tenor's API down. It exists for the same reasons food.js does:
 * the key belongs on the server rather than in everybody's browser, and the
 * reply is cut down (shared/gif.js) before it crosses the wire.
 *
 * GET ?q=cake[&page=2]  ->  { gifs: [{ id, title, preview, url, width, height }], more }
 * GET                   ->  what is trending, in the same shape
 *
 * Behind Access like everything else, so the key cannot be spent by strangers.
 *
 * THE KEY: KLIPY in the Pages project (Settings → Variables and secrets), from
 * partner.klipy.com — free, no card. A test key allows 100 requests an hour;
 * production access, requested from the same panel, lifts that.
 *
 * FAMILY-SAFE: every request asks for content_filter=high, KLIPY's strictest.
 * The slur filter only reads words, so this is what keeps the pictures clean.
 *
 * WHO IS ASKING is never sent. KLIPY wants a customer id to tell users apart;
 * it gets a hash of the roster id, which says nothing about who that is.
 *
 * Replies are cached for an hour, shared across everybody: the answer does not
 * depend on who asked, and a hundred requests an hour is better spent on new
 * searches than on the same "happy birthday" twice.
 */

import { identity, personFor } from "../../shared/access.js";
import { hasHate } from "../../shared/hate.js";
import { readGifs, hasMoreGifs } from "../../shared/gif.js";

const KLIPY = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;
const MAX_PAGE = 20;
const CACHE_SECONDS = 3600;
const TIMEOUT_MS = 6000;

const json = (data, status = 200, seconds = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* public, not private: the Cache API refuses to store a response marked
         private, and a list of GIFs is the same for everybody. */
      "Cache-Control": seconds ? `public, max-age=${seconds}` : "no-store",
    },
  });

const cacheKey = (q, page) =>
  new Request(`https://gif-cache.invalid/v1?q=${encodeURIComponent(q.toLowerCase())}&page=${page}`);

const edgeCache = () => {
  try { return typeof caches !== "undefined" && caches.default ? caches.default : null; }
  catch { return null; }
};

async function customerId(person) {
  const bytes = new TextEncoder().encode(`recipe-box:${person}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest({ request, env, waitUntil }) {
  /* A function that fails should still answer in the shape it promised, not
     with Cloudflare's HTML error page, which the picker cannot read. */
  try {
    return await search({ request, env, waitUntil });
  } catch (err) {
    return json({ error: `The GIF search broke: ${err && err.message ? err.message : err}` }, 500);
  }
}

async function search({ request, env, waitUntil }) {
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in" }, 403);
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

  /* Trimmed, because a key pasted into a dashboard field often carries a
     newline, and one invisible character is enough to be refused. */
  const key = String(env?.KLIPY || "").trim();
  if (!key) return json({ error: "GIF search isn't set up yet — add KLIPY in the Pages project and redeploy." }, 501);

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().replace(/\s+/g, " ");
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(params.get("page") || "1", 10) || 1));
  if (q.length > 80) return json({ error: "That search is too long" }, 400);
  /* The same words the rest of the site refuses find nothing here either,
     without spending a request to find out what they would have found. */
  if (q && hasHate(q)) return json({ gifs: [], more: false });

  const cache = edgeCache();
  const hit = cache && (await cache.match(cacheKey(q, page)).catch(() => null));
  if (hit) return hit;

  const url = new URL(`${KLIPY}/${encodeURIComponent(key)}/gifs/${q ? "search" : "trending"}`);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("content_filter", "high");
  url.searchParams.set("format_filter", "gif");
  url.searchParams.set("customer_id", await customerId(personFor(email).id));

  let res;
  let body = "";
  try {
    const init = { headers: { Accept: "application/json" } };
    if (typeof AbortSignal?.timeout === "function") init.signal = AbortSignal.timeout(TIMEOUT_MS);
    res = await fetch(url, init);
    body = await res.text();
  } catch (err) {
    return json({
      error: err && err.name === "TimeoutError" ? "KLIPY took too long to answer" : "Couldn't reach KLIPY",
    }, 502);
  }

  let payload = null;
  try { payload = JSON.parse(body); } catch { payload = null; }

  if (res.status === 429) {
    return json({ error: "Too many GIF searches this hour — try again in a little while" }, 429);
  }
  /* KLIPY says a key is wrong with a 404 and result:false rather than a 401,
     so its own words are what to trust. They never include the key. */
  if (!res.ok || !payload || payload.result === false) {
    const said = Array.isArray(payload?.errors?.message) ? payload.errors.message.join(" ") : "";
    if (/key/i.test(said)) {
      return json({ error: "KLIPY refused the key. Check KLIPY in the Pages project, and redeploy after changing it." }, 502);
    }
    return json({ error: `KLIPY answered with an error (${res.status})` }, 502);
  }

  const answer = json({ gifs: readGifs(payload, PER_PAGE), more: hasMoreGifs(payload) }, 200, CACHE_SECONDS);
  if (cache) {
    const store = cache.put(cacheKey(q, page), answer.clone()).catch(() => {});
    if (typeof waitUntil === "function") waitUntil(store); else await store;
  }
  return answer;
}
