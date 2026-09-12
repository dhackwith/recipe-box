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
    list: async ({ prefix, limit = 1000 }) => {
      const all = [...kv.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { keys: all.slice(0, limit).map((name) => ({ name })), list_complete: all.length <= limit };
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
is("...signed by the token, not the body", forged.data.entry.name, "Devonhackwith");
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
is("a default name is derived from the email",
  listed.data.entries.map((e) => e.name).sort(), ["Devonhackwith", "Tracey Hackwith"]);

/* ── names are resolved on read, so a rename reaches old notes ── */
is("a name can be set", (await call("PUT", "", devon, { name: "Devon" })).status, 200);
const renamed = await call("GET", "?recipe=r2", devon);
is("...and the note written before it now reads the new name",
  renamed.data.entries.map((e) => e.name).sort(), ["Devon", "Tracey Hackwith"]);
is("an empty name is refused", (await call("PUT", "", devon, { name: "  " })).status, 400);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
