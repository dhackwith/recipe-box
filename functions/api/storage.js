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
 * Reads are served from KV's ~60s edge cache, so a save reaches other devices
 * within about a minute — that floor is KV's, not ours, and it is why the
 * shopping list keeps writing to localStorage first and treats this endpoint
 * as a sync channel rather than as the truth. The person saving sees their own
 * change at once.
 *
 * WHO IS ASKING
 * Verifying the Access token, in shared/access.js — the same identity that
 * signs a family note, so there is one implementation rather than two that can
 * drift apart.
 *
 * STILL OPEN: shared keys (the family recipe box) are served without checking
 * a token, which is how this has always worked. If the project's *.pages.dev
 * hostname is not itself behind Access, that makes the box world-readable and
 * world-writable. Requiring identity for shared keys too is the one-line fix —
 * delete the `shared ||` below — but do it only once per-person keys are
 * confirmed working in production, so a verification problem cannot take the
 * whole site down with it.
 */

import { identity } from "../../shared/access.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const namespaced = (email, key, shared) => (shared ? `shared:${key}` : `user:${email}:${key}`);

export async function onRequest({ request, env }) {
  if (!env.RECIPES) {
    return json({ error: "KV namespace RECIPES is not bound to this project" }, 500);
  }

  const url = new URL(request.url);
  const shared = url.searchParams.get("shared") === "true";
  const key = url.searchParams.get("key");
  const prefix = url.searchParams.get("prefix");

  const email = shared ? null : await identity(request);
  if (!shared && !email) {
    return json({ error: "Could not tell who is signed in, so there is nowhere personal to keep this" }, 403);
  }

  try {
    if (request.method === "GET" && prefix !== null) {
      const scope = namespaced(email, prefix, shared);
      const listed = await env.RECIPES.list({ prefix: scope });
      const cut = scope.length - prefix.length;
      return json({ keys: listed.keys.map((k) => k.name.slice(cut)), prefix, shared });
    }

    if (request.method === "GET") {
      if (!key) return json({ error: "key or prefix required" }, 400);
      const value = await env.RECIPES.get(namespaced(email, key, shared));
      if (value === null) return json({ error: "not found" }, 404);
      return json({ key, value, shared });
    }

    if (request.method === "PUT") {
      if (!key) return json({ error: "key required" }, 400);
      const { value } = await request.json();
      if (typeof value !== "string") return json({ error: "value must be a string" }, 400);
      // KV values cap at 25 MB; recipe photos are far below that, but fail loudly.
      await env.RECIPES.put(namespaced(email, key, shared), value);
      return json({ key, value, shared });
    }

    if (request.method === "DELETE") {
      if (!key) return json({ error: "key required" }, 400);
      await env.RECIPES.delete(namespaced(email, key, shared));
      return json({ key, deleted: true, shared });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
