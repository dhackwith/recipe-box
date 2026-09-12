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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
