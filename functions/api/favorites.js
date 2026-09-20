/**
 * How many people have starred each recipe.
 *
 * Requires the same RECIPES binding as /api/storage.
 *
 * GET            -> { counts: { <recipeId>: n }, people: n }
 * PUT  { ids }   -> replace your own list; answers with the fresh counts
 *
 * WHAT THIS IS NOT
 * It is not where your favorites live. That is still src/favorites.js and the
 * per-person key under /api/storage, with its stamps and its tombstones, so
 * starring on the phone and un-starring on the laptop settles the way it
 * always has. This endpoint keeps a flattened copy of the *result* — just the
 * ids, under `favs:<email>` — purely so the box can be put in order of how
 * many people kept a recipe. The client writes it after a sync settles.
 *
 * WHAT IT WILL NOT TELL YOU
 * Only totals ever leave here. The counts are added up on this side and the
 * per-person keys are never served, so "★ 4" is all anybody learns: a recipe
 * four people kept, not which four. See shared/tally.js.
 *
 * A listing can lag KV's edge cache by about a minute, so somebody else's new
 * star can take that long to show. Your own count is right immediately,
 * because a PUT answers with the totals it has just written.
 */

import { identity } from "../../shared/access.js";
import { FAV_PREFIX, favKey, asIdList, readIdList, tally, STARS_MAX } from "../../shared/tally.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    /* Counting is a handful of reads and the answer is stale the moment
       somebody stars something, so it is never cached by the browser. */
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* A family, not a forum. Far above the roster, and a hard stop on how much
   work one request can ask for. */
const PEOPLE_MAX = 200;

/** Everybody's list, read in one listing and a get each, keyed by whose it is
    so a caller can put a fresher copy of its own in place without a second
    listing. */
async function everyList(env) {
  const listed = await env.RECIPES.list({ prefix: FAV_PREFIX, limit: PEOPLE_MAX });
  const keys = listed.keys.map((k) => k.name);
  const stored = await Promise.all(keys.map((k) => env.RECIPES.get(k)));
  return new Map(keys.map((k, i) => [k, readIdList(stored[i])]));
}

const summary = (lists) => {
  const all = [...lists.values()];
  return { counts: tally(all), people: all.filter((l) => l.length).length };
};

export async function onRequest({ request, env }) {
  if (!env.RECIPES) {
    return json({ error: "KV namespace RECIPES is not bound to this project" }, 500);
  }

  /* Reading the counts needs an identity too: the totals are the family's, not
     the web's, even though they say nothing about any one person. */
  const email = await identity(request);
  if (!email) {
    return json({ error: "Could not tell who is signed in" }, 403);
  }

  try {
    if (request.method === "GET") {
      return json(summary(await everyList(env)));
    }

    if (request.method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.ids)) {
        return json({ error: "ids must be a list of recipe ids" }, 400);
      }
      if (body.ids.length > STARS_MAX) {
        return json({ error: "that is more favorites than anyone has" }, 400);
      }
      const mine = asIdList(body.ids);

      /* Written only when it has actually changed. A page that syncs on every
         wake would otherwise spend a KV write each time to say the same thing,
         and the free tier's daily allowance is the thing being protected. */
      const key = favKey(email);
      const before = await env.RECIPES.get(key);
      const after = JSON.stringify(mine);
      if (before !== after) await env.RECIPES.put(key, after);

      /* The counts as they now stand, so whoever just starred something sees
         their own change straight away rather than waiting on the edge cache.
         Their own list is used as just written, not as read back — a listing
         made a moment ago may not have caught up with it, or with them. */
      const lists = await everyList(env);
      lists.set(key, mine);
      return json({ ...summary(lists), saved: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
