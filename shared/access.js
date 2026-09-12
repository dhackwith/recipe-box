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

/* A readable stand-in until somebody tells us what to call them. Only ever a
   default: the name a person sets for themselves always wins. */
export function nameFromEmail(email) {
  const local = String(email || "").split("@")[0].replace(/\+.*$/, "");
  const words = local.split(/[._-]+/).filter(Boolean);
  if (!words.length) return "Someone";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
