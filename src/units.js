/**
 * Reading a recipe in the units you think in.
 *
 * Everything about this is a judgement call rather than arithmetic, and the
 * arithmetic is the easy half. Three decisions shape the rest:
 *
 * SPOONS ARE LEFT ALONE. A teaspoon is 5ml and a tablespoon 15ml, and almost
 * nobody writes "5 ml of vanilla" — metric kitchens own spoons too. Converting
 * them is technically right and produces a recipe no one would write, so
 * teaspoons and tablespoons survive in both directions. Going the other way,
 * small millilitre amounts DO become spoons, because that is how the recipe
 * would have been written in the first place.
 *
 * ROUNDING IS THE POINT. A cup is 236.588ml and saying so helps nobody. Amounts
 * land on numbers a person would write on a shopping list: 240ml, 450g, 220°C.
 * The error this introduces is smaller than the error in how level your cup was.
 *
 * WHEN IN DOUBT, LEAVE IT. A wrong conversion is worse than none, so anything
 * not recognised passes through untouched.
 *
 * WHAT THE RECIPE ALREADY SAYS WINS. "⅓ cup (72 grams) sugar" was weighed by
 * the person who wrote it, and nothing converting a cup can know what a cup of
 * sugar weighs, so metric shows the 72 g. A bracket that already gives both
 * systems — "(3 ounces or 85 grams)" — is complete and is not touched, and one
 * that only restates the leading amount in the other system is dropped rather
 * than converted into the same amount twice.
 *
 * The quantity parsing and pretty-printing live here too, rather than in
 * RecipeBox.jsx where they began, so that there is one place that knows what
 * "1½" means rather than two that can drift apart.
 */

/* ── Numbers as recipes write them ───────────────────────────────── */

export const UNI = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
export const NUM = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\\d+\\/\\d+|\\d*\\.?\\d+|[¼½¾⅓⅔⅛⅜⅝⅞])";
export const FRACTIONS = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];

export function toNumber(tok) {
  if (!tok) return null;
  const t = String(tok).trim();
  if (UNI[t] != null) return UNI[t];
  const mixed = t.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (mixed) return parseInt(mixed[1], 10) + UNI[mixed[2]];
  const mixedFrac = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFrac) return parseInt(mixedFrac[1], 10) + Number(mixedFrac[2]) / Number(mixedFrac[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function prettyNumber(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 0.05) return String(Math.round(n * 100) / 100);
  if (n >= 10) return String(Math.round(n * 10) / 10);
  const whole = Math.floor(n + 1e-9);
  const rem = n - whole;
  if (rem < 0.06) return String(whole || 0);
  let best = null;
  let bestGap = Infinity;
  for (const [val, glyph] of FRACTIONS) {
    const gap = Math.abs(rem - val);
    if (gap < bestGap) { bestGap = gap; best = glyph; }
  }
  if (bestGap > 0.07) return String(Math.round(n * 100) / 100);
  return whole ? `${whole}${best}` : best;
}

/* ── The vocabulary of quantities ────────────────────────────────── */

export const UNITS = new Set([
  "cup","cups","tbsp","tbsps","tablespoon","tablespoons","tsp","tsps","teaspoon","teaspoons","oz","ounce","ounces",
  "lb","lbs","pound","pounds","g","gram","grams","kg","ml","l","liter","liters","clove","cloves","can","cans",
  "pinch","pinches","sprig","sprigs","slice","slices","stick","sticks","bunch","bunches","package","packages",
  "quart","quarts","pint","pints","dash","dashes","qt","pt",
  "scoop","scoops","packet","packets","handful","handfuls","head","heads","stalk","stalks",
  "sheet","sheets","drop","drops","jar","jars","bottle","bottles","bag","bags","knob","knobs",
]);

/* A measure followed by one of these is sizing the container, not the amount
   going into it: a 40 oz pitcher is still 40 oz however much you make. */
export const VESSELS = new Set([
  "pitcher","pitchers","blender","blenders","bowl","bowls","pan","pans","skillet","skillets",
  "dish","dishes","pot","pots","tin","tins","ramekin","ramekins","mold","molds","tray","trays",
  "jar","jars","bottle","bottles","can","cans","packet","packets","bag","bags","box","boxes",
  "tub","tubs","container","containers","carton","cartons","block","blocks","loaf","loaves",
]);

/* ── What converts into what ─────────────────────────────────────── */

export const SYSTEMS = [
  { id: "as-written", label: "As written", hint: "However whoever wrote it down did" },
  { id: "metric", label: "Metric", hint: "Grams, millilitres and °C" },
  { id: "us", label: "US", hint: "Cups, ounces and °F" },
];
export const isSystem = (v) => SYSTEMS.some((s) => s.id === v);

/* Deliberately without tsp and tbsp — see the note at the top. */
const US_VOLUME_ML = {
  cup: 240, cups: 240,
  pint: 473, pints: 473, pt: 473,
  quart: 946, quarts: 946, qt: 946,
  gallon: 3785, gallons: 3785, gal: 3785,
};
const METRIC_VOLUME_ML = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  cl: 10, dl: 100,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
};
const US_WEIGHT_G = {
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};
const METRIC_WEIGHT_G = {
  g: 1, gram: 1, grams: 1, gramme: 1, grammes: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
};
/* "in" is missing on purpose: it is a preposition far more often than it is an
   inch, and "cook 2 in butter" is not a length. */
const US_LENGTH_MM = { inch: 25.4, inches: 25.4 };
const METRIC_LENGTH_MM = { mm: 1, millimeter: 1, millimeters: 1, cm: 10, centimeter: 10, centimeters: 10, centimetre: 10, centimetres: 10 };

/* An ounce is a weight, except when it is a volume, and only the ingredient
   says which. US recipes write "6 oz brandy" meaning fluid ounces and "6 oz
   flour" meaning weight, with nothing in the measure to tell them apart. A
   short list of things that pour settles the common cases; anything unknown is
   treated as a weight, which is what a bare ounce usually means. */
const POURS = /\b(water|milk|buttermilk|cream|half-and-half|juice|wine|beer|cider|ale|stout|stock|broth|consomm|oil|vinegar|syrup|sauce|soda|seltzer|tonic|brandy|rum|vodka|gin|whisk|tequila|mezcal|liqueur|bourbon|scotch|sherry|port|vermouth|champagne|prosecco|sake|soju|schnapps|bitters|espresso|coffee|tea|liquor|spirit|puree|purée|nectar|kombucha|lemonade|brine|wash|extract)/i;

const looksLikeAPour = (context) => POURS.test(String(context || ""));

/* ── Amounts a recipe gives twice ────────────────────────────────── */

/* Spoons are left alone on their own (see the top), but they are still US
   measures when a recipe gives a metric amount beside them. A stick of butter
   is a US measure too: "1 stick (113 g)". */
const SPOONS = new Set(["tsp", "tsps", "teaspoon", "teaspoons", "tbsp", "tbsps", "tablespoon", "tablespoons"]);
const STICKS = new Set(["stick", "sticks"]);

const unitKey = (raw) => String(raw || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, "");

/* Which system a unit belongs to and what it measures, or null for a count, a
   container, or a word that is not a unit at all. */
function kindOf(u) {
  if (METRIC_WEIGHT_G[u]) return { system: "metric", kind: "weight" };
  if (METRIC_VOLUME_ML[u]) return { system: "metric", kind: "volume" };
  if (METRIC_LENGTH_MM[u]) return { system: "metric", kind: "length" };
  if (US_WEIGHT_G[u] || STICKS.has(u)) return { system: "us", kind: "weight" };
  if (US_VOLUME_ML[u] || u === "floz" || SPOONS.has(u)) return { system: "us", kind: "volume" };
  if (US_LENGTH_MM[u]) return { system: "us", kind: "length" };
  return null;
}

const AMOUNT_RE = new RegExp(`^(${NUM})\\s*(fl\\.?\\s*oz|[A-Za-z]+\\.?)$`);

/* The amounts in a bracket that holds nothing but amounts — "(72 grams)",
   "(3 ounces or 85 grams)" — or null when it says anything else, "(about 1
   lb)" or "(Garnacha or Tempranillo)", which is then converted like any text. */
function bracketAmounts(inside) {
  const pieces = String(inside).trim().split(/\s*(?:\bor\b|,|;|=)\s*/i).filter(Boolean);
  if (!pieces.length) return null;
  const amounts = [];
  for (const piece of pieces) {
    const m = piece.match(AMOUNT_RE);
    const kind = m && kindOf(unitKey(m[2]));
    if (!kind) return null;
    amounts.push({ amount: m[1].trim(), unit: m[2].trim(), ...kind });
  }
  return amounts;
}

const bothSystems = (amounts) =>
  !!amounts && amounts.some((a) => a.system === "metric") && amounts.some((a) => a.system === "us");

/* "grams" as the rest of a converted recipe writes it: g, ml, cm. */
function metricShort(u) {
  if (METRIC_WEIGHT_G[u]) return METRIC_WEIGHT_G[u] === 1 ? "g" : "kg";
  if (METRIC_VOLUME_ML[u]) return { 1: "ml", 10: "cl", 100: "dl", 1000: "l" }[METRIC_VOLUME_ML[u]];
  if (METRIC_LENGTH_MM[u]) return METRIC_LENGTH_MM[u] === 1 ? "mm" : "cm";
  return u;
}

/* A measure with a bracket straight after it: "⅓ cup (72 grams)". */
const RESTATED_RE = new RegExp(`(${NUM})(\\s*)(fl\\.?\\s*oz|[A-Za-z]+\\.?)(\\s*)\\(([^()]*)\\)`, "g");

/* Where a measure's bracket gives the amount in the reader's system, show that
   amount — weight first, as the more exact — in place of the pair. Where the
   measure is already in the reader's system and the bracket only restates it
   in the other, the bracket goes. Anything else is left for convertText. */
function preferWrittenAmounts(text, system) {
  return text.replace(RESTATED_RE, (whole, amount, gap, unitRaw, _space, inside) => {
    const lead = kindOf(unitKey(unitRaw));
    const amounts = bracketAmounts(inside);
    if (!lead || !amounts) return whole;

    /* Only a true repeat is dropped: "225 g (8 oz)" says one weight twice. A
       bracket giving a different kind of amount — "⅓ cup (72 grams)" to a US
       reader — adds something, so it stays and is converted as usual. */
    if (lead.system === system) {
      return amounts.every((a) => a.system !== system && a.kind === lead.kind) ? `${amount}${gap}${unitRaw}` : whole;
    }

    const mine = amounts.filter((a) => a.system === system);
    const pick = mine.find((a) => a.kind === "weight") || mine.find((a) => a.kind === "volume") || mine.find((a) => a.kind === "length");
    if (!pick) return whole;
    return `${pick.amount} ${system === "metric" ? metricShort(unitKey(pick.unit)) : pick.unit}`;
  });
}

/* ── Rounding, which is where the judgement lives ─────────────────── */

const toStep = (n, step) => Math.round(n / step) * step;

/* Numbers a person would actually write down. Under ten, one decimal is worth
   keeping; past that, fives and tens are as fine as any kitchen scale a family
   owns, and reading "453 g" where "455 g" would do is a false precision that
   makes a converted recipe look machine-made. */
function metricAmount(value, small, large) {
  if (value >= 1000) {
    const big = value / 1000;
    return { amount: String(Math.round(big * 100) / 100), unit: large };
  }
  if (value < 1) return { amount: String(Math.round(value * 100) / 100), unit: small };
  if (value < 10) return { amount: String(Math.round(value * 10) / 10), unit: small };
  return { amount: String(toStep(value, 5)), unit: small };
}

/* Ovens are marked in steps, not in degrees. A dial that offers 350 and 375
   does not care that 176.67 is the honest answer, and every conversion chart
   ever printed rounds these the same way. */
const toCelsius = (f) => toStep(((f - 32) * 5) / 9, 5);
const toFahrenheit = (c) => toStep((c * 9) / 5 + 32, 25);

/* ── Converting one measurement ──────────────────────────────────── */

/**
 * @returns {{amount: string, unit: string}|null} null when there is nothing
 * sensible to do, which is the common case and must stay cheap.
 */
export function convertMeasure(amount, unit, system, context = "") {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const u = String(unit || "").toLowerCase().replace(/\.$/, "");
  if (!u) return null;

  if (system === "metric") {
    if (US_VOLUME_ML[u]) return metricAmount(amount * US_VOLUME_ML[u], "ml", "l");
    if (u === "floz") return metricAmount(amount * 29.5735, "ml", "l");
    if (US_WEIGHT_G[u]) {
      /* A fluid ounce dressed as an ounce. Pounds are never volumes, so only
         the ounce needs asking about. */
      if ((u === "oz" || u === "ounce" || u === "ounces") && looksLikeAPour(context)) {
        return metricAmount(amount * 29.5735, "ml", "l");
      }
      return metricAmount(amount * US_WEIGHT_G[u], "g", "kg");
    }
    if (US_LENGTH_MM[u]) {
      const mm = amount * US_LENGTH_MM[u];
      return { amount: String(Math.round((mm / 10) * 10) / 10), unit: "cm" };
    }
    return null;
  }

  if (system === "us") {
    if (METRIC_VOLUME_ML[u]) {
      const ml = amount * METRIC_VOLUME_ML[u];
      /* Small amounts become spoons, because that is how a US recipe would
         have said it; a quarter cup of vanilla is not a thing anyone writes. */
      if (ml < 11) return { amount: prettyNumber(ml / 5), unit: "tsp" };
      if (ml < 60) return { amount: prettyNumber(ml / 15), unit: "tbsp" };
      const cups = ml / 240;
      return { amount: prettyNumber(cups), unit: cups >= 2 ? "cups" : "cup" };
    }
    if (METRIC_WEIGHT_G[u]) {
      const g = amount * METRIC_WEIGHT_G[u];
      if (g >= 453.592) return { amount: prettyNumber(g / 453.592), unit: "lb" };
      return { amount: prettyNumber(g / 28.3495), unit: "oz" };
    }
    if (METRIC_LENGTH_MM[u]) {
      const inches = (amount * METRIC_LENGTH_MM[u]) / 25.4;
      return { amount: prettyNumber(inches), unit: inches === 1 ? "inch" : "inches" };
    }
    return null;
  }

  return null;
}

/* ── Converting prose ────────────────────────────────────────────── */

/* "2 cups", "1½–2 cups", "8 fl oz". The unit is taken as a word and checked
   against the tables, so "8 minutes" and "step 2 of 6" cannot match. */
const MEASURE_RE = new RegExp(
  `(${NUM})(\\s*(?:-|–|—|to)\\s*)(${NUM})(\\s*)(fl\\.?\\s*oz|[A-Za-z]+\\.?)|(${NUM})(\\s*)(fl\\.?\\s*oz|[A-Za-z]+\\.?)`,
  "g",
);

/* "425°F", "425 degrees F", "220 C". */
const TEMP_RE = /(\d{2,3})\s*(?:°\s*([CF])|degrees?\s*([CF])(?:ahrenheit|elsius|entigrade)?\b|°(?![A-Za-z]))/gi;

function convertTemps(text, system) {
  return String(text).replace(TEMP_RE, (whole, digits, a, b) => {
    const scale = (a || b || "").toUpperCase();
    const value = parseInt(digits, 10);
    if (!Number.isFinite(value)) return whole;
    /* A bare degree sign with no letter is an oven temperature in whichever
       system the number implies: nothing is baked at 220°F and no oven reaches
       425°C, so the number itself says which was meant. */
    const from = scale || (value >= 250 ? "F" : "C");
    if (system === "metric" && from === "F") return `${toCelsius(value)}°C`;
    if (system === "us" && from === "C") return `${toFahrenheit(value)}°F`;
    return whole;
  });
}

/**
 * Convert every measurement in a piece of text.
 *
 * Unlike scaling, this does reach inside brackets and does touch the size of a
 * pan: a 9-inch tin is still a 23cm tin to somebody who shops in centimetres,
 * where doubling a recipe leaves the tin the size it always was.
 */
export function convertText(text, system, context) {
  if (!text || system !== "metric" && system !== "us") return text;
  const around = context === undefined ? text : context;

  const convertMeasures = (part) => part.replace(MEASURE_RE, (whole, aRange, dash, bRange, gapRange, unitRange, aLone, gapLone, unitLone) => {
    const unitRaw = unitRange ?? unitLone;
    const unit = unitRaw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const gap = gapRange ?? gapLone;

    if (aRange != null) {
      const from = convertMeasure(toNumber(aRange), unit, system, around);
      const to = convertMeasure(toNumber(bRange), unit, system, around);
      if (!from || !to) return whole;
      /* One unit for the pair, taken from the larger end — "1–2 cups" must not
         come back as "240 ml–0.5 l". */
      return `${from.unit === to.unit ? from.amount : convertMeasure(toNumber(aRange), unit, system, around).amount}${dash}${to.amount}${gap}${to.unit}`;
    }

    const one = convertMeasure(toNumber(aLone), unit, system, around);
    if (!one) return whole;
    return `${one.amount}${gap || " "}${one.unit}`;
  });

  const withUnits = preferWrittenAmounts(String(text), system)
    .split(/(\([^()]*\))/)
    .map((part) =>
      /* A bracket that already gives both systems is complete as written;
         converting inside it would only say one of its amounts twice. */
      part.startsWith("(") && bothSystems(bracketAmounts(part.slice(1, -1))) ? part : convertMeasures(part))
    .join("");

  return convertTemps(withUnits, system);
}

/**
 * An ingredient line. Identical to prose except that the whole line is the
 * context for deciding whether an ounce pours.
 */
export const convertIngredient = (line, system) => convertText(line, system, line);

/* ── Scaling a line ──────────────────────────────────────────────── */

const QTY_RE = new RegExp(`^(\\s*)(${NUM})(\\s*(?:-|–|to)\\s*)?(${NUM})?`);
const LEAD_BRACKET_RE = /^(\s*)(fl\.?\s*oz|[A-Za-z]+\.?)(\s*)\(([^()]*)\)/;
const BRACKET_AMOUNT_RE = new RegExp(`(${NUM})(\\s*)(fl\\.?\\s*oz|[A-Za-z]+\\.?)`, "g");

/**
 * An ingredient line at a different number of servings. The leading amount
 * moves, and anything later in the line is left as written — except the
 * bracket straight after a leading measure, because "⅓ cup (72 grams)" says one
 * amount twice and both halves have to agree, most of all now that metric shows
 * the bracket's half. A bracket after a container is the container's size, and
 * a 14 oz can is still 14 oz however many go in.
 */
export function scaleLine(line, factor) {
  if (!factor || factor === 1) return line;
  const m = line.match(QTY_RE);
  if (!m) return line;
  const a = toNumber(m[2]);
  if (a == null) return line;
  const b = m[4] ? toNumber(m[4]) : null;
  const scaled = prettyNumber(a * factor) + (b != null ? `${m[3] || "–"}${prettyNumber(b * factor)}` : "");

  let rest = line.slice(m[0].length);
  const lead = rest.match(LEAD_BRACKET_RE);
  if (lead && kindOf(unitKey(lead[2]))) {
    const inside = lead[4].replace(BRACKET_AMOUNT_RE, (whole, n, gap, unit) => {
      const v = toNumber(n);
      return v == null || !kindOf(unitKey(unit)) ? whole : `${prettyNumber(v * factor)}${gap}${unit}`;
    });
    rest = `${lead[1]}${lead[2]}${lead[3]}(${inside})${rest.slice(lead[0].length)}`;
  }
  return line.slice(0, m[1].length) + scaled + rest;
}
