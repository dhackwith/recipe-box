/**
 * The family's star count: adding it up, and the endpoint that serves it —
 * which must answer "how many" without ever answering "who".
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { asIdList, readIdList, tally, prune, favKey, favOwner, FAV_PREFIX, STARS_MAX } from "../shared/tally.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── the counting itself ── */
is("a list is sorted and deduped, so an unchanged list writes nothing",
  asIdList(["soup", "bread", "soup"]), ["bread", "soup"]);
is("anything that is not a recipe id is dropped",
  asIdList(["ok-1", "", null, 7, "has space", "../secrets", "x".repeat(200)]), ["ok-1"]);
is("nothing at all is an empty list", [asIdList(null), asIdList("soup")], [[], []]);
is("one person cannot star more than the ceiling",
  asIdList(Array.from({ length: STARS_MAX + 50 }, (_, i) => `r-${i}`)).length, STARS_MAX);

is("a stored list reads back", readIdList(JSON.stringify(["b", "a"])), ["a", "b"]);
is("rubbish in the key reads back as nothing, rather than throwing",
  [readIdList("{not json"), readIdList(""), readIdList(null), readIdList("{}")], [[], [], [], []]);

/* Counts are compared as sorted pairs: which key a tally happens to reach
   first is not something any caller should depend on. */
const pairs = (counts) => Object.entries(counts || {}).sort(([a], [b]) => a.localeCompare(b));

is("everybody's stars add up",
  pairs(tally([["soup", "bread"], ["soup"], ["soup", "cake"]])),
  [["bread", 1], ["cake", 1], ["soup", 3]]);
is("a recipe nobody starred is absent, not zero", tally([["soup"]]).bread, undefined);
is("nobody's stars is no counts", [tally([]), tally(null)], [{}, {}]);
is("one person starring the same recipe twice still counts once",
  tally([["soup", "soup"]]), { soup: 1 });

is("a deleted recipe stops being counted", prune({ soup: 2, gone: 1 }, ["soup"]), { soup: 2 });
is("...and a set works as well as a list", prune({ soup: 2 }, new Set(["soup"])), { soup: 2 });

is("a key is made from an address and reads back", favOwner(favKey("A@B.com")), "a@b.com");
is("a key that is not one of ours owns nobody", favOwner("note:soup:123"), "");
is("the prefix is what keys are built from", favKey("x@y.z").startsWith(FAV_PREFIX), true);

/* ══════════════════════════════════════════════════════════════════
   The endpoint
   ══════════════════════════════════════════════════════════════════ */

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

const real = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
globalThis.fetch = async (url) => {
  if (String(url).startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch: ${url}`);
};
const sign = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
    .sign(real.privateKey);

const kv = new Map();
let writes = 0;
const env = {
  RECIPES: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => { writes++; kv.set(k, v); },
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix }) => ({
      keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  },
};

const handler = (await import("../functions/api/favorites.js")).onRequest;
const call = async (method, token, body) => {
  const res = await handler({
    env,
    request: new Request("https://thehackwithtable.com/api/favorites", {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  return { status: res.status, data: await res.json(), cache: res.headers.get("Cache-Control") };
};

const tracey = await sign("tracey@example.com");
const devon = await sign("devon@example.com");

is("without a token there is nothing to read", (await call("GET")).status, 403);
is("an empty box counts nothing", (await call("GET", tracey)).data, { counts: {}, people: 0 });

const first = await call("PUT", tracey, { ids: ["soup", "bread"] });
is("starring answers with the counts straight away, without waiting on the cache",
  [first.status, pairs(first.data.counts), first.data.people], [200, [["bread", 1], ["soup", 1]], 1]);

await call("PUT", devon, { ids: ["soup", "cake"] });
const both = (await call("GET", tracey)).data;
is("a second person's stars add to the first's", [pairs(both.counts), both.people],
  [[["bread", 1], ["cake", 1], ["soup", 2]], 2]);

is("only totals come back — never whose they are",
  JSON.stringify(await call("GET", tracey)).includes("example.com"), false);

const before = writes;
await call("PUT", tracey, { ids: ["bread", "soup"] });
is("saying the same thing again writes nothing, so a page left open costs nothing", writes, before);
await call("PUT", tracey, { ids: ["bread"] });
is("...but a real change is written", writes, before + 1);
is("un-starring brings the count down",
  pairs((await call("GET", devon)).data.counts), [["bread", 1], ["cake", 1], ["soup", 1]]);

is("one person cannot write another's list",
  pairs((await call("PUT", devon, { ids: [] })).data.counts), [["bread", 1]]);

is("a body that is not a list of ids is refused", (await call("PUT", tracey, { ids: "soup" })).status, 400);
is("...as is no body at all", (await call("PUT", tracey)).status, 400);
is("more favorites than anyone has is refused",
  (await call("PUT", tracey, { ids: Array.from({ length: STARS_MAX + 1 }, (_, i) => `r-${i}`) })).status, 400);
is("a method with no meaning here is refused", (await call("DELETE", tracey)).status, 405);
is("counts are never cached by the browser", (await call("GET", tracey)).cache, "no-store");

is("the lists are kept one per person, under the tally prefix",
  [...kv.keys()].sort(), ["favs:devon@example.com", "favs:tracey@example.com"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
