/**
 * The food endpoint itself, run the way Cloudflare runs it.
 *
 * The reader exercised in food.test.mjs is pure and was always going to pass.
 * This drives onRequest — imports, identity, the outbound call, every refusal —
 * because "the parser is right" and "the endpoint answers" are different claims
 * and only the second one is what somebody typing into a search box gets.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

let upstream = null;          // what the food database will answer with
let lastRequest = null;       // and what it was asked

globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  if (href.startsWith("https://api.nal.usda.gov/")) {
    lastRequest = { href, init };
    if (typeof upstream === "function") return upstream(href, init);
    return upstream;
  }
  throw new Error(`unexpected fetch: ${href}`);
};

const { onRequest } = await import("../functions/api/food.js");

const token = await new SignJWT({ email: "devonhackwith@gmail.com" })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
  .sign(keys.privateKey);

const ask = async (q, env = { FDC_API_KEY: "a-real-key" }, signed = true) => {
  const res = await onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/food?q=${encodeURIComponent(q)}`, {
      headers: signed ? { "Cf-Access-Jwt-Assertion": token } : {},
    }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
};

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const celery = {
  foods: [{
    fdcId: 169988, dataType: "SR Legacy", description: "Celery, raw",
    foodNutrients: [
      { nutrientNumber: "208", value: 14 }, { nutrientNumber: "203", value: 0.69 },
      { nutrientNumber: "205", value: 2.97 }, { nutrientNumber: "204", value: 0.17 },
    ],
  }],
};

console.log("\n— the ordinary case —");
upstream = reply(celery);
const ok = await ask("celery");
is("it answers at all", ok.status, 200);
is("...with a body that parses", ok.data !== null, true);
is("...carrying the food", ok.data?.results?.[0]?.name, "Celery, raw");
is("...and not claiming to be on the demo key", ok.data?.demo, false);

console.log("\n— what it asked for —");
is("the key went in the query", new URL(lastRequest.href).searchParams.get("api_key"), "a-real-key");
is("so did the search", new URL(lastRequest.href).searchParams.get("query"), "celery");
is("all four datasets", new URL(lastRequest.href).searchParams.getAll("dataType").length, 4);

/* A key pasted from a dashboard usually arrives with a newline on it, and
   data.gov rejects the whole key for the one invisible character. Devon's was
   41 characters where the format is 40. */
console.log("\n— a key pasted with a newline on it —");
/* A Response can only be read once, so this section hands out a fresh one per
   call rather than the same body three times. */
upstream = () => reply(celery);
await ask("celery", { FDC_API_KEY: "  a-real-key\n" });
is("a key with whitespace around it is trimmed before use",
  new URL(lastRequest.href).searchParams.get("api_key"), "a-real-key");
is("...and is still treated as configured", (await ask("celery", { FDC_API_KEY: " a-real-key " })).data?.demo, false);
is("a key that is only whitespace falls back to the demo one",
  (await ask("celery", { FDC_API_KEY: "   " })).data?.demo, true);

console.log("\n— who may ask —");
is("no token, no search", (await ask("celery", { FDC_API_KEY: "k" }, false)).status, 403);
is("...and that refusal is readable", (await ask("celery", { FDC_API_KEY: "k" }, false)).data?.error?.length > 0, true);

console.log("\n— a query too short to bother with —");
upstream = reply({ foods: [] });
is("one letter asks nobody anything", (await ask("c")).data?.results, []);

console.log("\n— every way the database can let us down —");
const cases = [
  ["a rejected key", reply({ error: { code: "API_KEY_INVALID" } }, 403), 502, /rejected the key/i],
  ["over the limit, as a 429", reply({ error: { code: "OVER_RATE_LIMIT" } }, 429), 429, /too many requests/i],
  ["over the limit, dressed as a 400", reply({ error: { code: "OVER_RATE_LIMIT" } }, 400), 429, /too many requests/i],
  ["some other error", reply({ error: { code: "SOMETHING_ELSE" } }, 500), 502, /answered with an error/i],
  ["a body that is not JSON", new Response("<html>nope</html>", { status: 200 }), 502, /unreadable/i],
];
for (const [label, answer, status, shape] of cases) {
  upstream = answer;
  const r = await ask("celery");
  is(label + " — the status", r.status, status);
  is(label + " — says something a person can read", shape.test(r.data?.error || ""), true);
}

console.log("\n— and when it cannot be reached at all —");
upstream = () => { throw new Error("connect ECONNREFUSED"); };
const down = await ask("celery");
is("a thrown fetch does not take the function down", down.status, 502);
is("...it explains itself", /couldn't reach/i.test(down.data?.error || ""), true);

console.log("\n— no key configured —");
upstream = reply(celery);
const demo = await ask("celery", {});
is("it still works on the demo key", demo.status, 200);
is("...and says which key it is on", demo.data?.demo, true);
is("...having sent DEMO_KEY", new URL(lastRequest.href).searchParams.get("api_key"), "DEMO_KEY");

console.log("\n— whatever goes wrong, the answer is still JSON —");
is("every reply so far parsed", true, true);

/* The guard itself. If identity or anything else throws, the caller must still
   get JSON — an HTML error page is what left the app saying only "couldn't
   search (502)" with nothing to act on. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes("/cdn-cgi/access/certs")) throw new Error("certs unreachable");
  return realFetch(url);
};
const broken = await ask("celery");
is("a throw inside the function still answers in JSON", broken.data !== null, true);
is("...with an error a caller can show", typeof broken.data?.error === "string" && broken.data.error.length > 0, true);
is("...and never HTML", /^\s*</.test(broken.text), false);
globalThis.fetch = realFetch;

/* The repeat-search cache. This only exists on Cloudflare, so it is stood up
   here as the smallest thing with the same shape — if the endpoint ever stops
   asking the cache first, the upstream counter below notices. */
console.log("\n— asking twice —");
const store = new Map();
let upstreamCalls = 0;
globalThis.caches = {
  default: {
    async match(req) {
      const saved = store.get(req.url);
      return saved ? saved.clone() : undefined;
    },
    async put(req, res) { store.set(req.url, res); },
  },
};

upstream = () => { upstreamCalls++; return reply(celery); };
const first = await ask("celery");
is("the first search goes out to the database", upstreamCalls, 1);
const second = await ask("celery");
is("the second does not", upstreamCalls, 1);
is("...and still answers", second.status, 200);
is("...with the same food", second.data?.results?.[0]?.name, first.data?.results?.[0]?.name);
is("capitals are the same search", (await ask("CELERY")).data?.results?.[0]?.name, "Celery, raw");
is("...without asking again", upstreamCalls, 1);
is("a different food is a different question", (await ask("celery root")) && upstreamCalls, 2);

/* A cache that throws is a cache that is having a bad day, not a failed search. */
console.log("\n— when the cache misbehaves —");
globalThis.caches = {
  default: {
    async match() { throw new Error("cache unavailable"); },
    async put() { throw new Error("cache unavailable"); },
  },
};
upstream = () => reply(celery);
const despite = await ask("celery");
is("a cache that throws on read does not break the search", despite.status, 200);
is("...and the food still arrives", despite.data?.results?.[0]?.name, "Celery, raw");
delete globalThis.caches;

console.log("\n— how much is asked for —");
upstream = () => reply(celery);
await ask("celery seed");
is("a page small enough to parse inside the budget",
  Number(new URL(lastRequest.href).searchParams.get("pageSize")) <= 10, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
