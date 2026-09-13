/**
 * What to buy, as a shop sells it.
 *
 * The shopping list adds up what the recipes ask for — 10½ cups of almond milk,
 * 7 tbsp of almond butter — and nobody sells either. This asks Workers AI what
 * an ordinary supermarket in the United States or New Zealand sells instead,
 * and turns the answer into "2 × carton (64 fl oz)".
 *
 * The model is trusted with general knowledge only — the package a shop uses,
 * its size, how heavy a cup of the food is, how heavy one scoop or banana is —
 * and never with arithmetic. Tried against the real model it named packages
 * well but converted amounts badly (10½ cups of almond milk became 132 fl oz,
 * 1¾ cups of kale became 1¾ lb, 14 scoops became 14 lb), so every calculation
 * is done here:
 *
 *  - the amount is converted into the package's unit by exact factors whenever
 *    both are volumes, both weights, or both counts;
 *  - a count whose name carries its own size — "açaí packet (100 g)" — is
 *    multiplied out from that size;
 *  - a volume against a weight goes through the model's grams per cup, and a
 *    scoop, a bunch or a banana against a weight through its grams each, each
 *    kept only within the range a food could have;
 *  - the model is shown the amount already converted ("about 42 fl oz"), since
 *    it can't be relied on to know that 5¼ cups is a large tub of yogurt.
 *
 * Anything that went through the model's knowledge is marked as an estimate.
 * An answer in a unit that country's shops don't label with, an implausible
 * size, or more than MAX_COUNT packages is dropped rather than shown.
 *
 * The free Workers AI allowance is 10,000 neurons a day; a real list of ten
 * items costs about a hundred.
 */

export { MODEL } from "./fill.js";

export const COUNTRIES = ["US", "NZ"];
export const isCountry = (v) => COUNTRIES.includes(v);

/* The units each country's shelves are labelled in. "count" is things sold
   one at a time, or in packs of so many. */
export const PACK_UNITS = {
  US: ["oz", "lb", "fl oz", "qt", "gal", "count"],
  NZ: ["g", "kg", "ml", "l", "count"],
};

/* Exact US measures here, not the round figures a recipe converter uses: this
   is working out whether 84 fl oz fits in a 64 fl oz carton. */
const VOLUME_ML = {
  tsp: 4.92892, tbsp: 14.7868, cup: 236.588, "fl oz": 29.5735, floz: 29.5735,
  pint: 473.176, quart: 946.353, qt: 946.353, gal: 3785.41, gallon: 3785.41, ml: 1, l: 1000,
};
const WEIGHT_G = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };
const CUP_ML = VOLUME_ML.cup;

/* Allowance for a need that only just spills past a package: 64.5 fl oz is
   one 64 fl oz carton, not two. */
const SLACK = 0.03;
export const MAX_COUNT = 24;
export const MAX_ITEMS = 40;
/* What a food could plausibly weigh: a cup of it from loose leaves (about 20 g)
   to honey (about 340 g), and one of anything from a pinch to a pumpkin. */
const GRAMS_PER_CUP = [10, 400];
const GRAMS_EACH = [0.1, 5000];

const round = (n, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const within = (n, [lo, hi]) => Number(n) >= lo && Number(n) <= hi;
const unitKind = (u) => (u === "count" ? "count" : VOLUME_ML[u] ? "volume" : WEIGHT_G[u] ? "weight" : null);
const factor = (u) => (u === "count" ? 1 : VOLUME_ML[u] || WEIGHT_G[u]);

/* A size written into a name: "açaí packet (100 g)", "tomatoes (14.5 oz can)". */
const NAMED_SIZE = /\((\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|g|kg|ml|l)\b[^)]*\)/i;
/* Units that are really containers, or no unit at all: things counted one by
   one, which a size in the name can size. */
const COUNTED = new Set(["", "can", "jar", "bottle", "bag", "packet", "package", "box", "tub", "carton", "stick"]);
/* Packages only something poured comes in. */
const POURED_IN = new Set(["bottle", "jug", "carton"]);

/* How much is needed in millilitres, grams or a count, or null for a unit only
   the model can size — scoops, bunches, cloves. */
export function measure(amount, unit, name = "") {
  if (!(Number(amount) > 0)) return null;
  const u = String(unit || "").toLowerCase().trim();
  if (VOLUME_ML[u]) return { kind: "volume", base: amount * VOLUME_ML[u] };
  if (WEIGHT_G[u]) return { kind: "weight", base: amount * WEIGHT_G[u] };
  if (COUNTED.has(u)) {
    const m = String(name).match(NAMED_SIZE);
    if (m) {
      const each = measure(Number(m[1]), m[2].toLowerCase().replace(/[.\s]/g, "").replace("floz", "fl oz"));
      if (each) return { kind: each.kind, base: amount * each.base };
    }
    if (!u) return { kind: "count", base: Number(amount) };
  }
  return null;
}

/* One item as the model is shown it, and as the cache knows it. */
export function cleanItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const it of raw) {
    if (out.length >= MAX_ITEMS) break;
    const id = String(it?.id ?? "");
    const name = String(it?.name ?? "").replace(/\s+/g, " ").trim();
    const amount = Number(it?.amount);
    const unit = it?.unit == null ? "" : String(it.unit).toLowerCase().trim();
    if (!/^[\w-]{1,60}$/.test(id) || !name || name.length > 80) continue;
    if (!(amount > 0) || amount > 100000 || unit.length > 12) continue;
    out.push({ id, name, amount, unit });
  }
  return out;
}

const fold = (s) => String(s).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Cached per country, item and rough size of need — within a factor of two —
   so a week of smoothies and a week and a half ask once between them, while
   a teaspoon and a gallon of the same thing are asked about separately. */
export const cacheKeyOf = (country, item) =>
  `${country}|${fold(item.name)}|${item.unit}|${Math.floor(Math.log2(item.amount))}`;

const COUNTRY_TEXT = {
  US: {
    where: "an ordinary supermarket in the United States (Walmart, Kroger, Safeway)",
    units: "oz or lb for weight, fl oz, qt or gal for liquids, or count",
    loose: 'For produce sold by weight, use package "loose", size 1, size_unit "lb".',
  },
  NZ: {
    where: "an ordinary supermarket in New Zealand (Woolworths, New World, PAK'nSAVE)",
    units: "g or kg for weight, ml or l for liquids, or count",
    loose: 'For produce sold by weight, use package "loose", size 1, size_unit "kg".',
  },
};

/* The amount in the shop's own terms, worked out here for the model to read. */
function roughly(country, item) {
  const m = measure(item.amount, item.unit, item.name);
  if (!m || m.kind === "count") return "";
  if (m.kind === "volume") return country === "US" ? ` (about ${round(m.base / VOLUME_ML["fl oz"], 1)} fl oz)` : ` (about ${Math.round(m.base)} ml)`;
  return country === "US" ? ` (about ${round(m.base / WEIGHT_G.oz, 1)} oz by weight)` : ` (about ${Math.round(m.base)} g)`;
}

/* The request for the items the cache didn't have. Ids are replaced by short
   numbers, which cost the model fewer tokens to repeat. */
export function packRequest(country, items) {
  const t = COUNTRY_TEXT[country];
  const lines = items
    .map((it, i) => `${i + 1}. ${round(it.amount)}${it.unit ? ` ${it.unit}` : ""} ${it.name}${roughly(country, it)}`)
    .join("\n");
  return {
    messages: [
      {
        role: "system",
        content:
          `You help a home cook shop at ${t.where}. For each ingredient, say how that shop most commonly sells it. ` +
          'package is the container word only, such as "jar", "tub", "carton", "bag", "bottle" or "box", never a size. ' +
          `size and size_unit are the standard size a shopper would really find, in ${t.units}. Choose the common size ` +
          "that needs the fewest packages without buying much more than twice the amount. " +
          `For things sold one at a time, such as bananas or lemons, use package "each", size 1, size_unit "count". ${t.loose} ` +
          "grams_per_cup is how many grams one US cup of this food weighs, or 0 if a cup of it makes no sense. " +
          "grams_each is how many grams one of the amount's units weighs when the amount is a count, scoop, bunch, " +
          "clove or similar (one banana, one scoop), otherwise 0. Do not work out how many packages to buy.",
      },
      { role: "user", content: `Ingredients (number. amount name):\n${lines}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                n: { type: "integer" },
                package: { type: "string" },
                size: { type: "number" },
                size_unit: { type: "string", enum: PACK_UNITS[country] },
                grams_per_cup: { type: "number" },
                grams_each: { type: "number" },
              },
              required: ["n", "package", "size", "size_unit", "grams_per_cup", "grams_each"],
            },
          },
        },
        required: ["items"],
      },
    },
    max_tokens: 120 + 70 * items.length,
    temperature: 0,
  };
}

/* The model's answer for one item, in the form the cache keeps: nothing in it
   depends on the amount, so it serves any amount of the same thing. Null when
   it isn't shaped like an answer at all. */
export function rawPack(answer) {
  if (!answer || typeof answer !== "object") return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    package: String(answer.package ?? ""),
    size: Number(answer.size),
    size_unit: String(answer.size_unit ?? "").toLowerCase().trim(),
    grams_per_cup: num(answer.grams_per_cup),
    grams_each: num(answer.grams_each),
  };
}

/* "16 oz jar" and "jar (16 oz)" are both a jar. A name that was nothing but a
   size is a plain pack. */
function packageWord(raw) {
  const words = String(raw || "")
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|lbs?|g|kg|ml|l|qt|gal|ct|count|pack)?\b/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return "pack";
  return words.length <= 32 && /^[a-z][a-z' -]*$/.test(words) ? words : null;
}

/**
 * A suggestion — { package, size, unit, count, need, estimate } — for one item
 * from a raw answer, or null when the answer doesn't hold up. `need` is the
 * amount in the package's unit, which is what loose produce is bought by.
 */
export function readPack(raw, item, country) {
  if (!raw || !isCountry(country)) return null;
  let unit = raw.size_unit;
  if (!PACK_UNITS[country].includes(unit)) return null;
  const size = Number(raw.size);
  if (!(size > 0) || size > 100000) return null;
  const pkg = packageWord(raw.package);
  if (!pkg) return null;

  const gpc = within(raw.grams_per_cup, GRAMS_PER_CUP) ? Number(raw.grams_per_cup) : null;
  const each = within(raw.grams_each, GRAMS_EACH) ? Number(raw.grams_each) : null;
  let need = measure(item.amount, item.unit, item.name);
  let estimate = false;

  /* A recipe's bare "oz" of something poured is fluid ounces, and a package
     sold by volume says which it was. */
  if (need && item.unit === "oz" && unitKind(unit) === "volume") need = { kind: "volume", base: item.amount * VOLUME_ML["fl oz"] };
  /* And US shops label a small bottle of a liquid in plain ounces: a "1 oz"
     bottle of vanilla holds fluid ounces, unless the model says it weighs. Only
     something that pours comes in a bottle, jug or carton; a bag of kale
     labelled in ounces is a weight. */
  if (need?.kind === "volume" && unit === "oz" && gpc == null && POURED_IN.has(pkg)) unit = "fl oz";
  const kind = unitKind(unit);

  let inPack;
  if (kind === "count") {
    /* Packs of so many hold the same things the recipe counts: 7 packets from
       a box of 7. Scoops against a tub of 20 servings are a fair guess. */
    if (need && need.kind !== "count" && !COUNTED.has(item.unit)) return null;
    inPack = item.amount;
    estimate = !need;
  } else if (!need || need.kind === "count") {
    /* Scoops, bunches, bananas by weight: the model's weight of one. */
    if (each == null) return null;
    need = { kind: "weight", base: item.amount * each };
    estimate = true;
  }

  if (inPack == null) {
    if (need.kind === kind) {
      inPack = need.base / factor(unit);
    } else {
      if (gpc == null) return null;
      const gramsPerMl = gpc / CUP_ML;
      inPack = (need.kind === "volume" ? need.base * gramsPerMl : need.base / gramsPerMl) / factor(unit);
      estimate = true;
    }
  }

  const count = Math.max(1, Math.ceil(inPack / size - SLACK));
  if (count > MAX_COUNT) return null;
  return { package: pkg, size: round(size), unit, count, need: round(inPack, 3), estimate };
}
