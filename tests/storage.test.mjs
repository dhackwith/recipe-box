/**
 * Step photos through the storage endpoint: what is let in, and that what
 * comes out is a picture a browser may cache — and never anything else.
 */

const { onRequest } = await import("../functions/api/storage.js");

const kv = new Map();
const env = {
  RECIPES: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  },
};

const call = (method, query, body) =>
  onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/storage${query}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/* ── putting one in ── */
const put = await call("PUT", "?key=stepimg:sp1abcdef&shared=true", { value: JPEG });
is("a step photo is accepted", put.status, 200);
is("...and kept under its own shared key", kv.get("shared:stepimg:sp1abcdef"), JPEG);

const before = kv.size;
const refused = async (label, query, value) =>
  is(label, (await call("PUT", query, { value })).status >= 400, true);
await refused("a PNG is refused", "?key=stepimg:sp2abcdef&shared=true", "data:image/png;base64,iVBORw0KGgo=");
await refused("an HTML page dressed as a photo is refused", "?key=stepimg:sp3abcdef&shared=true", "data:text/html;base64,PHNjcmlwdD4=");
await refused("an SVG is refused", "?key=stepimg:sp4abcdef&shared=true", "data:image/svg+xml;base64,PHN2Zz4=");
await refused("something too big to be a step photo is refused", "?key=stepimg:sp5abcdef&shared=true", "data:image/jpeg;base64," + "A".repeat(800000));
await refused("an id with odd characters is refused", "?key=stepimg:../recipe-box&shared=true", JPEG);
await refused("a step photo outside the shared box is refused", "?key=stepimg:sp6abcdef", JPEG);
is("...and none of those were written", kv.size, before);

is("everything else is stored as before", (await call("PUT", "?key=recipe-box&shared=true", { value: "{}" })).status, 200);

/* ── getting one out ── */
const shown = await call("GET", "?image=sp1abcdef");
is("a step photo comes back", shown.status, 200);
is("...as a picture", shown.headers.get("content-type"), "image/jpeg");
is("...that a browser may keep for good, to itself", shown.headers.get("cache-control"), "private, max-age=31536000, immutable");
is("...and must not second-guess the type of", shown.headers.get("x-content-type-options"), "nosniff");
is("...and the bytes are the picture", new Uint8Array(await shown.arrayBuffer())[0], 0xff);

is("a photo that isn't there", (await call("GET", "?image=spnothere1")).status, 404);
is("an id that isn't an id", (await call("GET", "?image=../recipe-box")).status, 400);
is("the image address can only reach step photos, not the box", (await call("GET", "?image=recipe-box")).status, 404);

/* ── taking one out ── */
is("a step photo can be deleted", (await call("DELETE", "?key=stepimg:sp1abcdef&shared=true")).status, 200);
is("...and is gone", kv.has("shared:stepimg:sp1abcdef"), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
