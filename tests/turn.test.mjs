/**
 * The relay (shared/turn.js, functions/api/turn.js): what a browser is handed,
 * that the site's TURN key never leaves the server, that one login is shared
 * rather than asked for over and over, and that a call carries on with STUN
 * alone when the relay can't be had.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

const real = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

const asked = [];
let answer = () => new Response(JSON.stringify({
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:5349?transport=tcp"],
      username: "u1",
      credential: "c1",
    },
  ],
}), { status: 201, headers: { "Content-Type": "application/json" } });

globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  asked.push({ url: String(url), init });
  return answer(String(url), init);
};

const sign = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
    .sign(real.privateKey);

const { usableIce, hasRelay, turnUrl, hasTurnKeys, TURN_TTL } = await import("../shared/turn.js");
const { onRequest } = await import("../functions/api/turn.js");

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const env = { TURN_KEY_ID: "key-1", TURN_KEY_API_TOKEN: "token-1" };
const ask = async (token, useEnv = env) => {
  const res = await onRequest({
    env: useEnv,
    request: new Request("https://thehackwithtable.com/api/turn", {
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
    }),
  });
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
};
const devon = await sign("devonhackwith@gmail.com");

console.log("\n— what a browser is handed —");
is("a stun place and a relay with its login", usableIce({
  iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: "turn:turn.cloudflare.com:3478?transport=tcp", username: "u", credential: "c" }],
}), [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=tcp"], username: "u", credential: "c" }]);
is("anything that isn't a place to call is dropped", usableIce({ iceServers: [{ urls: ["https://example.com/", "turn:turn.cloudflare.com:3478"] }] }), [{ urls: ["turn:turn.cloudflare.com:3478"] }]);
is("...and an answer of the wrong shape gives nothing", [usableIce(null), usableIce({ iceServers: "turn:x" }), usableIce({ iceServers: [{}] })], [[], [], []]);
is("a relay needs a login to be one", [
  hasRelay([{ urls: ["turn:t:3478"], username: "u", credential: "c" }]),
  hasRelay([{ urls: ["turn:t:3478"] }]),
  hasRelay([{ urls: ["stun:s:3478"] }]),
], [true, false, false]);
/* One address rather than a list is how the site's own STUN server is
   written, and asking whether THAT is a relay is what every call does when
   there is none — it must answer no, not come apart. */
const { STUN_SERVERS } = await import("../shared/calls.js");
is("a place written as one address, not a list", [
  hasRelay(STUN_SERVERS),
  hasRelay([{ urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" }]),
  usableIce({ iceServers: STUN_SERVERS }),
], [false, true, [{ urls: ["stun:stun.cloudflare.com:3478"] }]]);
is("the key goes in the address, escaped", turnUrl("a b/c"), "https://rtc.live.cloudflare.com/v1/turn/keys/a%20b%2Fc/credentials/generate-ice-servers");
is("both keys are needed", [hasTurnKeys(env), hasTurnKeys({ TURN_KEY_ID: "x" }), hasTurnKeys(null)], [true, false, false]);

console.log("\n— the endpoint —");
is("without the keys it says so, and doesn't ask Cloudflare", [(await ask(devon, {})).status, asked.length], [501, 0]);
is("a stranger is turned away", (await ask(null)).status, 403);
is("...without asking Cloudflare either", asked.length, 0);

const first = await ask(devon);
is("somebody signed in gets the list", first.status, 200);
is("...with the relay in it", hasRelay(first.data.iceServers), true);
is("...and how long it lasts", first.data.seconds > TURN_TTL - 10 && first.data.seconds <= TURN_TTL, true);
is("the site's key never reaches the page", JSON.stringify(first.data).includes("token-1") || JSON.stringify(first.data).includes("key-1"), false);
is("Cloudflare was asked as the key's owner, for a login that lasts", [
  asked.length,
  asked[0].url,
  asked[0].init.headers.Authorization,
  JSON.parse(asked[0].init.body).ttl,
], [1, turnUrl("key-1"), "Bearer token-1", TURN_TTL]);

const second = await ask(devon);
is("a second call shares that login rather than asking again", [second.status, asked.length], [200, 1]);
is("...and is given the same relay", second.data.iceServers, first.data.iceServers);

console.log("\n— when the relay can't be had —");
answer = () => new Response("no", { status: 403 });
const { onRequest: fresh } = await import(`../functions/api/turn.js?again=${Date.now()}`);
const refused = await fresh({ env, request: new Request("https://thehackwithtable.com/api/turn", { headers: { "Cf-Access-Jwt-Assertion": devon } }) });
is("the page is told, rather than given something broken", refused.status, 502);
answer = () => new Response(JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] }), { status: 201, headers: { "Content-Type": "application/json" } });
const { onRequest: noRelay } = await import(`../functions/api/turn.js?again=${Date.now()}-2`);
const stunOnly = await noRelay({ env, request: new Request("https://thehackwithtable.com/api/turn", { headers: { "Cf-Access-Jwt-Assertion": devon } }) });
is("a list with no relay in it is no use, and says so", stunOnly.status, 502);

console.log("\n— the page's side —");
const { iceServers, forgetIce } = await import("../src/calls.js");
const pageFetch = (status, body) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); };
const relayList = [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" }];

forgetIce();
pageFetch(200, { iceServers: relayList, seconds: TURN_TTL });
is("the page uses the relay the site gives it", await iceServers(), relayList);
pageFetch(500, {});
is("...and keeps it rather than asking every call", await iceServers(), relayList);

forgetIce();
pageFetch(501, { error: "The relay isn't switched on for this site" });
is("a site without a relay still makes calls, with STUN alone", await iceServers(), STUN_SERVERS);
forgetIce();
globalThis.fetch = async () => { throw new Error("offline"); };
is("...and so does one that can't reach the site", await iceServers(), STUN_SERVERS);
forgetIce();
pageFetch(200, { iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }], seconds: 10 });
is("...and one sent no relay", await iceServers(), STUN_SERVERS);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
