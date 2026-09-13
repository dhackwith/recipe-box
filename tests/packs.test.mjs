/**
 * Package suggestions: the arithmetic and the checks in shared/packs.js, and
 * the endpoint run the way Cloudflare runs it, with the model stubbed.
 *
 * Several cases are the real model's own mistakes from trying the prompt on a
 * week of smoothies, kept so they stay caught.
 */

import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { measure, cleanItems, cacheKeyOf, packRequest, rawPack, readPack, PACK_UNITS } from "../shared/packs.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const item = (amount, unit, name, id = "a") => ({ id, amount, unit, name });
const answer = (pkg, size, size_unit, { gpc = 0, each = 0 } = {}) =>
  rawPack({ package: pkg, size, size_unit, grams_per_cup: gpc, grams_each: each });
const pick = (p) => p && [p.count, p.package, p.size, p.unit, p.estimate];

console.log("\n— measuring what is needed —");
is("cups are millilitres", Math.round(measure(10.5, "cup").base), 2484);
is("tablespoons too", measure(7, "tbsp").kind, "volume");
is("ounces are grams", Math.round(measure(16, "oz").base), 454);
is("no unit is a count", measure(7, ""), { kind: "count", base: 7 });
is("a count with its size in the name is that much", measure(7, "", "sweetened açaí packet (100 g)"), { kind: "weight", base: 700 });
is("...and so is a can", Math.round(measure(2, "can", "diced tomatoes (14.5 oz)").base), 822);
is("a scoop is for the model to size", measure(14, "scoop"), null);
is("nothing needed is nothing", measure(0, "cup"), null);

console.log("\n— the counts, worked out here —");
const milk = item(10.5, "cup", "unsweetened almond milk");
is("10½ cups of almond milk is two half-gallon cartons (the model said it was 132 fl oz)",
  pick(readPack(answer("carton", 64, "fl oz"), milk, "US")), [2, "carton", 64, "fl oz", false]);
is("and three 1 l cartons in New Zealand", pick(readPack(answer("carton", 1, "l"), milk, "NZ")), [3, "carton", 1, "l", false]);
const justOver = item(64.5, "fl oz", "milk");
is("a need just past a package is still one", readPack(answer("jug", 64, "fl oz"), justOver, "US").count, 1);
const bananas = item(7, "", "bananas");
is("seven bananas sold each is seven", pick(readPack(answer("each", 1, "count"), bananas, "US")), [7, "each", 1, "count", false]);
const acai = item(7, "", "sweetened açaí packet (100 g)");
is("seven 100 g açaí packets need seven (the model once said one)", pick(readPack(answer("packet", 100, "g"), acai, "NZ")), [7, "packet", 100, "g", false]);
is("...or one box of seven, exactly", pick(readPack(answer("box", 7, "count"), acai, "US")), [1, "box", 7, "count", false]);
const liquidOz = item(6, "oz", "brandy");
is("a bare oz of something poured is fluid ounces", readPack(answer("bottle", 750, "ml"), liquidOz, "NZ")?.estimate, false);
const vanilla = item(3.5, "tsp", "vanilla extract");
is("a US bottle of vanilla labelled \"1 oz\" holds fluid ounces", pick(readPack(answer("bottle", 1, "oz"), vanilla, "US")), [1, "bottle", 1, "fl oz", false]);

console.log("\n— through what a food weighs, checked —");
const butter = item(7, "tbsp", "unsalted natural almond butter");
const jar = readPack(answer("jar", 16, "oz", { gpc: 256 }), butter, "US");
is("7 tbsp almond butter at 256 g a cup is one 16 oz jar", pick(jar), [1, "jar", 16, "oz", true]);
is("...needing about 4 oz of it", Math.round(jar.need), 4);
const yogurt = item(5.25, "cup", "plain 2% Greek yogurt");
is("5¼ cups of yogurt is two 750 g tubs (the model said 660 g)", readPack(answer("tub", 750, "g", { gpc: 245 }), yogurt, "NZ").count, 2);
const kale = item(1.75, "cup", "kale");
const loose = readPack(answer("loose", 1, "lb", { gpc: 55 }), kale, "US");
is("1¾ cups of kale is about a fifth of a pound loose (the model said 1¾ lb)", [loose.count, Math.round(loose.need * 100) / 100], [1, 0.21]);
is("a density no food has is refused", readPack(answer("bag", 10, "oz", { gpc: 2000 }), kale, "US"), null);
is("so is none at all", readPack(answer("bag", 10, "oz"), kale, "US"), null);
const scoops = item(14, "scoop", "protein powder");
const tub = readPack(answer("tub", 1, "lb", { each: 30 }), scoops, "US");
is("14 scoops at 30 g each is one 1 lb tub (the model said 14 lb)", pick(tub), [1, "tub", 1, "lb", true]);
is("...scaled for a bigger need", readPack(answer("tub", 1, "lb", { each: 30 }), item(42, "scoop", "protein powder"), "US")?.count, 3);
is("scoops against a tub of 20 servings is one tub, as a guess", pick(readPack(answer("tub", 20, "count"), scoops, "US")), [1, "tub", 20, "count", true]);
is("scoops with no weight given are refused", readPack(answer("tub", 1, "lb"), scoops, "US"), null);
const byWeight = readPack(answer("loose", 1, "kg", { each: 120 }), bananas, "NZ");
is("bananas sold by weight, at 120 g each", [byWeight.count, byWeight.need, byWeight.estimate], [1, 0.84, true]);
is("a weight nothing could have is refused", readPack(answer("loose", 1, "kg", { each: 99999 }), bananas, "NZ"), null);
is("cups against a pack of so many is not a suggestion", readPack(answer("bag", 6, "count"), kale, "US"), null);

console.log("\n— answers that don't hold up —");
is("a US answer in grams is refused", readPack(answer("jar", 454, "g", { gpc: 256 }), butter, "US"), null);
is("an NZ answer in ounces is refused", readPack(answer("jar", 16, "oz", { gpc: 256 }), butter, "NZ"), null);
is("a size of nothing", readPack(answer("jar", 0, "oz", { gpc: 256 }), butter, "US"), null);
is("a package that isn't plain words", readPack(answer("<b>jar</b>", 16, "oz", { gpc: 256 }), butter, "US"), null);
is("a package name gets tidied", readPack(answer("  Glass  Jar ", 16, "oz", { gpc: 256 }), butter, "US")?.package, "glass jar");
is("a size in the package name is taken out (the model said \"16 oz jar\")", readPack(answer("16 oz jar", 16, "oz", { gpc: 256 }), butter, "US")?.package, "jar");
is("a package name that was only a size becomes a pack (it said \"6 oz\")", readPack(answer("6 oz", 32, "oz", { gpc: 245 }), yogurt, "US")?.package, "pack");
const lots = item(100, "cup", "milk");
is("more than two dozen packages is not a suggestion", readPack(answer("carton", 8, "fl oz"), lots, "US"), null);
is("no answer at all", readPack(rawPack(undefined), butter, "US"), null);
is("an unknown country", readPack(answer("jar", 16, "oz", { gpc: 256 }), butter, "UK"), null);

console.log("\n— what goes in —");
const cleaned = cleanItems([
  { id: "g-1", name: " almond  milk ", amount: 10.5, unit: "CUP" },
  { id: "bad id!", name: "x", amount: 1 },
  { id: "g-2", name: "salt", amount: null },
  { id: "g-3", name: "eggs", amount: 12 },
]);
is("only well-formed items with an amount", cleaned, [
  { id: "g-1", name: "almond milk", amount: 10.5, unit: "cup" },
  { id: "g-3", name: "eggs", amount: 12, unit: "" },
]);
is("similar amounts share a cache entry", cacheKeyOf("US", item(7, "tbsp", "Almond Butter")) === cacheKeyOf("US", item(6, "tbsp", "almond butter")), true);
is("very different ones don't", cacheKeyOf("US", item(7, "tbsp", "almond butter")) === cacheKeyOf("US", item(40, "tbsp", "almond butter")), false);
is("nor do countries", cacheKeyOf("US", butter) === cacheKeyOf("NZ", butter), false);
const req = packRequest("NZ", [butter, yogurt]);
const fields = req.response_format.json_schema.properties.items.items.properties;
is("the request only allows that country's units", fields.size_unit.enum, PACK_UNITS.NZ);
is("...asks what a food weighs rather than for sums", ["grams_per_cup", "grams_each"].every((f) => f in fields) && !("need_in_size_unit" in fields), true);
is("...names its shops", /New Zealand/.test(req.messages[0].content), true);
is("...and shows the amount in the shop's terms", req.messages[1].content.includes("2. 5.25 cup plain 2% Greek yogurt (about 1242 ml)"), true);
is("...fluid ounces for a US shop", packRequest("US", [milk]).messages[1].content.includes("(about 84 fl oz)"), true);

console.log("\n— the endpoint —");
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
const { onRequest } = await import("../functions/api/packs.js");
const token = await new SignJWT({ email: "devonhackwith@gmail.com" })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(TEAM).setAudience(AUD).setIssuedAt().setExpirationTime("1h")
  .sign(keys.privateKey);

let asked = null;
let reply = null;
const AI = { run: async (model, input) => { asked = { model, input }; if (reply instanceof Error) throw reply; return reply; } };

const call = async (body, { env = { AI }, signed = true, country } = {}) => {
  const request = new Request("https://thehackwithtable.com/api/packs", {
    method: "POST",
    headers: signed ? { "Cf-Access-Jwt-Assertion": token } : {},
    body: JSON.stringify(body),
  });
  if (country) Object.defineProperty(request, "cf", { value: { country } });
  const res = await onRequest({ request, env });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};

const list = [
  { id: "g-milk", name: "unsweetened almond milk", amount: 10.5, unit: "cup" },
  { id: "g-butter", name: "unsalted natural almond butter", amount: 7, unit: "tbsp" },
  { id: "g-bananas", name: "bananas", amount: 7, unit: null },
];
reply = { response: { items: [
  { n: 1, package: "carton", size: 64, size_unit: "fl oz", grams_per_cup: 240, grams_each: 0 },
  { n: 2, package: "16 oz jar", size: 16, size_unit: "oz", grams_per_cup: 256, grams_each: 0 },
  { n: 3, package: "each", size: 1, size_unit: "count", grams_per_cup: 0, grams_each: 120 },
] } };
const ok = await call({ items: list });
is("a list is answered", ok.status, 200);
is("...in the United States by default", ok.data?.country, "US");
is("...with every item worked out", Object.fromEntries(Object.entries(ok.data?.packs || {}).map(([k, p]) => [k, p && p.count])), { "g-milk": 2, "g-butter": 1, "g-bananas": 7 });
is("...by the importer's model", asked?.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");

is("somebody in New Zealand shops there", (await call({}, { country: "NZ" })).data, { country: "NZ" });
is("...unless they choose otherwise", (await call({ country: "US" }, { country: "NZ" })).data, { country: "US" });
is("asking only for the country needs no model", (await call({}, { env: {} })).status, 200);

reply = { response: { items: [{ n: 1, package: "carton", size: 64, size_unit: "fl oz", grams_per_cup: 240, grams_each: 0 }] } };
const partly = await call({ items: list });
is("an item the model skipped comes back empty", partly.data?.packs?.["g-butter"], null);

reply = { response: "not json" };
is("an unreadable answer says so", (await call({ items: list })).status, 502);
reply = new Error("4006: you have used up your daily free allocation of 10,000 neurons");
const spent = await call({ items: list });
is("a spent allowance says when it returns", [spent.status, /midnight UTC/.test(spent.data?.error || "")], [429, true]);

is("somebody not signed in is refused", (await call({ items: list }, { signed: false })).status, 403);
is("no binding says so", (await call({ items: list }, { env: {} })).status, 501);
const { TERMS } = await import("../shared/hate.js");
reply = { response: { items: [] } };
asked = null;
const hateful = await call({ items: [{ id: "g-x", name: TERMS[0], amount: 1, unit: "" }] });
is("a slur is never sent to the model", [hateful.status, asked], [200, null]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
