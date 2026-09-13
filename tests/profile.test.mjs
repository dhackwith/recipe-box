/**
 * Profile pictures: who may keep one, what is let in, what comes back out, and
 * that a note says whose face to show without giving anybody's address away.
 */

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

/* KV with metadata, which is where a face keeps its version. */
const kv = new Map();
const env = {
  RECIPES: {
    get: async (k) => (kv.has(k) ? kv.get(k).value : null),
    put: async (k, value, opts = {}) => void kv.set(k, { value, metadata: opts.metadata ?? null }),
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix }) => ({
      keys: [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })),
      list_complete: true,
    }),
  },
};

const profile = (await import("../functions/api/profile.js")).onRequest;
const notes = (await import("../functions/api/notes.js")).onRequest;

const call = async (handler, path, method, query, token, body) => {
  const res = await handler({
    env,
    request: new Request(`https://thehackwithtable.com/api/${path}${query}`, {
      method,
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
  const isJson = (res.headers.get("content-type") || "").includes("json");
  return { status: res.status, headers: res.headers, data: isJson ? await res.json() : null, bytes: isJson ? null : new Uint8Array(await res.arrayBuffer()) };
};
const face = (method, query, token, body) => call(profile, "profile", method, query, token, body);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const devon = await sign("devonhackwith@gmail.com");
const nick = await sign("nick@heyerconception.com");
const nickOther = await sign("nick@heyer.app");
const stranger = await sign("someone.new@example.com");

/* ── who may be here ── */
is("no token, no faces", (await face("GET", "?faces", null)).status, 403);

const first = await face("GET", "?faces", devon);
is("nobody has a picture yet", first.data.faces, {});
is("...and you are told who you are", first.data.me.id, "devon");
is("...that you can keep one", first.data.me.canHaveFace, true);
is("...and that you haven't", first.data.me.face, null);
is("the owner is told so", first.data.me.owner, true);
is("...and nobody else is", (await face("GET", "?faces", nick)).data.me.owner, false);

/* ── what is let in ── */
const refused = async (label, value) => is(label, (await face("PUT", "", devon, { face: value })).status, 400);
await refused("a PNG is refused", "data:image/png;base64,iVBORw0KGgo=");
await refused("an HTML page dressed as a picture is refused", "data:text/html;base64,PHNjcmlwdD4=");
await refused("an SVG is refused", "data:image/svg+xml;base64,PHN2Zz4=");
await refused("something far too big for a face is refused", "data:image/jpeg;base64," + "A".repeat(130000));
await refused("nothing at all is refused", undefined);
is("...and none of those were kept", kv.size, 0);

const put = await face("PUT", "", devon, { face: JPEG });
is("a JPEG is kept", put.status, 200);
is("...under the person's id", kv.get("face:devon")?.value, JPEG);
is("...and a version comes back", typeof put.data.face, "string");

const listed = await face("GET", "?faces", nick);
is("everyone can see who has a face", listed.data.faces.devon, put.data.face);

await pause(5);
const again = await face("PUT", "", devon, { face: JPEG });
is("a new picture is a new version, so no browser shows the old one", again.data.face !== put.data.face, true);
is("...and you are told your own", (await face("GET", "?faces", devon)).data.me.face, again.data.face);

/* ── what comes out ── */
const shown = await face("GET", `?face=devon&v=${again.data.face}`, nick);
is("a face comes back", shown.status, 200);
is("...as a picture", shown.headers.get("content-type"), "image/jpeg");
is("...that a browser may keep for good, to itself", shown.headers.get("cache-control"), "private, max-age=31536000, immutable");
is("...and must not second-guess the type of", shown.headers.get("x-content-type-options"), "nosniff");
is("...and the bytes are the picture", shown.bytes[0], 0xff);
is("somebody without a picture", (await face("GET", "?face=tracey", devon)).status, 404);
is("the face address reaches nothing but faces", (await face("GET", "?face=../recipe-box", devon)).status, 404);
is("...and never an address", (await face("GET", "?face=devonhackwith@gmail.com", devon)).status, 404);

/* ── one person, however many addresses ── */
await face("PUT", "", nickOther, { face: JPEG });
is("Nicholas's other address sets Nicholas's face", kv.has("face:nicholas"), true);
is("...which they see from either address", (await face("GET", "?faces", nick)).data.me.face !== null, true);

/* ── somebody the roster doesn't know ── */
const them = await face("GET", "?faces", stranger);
is("somebody off the family list is told they can't keep one", them.data.me.canHaveFace, false);
is("...and can't", (await face("PUT", "", stranger, { face: JPEG })).status, 403);
is("no face is ever listed under an address", Object.keys(them.data.faces).some((id) => id.includes("@")), false);

/* ── taking it away ── */
is("a face can be removed", (await face("DELETE", "", devon)).status, 200);
is("...and is gone from the list", (await face("GET", "?faces", devon)).data.faces.devon, undefined);
is("...and from its address", (await face("GET", "?face=devon", nick)).status, 404);

/* ── whose face goes beside a note ── */
const posted = await call(notes, "notes", "POST", "", nickOther, { recipe: "r1", kind: "note", text: "less sugar next time" });
is("a note says who wrote it, by id", posted.data.entry.who, "nicholas");
const strangerNote = await call(notes, "notes", "POST", "", stranger, { recipe: "r1", kind: "note", text: "lovely" });
is("...and nobody, for somebody off the family list", strangerNote.data.entry.who, null);
const read = await call(notes, "notes", "GET", "?recipe=r1", devon);
is("notes read back carry the id too", read.data.entries.map((e) => e.who).sort(), [null, "nicholas"].sort());
is("...and never anybody's address", JSON.stringify(read.data).includes("@"), false);
const feed = await call(notes, "notes", "GET", "?recent=5", devon);
is("so does Lately", feed.data.entries.some((e) => e.who === "nicholas"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
