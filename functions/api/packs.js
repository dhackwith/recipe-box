/**
 * What to buy, as a shop sells it: package suggestions for the shopping list,
 * asked of Workers AI and checked by shared/packs.js.
 *
 * POST { items: [{ id, name, amount, unit }], country? }
 *   -> { country, packs: { [id]: { package, size, unit, count, estimate } | null } }
 * POST { }  -> { country }, the country this visitor is shopping in by default
 *
 * THE COUNTRY is "US" or "NZ": the one asked for, or else where Cloudflare
 * says the visitor is — New Zealand if they are there, the United States
 * otherwise.
 *
 * Needs the Workers AI binding named AI, the same one the recipe importer uses.
 * Behind Access like everything else, so the allowance can't be spent by
 * strangers, and only shopping items go in — it can't be used as a general
 * model. Answers are cached for a month per country, item and rough size of
 * need, shared across the family: what a supermarket sells doesn't depend on
 * who asked, and the day's free allowance is better spent on new questions.
 */

import { identity } from "../../shared/access.js";
import { hasHate } from "../../shared/hate.js";
import { readAnswer } from "../../shared/fill.js";
import { MODEL, isCountry, cleanItems, cacheKeyOf, packRequest, rawPack, readPack } from "../../shared/packs.js";

const CACHE_SECONDS = 30 * 24 * 3600;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const edgeCache = () => {
  try { return typeof caches !== "undefined" && caches.default ? caches.default : null; }
  catch { return null; }
};
const cacheRequest = (key) => new Request(`https://packs-cache.invalid/v1?k=${encodeURIComponent(key)}`);

export async function onRequest(context) {
  try {
    return await packs(context);
  } catch (err) {
    return json({ error: `The package suggestions broke: ${err && err.message ? err.message : err}` }, 500);
  }
}

async function packs({ request, env, waitUntil }) {
  if (!(await identity(request))) return json({ error: "Could not tell who is signed in" }, 403);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await request.json().catch(() => null);
  const country = isCountry(body?.country) ? body.country : request.cf?.country === "NZ" ? "NZ" : "US";
  if (!body || body.items === undefined) return json({ country });

  if (!env || !env.AI) return json({ error: "Suggestions aren't switched on for this site" }, 501);

  const items = cleanItems(body.items).filter((it) => !hasHate(it.name));
  const result = {};
  const cache = edgeCache();
  const misses = [];

  for (const item of items) {
    const hit = cache && (await cache.match(cacheRequest(cacheKeyOf(country, item))).catch(() => null));
    const raw = hit ? await hit.json().catch(() => null) : null;
    if (raw) result[item.id] = readPack(raw, item, country);
    else misses.push(item);
  }

  if (misses.length) {
    let answer;
    try {
      answer = readAnswer(await env.AI.run(MODEL, packRequest(country, misses)));
    } catch (err) {
      const why = String((err && err.message) || err);
      return /4006|daily free allocation|neurons/i.test(why)
        ? json({ error: "Today's free suggestions are used up — they come back at midnight UTC" }, 429)
        : json({ error: "The suggestion service didn't give a usable answer" }, 502);
    }

    const answered = Array.isArray(answer.items) ? answer.items : [];
    const stores = [];
    misses.forEach((item, i) => {
      const raw = rawPack(answered.find((a) => Number(a?.n) === i + 1), item);
      const pack = readPack(raw, item, country);
      result[item.id] = pack;
      /* Only an answer that held up is kept, so a bad one is asked again. */
      if (pack && cache) {
        const stored = new Response(JSON.stringify(raw), {
          headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
        });
        stores.push(cache.put(cacheRequest(cacheKeyOf(country, item)), stored).catch(() => {}));
      }
    });
    if (stores.length) {
      const all = Promise.all(stores);
      if (typeof waitUntil === "function") waitUntil(all); else await all;
    }
  }

  for (const item of items) if (!(item.id in result)) result[item.id] = null;
  return json({ country, packs: result });
}
