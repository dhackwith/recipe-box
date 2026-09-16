/**
 * Audio calls: ringing, answering and hanging up, against a real SQLite
 * database with D1's shape (as tests/messages.test.mjs does). The call itself
 * runs browser to browser and can't be exercised here; what matters is who may
 * ring whom, that each end is sent only what it needs, and that calls nobody
 * ends — unanswered, or with one end gone — end themselves.
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

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

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../db/messages.sql", import.meta.url), "utf8"));
const MESSAGES = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    let args = [];
    const api = {
      bind: (...a) => { args = a; return api; },
      all: async () => ({ results: stmt.all(...args) }),
      first: async () => stmt.get(...args) ?? null,
      run: async () => {
        const r = stmt.run(...args);
        return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
      },
    };
    return api;
  },
};
MESSAGES.batch = async (statements) => {
  sqlite.exec("BEGIN");
  try {
    const results = [];
    for (const s of statements) results.push(await s.run());
    sqlite.exec("COMMIT");
    return results;
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
};
const env = { MESSAGES };

const { onRequest } = await import("../functions/api/calls.js");
const { lapsed, hangupReason, isSdp, shapeCall, ensureCalls, RING_MS, RING_EVERY_MS, RING_TIMES, STALE_MS, CHECK_IN_MS, KEEP_ENDED_MS, MISSED_TEXT, MISSED_VIDEO_TEXT } = await import("../shared/calls.js");
const { talkClock, endedLabel, callStatus, micError, callsSupported, trackRings, liveRings, retryDelay } = await import("../src/calls.js");

const call = async (method, query, token, body) => {
  const res = await onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/calls${query}`, {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
};

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:offer\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:answer\r\n";
const longAgo = (ms) => new Date(Date.now() - ms).toISOString();
const missedCalls = (from, to) =>
  sqlite.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender = ? AND recipient = ? AND text = ?").get(from, to, MISSED_TEXT).n;

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const nickOther = await sign("nick@heyer.app");          // his other address, the same person
const michael = await sign("mhealy.dev@gmail.com");

/* ── who may call at all ── */
is("no token, no calls", (await call("GET", "?ringing", null)).status, 403);
is("without the database it says so", (await onRequest({ env: {}, request: new Request("https://x/api/calls?ringing") })).status, 501);
is("nobody is ringing to begin with", (await call("GET", "?ringing", nick)).data, { ringing: [] });
is("you can't call yourself", (await call("POST", "", devon, { to: "devon", offer: OFFER })).status, 400);
is("...or somebody the box doesn't know", (await call("POST", "", devon, { to: "stranger", offer: OFFER })).status, 400);
is("...or without an offer a browser wrote", (await call("POST", "", devon, { to: "nicholas", offer: "hello" })).status, 400);

/* ── ringing and picking up ── */
const rung = await call("POST", "", devon, { to: "nicholas", offer: OFFER });
is("a call rings", [rung.status, rung.data.call.state, rung.data.call.outgoing, rung.data.call.with], [201, "ringing", true, "nicholas"]);
is("...and the caller isn't sent their own offer back", "offer" in rung.data.call, false);
const id = rung.data.call.id;

const ringing = await call("GET", "?ringing", nick);
is("the other end is told who is calling", ringing.data.ringing.map((r) => [r.id, r.from, r.name]), [[id, "devon", "Devon Hackwith"]]);
is("...and no address is in it", JSON.stringify(ringing.data).includes("@"), false);
is("...on his other address too", (await call("GET", "?ringing", nickOther)).data.ringing.length, 1);
is("somebody else isn't rung", (await call("GET", "?ringing", michael)).data.ringing, []);
is("...and can't look at the call", (await call("GET", `?call=${id}`, michael)).status, 404);
is("...or hang it up", (await call("POST", "", michael, { hangup: id })).status, 404);
is("...or answer it", (await call("POST", "", michael, { answer: id, sdp: ANSWER })).status, 404);

is("the caller can't ring anybody else meanwhile", (await call("POST", "", devon, { to: "michael", offer: OFFER })).data.error, "You're already on a call");
is("...and nobody can ring the person being rung", (await call("POST", "", michael, { to: "nicholas", offer: OFFER })).data.error, "Nicholas Heyer is on another call");

const seen = await call("GET", `?call=${id}`, nick);
is("the person rung gets the offer", [seen.data.call.offer, seen.data.call.outgoing, seen.data.call.name], [OFFER, false, "Devon Hackwith"]);
is("the caller can't answer their own call", (await call("POST", "", devon, { answer: id, sdp: ANSWER })).status, 400);
is("an answer has to be one a browser wrote", (await call("POST", "", nick, { answer: id, sdp: "yes" })).status, 400);

const picked = await call("POST", "", nick, { answer: id, sdp: ANSWER });
is("picking up makes it active", [picked.status, picked.data.call.state], [200, "active"]);
is("...and it stops ringing", (await call("GET", "?ringing", nick)).data.ringing, []);
is("a second tab picking up too is told", (await call("POST", "", nickOther, { answer: id, sdp: ANSWER })).data.error, "That call has already been answered");
const callerView = await call("GET", `?call=${id}`, devon);
is("the caller gets the answer", [callerView.data.call.state, callerView.data.call.answer], ["active", ANSWER]);
is("...and the person who answered isn't sent the offer any more", "offer" in (await call("GET", `?call=${id}`, nick)).data.call, false);

const waited = Date.now();
await call("GET", `?call=${id}&wait=1&state=ringing`, devon);
is("waiting for a change that already happened answers at once", Date.now() - waited < 1000, true);

const hung = await call("POST", "", nick, { hangup: id });
is("either end can hang up", [hung.data.call.state, hung.data.call.reason], ["ended", "ended"]);
const after = await call("GET", `?call=${id}`, devon);
is("...and the other end sees it end", [after.data.call.state, after.data.call.reason, "answer" in after.data.call], ["ended", "ended", false]);
is("hanging up twice is harmless", (await call("POST", "", devon, { hangup: id })).data.call.reason, "ended");
is("an ended call keeps no connection details", Object.values(sqlite.prepare("SELECT length(offer) AS o, length(answer) AS a FROM calls WHERE id = ?").get(id)), [0, 0]);
is("a call that was answered leaves no missed call", missedCalls("devon", "nicholas"), 0);

/* ── not answered ── */
const declined = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
is("turning a call down says so", (await call("POST", "", nick, { hangup: declined })).data.call.reason, "declined");
is("...and to the caller", (await call("GET", `?call=${declined}`, devon)).data.call.reason, "declined");
is("...without leaving a missed call — he saw it", missedCalls("devon", "nicholas"), 0);

const cancelled = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
is("the caller giving up cancels it", (await call("POST", "", devon, { hangup: cancelled })).data.call.reason, "cancelled");
is("...and leaves a missed call in the conversation", missedCalls("devon", "nicholas"), 1);

const unanswered = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
sqlite.prepare("UPDATE calls SET at = ? WHERE id = ?").run(longAgo(RING_MS + 1000), unanswered);
is("a ring nobody answers stops ringing", (await call("GET", "?ringing", nick)).data.ringing, []);
is("...and is missed", (await call("GET", `?call=${unanswered}`, devon)).data.call.reason, "missed");
await call("GET", `?call=${unanswered}`, nick);
is("...leaving one missed call, however many ask", missedCalls("devon", "nicholas"), 2);
is("...and the caller is free to call again", (await call("POST", "", devon, { to: "michael", offer: OFFER })).status, 201);
const toMichael = sqlite.prepare("SELECT id FROM calls WHERE callee = 'michael' ORDER BY id DESC").get().id;
await call("POST", "", devon, { hangup: toMichael });

/* ── one end gone ── */
const dropped = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
await call("POST", "", nick, { answer: dropped, sdp: ANSWER });
sqlite.prepare("UPDATE calls SET callee_seen = ? WHERE id = ?").run(longAgo(STALE_MS + 1000), dropped);
is("a call whose other end stopped checking in has dropped", (await call("GET", `?call=${dropped}`, devon)).data.call.reason, "dropped");

const leftOpen = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call.id;
await call("POST", "", nick, { answer: leftOpen, sdp: ANSWER });
sqlite.prepare("UPDATE calls SET caller_seen = ?, callee_seen = ? WHERE id = ?").run(longAgo(STALE_MS + 1000), longAgo(STALE_MS + 1000), leftOpen);
is("a call both ends walked away from doesn't keep anybody busy", (await call("POST", "", michael, { to: "devon", offer: OFFER })).status, 201);
const fromMichael = sqlite.prepare("SELECT id FROM calls WHERE caller = 'michael' ORDER BY id DESC").get().id;
await call("POST", "", michael, { hangup: fromMichael });

/* ── old calls don't pile up ── */
const oldestEnded = sqlite.prepare("SELECT id FROM calls WHERE state = 'ended' ORDER BY id LIMIT 1").get().id;
const newestEnded = sqlite.prepare("SELECT id FROM calls WHERE state = 'ended' ORDER BY id DESC LIMIT 1").get().id;
sqlite.prepare("UPDATE calls SET ended_at = ? WHERE id = ?").run(longAgo(KEEP_ENDED_MS + 60000), oldestEnded);
const clearing = (await call("POST", "", michael, { to: "devon", offer: OFFER })).data.call.id;
const kept = sqlite.prepare("SELECT id FROM calls").all().map((r) => r.id);
is("ringing somebody clears away calls that ended over a week ago", kept.includes(oldestEnded), false);
is("...but keeps recent ones", kept.includes(newestEnded), true);
await call("POST", "", michael, { hangup: clearing });

/* ── video ── */
const voiceOnly = (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.call;
is("a call rings as a voice call unless it says otherwise", voiceOnly.video, false);
is("...and is rung that way", (await call("GET", "?ringing", nick)).data.ringing.map((r) => r.video), [false]);
await call("POST", "", devon, { hangup: voiceOnly.id });
const withVideo = (await call("POST", "", devon, { to: "nicholas", offer: OFFER, video: true })).data.call;
is("a video call says so to the caller", withVideo.video, true);
is("...and to the person rung", (await call("GET", "?ringing", nick)).data.ringing.map((r) => r.video), [true]);
is("...and when they look at it", (await call("GET", `?call=${withVideo.id}`, nick)).data.call.video, true);
const missedVideo = () => sqlite.prepare("SELECT COUNT(*) AS n FROM messages WHERE text = ?").get(MISSED_VIDEO_TEXT).n;
await call("POST", "", devon, { hangup: withVideo.id });
is("a video call given up on leaves a missed video call", missedVideo(), 1);
const odd = (await call("POST", "", devon, { to: "nicholas", offer: OFFER, video: "yes" })).data.call;
is("only true makes it video", odd.video, false);
await call("POST", "", devon, { hangup: odd.id });

{
  /* A database made before video calls: the column is added, once. */
  const old = new DatabaseSync(":memory:");
  old.exec(`CREATE TABLE calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, caller TEXT NOT NULL, callee TEXT NOT NULL,
    state TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', offer TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL, answered_at TEXT NOT NULL DEFAULT '', ended_at TEXT NOT NULL DEFAULT '',
    caller_seen TEXT NOT NULL, callee_seen TEXT NOT NULL DEFAULT '')`);
  old.exec("INSERT INTO calls (pair, caller, callee, state, offer, at, caller_seen) VALUES ('a:b', 'a', 'b', 'ended', '', 't', 't')");
  const sent = [];
  const wrap = (db) => ({
    prepare(sql) {
      sent.push(sql);
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind: (...a) => { args = a; return api; },
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => { stmt.run(...args); return { meta: {} }; },
      };
      return api;
    },
  });
  const db = wrap(old);
  await ensureCalls(db);
  const columns = old.prepare("PRAGMA table_info(calls)").all().map((c) => c.name);
  is("a calls table from before video gets the column", columns.includes("video"), true);
  is("...and old calls count as voice calls", old.prepare("SELECT video FROM calls").get().video, 0);
  is("...added, not made again", [sent.filter((s) => /^\s*ALTER/i.test(s)).length, sent.filter((s) => /^\s*CREATE/i.test(s)).length], [1, 0]);
  const again = wrap(old);
  await ensureCalls(again);
  is("a second server copy on it sends no ALTER", sent.filter((s) => /^\s*ALTER/i.test(s)).length, 1);
  const racing = new DatabaseSync(":memory:");
  racing.exec("CREATE TABLE calls (id INTEGER PRIMARY KEY, caller_seen TEXT)");
  const late = wrap(racing);
  racing.exec("ALTER TABLE calls ADD COLUMN video INTEGER NOT NULL DEFAULT 0");
  /* This copy listed the tables before another added the column. */
  const stale = { prepare: (sql) => (/sqlite_master/.test(sql)
    ? { all: async () => ({ results: [{ name: "calls", sql: "CREATE TABLE calls (id INTEGER PRIMARY KEY, caller_seen TEXT)" }] }) }
    : late.prepare(sql)) };
  is("two copies adding it at once is harmless", await ensureCalls(stale).then(() => "fine", (err) => err.message), "fine");
}

/* ── blocks ── */
sqlite.prepare("INSERT INTO blocks (blocker, blocked, at) VALUES ('nicholas', 'devon', ?)").run(new Date().toISOString());
is("somebody who blocked you can't be called", (await call("POST", "", devon, { to: "nicholas", offer: OFFER })).data.error, "You can't call Nicholas Heyer");
is("...and can't call you either, until they unblock", (await call("POST", "", nick, { to: "devon", offer: OFFER })).data.error, "You've blocked Devon Hackwith — unblock them to call");
sqlite.prepare("DELETE FROM blocks").run();

/* ── the rules on their own ── */
const now = Date.now();
is("a fresh ring hasn't lapsed", lapsed({ state: "ringing", at: new Date(now).toISOString() }, now), null);
is("a ring past RING_MS is missed", lapsed({ state: "ringing", at: new Date(now - RING_MS - 1).toISOString() }, now), "missed");
is("a call with both ends checking in is going", lapsed({ state: "active", caller_seen: new Date(now).toISOString(), callee_seen: new Date(now).toISOString() }, now), null);
is("...one end silent past STALE_MS has dropped", lapsed({ state: "active", caller_seen: new Date(now).toISOString(), callee_seen: new Date(now - STALE_MS - 1).toISOString() }, now), "dropped");
is("an ended call stays ended", lapsed({ state: "ended", at: "2000-01-01T00:00:00.000Z" }, now), null);
is("hanging up a ring you're getting declines it", hangupReason({ state: "ringing", callee: "nicholas" }, "nicholas"), "declined");
is("...one you made cancels it", hangupReason({ state: "ringing", callee: "nicholas" }, "devon"), "cancelled");
is("...and a call going just ends", hangupReason({ state: "active", callee: "nicholas" }, "devon"), "ended");
is("a call checks in at least twice before it could be counted as dropped", CHECK_IN_MS * 2 < STALE_MS, true);
is("a call rings five times, four seconds apart, and no longer", [RING_TIMES, RING_EVERY_MS, RING_MS], [5, 4000, 20000]);
is("...so a ring one ring short is still going", lapsed({ state: "ringing", at: new Date(now - RING_MS + RING_EVERY_MS).toISOString() }, now), null);
const seenOnce = trackRings([], [{ id: 5 }], 1000);
is("a ring remembers when this page first saw it", trackRings(seenOnce, [{ id: 5 }, { id: 6 }], 9000).map((r) => [r.id, r.seen]), [[5, 1000], [6, 9000]]);
is("...and stops RING_MS after that, whether or not the page is still asking", liveRings(seenOnce, 1000 + RING_MS).length, 0);
is("...but not before", liveRings(seenOnce, 1000 + RING_MS - 1).length, 1);
is("asking again after failures waits longer each time, up to twenty seconds", [1, 2, 3, 4, 9].map(retryDelay), [3000, 6000, 12000, 20000, 20000]);
is("an offer is v=0 first", [isSdp(OFFER), isSdp("x"), isSdp(42), isSdp("v=0" + "a".repeat(30000))], [true, false, false, false]);
is("a call's shape names the other end", shapeCall({ id: 1, caller: "a", callee: "b", state: "active", answer: "v=0", at: "t" }, "b", (x) => x.toUpperCase()).name, "A");

/* ── what the card says ── */
is("the clock counts minutes and seconds", [talkClock(0), talkClock(7400), talkClock(760000), talkClock(3725000)], ["0:00", "0:07", "12:40", "1:02:05"]);
is("a call nobody answered, from the caller's side", endedLabel("missed", true, "Nicholas Heyer"), "Nicholas didn't answer");
is("...and from the other side", endedLabel("missed", false, "Devon Hackwith"), "Missed call from Devon");
is("a call turned down, to the caller", endedLabel("declined", true, "Nicholas Heyer"), "Nicholas can't talk right now");
is("a call that couldn't connect says why", endedLabel("failed", true, "Nick").startsWith("Couldn't connect"), true);
is("a going call shows its clock", callStatus({ phase: "active", since: 1000, now: 66000 }), "1:05");
is("an error is said in its own words", callStatus({ phase: "ended", error: "No microphone was found on this device." }), "No microphone was found on this device.");
is("a refused microphone says how to fix it", micError({ name: "NotAllowedError" }).startsWith("Calls need your microphone"), true);
is("node can't make calls, and says so", callsSupported({}), false);

/* A request that never answers is given up on, so no loop waits on it for good. */
const { callsCall } = await import("../src/calls.js");
const certsFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => new Promise((_, reject) => {
  opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
});
const gaveUp = await callsCall("GET", "?ringing", undefined, 50).then(() => null, (err) => [err.status, err.message]);
is("a request that never answers is given up on", gaveUp, [0, "The site took too long to answer"]);
globalThis.fetch = async () => new Response("<!doctype html>", { status: 200 });
is("a page that isn't the calls API says calls aren't here", await callsCall("GET", "?ringing").then(() => null, (err) => err.status), 501);
globalThis.fetch = certsFetch;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
