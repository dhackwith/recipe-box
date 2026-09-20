/**
 * How long a recipe takes, what sort of thing it is, and the order the shelf
 * puts it in.
 *
 * TIMES
 * The box has always carried one free-text `time` — "20 minutes, plus
 * overnight" — which reads well and sorts not at all. Prep and cook are now
 * kept as plain numbers beside it, the way every recipe site publishes them,
 * so "under 30 minutes" is a question the shelf can answer. The written line
 * stays: it is the only one that can say "plus overnight", and a recipe that
 * has only ever had that line still sorts, because `readMinutes` reads a
 * number back out of it.
 *
 * COURSE AND CUISINE
 * Tags are a flat free-for-all — "weeknight", "abuela", "peach" — and asking
 * them to also mean "this is a dinner" never worked. Course comes from a fixed
 * list so the shelf can be browsed by it. Cuisine is open, because there is no
 * list of the world's cooking that ends. Both are tidied rather than refused:
 * an import saying "Main Course" lands on Dinner, and anything unrecognised
 * keeps its own name instead of being thrown away.
 */

/* ══════════════════════════════════════════════════════════════════
   Times
   ══════════════════════════════════════════════════════════════════ */

/* A day and a half of cold-proofing is a real recipe; a thousand hours is a
   typo, and would sit at the bottom of every sort forever. */
export const MINUTES_MAX = 60 * 24 * 7;

/** A stored prep/cook figure, checked. null when there isn't one. */
export function asMinutes(v) {
  if (v === "" || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= MINUTES_MAX ? n : null;
}

/** "1 hour 30 minutes", "45 mins", "1h20" — whole minutes, or null.
    Reads the FIRST duration it finds, so "20 minutes, plus overnight" is 20:
    the bit you stand at the bench for is the bit worth sorting on. */
export function readMinutes(text) {
  const s = String(text ?? "").toLowerCase();
  if (!s) return null;
  let total = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const hours = m[2][0] === "h";
    /* "1 hour 30 minutes" is one duration in two parts; "20 minutes, plus
       overnight" is not. Only keep going while the parts are getting smaller. */
    if (found && hours) break;
    total += hours ? n * 60 : n;
    found = true;
    if (!hours) break;
  }
  const mins = Math.round(total);
  return found && mins > 0 && mins <= MINUTES_MAX ? mins : null;
}

/** Prep + cook, or whatever the written line says, or nothing. */
export function totalMinutes(recipe) {
  const prep = asMinutes(recipe?.prepMinutes);
  const cook = asMinutes(recipe?.cookMinutes);
  if (prep || cook) return Math.min((prep || 0) + (cook || 0), MINUTES_MAX);
  return readMinutes(recipe?.time);
}

/** "1 hour 30 minutes". Whole hours drop the minutes rather than say "0". */
export function minutesLabel(n) {
  const mins = asMinutes(n);
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && `${h} ${h === 1 ? "hour" : "hours"}`, m && `${m} ${m === 1 ? "minute" : "minutes"}`]
    .filter(Boolean)
    .join(" ");
}

/** The rows for the stats strip: only the ones this recipe actually knows.
    Total is worked out rather than stored, so it can never disagree. */
export function timeParts(recipe) {
  const prep = asMinutes(recipe?.prepMinutes);
  const cook = asMinutes(recipe?.cookMinutes);
  const rows = [];
  if (prep) rows.push({ key: "prep", label: "Prep", minutes: prep, text: minutesLabel(prep) });
  if (cook) rows.push({ key: "cook", label: "Cook", minutes: cook, text: minutesLabel(cook) });
  if (prep && cook) {
    const total = prep + cook;
    rows.push({ key: "total", label: "Total", minutes: total, text: minutesLabel(total) });
  }
  /* The written line is the only one that can say "plus overnight", so it is
     shown whenever it says something the numbers don't. */
  const written = String(recipe?.time || "").trim();
  if (written && (!rows.length || !rows.some((r) => r.text === written))) {
    rows.push({ key: "time", label: rows.length ? "In all" : "Time", minutes: null, text: written });
  }
  return rows;
}

/* The shelf's time filter. Kept short on purpose — a menu of nine thresholds
   is a worse question than a menu of three. */
export const TIME_LIMITS = [
  { id: 15, label: "Under 15 minutes" },
  { id: 30, label: "Under 30 minutes" },
  { id: 60, label: "Under an hour" },
];

/* ══════════════════════════════════════════════════════════════════
   Course and cuisine
   ══════════════════════════════════════════════════════════════════ */

/* The shelf browses by these, so the list is fixed and the order is the order
   a day happens in. `alias` catches what imports actually publish. */
export const COURSES = [
  { id: "breakfast", label: "Breakfast", alias: ["brunch", "breakfast and brunch", "breakfasts"] },
  { id: "lunch", label: "Lunch", alias: ["lunches", "packed lunch"] },
  { id: "dinner", label: "Dinner", alias: ["main", "mains", "main course", "main courses", "main dish", "main dishes", "entree", "entrees", "entrée", "supper"] },
  { id: "starter", label: "Starter", alias: ["appetizer", "appetizers", "appetiser", "appetisers", "starters", "hors d'oeuvre", "canape", "canapes"] },
  { id: "side", label: "Side", alias: ["sides", "side dish", "side dishes", "accompaniment"] },
  { id: "salad", label: "Salad", alias: ["salads"] },
  { id: "soup", label: "Soup", alias: ["soups", "soups and stews", "stew", "stews"] },
  { id: "snack", label: "Snack", alias: ["snacks", "nibbles"] },
  { id: "baking", label: "Baking", alias: ["bread", "breads", "bake", "bakes", "pastry", "cake", "cakes"] },
  { id: "dessert", label: "Dessert", alias: ["desserts", "pudding", "puddings", "sweets"] },
  { id: "drinks", label: "Drinks", alias: ["drink", "beverage", "beverages", "cocktail", "cocktails", "smoothie", "smoothies"] },
  { id: "sauce", label: "Sauces and dressings", alias: ["sauce", "sauces", "dressing", "dressings", "condiment", "condiments", "dip", "dips", "marinade", "marinades"] },
  { id: "preserve", label: "Preserves", alias: ["preserve", "jam", "jams", "jelly", "pickle", "pickles", "canning"] },
];

const fold = (v) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const COURSE_BY_WORD = new Map();
for (const c of COURSES) {
  COURSE_BY_WORD.set(fold(c.label), c.id);
  COURSE_BY_WORD.set(c.id, c.id);
  for (const a of c.alias) COURSE_BY_WORD.set(fold(a), c.id);
}

/**
 * A course id, or "" when nothing recognisable was given.
 *
 * Only the fixed list, because the shelf's shape depends on it: an import
 * offering "Weeknight Suppers" gets Dinner out of its last word rather than
 * opening a thirteenth shelf nobody asked for.
 */
export function asCourse(v) {
  const s = fold(v);
  if (!s) return "";
  if (COURSE_BY_WORD.has(s)) return COURSE_BY_WORD.get(s);
  /* "main dish, chicken" and "Weeknight Suppers" — try the pieces. */
  for (const piece of s.split(/[,/>|·-]| and /).map((p) => p.trim()).filter(Boolean)) {
    if (COURSE_BY_WORD.has(piece)) return COURSE_BY_WORD.get(piece);
  }
  /* Last word first: a category reads narrow to wide, so "Weeknight Suppers"
     is a supper. A plain trailing "s" is tried off, which saves listing the
     plural of everything. */
  for (const word of s.split(" ").reverse()) {
    if (COURSE_BY_WORD.has(word)) return COURSE_BY_WORD.get(word);
    const one = word.replace(/s$/, "");
    if (one !== word && COURSE_BY_WORD.has(one)) return COURSE_BY_WORD.get(one);
  }
  return "";
}

export const courseLabel = (id) => COURSES.find((c) => c.id === id)?.label || "";

/* A handful to offer in the form. Not a limit — anywhere that cooks is a
   cuisine, and the field takes whatever is typed. */
export const CUISINE_HINTS = [
  "American", "British", "Chinese", "French", "Greek", "Indian", "Italian", "Japanese",
  "Korean", "Mexican", "Middle Eastern", "New Zealand", "Spanish", "Thai", "Vietnamese",
];

const CUISINE_CASE = new Map(CUISINE_HINTS.map((c) => [fold(c), c]));

/**
 * A cuisine, tidied. Open-ended, so anything unrecognised keeps its own name
 * with sensible capitals rather than being dropped.
 */
export function asCuisine(v) {
  const s = fold(v);
  if (!s) return "";
  if (CUISINE_CASE.has(s)) return CUISINE_CASE.get(s);
  const first = s.split(/[,/>|]/)[0].trim();
  if (!first || first.length > 32) return "";
  if (CUISINE_CASE.has(first)) return CUISINE_CASE.get(first);
  return first.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/* ══════════════════════════════════════════════════════════════════
   Sorting
   ══════════════════════════════════════════════════════════════════ */

/* `needs` names what a mode can't sort without, so the menu can leave out a
   mode there is no data for — no "Most cooked" on a box nobody has cooked in. */
export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "title", label: "A to Z" },
  { id: "quickest", label: "Quickest first", needs: "time" },
  { id: "loved", label: "Most loved", needs: "loved" },
  { id: "cooked", label: "Most cooked", needs: "cooked" },
];

export const DEFAULT_SORT = "newest";

export const isSort = (id) => SORTS.some((s) => s.id === id);

const byTitle = (a, b) =>
  String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base", numeric: true });

/**
 * The shelf in order. Never sorts in place.
 *
 * `counts` supplies what the recipe itself doesn't know: { loved, cooked },
 * each a map of recipe id to a number. A recipe with nothing to sort on goes
 * to the bottom rather than the top, so an unloved recipe doesn't lead "Most
 * loved", and ties fall back to the title so the order never wobbles between
 * renders.
 */
export function sortRecipes(recipes, mode, counts = {}) {
  const list = [...(recipes || [])];
  const loved = counts.loved || {};
  const cooked = counts.cooked || {};
  const at = (r) => Number(r?.created) || 0;

  switch (isSort(mode) ? mode : DEFAULT_SORT) {
    case "oldest":
      return list.sort((a, b) => at(a) - at(b) || byTitle(a, b));
    case "title":
      return list.sort(byTitle);
    case "quickest":
      return list.sort((a, b) => {
        const x = totalMinutes(a);
        const y = totalMinutes(b);
        if (x == null && y == null) return byTitle(a, b);
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y || byTitle(a, b);
      });
    case "loved":
      return list.sort((a, b) => (loved[b.id] || 0) - (loved[a.id] || 0) || byTitle(a, b));
    case "cooked":
      return list.sort((a, b) => (cooked[b.id] || 0) - (cooked[a.id] || 0) || byTitle(a, b));
    default:
      return list.sort((a, b) => at(b) - at(a) || byTitle(a, b));
  }
}

/* ══════════════════════════════════════════════════════════════════
   Filtering
   ══════════════════════════════════════════════════════════════════ */

/* Everything the Filters panel can ask for, apart from the search box and the
   box on the shelf, which the app already handles. Tags are AND, not OR:
   picking "vegetarian" and "quick" means both, which is what somebody
   narrowing a list expects. */
export const emptyFilters = () => ({ tags: [], course: "", cuisine: "", maxMinutes: null, favOnly: false });

export function countFilters(f) {
  if (!f) return 0;
  return (f.tags?.length || 0) + (f.course ? 1 : 0) + (f.cuisine ? 1 : 0) + (f.maxMinutes ? 1 : 0) + (f.favOnly ? 1 : 0);
}

/**
 * One recipe against the panel. `isFav` is passed in rather than read here,
 * because whose favorites they are is the app's business, not this module's.
 */
export function matchesFilters(recipe, f, isFav = () => false) {
  if (!f) return true;
  const tags = (recipe?.tags || []).map(fold);
  for (const want of f.tags || []) {
    if (!tags.includes(fold(want))) return false;
  }
  if (f.course && recipe?.course !== f.course) return false;
  if (f.cuisine && fold(recipe?.cuisine) !== fold(f.cuisine)) return false;
  if (f.maxMinutes) {
    const mins = totalMinutes(recipe);
    /* A recipe that never said how long it takes is not "under 15 minutes". */
    if (mins == null || mins > f.maxMinutes) return false;
  }
  if (f.favOnly && !isFav(recipe?.id)) return false;
  return true;
}

/**
 * The shelf grouped for browsing: course, and within it cuisine.
 *
 * Every recipe appears exactly once. Anything without a course lands under
 * "Everything else" at the bottom, so a box that has never filled the field in
 * still shows all of itself rather than looking empty.
 */
export function browseShelf(recipes) {
  const byCourse = new Map();
  for (const r of recipes || []) {
    const id = asCourse(r?.course) || "";
    if (!byCourse.has(id)) byCourse.set(id, []);
    byCourse.get(id).push(r);
  }
  const shelf = [];
  for (const c of COURSES) {
    const list = byCourse.get(c.id);
    if (list?.length) shelf.push({ id: c.id, label: c.label, recipes: list, cuisines: cuisineCounts(list) });
  }
  const rest = byCourse.get("");
  if (rest?.length) shelf.push({ id: "", label: "Everything else", recipes: rest, cuisines: cuisineCounts(rest) });
  return shelf;
}

/** [{ name, count }], commonest first, for the line under a course heading. */
export function cuisineCounts(recipes) {
  const tally = new Map();
  for (const r of recipes || []) {
    const name = asCuisine(r?.cuisine);
    if (name) tally.set(name, (tally.get(name) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
