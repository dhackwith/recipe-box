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

/* The token and its claims once the signature, issuer and audience check out,
   or null. */
async function verified(request) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: TEAM_DOMAIN,
      audience: POLICY_AUD,
    });
    return typeof payload.email === "string" ? { token, payload, email: payload.email.toLowerCase() } : null;
  } catch {
    return null;
  }
}

/* The signed-in email, or null. Expired, wrong-audience, wrong-issuer and
   outright forged tokens all get the same answer: we do not know you. */
export async function identity(request) {
  const found = await verified(request);
  return found ? found.email : null;
}

/* ── What Google or GitHub says about somebody ────────────────────
   People can sign in with Google, GitHub or an emailed PIN. The token names
   the address only, so the name the provider knows them by comes from Access's
   get-identity endpoint, asked with the same token the request arrived with.
   Cloudflare documents the endpoint but not a name field, so several shapes are
   tried; whatever cannot be found is null, and the site carries on with the
   address as before. A PIN sign-in has no name to give. */

const LOOKUP_MS = 3000;
const REMEMBER_MS = 10 * 60 * 1000;
const remembered = new Map();

/* A name fit to show other people, or null. Anything holding an @ is refused,
   because a provider that has no name tends to hand back the address instead,
   and a guest's address is never shown. */
export function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(/\p{C}+/gu, "").replace(/\s+/g, " ").trim();
  if (!name || name.includes("@")) return null;
  return [...name].slice(0, 60).join("").trim();
}

function nameIn(found) {
  for (const place of [found, found.oidc_fields, found.custom, found.idp]) {
    if (!place || typeof place !== "object") continue;
    const whole = cleanName(place.name);
    if (whole) return whole;
    const joined = cleanName([place.given_name, place.family_name].filter((s) => typeof s === "string").join(" "));
    if (joined) return joined;
  }
  return null;
}

/* "google", "github", "onetimepin", or null when Access doesn't say. */
const providerIn = (found) =>
  typeof found?.idp?.type === "string" && /^[a-z0-9-]{1,32}$/i.test(found.idp.type) ? found.idp.type.toLowerCase() : null;

async function getIdentity(url, token) {
  try {
    const res = await fetch(url, {
      headers: { Cookie: `CF_Authorization=${token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(LOOKUP_MS),
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The signed-in person as their login provider knows them:
 * { email, name, provider }, with name and provider null when unknown, or null
 * when nobody is signed in. Asked of the team domain, then of the site's own
 * address, and kept for ten minutes per sign-in.
 */
export async function providerIdentity(request) {
  const found = await verified(request);
  if (!found) return null;
  const key = String(found.payload.identity_nonce || found.token);
  const kept = remembered.get(key);
  if (kept && kept.until > Date.now()) return kept.value;

  let got = null;
  const origin = new URL(request.url).origin;
  for (const base of [TEAM_DOMAIN, origin]) {
    got = await getIdentity(`${base}/cdn-cgi/access/get-identity`, found.token);
    if (got) break;
  }
  /* Only believed about the person the verified token names. */
  const same = got && typeof got.email === "string" && got.email.toLowerCase() === found.email;
  const value = { email: found.email, name: same ? nameIn(got) : null, provider: same ? providerIn(got) : null };

  if (got) {
    if (remembered.size > 500) remembered.clear();
    remembered.set(key, { value, until: Date.now() + REMEMBER_MS });
  }
  return value;
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

/* Letters and digits only, lower case, for telling whether two names are the
   same person's however they are spaced or punctuated. */
const bareName = (s) => String(s).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const ROSTER_NAMES = new Set(PEOPLE.map((p) => bareName(p.name)));

/** The person a signed-in address belongs to. Somebody on the roster is
    always called what the roster says, whatever their Google or GitHub name.
    A guest is called by the name their provider gave, when there is one —
    unless it is the name of somebody on the roster, which anybody could type
    into their own account; then they are named from their address. */
export function personFor(email, providerName = null) {
  const parts = addressOf(email);
  if (!parts) return null;
  const known = BY_ADDRESS.get(parts.addr) || BY_ADDRESS.get(parts.local);
  if (known) return { id: known.id, name: known.name };
  const given = cleanName(providerName);
  const bare = given ? bareName(given) : "";
  const name = bare && !ROSTER_NAMES.has(bare) ? given : fromAddress(parts.local);
  return { id: guestIdFor(parts.addr), name };
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
