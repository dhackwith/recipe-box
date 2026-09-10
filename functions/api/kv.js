/**
 * Storage API for the recipe box.
 *
 * Requires a KV namespace bound as RECIPES (Pages project → Settings →
 * Functions → KV namespace bindings).
 *
 * Cloudflare Access sits in front of this, so every request that arrives here
 * has already been checked against the allowlist. The identity it forwards is
 * used to namespace personal keys — it is not a second authorisation check.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Access puts the signed-in email on every request it lets through. */
const identity = (request) =>
  request.headers.get("Cf-Access-Authenticated-User-Email") || "local-dev";

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
