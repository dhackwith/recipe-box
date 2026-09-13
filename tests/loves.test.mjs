/**
 * Hearts on messages and on notes, through both endpoints, against real SQLite
 * (tests/d1.mjs). What matters: the right people see them, nobody hearts their
 * own words or somebody else's conversation, and a heart on an old message
 * still reaches the other end.
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

const messages = await import("../functions/api/messages.js");
const notes = await import("../functions/api/notes.js");

const endpoint = (handler, path, env) => async (method, query, token, body) => {
  const res = await handler.onRequest({
    env,
    request: new Request(`https://thehackwithtable.com${path}${query}`, {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
};

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const nickOther = await sign("nick@heyer.app");
const michael = await sign("mhealy.dev@gmail.com");
const outsider = await sign("somebody@example.com");

/* ── messages ── */
console.log("\n— hearts on messages —");
const db = d1();
const msg = endpoint(messages, "/api/messages", { MESSAGES: db });

const first = (await msg("POST", "", devon, { to: "nicholas", text: "Are you bringing the sourdough?" })).data.message;
const answer = (await msg("POST", "", nick, { to: "devon", text: "Two loaves." })).data.message;
is("a new message has no hearts", [first.loves ?? [], first.loved ?? false], [[], false]);

const opened = await msg("GET", "?with=nicholas&since=0&loves=0", devon);
is("a conversation says where its hearts are up to", opened.data.loveSeq, 0);
is("...and its messages carry none yet", opened.data.messages.map((m) => m.loves), [[], []]);

const loved = await msg("POST", "", nick, { love: first.id, on: true });
is("loving their message works", loved.status, 200);
is("...and says who loves it", [loved.data.loves, loved.data.loved], [["nicholas"], true]);

const devonSees = await msg("GET", "?with=nicholas&since=0", devon);
is("the sender sees the heart on their message", devonSees.data.messages.find((m) => m.id === first.id).loves, ["nicholas"]);
is("...as not their own heart", devonSees.data.messages.find((m) => m.id === first.id).loved, false);

const caughtUp = await msg("GET", `?with=nicholas&since=${answer.id}&loves=${opened.data.loveSeq}`, devon);
is("an open chat is told of a heart on a message it already has", caughtUp.data.loved, [{ id: first.id, loves: ["nicholas"], loved: false }]);
is("...with no messages resent", caughtUp.data.messages, []);
const seq = caughtUp.data.loveSeq;
is("...and moves on past it", seq > 0, true);
is("asking again from there finds nothing new", (await msg("GET", `?with=nicholas&since=${answer.id}&loves=${seq}`, devon)).data.loved, []);

/* A waiting request wakes for a heart, not only for a message. */
const waiting = msg("GET", `?with=nicholas&since=${answer.id}&loves=${seq}&wait=1`, devon);
setTimeout(() => { msg("POST", "", nick, { love: first.id, on: false }); }, 150);
const started = Date.now();
const before = db.queries;
const woke = await waiting;
is("a waiting chat wakes when a heart is taken back", woke.data.loved, [{ id: first.id, loves: [], loved: false }]);
is("...within a couple of seconds", Date.now() - started < 3000, true);
is("...well inside fifty queries", db.queries - before < 50, true);

is("nobody loves their own message", (await msg("POST", "", devon, { love: first.id })).status, 400);
is("nor his, from his other address", (await msg("POST", "", nickOther, { love: answer.id })).status, 400);
is("a third person can't reach the conversation", (await msg("POST", "", michael, { love: first.id })).status, 404);
is("a message that isn't there", (await msg("POST", "", nick, { love: 99999 })).status, 404);
is("an older page, not asking about hearts, is not told about them", "loved" in (await msg("GET", "?with=nicholas&since=0", devon)).data, false);

await msg("POST", "", devon, { block: "nicholas" });
const blockedLove = await msg("POST", "", nick, { love: first.id });
is("somebody blocked can't love", [blockedLove.status, blockedLove.data.error], [403, "You can't message Devon Hackwith"]);
await msg("POST", "", devon, { unblock: "nicholas" });

const fresh = (await msg("POST", "", devon, { to: "nicholas", text: "Perfect." })).data.message;
await msg("POST", "", nick, { love: fresh.id });
await msg("DELETE", `?id=${fresh.id}`, devon);
const afterTakeBack = (await msg("GET", "?with=nicholas&since=0", devon)).data.messages.find((m) => m.id === fresh.id);
is("a message taken back loses its hearts", [afterTakeBack.deleted, afterTakeBack.loves], [true, []]);
is("...and loving it now is refused", (await msg("POST", "", nick, { love: fresh.id })).status, 409);

/* ── notes ── */
console.log("\n— hearts on notes —");
const kv = new Map();
const RECIPES = {
  get: async (k) => (kv.has(k) ? kv.get(k) : null),
  put: async (k, v) => void kv.set(k, v),
  delete: async (k) => void kv.delete(k),
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true }),
};
const notesDb = d1({ schema: false });   // loves.js makes its own table
const note = endpoint(notes, "/api/notes", { RECIPES, MESSAGES: notesDb });

const written = (await note("POST", "", devon, { recipe: "r1", text: "Half the sugar next time." })).data.entry;
is("a new note has no hearts and can't be loved by its writer", [written.loves, written.canLove], [[], false]);

const nickReads = (await note("GET", "?recipe=r1", nick)).data.entries[0];
is("somebody else may love it", nickReads.canLove, true);
is("an outsider may not", (await note("GET", "?recipe=r1", outsider)).data.entries[0].canLove, false);

const hearted = await note("POST", "", nick, { love: written.id, on: true });
is("loving a note works", [hearted.status, hearted.data.loved], [200, true]);
is("...and names who, marking the reader", hearted.data.loves, [{ id: "nicholas", name: "Nicholas Heyer", you: true }]);
await note("POST", "", michael, { love: written.id });

const everybody = (await note("GET", "?recipe=r1", devon)).data.entries[0];
is("everybody reading the recipe sees every heart", everybody.loves.map((l) => l.name), ["Nicholas Heyer", "Michael Healy"]);
is("...none of them the reader's", everybody.loves.some((l) => l.you), false);
is("...and no addresses go with them", JSON.stringify(everybody).includes("@heyer"), false);
is("loving twice from his other address is still one heart", (await note("POST", "", nickOther, { love: written.id })).data.loves.length, 2);

is("the writer can't love their own note", (await note("POST", "", devon, { love: written.id })).status, 400);
is("an outsider can't love at all", (await note("POST", "", outsider, { love: written.id })).status, 403);
is("a note that isn't there", (await note("POST", "", nick, { love: "note:r1:nope" })).status, 404);

const unloved = await note("POST", "", nick, { love: written.id, on: false });
is("taking a heart back", unloved.data.loves.map((l) => l.id), ["michael"]);

await note("DELETE", `?id=${encodeURIComponent(written.id)}`, devon);
const redo = (await note("POST", "", devon, { recipe: "r1", text: "Try again." })).data.entry;
await note("POST", "", michael, { love: redo.id });
is("a removed note takes its hearts with it", (await notesDb.prepare("SELECT COUNT(*) AS n FROM loves WHERE target = ?1").bind(written.id).first()).n, 0);

const noDb = endpoint(notes, "/api/notes", { RECIPES });
const plain = (await noDb("GET", "?recipe=r1", nick)).data.entries[0];
is("without the database, notes still list", plain.text, "Try again.");
is("...unloved and not lovable", [plain.loves, plain.canLove], [[], false]);
is("...and loving says so", (await noDb("POST", "", nick, { love: redo.id })).status, 501);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
