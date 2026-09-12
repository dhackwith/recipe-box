/**
 * Who is asking, according to Cloudflare Access.
 *
 * Lives outside functions/ on purpose: everything under that directory becomes
 * a route, and this is a module, not an endpoint.
 *
 * Access no longer sends the old Cf-Access-Authenticated-User-Email header —
 * /api/whoami confirmed on the live domain that only the signed token arrives —
 * so identity comes from verifying that token. Verification is the point, not a
 * formality: the header it replaced could be forged by anything able to reach
 * the origin outside Access, and a forged identity would let one person write a
 * note under another person's name.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/* Both read off /api/whoami on the live domain. Neither is a secret: the AUD
   tag names the Access application and rides in every member's token. It does
   change if the Access application is ever deleted and recreated. */
export const TEAM_DOMAIN = "https://thehackwithtable.cloudflareaccess.com";
export const POLICY_AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

/* jose caches the fetched keys, so this costs one request per isolate, not one
   per visit. Built once at module scope for that reason. */
const jwks = createRemoteJWKSet(new URL(`${TEAM_DOMAIN}/cdn-cgi/access/certs`));

/* The signed-in email, or null. Expired, wrong-audience, wrong-issuer and
   outright forged tokens all get the same answer: we do not know you. */
export async function identity(request) {
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
}

/* Who is who.
 *
 * Access decides whether somebody may be here at all; this decides what their
 * name is once they are. Both ends are now out of the reader's hands: the
 * address comes from a verified token, and the name comes from this list. There
 * is no way to post as somebody else, and no way to rename yourself into them.
 *
 * An entry containing @ matches that address exactly. An entry without one
 * matches any address whose local part is that word — Devon gave three of these
 * as bare names, and on an invite-only site the part before the @ is
 * unambiguous enough to go on. Supply the full address to tighten any of them.
 *
 * Two addresses may name one person; Nicholas has two.
 *
 * Somebody not listed still gets in — Access, not this file, decides that — and
 * is named from their address until they are added here. */
const ROSTER = new Map(Object.entries({
  "devonhackwith@gmail.com": "Devon Hackwith",
  uktraceyj: "Tracey Hackwith",
  hhackwith: "Haven Hackwith",
  ashtonhack: "Ashton Hackwith",
  "nick@heyerconception.com": "Nicholas Heyer",
  "nick@heyer.app": "Nicholas Heyer",
  "mhealy.dev@gmail.com": "Michael Healy",
}));

/* A readable stand-in for anybody not on the roster. Only ever a fallback, and
   a visible prompt to add them to it. */
function fromAddress(local) {
  const words = local.split(/[._-]+/).filter(Boolean);
  if (!words.length) return "Someone";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function displayName(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw) return "Someone";
  /* Gmail and others treat everything after a + as the same mailbox, so the
     suffix comes off before any lookup — otherwise a full-address entry is
     missed by the very person it names, and they are quietly renamed. */
  const at = raw.indexOf("@");
  const local = (at < 0 ? raw : raw.slice(0, at)).replace(/\+.*$/, "");
  const addr = at < 0 ? local : local + raw.slice(at);
  if (ROSTER.has(addr)) return ROSTER.get(addr);
  if (ROSTER.has(local)) return ROSTER.get(local);
  return fromAddress(local);
}
