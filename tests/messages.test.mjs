/**
 * Private messages, against a real SQLite database rather than a pretend one:
 * Node has one built in, so the endpoint's own SQL runs, indexes and all, with
 * a thin wrapper giving it the shape D1 has.
 *
 * What matters most here is what one person cannot do: read somebody else's
 * conversation, write as somebody else, or get past a block.
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

/* D1's shape over Node's SQLite: prepare().bind().all()/first()/run(). */
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
const env = { MESSAGES };

const { onRequest } = await import("../functions/api/messages.js");

const call = async (method, query, token, body) => {
  const res = await onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/messages${query}`, {
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

const lastId = (messages) => (messages && messages.length ? messages[messages.length - 1].id : 0);

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const nickOther = await sign("nick@heyer.app");          // his other address, the same person
const michael = await sign("mhealy.dev@gmail.com");
const tracey = await sign("uktraceyj@gmail.com");        // the roster matches her by the part before the @

/* ── who may be here at all ── */
is("no token, no messages", (await call("GET", "?inbox", null)).status, 403);
is("a forged token is nobody", (await call("GET", "?inbox", "not.a.jwt")).status, 403);
is("without the database it says so", (await onRequest({ env: {}, request: new Request("https://x/api/messages?inbox") })).status, 501);

/* ── who there is to talk to ── */
const roster = await call("GET", "?people", devon);
is("everybody else is listed", roster.data.people.map((p) => p.id).sort(), ["ashton", "haven", "michael", "nicholas", "tracey"]);
is("...by name", roster.data.people.find((p) => p.id === "nicholas").name, "Nicholas Heyer");
is("...and you are told who you are", roster.data.me, { id: "devon", name: "Devon Hackwith", owner: true });
is("nobody's address is sent to the page", JSON.stringify(roster.data).includes("@"), false);

/* ── sending and reading ── */
const sent = await call("POST", "", devon, { to: "nicholas", text: "Are you bringing the sourdough?" });
is("a message is sent", sent.status, 201);
is("...and comes back as yours", [sent.data.message.mine, sent.data.message.from], [true, "devon"]);

const asNick = await call("GET", "?with=devon", nick);
is("the other end sees it", asNick.data.messages.map((m) => m.text), ["Are you bringing the sourdough?"]);
is("...as not theirs", asNick.data.messages[0].mine, false);

const asNickOtherAddress = await call("GET", "?with=devon", nickOther);
is("his other address is the same conversation", asNickOtherAddress.data.messages.length, 1);

await call("POST", "", nick, { to: "devon", text: "Two loaves." });
const thread = await call("GET", "?with=nicholas", devon);
is("the conversation reads in order", thread.data.messages.map((m) => m.text), ["Are you bringing the sourdough?", "Two loaves."]);
is("only what is new, when asked", (await call("GET", `?with=nicholas&since=${thread.data.messages[0].id}`, devon)).data.messages.map((m) => m.text), ["Two loaves."]);

/* ── what somebody else cannot see ── */
const michaelLooking = await call("GET", "?with=devon", michael);
is("a third person asking for that conversation gets their own, which is empty", michaelLooking.data.messages, []);
/* A conversation is named by the person at the other end, never by the pair,
   so the only thing to try is a malformed id — which is refused outright. */
is("...and there is no way to name somebody else's",
  (await call("GET", "?with=devon:nicholas", michael)).status, 400);

/* ── the inbox ── */
const inbox = await call("GET", "?inbox", nick);
is("one conversation", inbox.data.threads.map((t) => t.with), ["devon"]);
is("...named", inbox.data.threads[0].name, "Devon Hackwith");
is("...with the last thing said", inbox.data.threads[0].last.text, "Two loaves.");
is("...and one unread", [inbox.data.threads[0].unread, inbox.data.unread], [1, 1]);

await call("POST", "", nick, { read: inbox.data.threads[0].last.id, with: "devon" });
is("reading it clears the count", (await call("GET", "?inbox", nick)).data.unread, 0);
await call("POST", "", devon, { to: "nicholas", text: "Perfect." });
is("...and a new one raises it again", (await call("GET", "?inbox", nick)).data.unread, 1);

/* ── blocking, said plainly ── */
is("blocking is your own list", (await call("POST", "", nick, { block: "michael" })).data.blocked, ["michael"]);
const refused = await call("POST", "", michael, { to: "nicholas", text: "hello?" });
is("somebody blocked is told, not ignored", refused.status, 403);
is("...plainly", refused.data.error, "You can't message Nicholas Heyer");
is("...and nothing was written", (await call("GET", "?with=michael", nick)).data.messages, []);

const blockedSelf = await call("POST", "", nick, { to: "michael", text: "nor you" });
is("writing to somebody you blocked explains itself", blockedSelf.status, 403);
is("...saying who", /You've blocked Michael Healy/.test(blockedSelf.data.error), true);
await call("POST", "", michael, { to: "devon", text: "Can I bring anything?" });
is("a block is one-way: others are unaffected", (await call("GET", "?with=michael", devon)).data.messages.length, 1);

is("unblocking is the same list, shorter", (await call("POST", "", nick, { unblock: "michael" })).data.blocked, []);
is("...and then it goes through", (await call("POST", "", michael, { to: "nicholas", text: "hello again" })).status, 201);
is("a blocked conversation leaves your inbox",
  (await call("POST", "", nick, { block: "michael" })).status === 200
    && (await call("GET", "?inbox", nick)).data.threads.map((t) => t.with), ["devon"]);
await call("POST", "", nick, { unblock: "michael" });

/* ── the filter, and other refusals ── */
const { TERMS } = await import("../shared/hate.js");
is("a slur is refused", (await call("POST", "", devon, { to: "nicholas", text: `you ${TERMS[0]}` })).status, 400);
is("swearing is not", (await call("POST", "", devon, { to: "nicholas", text: "bloody hell, fine" })).status, 201);
is("an empty message is nothing to send", (await call("POST", "", devon, { to: "nicholas", text: "   " })).status, 400);
is("a very long one is cut, not refused",
  (await call("POST", "", devon, { to: "nicholas", text: "x".repeat(5000) })).data.message.text.length, 4000);
is("you cannot message yourself", (await call("POST", "", devon, { to: "devon", text: "hi" })).status, 400);
is("nor somebody the box doesn't know", (await call("POST", "", devon, { to: "stranger", text: "hi" })).status, 400);

/* ── taking something back ── */
const mine = await call("POST", "", devon, { to: "nicholas", text: "ignore that" });
is("somebody else's message is not yours to take back", (await call("DELETE", `?id=${mine.data.message.id}`, nick)).status, 403);
is("your own is", (await call("DELETE", `?id=${mine.data.message.id}`, devon)).status, 200);
const afterDelete = (await call("GET", "?with=devon", nick)).data.messages.find((m) => m.id === mine.data.message.id);
is("...and it leaves a gap rather than vanishing", [afterDelete.deleted, afterDelete.text], [true, ""]);
is("...marked as taken back, not removed", afterDelete.removed, false);

/* A minute to change your mind, and then it stays. The clock is the server's:
   the stored time is moved back rather than waiting a minute. */
const ageBy = (id, ms) => sqlite.prepare("UPDATE messages SET at = ? WHERE id = ?").run(new Date(Date.now() - ms).toISOString(), id);
const late = await call("POST", "", michael, { to: "nicholas", text: "said in haste" });
ageBy(late.data.message.id, 61_000);
const tooLate = await call("DELETE", `?id=${late.data.message.id}`, michael);
is("after a minute your own message can't be taken back", tooLate.status, 403);
is("...and you are told why", /minute/.test(tooLate.data.error), true);
is("...and it is still there",
  (await call("GET", "?with=michael", nick)).data.messages.find((m) => m.id === late.data.message.id)?.text, "said in haste");
const justInTime = await call("POST", "", michael, { to: "nicholas", text: "oops" });
ageBy(justInTime.data.message.id, 50_000);
is("inside the minute it still can", (await call("DELETE", `?id=${justInTime.data.message.id}`, michael)).status, 200);

/* The owner may remove anybody's, however old, and it says removed. */
is("the owner is told they are the owner", (await call("GET", "?people", devon)).data.me.owner, true);
is("...and nobody else is", (await call("GET", "?people", nick)).data.me.owner, false);
const fromNick = await call("POST", "", nick, { to: "devon", text: "something that should go" });
ageBy(fromNick.data.message.id, 10 * 60_000);
is("nobody else may remove somebody else's message", (await call("DELETE", `?id=${fromNick.data.message.id}`, michael)).status, 403);
is("the owner may, however old it is", (await call("DELETE", `?id=${fromNick.data.message.id}`, devon)).status, 200);
const removedRow = (await call("GET", "?with=devon", nick)).data.messages.find((m) => m.id === fromNick.data.message.id);
is("...leaving a gap marked as removed", [removedRow.deleted, removedRow.text, removedRow.removed], [true, "", true]);
const ownOld = await call("POST", "", devon, { to: "nicholas", text: "an old one of mine" });
ageBy(ownOld.data.message.id, 5 * 60_000);
const ownGone = await call("DELETE", `?id=${ownOld.data.message.id}`, devon);
is("the owner's own old messages can go too, as removed", [ownGone.status, ownGone.data.removed], [200, true]);
is("a message that isn't there", (await call("DELETE", "?id=999999", devon)).status, 404);

/* ── who is about ──
   One request says "I am here" and brings back the badge and the lights. */
const beat = await call("POST", "", devon, { here: true });
is("saying you are here is allowed", beat.status, 200);
is("...and you are lit", beat.data.people.find((p) => p.id === "devon")?.online, true);
is("...everybody is listed, you included", beat.data.people.length, 6);
is("...somebody never seen is unlit and has no time",
  [beat.data.people.find((p) => p.id === "haven")?.online, beat.data.people.find((p) => p.id === "haven")?.seen], [false, null]);
is("...and the unread count rides along", typeof beat.data.unread, "number");

await call("POST", "", nick, { here: true });
is("the other end sees your light from their side",
  (await call("GET", "?people", nick)).data.people.find((p) => p.id === "devon")?.online, true);

/* Six minutes ago is not "now". */
sqlite.prepare("UPDATE presence SET at = ?1 WHERE person = ?2")
  .run(new Date(Date.now() - 6 * 60 * 1000).toISOString(), "devon");
const stale = (await call("GET", "?people", nick)).data.people.find((p) => p.id === "devon");
is("six minutes out and the light is off", stale.online, false);
is("...but it still says when they were last seen", typeof stale.seen, "string");

sqlite.prepare("UPDATE presence SET at = ?1 WHERE person = ?2")
  .run(new Date(Date.now() - 4 * 60 * 1000).toISOString(), "devon");
is("four minutes out is still here",
  (await call("GET", "?people", nick)).data.people.find((p) => p.id === "devon")?.online, true);

is("being here needs a sign-in too", (await call("POST", "", null, { here: true })).status, 403);
is("saying you are here twice keeps one row, not two",
  (await call("POST", "", devon, { here: true })).status === 200 && sqlite.prepare("SELECT COUNT(*) AS n FROM presence WHERE person = ?1").get("devon").n, 1);

/* The badge leaves out anybody you have blocked. */
await call("POST", "", michael, { to: "devon", text: "still here?" });
const before = (await call("POST", "", devon, { here: true })).data.unread;
await call("POST", "", devon, { block: "michael" });
is("blocking somebody takes their unread away", (await call("POST", "", devon, { here: true })).data.unread < before, true);
await call("POST", "", devon, { unblock: "michael" });

/* ── what is waiting to be read ──
   The names that flash above the messenger. */
await call("POST", "", tracey, { to: "devon", text: "are you up?" });
const waiting = await call("GET", "?waiting", devon);
is("who has written is listed", waiting.data.waiting.map((w) => w.id).includes("tracey"), true);
is("...by name", waiting.data.waiting.find((w) => w.id === "tracey")?.name, "Tracey Hackwith");
is("...with how many", waiting.data.waiting.find((w) => w.id === "tracey")?.unread >= 1, true);
is("...and the lights ride along", Array.isArray(waiting.data.people), true);

const fromTracey = (await call("GET", "?with=tracey", devon)).data.messages;
await call("POST", "", devon, { read: lastId(fromTracey), with: "tracey" });
is("reading them takes the name off the list",
  (await call("GET", "?waiting", devon)).data.waiting.some((w) => w.id === "tracey"), false);

await call("POST", "", tracey, { to: "devon", text: "still awake?" });
await call("POST", "", devon, { block: "tracey" });
is("somebody blocked never flashes", (await call("GET", "?waiting", devon)).data.waiting.some((w) => w.id === "tracey"), false);
await call("POST", "", devon, { unblock: "tracey" });

/* Holding the request open: told a count that is already out of date, it
   answers at once rather than waiting out the clock. */
const started = Date.now();
const promptly = await call("GET", "?waiting&wait=1&unread=-5", devon);
is("a count it already disagrees with comes back immediately", Date.now() - started < 3000, true);
is("...with what is actually waiting", promptly.data.waiting.some((w) => w.id === "tracey"), true);
is("waiting needs a sign-in too", (await call("GET", "?waiting", null)).status, 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
