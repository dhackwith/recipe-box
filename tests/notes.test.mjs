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

const { onRequest } = await import("../functions/api/notes.js");

const sign = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
    .sign(real.privateKey);

const kv = new Map();
const env = {
  RECIPES: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    /* Paged the way KV really is, so the feed's cursor loop is exercised rather
       than assumed. */
    list: async ({ prefix, limit = 1000, cursor }) => {
      const all = [...kv.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      const next = start + page.length;
      const done = next >= all.length;
      return { keys: page.map((name) => ({ name })), list_complete: done, cursor: done ? undefined : String(next) };
    },
  },
};

const call = async (method, query, token, body) => {
  const res = await onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/notes${query}`, {
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

const devon = await sign("devonhackwith@gmail.com");
const tracey = await sign("tracey.hackwith@example.com");

/* ── who may write at all ── */
is("no token cannot read", (await call("GET", "?recipe=r1", null)).status, 403);
is("no token cannot write", (await call("POST", "", null, { recipe: "r1", text: "hi" })).status, 403);
is("a forged token cannot write", (await call("POST", "", "not.a.jwt", { recipe: "r1", text: "hi" })).status, 403);

/* ── the author is stamped, never accepted ── */
const forged = await call("POST", "", devon, {
  recipe: "r1", text: "I halved the sugar", email: "tracey.hackwith@example.com", name: "Tracey", mine: true,
});
is("a note is created", forged.status, 201);
is("...signed by the token, not the body", forged.data.entry.name, "Devon Hackwith");
is("...and the stored record holds the verified email",
  JSON.parse(kv.get(forged.data.entry.id)).email, "devonhackwith@gmail.com");

/* ── a recipe id cannot reach outside its own notes ── */
is("a colon in the id is refused", (await call("GET", "?recipe=r1:x", devon)).status, 400);
is("a missing id is refused", (await call("GET", "", devon)).status, 400);
is("a slash in the id is refused", (await call("POST", "", devon, { recipe: "a/b", text: "x" })).status, 400);

/* ── empty notes ── */
is("an empty note is refused", (await call("POST", "", devon, { recipe: "r1", text: "   " })).status, 400);
is("made-it needs no words", (await call("POST", "", devon, { recipe: "r1", kind: "made" })).status, 201);

/* ── two people writing at once keep both ── */
const before = kv.size;
await Promise.all([
  call("POST", "", devon, { recipe: "r2", text: "first" }),
  call("POST", "", tracey, { recipe: "r2", text: "second" }),
]);
is("simultaneous notes both survive", kv.size - before, 2);

/* ── listing ── */
const listed = await call("GET", "?recipe=r2", devon);
is("both are listed", listed.data.entries.length, 2);
is("in the order they were written", listed.data.entries.map((e) => e.at).slice().sort(), listed.data.entries.map((e) => e.at));
is("each knows whether it is yours", listed.data.entries.map((e) => e.mine).sort(), [false, true]);
is("a known address is named from the roster",
  listed.data.entries.map((e) => e.name).sort(), ["Devon Hackwith", "Tracey Hackwith"]);

/* ── nobody may rename themselves any more ── */
is("renaming is not a thing the endpoint does", (await call("PUT", "", devon, { name: "Somebody Else" })).status, 405);
const renamed = await call("GET", "?recipe=r2", devon);
is("...so the names are unchanged",
  renamed.data.entries.map((e) => e.name).sort(), ["Devon Hackwith", "Tracey Hackwith"]);

/* ── removing ── */
const mine = renamed.data.entries.find((e) => e.mine);
const theirs = renamed.data.entries.find((e) => !e.mine);
is("somebody else's note is not yours to remove", (await call("DELETE", `?id=${theirs.id}`, devon)).status, 403);
is("...and it is still there", kv.has(theirs.id), true);
is("your own comes out", (await call("DELETE", `?id=${mine.id}`, devon)).status, 200);
is("...and is gone", kv.has(mine.id), false);
is("a missing id is refused", (await call("DELETE", "?id=note:r2:nope", devon)).status, 404);

/* ── length ── */
const long = await call("POST", "", devon, { recipe: "r3", text: "x".repeat(5000) });
is("a very long note is cut, not rejected", JSON.parse(kv.get(long.data.entry.id)).text.length, 2000);

/* -- the feed across every recipe -- */
const feedAt = (recipe, iso, email, kind, text) =>
  kv.set(`note:${recipe}:${iso}-aaaaaa`, JSON.stringify({ kind, text, email, at: iso }));

kv.clear();
feedAt("apple", "2026-09-01T10:00:00.000Z", "devonhackwith@gmail.com", "note", "oldest");
feedAt("zucchini", "2026-09-05T10:00:00.000Z", "nick@heyer.app", "made", "");
feedAt("apple", "2026-09-09T10:00:00.000Z", "uktraceyj@gmail.com", "note", "middle");
feedAt("zucchini", "2026-09-11T10:00:00.000Z", "devonhackwith@gmail.com", "note", "newest");

const feed = await call("GET", "?recent=3", devon);
is("the feed comes back newest first", feed.data.entries.map((e) => e.text), ["newest", "middle", ""]);
is("...across different recipes", feed.data.entries.map((e) => e.recipe), ["zucchini", "apple", "zucchini"]);
is("...naming everyone from the roster", feed.data.entries.map((e) => e.name),
  ["Devon Hackwith", "Tracey Hackwith", "Nicholas Heyer"]);
is("...marking which are yours", feed.data.entries.map((e) => e.mine), [true, false, false]);
is("...and keeping the kind", feed.data.entries.map((e) => e.kind), ["note", "note", "made"]);
is("a bigger ask than there is content is fine", (await call("GET", "?recent=50", devon)).data.entries.length, 4);
is("the feed needs a token too", (await call("GET", "?recent=3", null)).status, 403);

/* The newest entry sits under a recipe late in the alphabet, so a single
   unpaged listing would return the first thousand and miss it entirely. */
kv.clear();
for (let i = 0; i < 1100; i++) {
  feedAt(`aaa${String(i).padStart(4, "0")}`, `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`, "hhackwith@gmail.com", "note", "old");
}
feedAt("zzz", "2026-09-12T08:00:00.000Z", "ashtonhack@icloud.com", "note", "the one that matters");
const deep = await call("GET", "?recent=1", devon);
is("past a thousand entries, the newest is still found", deep.data.entries[0]?.text, "the one that matters");
is("...and named correctly", deep.data.entries[0]?.name, "Ashton Hackwith");

/* ── Photographs on a made-it ──────────────────────────────────────────
   Two things carry the weight here. The full-size picture must stay out of
   every listing, because the feed reads a dozen entries at once and a dozen
   photographs is the difference between a page and a download. And what comes
   in must be checked, because it is stored and later handed back for a browser
   to render — a string that says "image" and is not one is the whole attack. */

/* Valid base64, so the endpoint can really decode it on the way back out. */
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const BIG = "data:image/jpeg;base64," + "A".repeat(120000);

const rawCall = async (query, token) =>
  onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/notes${query}`, {
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
    }),
  });

console.log("\n— a made-it with a picture —");
const withPic = await call("POST", "", devon, { recipe: "stew", kind: "made", shot: JPEG, photo: JPEG });
is("it is accepted", withPic.status, 201);
is("the entry says it has one", withPic.data?.entry?.hasPhoto, true);
is("...and carries the small version back", withPic.data?.entry?.shot, JPEG);

const picId = withPic.data.entry.id;
is("the full-size one is a key of its own", kv.has(picId.replace("note:", "shot:")), true);
is("...and is not inside the entry", JSON.parse(kv.get(picId)).photo, undefined);

console.log("\n— what a listing carries —");
const withShots = await call("GET", "?recipe=stew", devon);
const picEntry = withShots.data.entries.find((e) => e.id === picId);
is("the small version comes with the listing", picEntry.shot, JPEG);
is("...and so does the fact there is a bigger one", picEntry.hasPhoto, true);
is("the full-size picture does not", picEntry.photo, undefined);
is("nor does it reach the feed", (await call("GET", "?recent=6", devon)).data.entries.every((e) => e.photo === undefined), true);
is("but the feed does get a thumbnail", (await call("GET", "?recent=6", devon)).data.entries.find((e) => e.id === picId)?.shot, JPEG);

console.log("\n— fetching one full size —");
const shown = await rawCall(`?photo=${encodeURIComponent(picId)}`, devon);
is("it answers", shown.status, 200);
is("...as a picture rather than as JSON", shown.headers.get("content-type"), "image/jpeg");
is("...that a browser may keep, and keep to itself",
  /private/.test(shown.headers.get("cache-control") || "") && /immutable/.test(shown.headers.get("cache-control") || ""), true);
is("...and the bytes are the picture", new Uint8Array(await shown.arrayBuffer())[0], 0xff);

is("a stranger cannot fetch one", (await rawCall(`?photo=${encodeURIComponent(picId)}`, null)).status, 403);
is("an id that is not a note is refused", (await call("GET", "?photo=shot:stew:whatever", devon)).status, 400);
is("a picture that was never there", (await call("GET", "?photo=note:stew:nothing", devon)).status, 404);

console.log("\n— what will not be stored —");
const keysBefore = kv.size;
const refuse = async (label, body) => {
  const r = await call("POST", "", devon, { recipe: "stew", kind: "made", ...body });
  is(label, r.status, 400);
};
await refuse("a page dressed as a picture", { shot: "data:text/html;base64,PHNjcmlwdD4=", photo: JPEG });
await refuse("an SVG, which is a document that can carry script", { shot: "data:image/svg+xml;base64,PHN2Zz4=", photo: JPEG });
await refuse("a bare script", { shot: "javascript:alert(1)", photo: JPEG });
await refuse("a thumbnail too big to ride inside every listing", { shot: BIG, photo: JPEG });
await refuse("a thumbnail with no full-size picture behind it", { shot: JPEG });
await refuse("a full-size picture with no thumbnail", { photo: JPEG });
is("and none of that was written anywhere", kv.size, keysBefore);

console.log("\n— a note that is only a photograph —");
const justPic = await call("POST", "", devon, { recipe: "stew", kind: "note", text: "", shot: JPEG, photo: JPEG });
is("a picture is something to say", justPic.status, 201);
is("a note with neither words nor picture is still a mistake",
  (await call("POST", "", devon, { recipe: "stew", kind: "note", text: "" })).status, 400);

console.log("\n— taking one down —");
const shotKey = picId.replace("note:", "shot:");
is("the picture is there to begin with", kv.has(shotKey), true);
await call("DELETE", `?id=${encodeURIComponent(picId)}`, devon);
is("the entry goes", kv.has(picId), false);
is("...and the picture goes with it, rather than sitting unreachable in the account",
  kv.has(shotKey), false);

/* ── Replies ───────────────────────────────────────────────────────────
   A reply names what it answers. Removing something that has replies leaves a
   placeholder so the thread holds together, and the placeholder is cleared
   away once nothing hangs from it. */
const enc = encodeURIComponent;
const threadRoot = await call("POST", "", devon, { recipe: "pie", text: "Blind bake the crust first" });
const rootId = threadRoot.data.entry.id;
const threadReply = await call("POST", "", tracey, { recipe: "pie", text: "How long for?", parent: rootId });
is("a reply is created", threadReply.status, 201);
is("...pointing at what it answers", threadReply.data.entry.parent, rootId);
is("...and stored that way", JSON.parse(kv.get(threadReply.data.entry.id)).parent, rootId);
const replyId = threadReply.data.entry.id;

const threadDeep = await call("POST", "", devon, { recipe: "pie", text: "About fifteen minutes", parent: replyId });
is("a reply can answer a reply", threadDeep.status, 201);
const deepId = threadDeep.data.entry.id;

const threadMade = await call("POST", "", tracey, { recipe: "pie", kind: "made", text: "Did it", parent: rootId });
is("a reply is always a note, never a made-it", threadMade.data.entry.kind, "note");
const madeId = threadMade.data.entry.id;

is("a plain note has no parent", threadRoot.data.entry.parent, null);
is("a reply to another recipe's note is refused",
  (await call("POST", "", devon, { recipe: "stew2", text: "x", parent: rootId })).status, 400);
is("a reply to something that isn't there is refused",
  (await call("POST", "", devon, { recipe: "pie", text: "x", parent: "note:pie:2020-01-01T00:00:00.000Z-zzzz" })).status, 404);
is("a parent that isn't a note id is refused",
  (await call("POST", "", devon, { recipe: "pie", text: "x", parent: "shot:pie:whatever" })).status, 400);

const pieList = await call("GET", "?recipe=pie", devon);
const parentOf = Object.fromEntries(pieList.data.entries.map((e) => [e.id, e.parent]));
is("the listing carries each entry's parent",
  [parentOf[rootId], parentOf[replyId], parentOf[deepId], parentOf[madeId]], [null, rootId, replyId, rootId]);

const tombstoned = await call("DELETE", `?id=${enc(rootId)}`, devon);
is("removing a note with replies leaves a placeholder", tombstoned.data.placeholder, rootId);
is("...so nothing is reported gone", tombstoned.data.removed, []);
const stub = JSON.parse(kv.get(rootId));
is("the placeholder keeps no words and no author", [stub.deleted, stub.text, stub.email], [true, undefined, undefined]);

const afterStub = await call("GET", "?recipe=pie", devon);
const shownStub = afterStub.data.entries.find((e) => e.id === rootId);
is("the listing shows it as removed, with no name and no words",
  [shownStub.deleted, shownStub.name, shownStub.text, shownStub.mine], [true, "", "", false]);
is("...and its replies are still under it", afterStub.data.entries.filter((e) => e.parent === rootId).length, 2);
is("nobody can remove a placeholder directly", (await call("DELETE", `?id=${enc(rootId)}`, devon)).status, 403);
is("nobody can reply to one", (await call("POST", "", devon, { recipe: "pie", text: "x", parent: rootId })).status, 404);

is("a reply with nothing under it just goes", (await call("DELETE", `?id=${enc(deepId)}`, devon)).data.removed, [deepId]);
is("the placeholder stays while anything still hangs from it",
  (await call("DELETE", `?id=${enc(madeId)}`, tracey)).data.removed, [madeId]);
is("when the last reply goes, the placeholder goes with it",
  (await call("DELETE", `?id=${enc(replyId)}`, tracey)).data.removed, [replyId, rootId]);
is("...and nothing of the thread is left", [...kv.keys()].filter((k) => k.startsWith("note:pie:")), []);

/* the feed: placeholders are not news, and replies say they are replies */
const soupQ = await call("POST", "", devon, { recipe: "soup", text: "Too salty?" });
const soupA = await call("POST", "", tracey, { recipe: "soup", text: "Use less stock", parent: soupQ.data.entry.id });
await call("DELETE", `?id=${enc(soupQ.data.entry.id)}`, devon);
const feedNow = await call("GET", "?recent=2", devon);
is("the feed skips placeholders", feedNow.data.entries.some((e) => e.deleted || e.id === soupQ.data.entry.id), false);
is("...and still fills its count from further back", feedNow.data.entries.length, 2);
/* found by id: two entries written in the same millisecond have no set order */
const soupReply = feedNow.data.entries.find((e) => e.id === soupA.data.entry.id);
is("...and says which entries are replies", soupReply?.parent, soupQ.data.entry.id);
is("...naming nobody when the note it answered has been removed", soupReply?.parentName, "");

const cakeQ = await call("POST", "", tracey, { recipe: "cake", text: "Can I use oil instead of butter?" });
const cakeA = await call("POST", "", devon, { recipe: "cake", text: "Yes, a light one", parent: cakeQ.data.entry.id });
const feedCake = await call("GET", "?recent=2", devon);
const askerName = (await call("GET", "?recipe=cake", devon)).data.entries.find((e) => e.id === cakeQ.data.entry.id).name;
is("a reply in the feed names whose note it answers",
  feedCake.data.entries.find((e) => e.id === cakeA.data.entry.id)?.parentName, askerName);
is("...and a note that isn't a reply carries no such name",
  "parentName" in (feedCake.data.entries.find((e) => e.id === cakeQ.data.entry.id) || {}), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
