/**
 * Cloudflare's relay (TURN), for calls that can't go directly.
 *
 * Two browsers usually talk straight to each other (shared/calls.js), finding
 * their way out with Cloudflare's free STUN. Some networks won't allow that at
 * all — a VPN, strict work Wi-Fi, a router that gives every connection a
 * different address — and such a call simply failed before. The relay is a
 * middle point both ends can always reach: Cloudflare carries the call between
 * them, over ordinary web ports if nothing else is allowed.
 *
 * A relay login is short-lived and made here, never on a page, so the site's
 * TURN key stays on the server. Cloudflare hands back the whole list a browser
 * needs — its STUN server and the relay, with a username and password good for
 * TURN_TTL seconds.
 *
 * FREE: relay traffic shares the Realtime allowance (1,000 GB a month) with
 * the group voice channels, and only calls that can't connect directly use it.
 */

/* How long a login lasts. Long enough for a call nobody ends, short enough
   that one copied off a page is worth little. */
export const TURN_TTL = 2 * 60 * 60;

export const turnUrl = (id) =>
  `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`;

export const hasTurnKeys = (env) => !!(env && env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN);

/* Only what a browser can be handed: each entry a list of stun:/turn: places,
   with the login when there is one. Anything else in the answer is dropped, so
   a change at the other end can't put something odd into a page. */
/* A place to call is written either as one address or as a list of them —
   the site's own STUN server is a single string, Cloudflare sends lists — so
   everything here reads both. */
const urlsOf = (server) => (Array.isArray(server?.urls) ? server.urls : server?.urls ? [server.urls] : []);

export function usableIce(data) {
  const given = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
  const out = [];
  for (const server of given) {
    const urls = urlsOf(server)
      .filter((u) => typeof u === "string" && /^(stun|turn)s?:[^\s]+$/.test(u));
    if (!urls.length) continue;
    const login = server.username && server.credential
      ? { username: String(server.username), credential: String(server.credential) }
      : {};
    out.push({ urls, ...login });
  }
  return out;
}

/* Whether a list can carry a call that can't go directly. */
export const hasRelay = (servers) =>
  (servers || []).some((s) => urlsOf(s).some((u) => /^turns?:/.test(u)) && s.username && s.credential);

/* A fresh login from Cloudflare. Throws, rather than half-answering, when the
   relay says no — the page then carries on with STUN alone. */
export async function turnCredentials(env, ttl = TURN_TTL, fetchImpl = (...args) => globalThis.fetch(...args)) {
  const res = await fetchImpl(turnUrl(env.TURN_KEY_ID), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`The relay wouldn't give a login (${res.status})`);
  const servers = usableIce(data);
  if (!hasRelay(servers)) throw new Error("The relay sent nothing a browser could use");
  return servers;
}
