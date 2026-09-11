/**
 * TEMPORARY diagnostic — delete this file once the identity question is settled.
 *
 * Cloudflare Access is in front of thehackwithtable.com, but something about
 * the signed-in email has not been reaching functions/api/storage.js, which is
 * why every personal thing now lives in the browser instead. This endpoint
 * reports exactly what Access hands to a Pages Function, so the guessing can
 * stop. Open https://thehackwithtable.com/api/whoami in a normal browser tab
 * and read the JSON.
 *
 * Access can prove identity three ways, and they fail independently:
 *   - Cf-Access-Authenticated-User-Email — a plain header, convenient, and NOT
 *     trustworthy on its own (anything that can reach the origin outside Access
 *     can forge it).
 *   - Cf-Access-Jwt-Assertion — the signed token, same thing but verifiable.
 *   - CF_Authorization cookie — the same signed token, set on the browser. It
 *     rides along on same-origin fetches even if neither header is injected,
 *     so it is the fallback that is hardest to misconfigure.
 *
 * Nothing here is trusted: the token is decoded for a human to read, never
 * verified, and never used to decide anything. Real code must check the
 * signature against the team's certs before believing a single claim.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Read a JWT payload WITHOUT verifying the signature. Only safe because the
   result is printed, not acted on. */
const peek = (token) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return { error: "not a JWT — no payload segment" };
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (err) {
    return { error: `could not decode: ${err && err.message ? err.message : err}` };
  }
};

const cookie = (header, name) => {
  for (const pair of (header || "").split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return null;
};

const seconds = (s) => (typeof s === "number" ? new Date(s * 1000).toISOString() : null);

export async function onRequest({ request }) {
  const headers = request.headers;
  const email = headers.get("Cf-Access-Authenticated-User-Email");
  const assertion = headers.get("Cf-Access-Jwt-Assertion");
  const authCookie = cookie(headers.get("Cookie"), "CF_Authorization");

  const token = assertion || authCookie;
  const claims = token ? peek(token) : null;

  return json({
    readMe:
      "If any of the three below is present, the server CAN tell people apart " +
      "and a per-person shopping list is possible. If all three are absent on " +
      "the real domain, Access is not proxying this path.",

    hostname: new URL(request.url).hostname,
    seenBy: "functions/api/whoami.js",

    /* The three ways identity can arrive, reported separately on purpose. */
    emailHeader: email || "ABSENT",
    jwtHeader: assertion ? `present, ${assertion.length} chars` : "ABSENT",
    jwtCookie: authCookie ? `present, ${authCookie.length} chars` : "ABSENT",

    /* UNVERIFIED. Read it, do not trust it. */
    claimsUnverified: claims && {
      email: claims.email || null,
      /* Pin this aud when verifying — it identifies the Access application. */
      aud: claims.aud || null,
      /* https://<team>.cloudflareaccess.com — the certs live under it. */
      iss: claims.iss || null,
      certsUrl: claims.iss ? `${claims.iss}/cdn-cgi/access/certs` : null,
      type: claims.type || null,
      issued: seconds(claims.iat),
      expires: seconds(claims.exp),
      decodeError: claims.error || null,
    },

    /* Names only — a value here could be the session cookie itself. */
    headerNames: [...headers.keys()].sort(),
  });
}
