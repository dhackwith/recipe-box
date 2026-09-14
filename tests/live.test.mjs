/**
 * Live notices: the site telling open pages that something changed, instead
 * of pages holding requests open while the site looks every second (which ran
 * past the free plan's processing limit and came back as 503s).
 *
 * What matters: every change a page shows is announced to exactly the people
 * it concerns, a notice never carries the thing itself, a connection is always
 * tagged with who the token says, a hub that can't be reached never stops the
 * change, and the page never loses a notice between asking and waiting.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { d1 } from "./d1.mjs";

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

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A stand-in for the hub binding: records every notice and connection. */
const pokes = [];
const connects = [];
let hubDown = false;
const LIVE = {
  idFromName: (name) => ({ name }),
  get: (id) => ({
    fetch: async (input, init) => {
      if (hubDown) throw new Error("hub unreachable");
      const req = input instanceof Request ? input : new Request(input, init);
      const u = new URL(req.url);
      if (u.pathname === "/poke") {
        const { notes } = await req.json();
        pokes.push(...notes.map((n) => ({ hub: id.name, ...n })));
        return Response.json({ sent: notes.length });
      }
      connects.push({ hub: id.name, path: u.pathname, person: u.searchParams.get("person"), upgrade: req.headers.get("Upgrade") });
      return new Response("connected", { status: 200 });
    },
  }),
};

const db = d1();
const env = { MESSAGES: db, LIVE };
const messages = (await import("../functions/api/messages.js")).onRequest;
const calls = (await import("../functions/api/calls.js")).onRequest;
const liveEndpoint = (await import("../functions/api/live.js")).onRequest;

const call = async (handler, api, method, query, token, body) => {
  const res = await handler({
    env,
    request: new Request(`https://thehackwithtable.com/api/${api}${query}`, {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
};
const mark = () => pokes.length;
const since = (from) => pokes.slice(from).map(({ hub, ...n }) => n);

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");

/* ── connecting ── */
const upgrade = (query = "", token) =>
  new Request(`https://thehackwithtable.com/api/live${query}`, {
    headers: { Upgrade: "websocket", ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}) },
  });
is("without the hub, the live address says so", (await liveEndpoint({ request: upgrade("", devon), env: { MESSAGES: db } })).status, 501);
is("a plain request isn't a live connection", (await liveEndpoint({ request: new Request("https://thehackwithtable.com/api/live"), env })).status, 426);
is("nobody signed in, no connection", (await liveEndpoint({ request: upgrade(), env })).status, 403);
is("a forged token, no connection", (await liveEndpoint({ request: upgrade("", "not.a.jwt"), env })).status, 403);
const joined = await liveEndpoint({ request: upgrade("?person=michael", devon), env });
is("a signed-in page is handed to the hub", [joined.status, connects.length], [200, 1]);
is("...as who the token says, not who the address claims", connects[0], { hub: "hub", path: "/connect", person: "devon", upgrade: "websocket" });
await liveEndpoint({ request: upgrade("", await sign("nick@heyer.app")), env });
is("both of Nicholas's addresses are one person's pages", connects[1].person, "nicholas");

/* ── messages ── */
let from = mark();
const sent = await call(messages, "messages", "POST", "", devon, { to: "nicholas", text: "Dinner at six?" });
is("sending tells both ends' pages", since(from), [
  { to: "devon", with: "nicholas", kind: "message" },
  { to: "nicholas", with: "devon", kind: "message" },
]);
is("...all through the one hub", pokes.slice(from).every((p) => p.hub === "hub"), true);
is("...and a notice carries no words", JSON.stringify(pokes.slice(from)).includes("Dinner"), false);
const messageId = sent.data.message.id;

from = mark();
await call(messages, "messages", "POST", "", nick, { love: messageId, on: true });
is("a heart tells both ends", since(from).map((n) => [n.to, n.with, n.kind]), [["nicholas", "devon", "love"], ["devon", "nicholas", "love"]]);

from = mark();
await call(messages, "messages", "POST", "", nick, { read: messageId, with: "devon" });
is("reading tells only your own other pages", since(from), [{ to: "nicholas", with: "devon", kind: "read" }]);

from = mark();
await call(messages, "messages", "DELETE", `?id=${messageId}`, devon);
is("taking a message back tells both ends", since(from).map((n) => [n.to, n.with, n.kind]), [["devon", "nicholas", "message"], ["nicholas", "devon", "message"]]);

from = mark();
await call(messages, "messages", "POST", "", nick, { block: "devon" });
is("blocking tells both ends", since(from).map((n) => [n.to, n.kind]), [["nicholas", "block"], ["devon", "block"]]);
from = mark();
await call(messages, "messages", "POST", "", nick, { unblock: "devon" });
is("...and so does unblocking", since(from).map((n) => [n.to, n.kind]), [["nicholas", "block"], ["devon", "block"]]);

from = mark();
await call(messages, "messages", "POST", "", devon, { here: true });
await call(messages, "messages", "GET", "?inbox", devon);
is("being here, or only reading, tells nobody", since(from), []);

from = mark();
is("a refused message tells nobody", [(await call(messages, "messages", "POST", "", devon, { to: "nicholas", text: "" })).status, since(from)], [400, []]);

hubDown = true;
is("a hub that can't be reached doesn't stop a message", (await call(messages, "messages", "POST", "", devon, { to: "nicholas", text: "Still there?" })).status, 201);
hubDown = false;

/* ── calls ── */
const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

from = mark();
const rung = await call(calls, "calls", "POST", "", devon, { to: "nicholas", offer: OFFER });
const callId = rung.data.call.id;
is("ringing tells both ends which call", since(from), [
  { to: "devon", with: "nicholas", kind: "call", id: callId },
  { to: "nicholas", with: "devon", kind: "call", id: callId },
]);
is("...and never the offer", JSON.stringify(pokes.slice(from)).includes("v=0"), false);

from = mark();
await call(calls, "calls", "POST", "", nick, { answer: callId, sdp: ANSWER });
is("picking up tells both ends", since(from).map((n) => [n.to, n.kind, n.id]), [["devon", "call", callId], ["nicholas", "call", callId]]);

from = mark();
await call(calls, "calls", "GET", `?call=${callId}`, devon);
is("checking in on a call tells nobody", since(from), []);

from = mark();
await call(calls, "calls", "POST", "", nick, { hangup: callId });
is("hanging up tells both ends", since(from).map((n) => [n.to, n.kind, n.id]), [["devon", "call", callId], ["nicholas", "call", callId]]);
from = mark();
await call(calls, "calls", "POST", "", devon, { hangup: callId });
is("hanging up a call that already ended tells nobody again", since(from), []);

const unanswered = (await call(calls, "calls", "POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
await db.prepare("UPDATE calls SET at = ?1 WHERE id = ?2").bind(new Date(Date.now() - 60000).toISOString(), unanswered).run();
from = mark();
await call(calls, "calls", "GET", `?call=${unanswered}`, devon);
is("a ring that runs out tells both ends, and that a missed call was left", since(from).map((n) => [n.to, n.kind]), [
  ["devon", "call"], ["nicholas", "call"], ["devon", "message"], ["nicholas", "message"],
]);

/* ── a fresh server copy on a database that's already set up ── */
{
  const warm = d1();
  const statements = [];
  const prepare = warm.prepare.bind(warm);
  warm.prepare = (sql) => { statements.push(sql); return prepare(sql); };
  const coldEnv = { MESSAGES: warm };
  const ask = async (handler, api, query) => handler({
    env: coldEnv,
    request: new Request(`https://thehackwithtable.com/api/${api}${query}`, { headers: { "Cf-Access-Jwt-Assertion": devon } }),
  });
  is("messages answer a first request on a set-up database", (await ask(messages, "messages", "?inbox")).status, 200);
  is("calls do too", (await ask(calls, "calls", "?ringing")).status, 200);
  is("...without sending a single CREATE, because the tables are already there", statements.filter((s) => /^\s*CREATE/i.test(s)).length, 0);
  is("...having asked which tables exist just once", statements.filter((s) => /sqlite_master/.test(s)).length, 1);
}

/* ── the hub ── */
const { deliver, okPerson } = await import("../live/src/hub.js");
const socket = (log, broken = false) => ({ send: (t) => { if (broken) throw new Error("closing"); log.push(t); } });
const devonTab = [], devonPhone = [], nickTab = [];
const socketsFor = (p) => ({ devon: [socket(devonTab), socket(devonPhone), socket([], true)], nicholas: [socket(nickTab)] }[p] || []);
const delivered = deliver([{ to: "devon", with: "nicholas", kind: "message" }, { to: "nobody", kind: "message" }, { kind: "message" }, null], socketsFor);
is("a notice reaches every page its person has open", [devonTab, devonPhone], [['{"with":"nicholas","kind":"message"}'], ['{"with":"nicholas","kind":"message"}']]);
is("...and nobody else's", nickTab, []);
is("...counting what was sent, past a page that's closing", delivered, 2);
is("rubbish isn't delivered", deliver("nope", socketsFor), 0);
is("person ids as the site makes them", [okPerson("devon"), okPerson("g-0123456789abcdef"), okPerson(""), okPerson("a b"), okPerson(7)], [true, true, false, false, false]);

/* ── the page ── */
const { createLive, watcher, reconnectDelay, liveUrl, RESYNC_MS } = await import("../src/live.js");
class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.sent = []; this.closed = false; FakeSocket.all.push(this); }
  send(t) { this.sent.push(t); }
  close() { this.closed = true; this.onclose?.({}); }
}
const live = createLive({ url: "wss://thehackwithtable.com/api/live", WebSocketImpl: FakeSocket });
const states = [];
live.onState((on) => states.push(on));
live.start();
is("starting opens one connection", [FakeSocket.all.length, FakeSocket.all[0].url], [1, "wss://thehackwithtable.com/api/live"]);
is("...which is connecting, not yet connected", [live.connecting, live.connected], [true, false]);
FakeSocket.all[0].onopen();
is("connected once it opens", [live.connected, live.connecting, states], [true, false, [true]]);

const heard = watcher(live, (n) => n.with === "nicholas");
let woke = false;
const sleeping = heard.sleep(10000).then(() => { woke = true; });
FakeSocket.all[0].onmessage({ data: JSON.stringify({ with: "michael", kind: "message" }) });
FakeSocket.all[0].onmessage({ data: "pong" });
FakeSocket.all[0].onmessage({ data: "not json" });
await sleep(10);
is("a notice about somebody else, a pong or rubbish doesn't wake a loop", woke, false);
FakeSocket.all[0].onmessage({ data: JSON.stringify({ with: "nicholas", kind: "message" }) });
await sleeping;
is("a notice about its conversation does", woke, true);

heard.clear();
FakeSocket.all[0].onmessage({ data: JSON.stringify({ with: "nicholas", kind: "love" }) });
let started = Date.now();
await heard.sleep(10000);
is("a notice that lands while the loop is asking isn't lost: the next sleep returns at once", Date.now() - started < 50, true);
heard.clear();
started = Date.now();
await heard.sleep(40);
is("with nothing heard, a loop sleeps as long as it asked", Date.now() - started >= 35, true);

heard.clear();
let wokeByDrop = false;
const dropping = heard.sleep(10000).then(() => { wokeByDrop = true; });
FakeSocket.all[0].onclose({});
await dropping;
is("losing the connection wakes a loop, so it can go back to asking the old way", [wokeByDrop, live.connected, states], [true, false, [true, false]]);
is("reconnecting waits longer each time, up to five minutes", [1, 2, 3, 9, 20].map(reconnectDelay), [2000, 4000, 8000, 300000, 300000]);
live.nudge();
is("coming back to the page reconnects at once", FakeSocket.all.length, 2);
live.stop();
await sleep(10);
is("stopping closes it and doesn't reconnect", [FakeSocket.all[1].closed, live.connected, FakeSocket.all.length], [true, false, 2]);
heard.close();

/* A dropped connection isn't a failed one: loops only go back to holding
   requests open after several tries in a row fail. */
const { DEGRADED_AFTER } = await import("../src/live.js");
FakeSocket.all.length = 0;
const flaky = createLive({ url: "wss://thehackwithtable.com/api/live", WebSocketImpl: FakeSocket, retryDelay: () => 0 });
flaky.start();
FakeSocket.all.at(-1).onopen();
FakeSocket.all.at(-1).onclose({});
is("a connection that just dropped isn't treated as failed", flaky.degraded, false);
await sleep(5);
FakeSocket.all.at(-1).onopen();
is("...and once it's back, it's back", [flaky.connected, flaky.degraded], [true, false]);
for (let i = 0; i < DEGRADED_AFTER; i++) {
  FakeSocket.all.at(-1).onclose({});
  await sleep(5);
}
is(`${DEGRADED_AFTER} failed tries in a row count as failed`, flaky.degraded, true);
FakeSocket.all.at(-1).onopen();
is("...until a connection opens again", flaky.degraded, false);
flaky.stop();
is("a browser without WebSockets counts as failed from the start", createLive({ url: "x", WebSocketImpl: null }).degraded, true);

is("the address follows the page", [
  liveUrl({ protocol: "https:", host: "thehackwithtable.com" }),
  liveUrl({ protocol: "http:", host: "localhost:5180" }),
], ["wss://thehackwithtable.com/api/live", "ws://localhost:5180/api/live"]);
is("connected pages still check now and then, in case a notice was lost", RESYNC_MS >= 60000, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
