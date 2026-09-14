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
const PEOPLE = [
  { id: "devon", name: "Devon Hackwith", addresses: ["devonhackwith@gmail.com"], owner: true },
  { id: "tracey", name: "Tracey Hackwith", addresses: ["uktraceyj"] },
  { id: "haven", name: "Haven Hackwith", addresses: ["hhackwith"] },
  { id: "ashton", name: "Ashton Hackwith", addresses: ["ashtonhack"] },
  { id: "nicholas", name: "Nicholas Heyer", addresses: ["nick@heyerconception.com", "nick@heyer.app"] },
  { id: "michael", name: "Michael Healy", addresses: ["mhealy.dev@gmail.com"] },
];

const ROSTER = new Map(PEOPLE.flatMap((p) => p.addresses.map((a) => [a, p.name])));
const BY_ADDRESS = new Map(PEOPLE.flatMap((p) => p.addresses.map((a) => [a, p])));

/* A readable stand-in for anybody not on the roster. Only ever a fallback, and
   a visible prompt to add them to it. */
function fromAddress(local) {
  const words = local.split(/[._-]+/).filter(Boolean);
  if (!words.length) return "Someone";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* An address as the roster is keyed: lower case, and without the +suffix Gmail
   and others treat as the same mailbox — otherwise a full-address entry is
   missed by the very person it names, and they are quietly renamed. */
function addressOf(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw) return null;
  const at = raw.indexOf("@");
  const local = (at < 0 ? raw : raw.slice(0, at)).replace(/\+.*$/, "");
  return { local, addr: at < 0 ? local : local + raw.slice(at) };
}

export function displayName(email) {
  const parts = addressOf(email);
  if (!parts) return "Someone";
  if (ROSTER.has(parts.addr)) return ROSTER.get(parts.addr);
  if (ROSTER.has(parts.local)) return ROSTER.get(parts.local);
  return fromAddress(parts.local);
}

/* ── People, as private messages need them ────────────────────────
   A message is between people, not addresses: Nicholas answers to two, and a
   conversation with him is one conversation. An id is the stable name of a
   person, so it is what a message, a block and a read marker are keyed by.
   Somebody signed in but not on the roster is a guest: their id is a hash of
   their address (g- and sixteen hex digits), stable from visit to visit, which
   cannot collide with a roster id and never puts an address in front of the
   page as the name of a conversation. Guests are remembered, with a name made
   from their address, in D1 (shared/guests.js). */

/* FNV-1a, twice with different seeds for 64 bits. Not a secret — only a label
   that is the same every time and doesn't read as an email address. */
function fnv(s, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const guestIdFor = (addr) => `g-${fnv(addr, 0x811c9dc5)}${fnv(addr, 0x9e3779b9)}`;

/** Whether an id is a guest's rather than somebody on the roster. */
export const isGuestId = (id) => /^g-[0-9a-f]{16}$/.test(String(id ?? ""));

/** A signed-in address as it is keyed: lower case, without any +suffix. Guests
    were keyed by exactly this before they had ids of their own. */
export function addressKey(email) {
  const parts = addressOf(email);
  return parts ? parts.addr : null;
}

/** Everyone the box knows: ids and names, and never anybody's address. */
export const people = () => PEOPLE.map(({ id, name }) => ({ id, name }));

/** The person a signed-in address belongs to. */
export function personFor(email) {
  const parts = addressOf(email);
  if (!parts) return null;
  const known = BY_ADDRESS.get(parts.addr) || BY_ADDRESS.get(parts.local);
  return known ? { id: known.id, name: known.name } : { id: guestIdFor(parts.addr), name: fromAddress(parts.local) };
}

/** What to call a roster id. A guest's name lives in D1 (shared/guests.js),
    so a guest id on its own is only "Someone". */
export function personName(id) {
  const known = PEOPLE.find((p) => p.id === id);
  if (known) return known.name;
  if (isGuestId(id)) return "Someone";
  const parts = addressOf(id);
  return parts ? fromAddress(parts.local) : "Someone";
}

/** Whether an id is somebody the box knows, which is who may be messaged. */
export const isPerson = (id) => PEOPLE.some((p) => p.id === id);

/** Whether a signed-in address belongs to the site's owner, who may remove
    anybody's notes and messages. Read from the roster, like a name, so it can
    only be granted by editing this file — never by anything a page sends. */
export function isOwner(email) {
  const person = personFor(email);
  return !!person && PEOPLE.some((p) => p.id === person.id && p.owner === true);
}
