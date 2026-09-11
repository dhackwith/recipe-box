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
 * Cloudflare Access sits in front of the site. It no longer sends the old
 * Cf-Access-Authenticated-User-Email header — /api/whoami confirmed on the live
 * domain that only the signed token arrives — so identity comes from verifying
 * that token. Verification is the point, not a formality: the header it
 * replaced could be forged by anything able to reach the origin outside
 * Access, and a forged identity here would hand one person another person's
 * shopping list.
 *
 * STILL OPEN: shared keys (the family recipe box) are served without checking
 * a token, which is how this has always worked. If the project's *.pages.dev
 * hostname is not itself behind Access, that makes the box world-readable and
 * world-writable. Requiring identity for shared keys too is the one-line fix —
 * delete the `shared ||` below — but do it only once per-person keys are
 * confirmed working in production, so a verification problem cannot take the
 * whole site down with it.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/* Both read off /api/whoami on the live domain. Neither is a secret: the AUD
   tag names the Access application and rides in every member's token. It does
   change if the Access application is ever deleted and recreated. */
const TEAM_DOMAIN = "https://thehackwithtable.cloudflareaccess.com";
const POLICY_AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

/* jose caches the fetched keys, so this costs one request per isolate, not one
   per visit. Built once at module scope for that reason. */
const jwks = createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* The signed-in email, or null. Expired, wrong-audience, wrong-issuer and
   outright forged tokens all get the same answer: we do not know you. */
const identity = async (request) => {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: TEAM_DOMAIN,
      audience: POLICY_AUD,
    });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
};

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
