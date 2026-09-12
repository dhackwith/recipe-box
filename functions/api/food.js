/**
 * Searching for a food that is not a recipe.
 *
 * A thin proxy onto USDA FoodData Central. It exists for two reasons: the key
 * belongs on the server rather than in everybody's browser, and the reply is cut
 * down to the four numbers the tracker uses before it crosses the wire.
 *
 * GET ?q=celery  ->  { results: [{ id, name, brand, kind, portion, per }] }
 *
 * Behind Access like everything else, so the key cannot be spent by strangers.
 *
 * THE KEY: set FDC_API_KEY in the Pages project (Settings → Environment
 * variables), from a free signup at fdc.nal.usda.gov/api-key-signup — no card,
 * 1,000 requests an hour. Without one this falls back to DEMO_KEY, which allows
 * about 30 an hour and will start refusing; the reply says so plainly rather
 * than looking like an outage.
 *
 * Results are cached for a day. The same handful of foods get searched over and
 * over in a household, the underlying data changes about twice a year, and an
 * hourly allowance is worth spending on new questions rather than repeats.
 */

import { identity } from "../../shared/access.js";
import { readSearch, DATA_TYPES } from "../../shared/food.js";

const FDC = "https://api.nal.usda.gov/fdc/v1/foods/search";
const CACHE_SECONDS = 86400;
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 25;

const json = (data, status = 200, seconds = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": seconds ? `private, max-age=${seconds}` : "no-store",
    },
  });

export async function onRequest({ request, env }) {
  /* Everything, not just the outbound call. Without this any throw escapes into
     Cloudflare's own error page — which arrives as a 5xx carrying HTML, so the
     app cannot read a reason out of it and says only that it could not search.
     A function that fails should still answer in the shape it promised. */
  try {
    return await search({ request, env });
  } catch (err) {
    return json({ error: `The food search broke: ${err && err.message ? err.message : err}` }, 500);
  }
}

async function search({ request, env }) {
  if (!(await identity(request))) {
    return json({ error: "Could not tell who is signed in" }, 403);
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ results: [] });
  if (q.length > 100) return json({ error: "That search is too long" }, 400);

  /* Trimmed, because a key pasted into a dashboard field arrives with a newline
     on it more often than not, and data.gov rejects the whole thing for the one
     stray character. Forty characters of key and one invisible one is a wrong
     answer nobody can see, so it is dealt with here rather than left as a thing
     somebody has to notice. */
  const key = String(env.FDC_API_KEY || "").trim() || "DEMO_KEY";
  const configured = key !== "DEMO_KEY";
  const url = new URL(FDC);
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", String(MAX_RESULTS));
  /* Ask for the four datasets in the order a kitchen question wants them. */
  for (const t of DATA_TYPES) url.searchParams.append("dataType", t);

  let res;
  try {
    /* Deliberately plain. This had cf: { cacheTtl, cacheEverything } on it,
       which is a Cloudflare-only fetch option and therefore the one line that
       could not be exercised anywhere else — and an untestable optimisation is
       a poor trade against a search that works. The reply is still cached, by
       the Cache-Control header below, which every client honours.

       AbortSignal.timeout is guarded for the same reason: a missing API should
       cost the timeout, not the whole request. */
    const init = { headers: { Accept: "application/json" } };
    /* Added only when it exists, rather than passed as undefined. A runtime
       that validates this field would reject the literal undefined, and the
       throw would land outside anything that could explain it. */
    if (typeof AbortSignal?.timeout === "function") init.signal = AbortSignal.timeout(TIMEOUT_MS);
    res = await fetch(url, init);
  } catch (err) {
    return json({
      error: err && err.name === "TimeoutError"
        ? "The food database took too long to answer"
        : "Couldn't reach the food database",
    }, 502);
  }

  /* The status alone is not enough to tell what happened. Watched live, the
     data.gov limiter answers 429 most of the time and 400 some of the time for
     the very same condition, so the body's error code is the thing to trust —
     and a rejected key deserves to say so rather than arriving as a generic
     failure while somebody is trying to work out whether they set it right. */
  const body = await res.text();
  let payload = null;
  try { payload = JSON.parse(body); } catch { payload = null; }
  const code = payload?.error?.code || "";

  if (code === "API_KEY_INVALID" || code === "API_KEY_MISSING" || res.status === 403) {
    return json({
      error: configured
        ? "FoodData Central rejected the key. Check FDC_API_KEY in the Pages project — and that it is set for the environment this deployment is in, and that the project has been redeployed since."
        : "No food database key is set. Add FDC_API_KEY in the Pages project.",
    }, 502);
  }

  if (code === "OVER_RATE_LIMIT" || res.status === 429) {
    return json({
      error: configured
        ? "The food database has had too many requests this hour — try again shortly"
        : "This is using the shared demo key, which only allows a few searches an hour. Set FDC_API_KEY in the Pages project for the full allowance.",
    }, 429);
  }

  if (!res.ok) return json({ error: `The food database answered with an error (${res.status})` }, 502);
  if (!payload) return json({ error: "The food database sent something unreadable" }, 502);

  return json({ results: readSearch(payload, MAX_RESULTS), demo: !configured }, 200, CACHE_SECONDS);
}
