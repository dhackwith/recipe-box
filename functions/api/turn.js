/**
 * Where a call goes when the two browsers can't reach each other directly
 * (shared/turn.js).
 *
 * GET -> { iceServers: [...], seconds }
 *
 * Only for somebody signed in, because a login here costs the site's relay
 * allowance. One login is fetched per server copy and shared by the calls it
 * serves until it is nearly out of date: they are the same for everybody, and
 * asking Cloudflare on every call would be a request nobody needs.
 *
 * Without the keys in the site's settings this says so, and the page quietly
 * carries on with STUN alone — which is how calls worked before.
 */

import { identity } from "../../shared/access.js";
import { hasTurnKeys, turnCredentials, TURN_TTL } from "../../shared/turn.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Asked for again a minute before the login runs out. */
const EARLY_MS = 60 * 1000;
let held = null;

export async function onRequest({ request, env }) {
  if (!hasTurnKeys(env)) {
    return json({ error: "The relay isn't switched on for this site" }, 501);
  }
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in" }, 403);

  const now = Date.now();
  if (!held || held.until - EARLY_MS < now) {
    try {
      const servers = await turnCredentials(env, TURN_TTL);
      held = { servers, until: now + TURN_TTL * 1000 };
    } catch (err) {
      held = null;
      return json({ error: String(err && err.message ? err.message : err) }, 502);
    }
  }
  return json({ iceServers: held.servers, seconds: Math.round((held.until - now) / 1000) });
}
