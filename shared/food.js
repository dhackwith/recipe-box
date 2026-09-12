/**
 * Foods that are not recipes.
 *
 * Nobody is going to write a recipe for a stick of celery, so the tracker has to
 * be able to reach outside the box. It does not hold a food database of its own
 * — that is millions of rows and several gigabytes, well past what this site
 * runs on — it asks one.
 *
 * The source is USDA FoodData Central: public domain (CC0), free, and the thing
 * most other calorie apps are quietly built on. Four datasets sit behind it:
 *
 *   Foundation and SR Legacy  whole foods, measured. Celery, peanut butter.
 *   Survey (FNDDS)            foods as people actually eat them, including
 *                             generic restaurant dishes — "cheeseburger, on
 *                             bun, with bacon" is in here.
 *   Branded                   packaged groceries, from the label.
 *
 * What it is weakest at is a named item from a named chain. For those the
 * Survey entry for the same dish is usually close, and the app also lets
 * somebody type the numbers straight off the chain's own nutrition page.
 *
 * This file does the reading-off, and holds no network code, so the shape of
 * what comes back can be tested without asking anybody for anything.
 */

/* FoodData Central identifies nutrients by number, and the numbers outlive the
   names — "Energy" appears more than once in some records, once as kcal and
   once as kJ, so matching on the name alone picks up the wrong one. */
const NUTRIENT = { calories: "208", protein: "203", carbs: "205", fat: "204" };

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const round = (n, places = 0) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/* Branded records carry what is written on the label, already per serving. */
function fromLabel(label) {
  if (!label || typeof label !== "object") return null;
  const pick = (k) => (label[k] && typeof label[k].value !== "undefined" ? num(label[k].value) : null);
  const calories = pick("calories");
  if (calories == null) return null;
  return {
    calories: round(calories),
    protein: round(pick("protein") ?? 0),
    carbs: round(pick("carbohydrates") ?? 0),
    fat: round(pick("fat") ?? 0),
  };
}

/* Everything else is measured per 100 g. */
function fromNutrients(list) {
  if (!Array.isArray(list)) return null;
  const find = (code) =>
    list.find((n) => String(n.nutrientNumber ?? n.number ?? "") === code) ||
    list.find((n) => String(n.nutrient?.number ?? "") === code);
  const energy = find(NUTRIENT.calories);
  if (!energy) return null;
  const value = (n) => (n ? num(n.value ?? n.amount) : 0);
  return {
    calories: round(value(energy)),
    protein: round(value(find(NUTRIENT.protein))),
    carbs: round(value(find(NUTRIENT.carbs))),
    fat: round(value(find(NUTRIENT.fat))),
  };
}

/* A branded record in a SEARCH reply does not carry labelNutrients — that field
   only appears when a single food is fetched by id. What it does carry is its
   serving size in grams, alongside nutrients measured per 100 g. So the serving
   is arithmetic rather than invention: scale the hundred-gram figures by the
   stated size.

   This matters most exactly where it is easiest to miss. Peanut butter reads
   600 calories per 100 g and 180 per the two tablespoons anybody actually eats,
   and a tracker offering only the first is technically right and practically
   useless.

   Only grams and millilitres, because those are the basis the nutrients are
   measured against. A serving stated in ounces or pieces is left as per 100 g
   rather than converted on an assumption. */
const BY_WEIGHT = new Set(["g", "gram", "grams", "grm", "ml", "mlt", "millilitre", "milliliter"]);

function perServing(food, per100) {
  const size = num(food.servingSize);
  const unit = String(food.servingSizeUnit || "").toLowerCase().trim();
  if (!(size > 0) || !BY_WEIGHT.has(unit)) return null;
  const k = size / 100;
  return {
    calories: round(per100.calories * k),
    protein: round(per100.protein * k),
    carbs: round(per100.carbs * k),
    fat: round(per100.fat * k),
  };
}

/* "0.667 CUP | ABOUT" is how some labels arrive; the part after the bar is
   commentary. */
const household = (food) => {
  const said = String(food.householdServingFullText || "").split("|")[0].replace(/\s+/g, " ").trim();
  /* Some labels put the weight in the household field as well — "15 GRM" next
     to a 15 g serving reads as a stutter. */
  return /^[\d.]+\s*(g|grm|gram|grams|ml|mlt)$/i.test(said) ? "" : said;
};

function portionOf(food, scaled) {
  if (!scaled) return "100 g";
  const size = round(num(food.servingSize));
  const unit = String(food.servingSizeUnit || "").toLowerCase().trim();
  const said = household(food);
  if (said && size) return `${said} (${size} ${unit})`;
  if (said) return said;
  return `${size} ${unit}`;
}

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* Survey and SR names are written for a database — "Celery, raw" or "Peanut
   butter, smooth style, with salt". Left as they are: they are precise, and
   rewriting them would lose the distinctions they are precise about. */
export function readFood(food) {
  if (!food || typeof food !== "object") return null;
  const branded = String(food.dataType || "").toLowerCase() === "branded";
  const name = tidy(food.description || food.lowercaseDescription);
  if (!name) return null;

  /* A label if one came with it, otherwise the per-100g measurement — scaled to
     the stated serving when the record says what a serving weighs. */
  const label = branded ? fromLabel(food.labelNutrients) : null;
  const per100 = fromNutrients(food.foodNutrients);
  const scaled = !label && branded && per100 ? perServing(food, per100) : null;
  const per = label || scaled || per100;
  if (!per) return null;

  return {
    id: String(food.fdcId ?? ""),
    name,
    brand: tidy(food.brandName || food.brandOwner) || null,
    kind: String(food.dataType || "").trim() || null,
    portion: portionOf(food, !!label || !!scaled),
    per,
  };
}

/* A whole search reply. Anything that cannot be read is dropped rather than
   shown as a row of zeroes — a food claiming no calories is worse than a food
   that is simply not there. */
export function readSearch(payload, limit = 25) {
  const foods = Array.isArray(payload?.foods) ? payload.foods : [];
  const out = [];
  const seen = new Set();
  for (const food of foods) {
    const read = readFood(food);
    if (!read || seen.has(read.id)) continue;
    seen.add(read.id);
    out.push(read);
    if (out.length >= limit) break;
  }
  return out;
}

/* The datasets, in the order that answers a kitchen question best: things as
   people eat them first, then measured whole foods, then packets. */
export const DATA_TYPES = ["Survey (FNDDS)", "Foundation", "SR Legacy", "Branded"];
