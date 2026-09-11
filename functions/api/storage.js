/**
 * Storage API for the recipe box.
 *
 * Requires a KV namespace bound as RECIPES (Pages project → Settings →
 * Bindings → KV namespace). Bind it in BOTH the Production and the Preview
 * environment — those are configured separately — then redeploy, because a
 * binding only takes effect on a new deployment. While it is unbound every
 * write fails silently: saveBox swallows the 500, so the box lives in React
 * state and is gone on reload.
 *
 * Reads are served from a ~60s edge cache, so a save reaches other devices
 * within about a minute. The person saving sees their own change at once —
 * the app keeps the authoritative box in memory and does not re-read.
 *
 * Cloudflare Access sits in front of the site, so only invited people reach
 * this. Unshared keys are namespaced by the email header Access forwards —
 * but that header has not been arriving here, and the old fallback filed
 * every visitor under one made-up name (which gave the whole family a single
 * "personal" shopping list). Without an email, unshared keys are now refused.
 * The app keeps personal things in the browser instead.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Access puts the signed-in email on every request it lets through. */
const identity = (request) => request.headers.get("Cf-Access-Authenticated-User-Email");

const namespaced = (request, key, shared) =>
  shared ? `shared:${key}` : `user:${identity(request)}:${key}`;

export async function onRequest({ request, env }) {
  if (!env.RECIPES) {
    return json({ error: "KV namespace RECIPES is not bound to this project" }, 500);
  }

  const url = new URL(request.url);
  const shared = url.searchParams.get("shared") === "true";
  const key = url.searchParams.get("key");
  const prefix = url.searchParams.get("prefix");
  if (!shared && !identity(request)) {
    return json({ error: "No one is signed in, so there is nowhere personal to keep this" }, 403);
  }

  try {
    if (request.method === "GET" && prefix !== null) {
      const scope = namespaced(request, prefix, shared);
      const listed = await env.RECIPES.list({ prefix: scope });
      const cut = scope.length - prefix.length;
      return json({ keys: listed.keys.map((k) => k.name.slice(cut)), prefix, shared });
    }

    if (request.method === "GET") {
      if (!key) return json({ error: "key or prefix required" }, 400);
      const value = await env.RECIPES.get(namespaced(request, key, shared));
      if (value === null) return json({ error: "not found" }, 404);
      return json({ key, value, shared });
    }

    if (request.method === "PUT") {
      if (!key) return json({ error: "key required" }, 400);
      const { value } = await request.json();
      if (typeof value !== "string") return json({ error: "value must be a string" }, 400);
      // KV values cap at 25 MB; recipe photos are far below that, but fail loudly.
      await env.RECIPES.put(namespaced(request, key, shared), value);
      return json({ key, value, shared });
    }

    if (request.method === "DELETE") {
      if (!key) return json({ error: "key required" }, 400);
      await env.RECIPES.delete(namespaced(request, key, shared));
      return json({ key, deleted: true, shared });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
