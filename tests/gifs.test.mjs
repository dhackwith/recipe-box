/**
 * GIFs: reading KLIPY's reply, telling a GIF message from any other, and the
 * search endpoint run the way Cloudflare runs it — identity, the key, the
 * outbound call and every refusal.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { gifUrl, isGifMessage, readGifs, hasMoreGifs } from "../shared/gif.js";

const TEAM = "https://thehackwithtable.cloudflareaccess.com";
const AUD = "f6ab6d8de36d5a27b9d93a5d619d1b761ba360f573a5c53b009a9fe6baef13b0";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const file = (name, w, h) => ({ url: `https://static.klipy.com/ii/abc/${name}.gif`, width: w, height: h, size: 1000 });
const item = (slug, extra = {}) => ({
  id: 1, slug, title: `${slug} title`, type: "gif", tags: [],
  file: {
    hd: { gif: file(`${slug}-hd`, 498, 280) },
    md: { gif: file(`${slug}-md`, 320, 180) },
    sm: { gif: file(`${slug}-sm`, 220, 124) },
    xs: { gif: file(`${slug}-xs`, 90, 50) },
  },
  ...extra,
});
const page = (items, has_next = false) => ({ result: true, data: { data: items, current_page: 1, per_page: 24, has_next } });

console.log("\n— what counts as a GIF message —");
is("a KLIPY file address", isGifMessage("https://static.klipy.com/ii/abc/x.gif"), true);
is("...with spaces round it", gifUrl("  https://static.klipy.com/ii/abc/x.gif \n"), "https://static.klipy.com/ii/abc/x.gif");
is("plain words are not", isGifMessage("happy birthday"), false);
is("a link with words is not", isGifMessage("look https://static.klipy.com/ii/abc/x.gif"), false);
is("http is not", isGifMessage("http://static.klipy.com/ii/abc/x.gif"), false);
is("another host is not", isGifMessage("https://example.com/x.gif"), false);
is("a lookalike host is not", isGifMessage("https://static.klipy.com.evil.test/x.gif"), false);
is("a subdomain trick is not", isGifMessage("https://evil.test/static.klipy.com/x.gif"), false);
is("credentials in the address are not", isGifMessage("https://a:b@static.klipy.com/x.gif"), false);
is("nothing is not", isGifMessage(""), false);

console.log("\n— reading KLIPY's reply —");
const read = readGifs(page([item("cake")]));
is("one GIF comes out", read.length, 1);
is("...previewed small", read[0].preview.url, "https://static.klipy.com/ii/abc/cake-sm.gif");
is("...sent middle-sized", read[0].url, "https://static.klipy.com/ii/abc/cake-md.gif");
is("...with its size", [read[0].width, read[0].height], [320, 180]);
is("...and its title", read[0].title, "cake title");
is("ads are left out", readGifs(page([item("ad", { type: "ad" }), item("pie")])).map((g) => g.id), ["pie"]);
is("files on another host are left out",
  readGifs(page([item("bad", { file: { md: { gif: { url: "https://example.com/x.gif" } } } })])), []);
is("a missing size falls back", readGifs(page([item("x", { file: { hd: { gif: file("only-hd", 1, 1) } } })]))[0]?.url,
  "https://static.klipy.com/ii/abc/only-hd.gif");
is("the list stops at max", readGifs(page([item("a"), item("b"), item("c")]), 2).length, 2);
is("a reply with no list reads as none", readGifs({ result: true }), []);
is("more is read from has_next", [hasMoreGifs(page([], true)), hasMoreGifs(page([]))], [true, false]);

console.log("\n— the endpoint —");
const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
let upstream = null;
let asked = null;
let calls = 0;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.startsWith(`${TEAM}/cdn-cgi/access/certs`)) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  }
  if (href.startsWith("https://api.klipy.com/")) {
    calls++;
    asked = new URL(href);
    return typeof upstream === "function" ? upstream() : upstream;
  }
  throw new Error(`unexpected fetch: ${href}`);
};
const { onRequest } = await import("../functions/api/gifs.js");
const token = await new SignJWT({ email: "devonhackwith@gmail.com" })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
  .sign(keys.privateKey);

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ask = async (query = "", env = { KLIPY: "the-key\n" }, signed = true) => {
  const res = await onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/gifs${query}`, { headers: signed ? { "Cf-Access-Jwt-Assertion": token } : {} }),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};

upstream = reply(page([item("cake")], true));
const ok = await ask("?q=birthday%20cake");
is("a search answers", ok.status, 200);
is("...with the GIFs", ok.data?.gifs?.map((g) => g.id), ["cake"]);
is("...and whether there are more", ok.data?.more, true);
is("...asking KLIPY's search", asked?.pathname, "/api/v1/the-key/gifs/search");
is("...with the key trimmed", asked?.pathname.includes("%0A"), false);
is("...for the words", asked?.searchParams.get("q"), "birthday cake");
is("...strictest filter", asked?.searchParams.get("content_filter"), "high");
is("...GIFs only", asked?.searchParams.get("format_filter"), "gif");
const customer = asked?.searchParams.get("customer_id") || "";
is("...and a customer id that isn't the address", [/^[0-9a-f]{24}$/.test(customer), customer.includes("devon")], [true, false]);

await ask();
is("no words asks for trending", asked?.pathname, "/api/v1/the-key/gifs/trending");
await ask("?q=cake&page=999");
is("the page is held to a limit", asked?.searchParams.get("page"), "20");

is("somebody not signed in is refused", (await ask("?q=cake", { KLIPY: "k" }, false)).status, 403);
const unset = await ask("?q=cake", {});
is("no key says so", [unset.status, /KLIPY/.test(unset.data?.error || "")], [501, true]);

upstream = reply({ result: false, errors: { message: ["The provided API key is invalid."] } }, 404);
const badKey = await ask("?q=cake");
is("a refused key is told plainly", [badKey.status, /refused the key/.test(badKey.data?.error || "")], [502, true]);
is("...without repeating the key", JSON.stringify(badKey.data).includes("the-key"), false);

upstream = reply({}, 429);
is("the hourly limit is told plainly", (await ask("?q=cake")).status, 429);

upstream = () => { throw new Error("offline"); };
const down = await ask("?q=cake");
is("KLIPY unreachable still answers JSON", [down.status, typeof down.data?.error], [502, "string"]);

const before = calls;
const long = await ask(`?q=${"a".repeat(81)}`);
is("a search too long is refused before asking", [long.status, calls], [400, before]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
