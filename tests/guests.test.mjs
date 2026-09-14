/**
 * Guests in the messenger: people Access lets in who aren't on the roster.
 * They are listed with the family, can message and be messaged, never show up
 * as an address, and keep their conversations when their id changes — from
 * the bare address they were keyed by before, and to a roster id once added.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { d1 } from "./d1.mjs";
import { personFor, personName, isGuestId } from "../shared/access.js";
import { rekey } from "../shared/guests.js";

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";
const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
globalThis.fetch = async (url) => {
  if (String(url).startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch: ${url}`);
};
const sign = (email) =>
  new SignJWT({ email }).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h").sign(keys.privateKey);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const db = d1();
const { onRequest } = await import("../functions/api/messages.js");
const call = async (method, query, token, body) => {
  const res = await onRequest({
    env: { MESSAGES: db },
    request: new Request(`https://thehackwithtable.com/api/messages${query}`, {
      method,
      headers: { "Cf-Access-Jwt-Assertion": token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  let data = null;
  try { data = JSON.parse(await res.text()); } catch { data = null; }
  return { status: res.status, data };
};
const rows = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

const SPAM = "devonhackwithspam@example.com";
const devon = await sign("devonhackwith@gmail.com");
const guest = await sign(SPAM);
const other = await sign("someone.new@example.com");

console.log("\n— who a guest is —");
const g = personFor(SPAM);
is("a guest's id is not their address", [isGuestId(g.id), g.id.includes("@")], [true, false]);
is("...and the same however the address is written", personFor("DevonHackwithSpam+recipes@Example.com").id, g.id);
is("...and named from the address", g.name, "Devonhackwithspam");
is("somebody on the roster is still their roster id", personFor("devonhackwith@gmail.com").id, "devon");
is("a guest id on its own has no name to give", personName(g.id), "Someone");

console.log("\n— what was written before guests had ids —");
/* How a guest's conversation was stored until now: keyed by the address. */
await db.prepare("INSERT INTO messages (pair, sender, recipient, text, at) VALUES (?1, ?2, ?3, ?4, ?5)")
  .bind(`devon:${SPAM}`, SPAM, "devon", "Ayo watup", new Date().toISOString()).run();
const oldId = (await rows("SELECT id FROM messages"))[0].id;
await db.prepare("INSERT INTO reads (person, pair, last_read) VALUES (?1, ?2, ?3)").bind("devon", `devon:${SPAM}`, oldId).run();
await call("GET", "?people", devon);   // makes the loves table
await db.prepare("INSERT INTO loves (kind, target, person, pair, loved, seq, at) VALUES ('m', ?1, 'devon', ?2, 1, 1, ?3)")
  .bind(String(oldId), `devon:${SPAM}`, new Date().toISOString()).run();
await db.prepare("INSERT INTO presence (person, at) VALUES (?1, ?2)").bind(SPAM, new Date().toISOString()).run();

await call("GET", "?people", guest);    // the guest's first visit since
const moved = (await rows("SELECT sender, recipient, pair FROM messages WHERE id = ?1", oldId))[0];
is("their old message now belongs to their guest id", moved, { sender: g.id, recipient: "devon", pair: ["devon", g.id].sort().join(":") });
is("...and Devon's read marker follows the conversation", (await rows("SELECT pair FROM reads WHERE person = 'devon'"))[0].pair, moved.pair);
is("...and so does the heart on it", (await rows("SELECT pair, person FROM loves"))[0], { pair: moved.pair, person: "devon" });
is("...and their old last-seen is gone", (await rows("SELECT person FROM presence WHERE person = ?1", SPAM)).length, 0);
const tables = ["messages", "reads", "loves", "presence", "blocks"];
let leftovers = 0;
for (const t of tables) leftovers += (await rows(`SELECT * FROM ${t}`)).filter((r) => JSON.stringify(r).includes("@")).length;
is("no address is left keying anything", leftovers, 0);

console.log("\n— the friends list —");
const devonsList = await call("GET", "?people", devon);
is("the guest is in Devon's friends list", devonsList.data.people.some((p) => p.id === g.id && p.name === "Devonhackwithspam"), true);
is("...with no address anywhere in it", JSON.stringify(devonsList.data).includes("@"), false);
const guestsList = await call("GET", "?people", guest);
is("the guest sees the family", ["devon", "tracey", "nicholas"].every((id) => guestsList.data.people.some((p) => p.id === id)), true);
is("...and not themselves", guestsList.data.people.some((p) => p.id === g.id), false);
is("...and is told who they are, without an address", [guestsList.data.me.id, JSON.stringify(guestsList.data.me).includes("@")], [g.id, false]);
is("somebody who hasn't used the site isn't listed yet", devonsList.data.people.some((p) => p.name === "Someone New"), false);
await call("POST", "", other, { here: true });
is("...until they do", (await call("GET", "?people", devon)).data.people.some((p) => p.name === "Someone New"), true);

console.log("\n— messaging both ways —");
is("a guest can message the family", (await call("POST", "", guest, { to: "devon", text: "what's crackin" })).status, 201);
const reply = await call("POST", "", devon, { to: g.id, text: "not much" });
is("...and the family can reply", reply.status, 201);
is("the guest reads the whole conversation", (await call("GET", "?with=devon", guest)).data.messages.map((m) => m.text), ["Ayo watup", "what's crackin", "not much"]);
const inbox = await call("GET", "?inbox", devon);
is("Devon's inbox names the guest", inbox.data.threads.find((t) => t.with === g.id)?.name, "Devonhackwithspam");
is("...with no address in it", JSON.stringify(inbox.data).includes("@"), false);
const waiting = await call("GET", "?waiting", devon);
is("a guest waiting to be read is named", waiting.data.waiting.find((w) => w.id === g.id)?.name, "Devonhackwithspam");
is("a guest can message another guest", (await call("POST", "", guest, { to: personFor("someone.new@example.com").id, text: "hi" })).status, 201);
is("a made-up guest id is still nobody", (await call("POST", "", devon, { to: "g-0000000000000000", text: "hi" })).status, 400);
is("so is a name", (await call("POST", "", devon, { to: "stranger", text: "hi" })).status, 400);
is("a guest can love a family member's message", (await call("POST", "", guest, { love: reply.data.message.id })).status, 200);
await call("POST", "", devon, { block: g.id });
const blocked = await call("POST", "", guest, { to: "devon", text: "hello?" });
is("blocking a guest works as it does for anyone", [blocked.status, blocked.data.error], [403, "You can't message Devon Hackwith"]);
await call("POST", "", devon, { unblock: g.id });

console.log("\n— when a guest is added to the roster —");
/* Tracey's address stands in for a guest who has since been added: rows under
   a guest id for her address move to "tracey" on her next visit. */
const traceyAddress = "uktraceyj@gmail.com";
const asGuest = "g-1234567890abcdef";
await db.prepare("INSERT INTO guests (id, name, address, at) VALUES (?1, 'Uktraceyj', ?2, ?3)").bind(asGuest, traceyAddress, new Date().toISOString()).run();
await db.prepare("INSERT INTO messages (pair, sender, recipient, text, at) VALUES (?1, ?2, 'devon', 'from before', ?3)")
  .bind(["devon", asGuest].sort().join(":"), asGuest, new Date().toISOString()).run();
await db.prepare("INSERT INTO blocks (blocker, blocked, at) VALUES ('michael', ?1, ?2)").bind(asGuest, new Date().toISOString()).run();
await call("GET", "?people", await sign(traceyAddress));
is("her messages from before are hers now", (await rows("SELECT sender, pair FROM messages WHERE text = 'from before'"))[0], { sender: "tracey", pair: "devon:tracey" });
is("...a block on her followed her", (await rows("SELECT blocked FROM blocks WHERE blocker = 'michael'"))[0]?.blocked, "tracey");
is("...and she is no longer listed as a guest", (await rows("SELECT id FROM guests WHERE id = ?1", asGuest)).length, 0);
is("...so she appears once, under her name", (await call("GET", "?people", devon)).data.people.filter((p) => p.name === "Tracey Hackwith" || p.id === asGuest).map((p) => p.id), ["tracey"]);

console.log("\n— moving ids directly —");
await rekey(db, "nobody-here", "nobody-there");
is("moving an id nothing uses changes nothing", (await rows("SELECT COUNT(*) AS n FROM messages WHERE sender = 'nobody-there'"))[0].n, 0);
await rekey(db, "devon", "devon");
is("moving an id to itself changes nothing", (await rows("SELECT COUNT(*) AS n FROM messages WHERE sender = 'devon' OR recipient = 'devon'"))[0].n > 0, true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
