/**
 * Group voice channels (functions/api/voice.js), against real SQLite and a
 * stand-in for Cloudflare's Realtime relay that records every request.
 *
 * What matters: only members join or listen, the relay is only ever asked for
 * tracks of ready people in the same channel, a page never sees a relay
 * session or the app secret, everyone in the group is told of every change,
 * and a channel clears out people who have gone.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { d1 } from "./d1.mjs";

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";
const real = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

/* The relay: sessions s1, s2…; pushing answers; pulling offers one mid per track. */
const relay = [];
let relayDown = false;
let nextSession = 1;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  if (!url.startsWith("https://rtc.live.cloudflare.com/v1/apps/")) throw new Error(`unexpected fetch: ${url}`);
  const body = init.body ? JSON.parse(init.body) : null;
  relay.push({ method: init.method, path: url.replace("https://rtc.live.cloudflare.com/v1", ""), auth: init.headers?.Authorization, body });
  if (relayDown) return new Response(JSON.stringify({ errorCode: "internal", errorDescription: "down" }), { status: 500 });
  if (url.endsWith("/sessions/new")) return Response.json({ sessionId: `s${nextSession++}` });
  if (url.endsWith("/renegotiate")) return Response.json({});
  if (url.endsWith("/tracks/new") && body.tracks[0].location === "local") {
    return Response.json({ sessionDescription: { type: "answer", sdp: "v=0\r\nanswer" }, tracks: [{ mid: body.tracks[0].mid, trackName: body.tracks[0].trackName }] });
  }
  if (url.endsWith("/tracks/new")) {
    return Response.json({
      requiresImmediateRenegotiation: true,
      sessionDescription: { type: "offer", sdp: "v=0\r\noffer" },
      tracks: body.tracks.map((t, i) => ({ mid: String(i + 1), sessionId: t.sessionId, trackName: t.trackName })),
    });
  }
  return new Response("{}", { status: 404 });
};
const sign = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
    .sign(real.privateKey);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const pokes = [];
const LIVE = {
  idFromName: (name) => ({ name }),
  get: () => ({ fetch: async (input, init) => { const req = input instanceof Request ? input : new Request(input, init); pokes.push(...(await req.json()).notes); return Response.json({}); } }),
};
const db = d1();
const env = { MESSAGES: db, LIVE, REALTIME_APP_ID: "app1", REALTIME_APP_SECRET: "sekret" };
const voice = (await import("../functions/api/voice.js")).onRequest;
const groups = (await import("../functions/api/groups.js")).onRequest;

const call = async (handler, api, method, query, token, body, withEnv = env) => {
  const res = await handler({
    env: withEnv,
    request: new Request(`https://thehackwithtable.com/api/${api}${query}`, {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
};
const V = (method, query, token, body) => call(voice, "voice", method, query, token, body);

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const tracey = await sign("uktraceyj@gmail.com");
const michael = await sign("mhealy.dev@gmail.com");

const g = (await call(groups, "groups", "POST", "", devon, { create: ["nicholas", "tracey"] })).data.group;
const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";

/* ── who may ── */
is("without the Realtime keys, voice says so", (await call(voice, "voice", "GET", `?room=${g.id}`, devon, undefined, { MESSAGES: db })).status, 501);
is("nobody signed in, no voice", (await V("GET", `?room=${g.id}`, null)).status, 403);
is("somebody outside the group can't see its channel", (await V("GET", `?room=${g.id}`, michael)).status, 404);
is("...or join it", (await V("POST", "", michael, { join: g.id, sdp: OFFER, mid: "0" })).status, 404);
is("an empty channel has nobody in it", (await V("GET", `?room=${g.id}`, devon)).data, { room: [], you: null });
is("joining needs a microphone offer a browser wrote", (await V("POST", "", devon, { join: g.id, sdp: "hi", mid: "0" })).status, 400);
is("listening before joining is refused", (await V("POST", "", devon, { pull: g.id, people: ["nicholas"] })).status, 409);

/* ── joining ── */
relay.length = 0;
const joined = await V("POST", "", devon, { join: g.id, sdp: OFFER, mid: "0" });
is("a member joins and gets the relay's answer", [joined.status, joined.data.answer], [200, "v=0\r\nanswer"]);
is("...having made a relay session and sent up their microphone", relay.map((r) => [r.method, r.path]), [["POST", "/apps/app1/sessions/new"], ["POST", "/apps/app1/sessions/s1/tracks/new"]]);
is("...with the app secret, from the server", relay.every((r) => r.auth === "Bearer sekret"), true);
is("...as one local track", relay[1].body.tracks, [{ location: "local", mid: "0", trackName: "mic" }]);
is("...but isn't listed until their connection is up", [joined.data.room, joined.data.you], [[], { muted: false, ready: false }]);
is("the page is never given a relay session or the secret", /s1|sekret/.test(joined.text), false);

pokes.length = 0;
const readyNow = await V("POST", "", devon, { ready: g.id });
is("once connected, they're in the channel", readyNow.data.room, [{ id: "devon", name: "Devon Hackwith", muted: false }]);
is("...and everyone in the group is told", pokes.map((p) => [p.to, p.with, p.kind]), [["devon", g.chat, "voice"], ["nicholas", g.chat, "voice"], ["tracey", g.chat, "voice"]]);
is("members who haven't joined can see who's in", (await V("GET", `?room=${g.id}`, tracey)).data.room.map((p) => p.id), ["devon"]);

/* ── listening ── */
await V("POST", "", nick, { join: g.id, sdp: OFFER, mid: "0" });
is("listening before your connection is up is refused", (await V("POST", "", nick, { pull: g.id, people: ["devon"] })).status, 409);
await V("POST", "", nick, { ready: g.id });
relay.length = 0;
const pulled = await V("POST", "", nick, { pull: g.id, people: ["devon", "tracey", "michael", "nicholas"] });
is("a member in the channel listens to the others", pulled.data, { offer: "v=0\r\noffer", tracks: [{ id: "devon", mid: "1" }] });
is("...only to people who are actually in it, never themselves or outsiders", relay.map((r) => r.body.tracks), [[{ location: "remote", sessionId: "s1", trackName: "mic" }]]);
is("...down their own session", relay[0].path, "/apps/app1/sessions/s2/tracks/new");
is("nobody to listen to asks the relay for nothing", [(await V("POST", "", nick, { pull: g.id, people: ["tracey"] })).data, relay.length], [{ offer: null, tracks: [] }, 1]);
relay.length = 0;
is("answering the relay's offer renegotiates their session", [(await V("POST", "", nick, { answer: g.id, sdp: "v=0\r\npage-answer" })).status, relay.map((r) => [r.method, r.path, r.body.sessionDescription])], [200, [["PUT", "/apps/app1/sessions/s2/renegotiate", { type: "answer", sdp: "v=0\r\npage-answer" }]]]);
is("an answer has to be one a browser wrote", (await V("POST", "", nick, { answer: g.id, sdp: "nope" })).status, 400);

/* ── muting, checking in, going ── */
pokes.length = 0;
const muted = await V("POST", "", nick, { mute: g.id, muted: true });
is("muting shows in the channel", muted.data.room.map((p) => [p.id, p.muted]), [["devon", false], ["nicholas", true]]);
is("...and the group is told", pokes.length, 3);
is("checking in is fine", (await V("POST", "", devon, { here: g.id })).status, 200);
await db.prepare("UPDATE voice_members SET seen = ?1 WHERE person = 'nicholas'").bind(new Date(Date.now() - 120000).toISOString()).run();
is("somebody whose page stopped checking in drops out", (await V("GET", `?room=${g.id}`, devon)).data.room.map((p) => p.id), ["devon"]);

pokes.length = 0;
is("leaving takes you out", (await V("POST", "", devon, { leave: g.id })).data.room, []);
is("...and the group is told", pokes.map((p) => p.kind), ["voice", "voice", "voice"]);
is("leaving twice is harmless", (await V("POST", "", devon, { leave: g.id })).status, 200);

/* ── one channel at a time, and leaving the group ── */
const other = (await call(groups, "groups", "POST", "", devon, { create: ["tracey", "michael"] })).data.group;
await V("POST", "", devon, { join: g.id, sdp: OFFER, mid: "0" });
await V("POST", "", devon, { ready: g.id });
pokes.length = 0;
await V("POST", "", devon, { join: other.id, sdp: OFFER, mid: "0" });
is("joining another channel leaves the first", (await V("GET", `?room=${g.id}`, nick)).data.room, []);
is("...and tells the first group", pokes.filter((p) => p.with === g.chat).map((p) => p.to), ["devon", "nicholas", "tracey"]);
await V("POST", "", devon, { ready: other.id });
await call(groups, "groups", "POST", "", devon, { leave: other.id });
is("leaving a group takes you out of its channel", (await V("GET", `?room=${other.id}`, tracey)).data.room, []);

relayDown = true;
const down = await V("POST", "", tracey, { join: g.id, sdp: OFFER, mid: "0" });
is("when the relay is down, joining says so plainly", [down.status, down.data.error], [502, "The voice service didn't answer — try again in a moment"]);
relayDown = false;

/* ── the page's meter ── */
const { loudness, SPEAKING_LEVEL, createSpeakingMeter } = await import("../src/voice.js");
is("silence is not loud", loudness(new Uint8Array(512).fill(128)), 0);
is("a full-scale wave is as loud as it gets", Math.round(loudness(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 255 : 1))) * 100) / 100, 0.99);
is("a quiet hum isn't talking", loudness(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 130 : 126))) > SPEAKING_LEVEL, false);
is("a browser without Web Audio gets a meter that does nothing", (() => { const m = createSpeakingMeter(() => {}, null); m.add("x", {}); m.stop(); return true; })(), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
