/**
 * Group chats: making and running a group (functions/api/groups.js) and
 * talking in one (functions/api/messages.js with a "grp:<id>" chat id),
 * against real SQLite with D1's shape (tests/d1.mjs).
 *
 * What matters most: only members see or write in a group, everyone in it is
 * told of every change, nobody gets past twelve, only the creator removes
 * people, and groups don't disturb one-to-one conversations.
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

/* Notices recorded instead of sent (shared/live.js). */
const pokes = [];
const LIVE = {
  idFromName: (name) => ({ name }),
  get: () => ({
    fetch: async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      pokes.push(...(await req.json()).notes);
      return Response.json({ sent: 0 });
    },
  }),
};

const db = d1();
const env = { MESSAGES: db, LIVE };
const groups = (await import("../functions/api/groups.js")).onRequest;
const messages = (await import("../functions/api/messages.js")).onRequest;
const { TERMS } = await import("../shared/hate.js");

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
const G = (method, query, token, body) => call(groups, "groups", method, query, token, body);
const M = (method, query, token, body) => call(messages, "messages", method, query, token, body);

const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const tracey = await sign("uktraceyj@gmail.com");
const michael = await sign("mhealy.dev@gmail.com");

/* ── making a group ── */
is("nobody signed in, no group", (await G("POST", "", null, { create: ["nicholas", "tracey"] })).status, 403);
is("a group needs two other people", (await G("POST", "", devon, { create: ["nicholas"] })).status, 400);
is("...who the box knows", (await G("POST", "", devon, { create: ["nicholas", "stranger"] })).status, 400);
pokes.length = 0;
const made = await G("POST", "", devon, { create: ["nicholas", "tracey", "nicholas", "devon"] });
is("a group of three is made", made.status, 201);
const g = made.data.group;
const chat = g.chat;
is("...you first, then them, each once", g.members.map((m) => m.id), ["devon", "nicholas", "tracey"]);
is("...named after the others until somebody names it", [g.name, g.title], ["", "Nicholas and Tracey"]);
is("...and made by you", [g.creator, g.youMadeIt], ["devon", true]);
is("its chat id is a group's", chat, `grp:${g.id}`);
is("everyone in it is told", pokes.map((p) => [p.to, p.with, p.kind]), [["devon", chat, "group"], ["nicholas", chat, "group"], ["tracey", chat, "group"]]);
is("a member sees it named from their side", (await G("GET", `?id=${g.id}`, tracey)).data.group.title, "Devon and Nicholas");
is("somebody outside it doesn't see it at all", (await G("GET", `?id=${g.id}`, michael)).status, 404);

/* ── talking in it ── */
pokes.length = 0;
const hello = await M("POST", "", devon, { to: chat, text: "Sangria Saturday?" });
is("a member can write in it", hello.status, 201);
is("...and every member's pages are told", pokes.map((p) => [p.to, p.with, p.kind]), [["devon", chat, "message"], ["nicholas", chat, "message"], ["tracey", chat, "message"]]);
const traceyReads = await M("GET", `?with=${chat}&since=0`, tracey);
is("members read it, with who said it", traceyReads.data.messages.map((m) => [m.from, m.text, m.mine]), [["devon", "Sangria Saturday?", false]]);
is("...and are told who's in the group", [traceyReads.data.name, traceyReads.data.group.members.map((m) => m.id)], ["Devon and Nicholas", ["devon", "nicholas", "tracey"]]);
is("somebody outside can't read it", (await M("GET", `?with=${chat}&since=0`, michael)).status, 404);
is("...or write in it", (await M("POST", "", michael, { to: chat, text: "hi" })).status, 403);
is("a made-up group is nobody's", (await M("GET", "?with=grp:999&since=0", devon)).status, 404);

const traceyWaiting = await M("GET", "?waiting", tracey);
is("it's unread for the others", traceyWaiting.data.unread, 1);
is("...under the group's chat id and name", traceyWaiting.data.waiting.map((w) => [w.id, w.name, w.unread]), [[chat, "Devon and Nicholas", 1]]);
is("...but not for whoever wrote it", (await M("GET", "?waiting", devon)).data.unread, 0);
const traceyThread = (await M("GET", "?inbox", tracey)).data.threads.find((t) => t.with === chat);
is("the group is in their inbox with its last message", [traceyThread.name, traceyThread.unread, traceyThread.last.text, traceyThread.group.id], ["Devon and Nicholas", 1, "Sangria Saturday?", g.id]);
await M("POST", "", tracey, { read: hello.data.message.id, with: chat });
is("reading it clears it", (await M("GET", "?waiting", tracey)).data.unread, 0);
is("an outsider can't mark it read", (await M("POST", "", michael, { read: 1, with: chat })).status, 404);

pokes.length = 0;
const laughed = await M("POST", "", tracey, { react: hello.data.message.id, emoji: "😂" });
is("members can react in a group", [laughed.status, laughed.data.reacted], [200, "😂"]);
is("...and everyone is told", pokes.map((p) => p.to).sort(), ["devon", "nicholas", "tracey"]);
is("an outsider can't", (await M("POST", "", michael, { react: hello.data.message.id, emoji: "😂" })).status, 404);
const oops = await M("POST", "", nick, { to: chat, text: "wrong chat" });
is("taking back works in a group", (await M("DELETE", `?id=${oops.data.message.id}`, nick)).status, 200);

await M("POST", "", nick, { to: "devon", text: "just us" });
is("a one-to-one conversation is still its own thread", (await M("GET", "?inbox", devon)).data.threads.map((t) => t.with).sort(), [chat, "nicholas"].sort());
is("...and still counts as a person waiting", (await M("GET", "?waiting", devon)).data.waiting.map((w) => w.id), ["nicholas"]);

/* ── renaming and its picture ── */
pokes.length = 0;
const renamed = await G("POST", "", tracey, { rename: g.id, name: "  Sangria   crew " });
is("any member can rename it", [renamed.status, renamed.data.group.name, renamed.data.group.title], [200, "Sangria crew", "Sangria crew"]);
is("...and everyone is told", pokes.map((p) => p.kind), ["group", "group", "group"]);
is("a name with a slur is refused", (await G("POST", "", tracey, { rename: g.id, name: `the ${TERMS[0]} crew` })).status, 400);
is("an outsider can't rename it", (await G("POST", "", michael, { rename: g.id, name: "Mine now" })).status, 404);
is("clearing the name goes back to the members' names", (await G("POST", "", devon, { rename: g.id, name: "" })).data.group.title, "Nicholas and Tracey");
await G("POST", "", devon, { rename: g.id, name: "Sangria crew" });

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64")}`;
const pictured = await G("POST", "", nick, { picture: g.id, image: JPEG });
is("any member can set its picture", [pictured.status, typeof pictured.data.group.picture], [200, "string"]);
const asked = (token) => groups({ env, request: new Request(`https://thehackwithtable.com/api/groups?picture=${g.id}&v=1`, { headers: { "Cf-Access-Jwt-Assertion": token } }) });
const seen = await asked(tracey);
is("members see the picture", [seen.status, seen.headers.get("Content-Type")], [200, "image/jpeg"]);
is("...nobody else does", (await asked(michael)).status, 404);
is("only a JPEG is kept", (await G("POST", "", nick, { picture: g.id, image: "data:image/svg+xml;base64,PHN2Zz4=" })).status, 400);
is("the picture can be taken off", (await G("POST", "", nick, { picture: g.id, image: null })).data.group.picture, null);

/* ── adding people, up to twelve ── */
const added = await G("POST", "", tracey, { add: g.id, people: ["michael", "tracey"] });
is("any member can add people", added.data.group.members.map((m) => m.id), ["devon", "nicholas", "tracey", "michael"]);
is("somebody added can read what came before", (await M("GET", `?with=${chat}&since=0`, michael)).data.messages.map((m) => m.text).filter(Boolean), ["Sangria Saturday?"]);
is("...none of it unread for them", (await M("GET", "?waiting", michael)).data.unread, 0);
is("adding nobody new is refused", (await G("POST", "", tracey, { add: g.id, people: ["michael"] })).status, 400);

const guestTokens = await Promise.all(Array.from({ length: 8 }, (_, i) => sign(`guest${i}@example.com`)));
for (const t of guestTokens) await M("GET", "?people", t);
const guestIds = (await M("GET", "?people", devon)).data.people.map((p) => p.id).filter((id) => id.startsWith("g-"));
is("eight guests have arrived to add", guestIds.length, 8);
const tooMany = await G("POST", "", devon, { add: g.id, people: [...guestIds, "ashton"] });
is("a group can't go past twelve", tooMany.status, 400);
is("...and says how much room is left", tooMany.data.error.includes("room for 8 more"), true);
is("a new group of thirteen is refused too", (await G("POST", "", devon, { create: [...guestIds, "ashton", "haven", "nicholas", "tracey"] })).status, 400);
is("a new group of exactly twelve is fine", (await G("POST", "", devon, { create: [...guestIds, "ashton", "haven", "nicholas"] })).status, 201);

/* ── removing people and leaving ── */
is("only the creator removes people", (await G("POST", "", tracey, { remove: g.id, person: "michael" })).status, 403);
const removed = await G("POST", "", devon, { remove: g.id, person: "michael" });
is("the creator can", removed.data.group.members.map((m) => m.id), ["devon", "nicholas", "tracey"]);
is("somebody removed can't read it any more", (await M("GET", `?with=${chat}&since=0`, michael)).status, 404);
is("the creator doesn't remove themselves, they leave", (await G("POST", "", devon, { remove: g.id, person: "devon" })).status, 400);

const form = new FormData();
form.append("to", chat);
form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], "sangria.jpg", { type: "image/jpeg" }));
const upload = await messages({ env, request: new Request("https://thehackwithtable.com/api/messages", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": nick }, body: form }) });
const uploaded = JSON.parse(await upload.text());
is("a photo can be sent to a group", upload.status, 201);
const fetchFile = (token) => messages({ env, request: new Request(`https://thehackwithtable.com/api/messages?attachment=${uploaded.message.attachment.id}`, { headers: { "Cf-Access-Jwt-Assertion": token } }) });
is("...and every member can open it", (await fetchFile(tracey)).status, 200);
is("...but not somebody taken out of the group", (await fetchFile(michael)).status, 404);

const left = await G("POST", "", devon, { leave: g.id });
is("anyone can leave", left.data, { left: true, id: g.id });
is("a creator who leaves hands it to whoever's been in longest", (await G("GET", `?id=${g.id}`, nick)).data.group.creator, "nicholas");
is("somebody who left can't see it", (await M("GET", `?with=${chat}&since=0`, devon)).status, 404);

/* ── a person's id changing (a guest put on the roster) ── */
await M("POST", "", tracey, { to: chat, text: "count me in" });
const { rekey } = await import("../shared/guests.js");
await rekey(db, "tracey", "tracey-new");
const groupPairs = await db.prepare("SELECT DISTINCT pair FROM messages WHERE sender = 'tracey-new'").all();
is("their group messages stay in the group's conversation", groupPairs.results.map((r) => r.pair), [chat]);
const membersNow = await db.prepare("SELECT person FROM group_members WHERE group_id = ?1 ORDER BY at, rowid").bind(g.id).all();
is("...and they stay in the group under the new id", membersNow.results.map((r) => r.person), ["nicholas", "tracey-new"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
