/**
 * Adding up a day.
 *
 * The parts that matter: nutrition is written per serving so a portion is a
 * multiplier; anything without nutrition is counted as nothing rather than as
 * zero-that-looks-real; and the day rolls over locally, not in Greenwich.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

const a = src.indexOf("const DAY_KEY =");
const b = src.indexOf("/* ══", a);
if (a < 0 || b < 0) throw new Error("could not find the day model — has RecipeBox.jsx moved on?");

const NAMES = "dayTotals, dayId, shiftDay, earliestDay, dayLabel, dayIsEmpty, pruneDays, emptyDay, emptyLog, asLog, mergeLogs, newerBody, numOf, MEALS, HISTORY_DAYS, DAY_HISTORY";
const { dayTotals, dayId, shiftDay, earliestDay, dayLabel, dayIsEmpty, pruneDays, emptyDay, emptyLog, asLog, mergeLogs, newerBody, numOf, MEALS, HISTORY_DAYS, DAY_HISTORY } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(a, b) + "export { " + NAMES + " };")
);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const recipes = [
  { id: "oats", nutrition: { calories: "320", protein: "12 g", carbs: "54 g", fat: "6 g" } },
  { id: "chili", nutrition: { calories: 540, protein: "38 g", carbs: "41 g", fat: "22 g" } },
  { id: "tea", nutrition: null },
  { id: "cake", nutrition: { protein: "4 g" } },   // no calories, so nothing to count from
];

console.log("\n— reading the numbers off a label —");
is("a bare number", numOf("320"), 320);
is("a number with its unit", numOf("18 g"), 18);
is("a decimal", numOf("2.5 g"), 2.5);
is("a comma decimal", numOf("2,5 g"), 2.5);
is("nothing at all", numOf(""), 0);
is("undefined", numOf(undefined), 0);

console.log("\n— a day —");
const day = {
  ...emptyDay(),
  breakfast: [{ id: "1", recipeId: "oats", servings: 1 }],
  dinner: [{ id: "2", recipeId: "chili", servings: 2 }],
};
const t = dayTotals(day, recipes);
is("calories add up across meals", t.calories, 320 + 540 * 2);
is("so do the macros", [t.protein, t.carbs, t.fat], [12 + 38 * 2, 54 + 41 * 2, 6 + 22 * 2]);
is("nothing is uncounted", t.unknown, 0);

console.log("\n— a portion is a multiplier, because nutrition is per serving —");
is("half a serving", dayTotals({ ...emptyDay(), lunch: [{ id: "3", recipeId: "oats", servings: 0.5 }] }, recipes).calories, 160);
is("a serving and a half", dayTotals({ ...emptyDay(), lunch: [{ id: "4", recipeId: "oats", servings: 1.5 }] }, recipes).calories, 480);

console.log("\n— what cannot be counted is said, not guessed —");
const murky = dayTotals({
  ...emptyDay(),
  breakfast: [{ id: "5", recipeId: "oats", servings: 1 }],
  snacks: [
    { id: "6", recipeId: "tea", servings: 1 },
    { id: "7", recipeId: "cake", servings: 1 },
    { id: "8", recipeId: "gone", servings: 1 },
  ],
}, recipes);
is("only what is known is added", murky.calories, 320);
is("a recipe with no nutrition is counted as unknown", murky.unknown, 3);
is("...including one that has since been deleted", dayTotals({ ...emptyDay(), lunch: [{ id: "9", recipeId: "nope", servings: 1 }] }, recipes).unknown, 1);
is("an empty day is zero, not broken", dayTotals(emptyDay(), recipes), { calories: 0, protein: 0, carbs: 0, fat: 0, unknown: 0 });
is("a day missing a meal entirely is fine", dayTotals({ breakfast: [{ id: "a", recipeId: "oats", servings: 1 }] }, recipes).calories, 320);

console.log("\n— which day it is —");
const d = new Date(2026, 8, 12, 23, 30);            // 11:30pm on 12 September, locally
is("the local date, not the UTC one", dayId(d), "2026-09-12");
const early = new Date(2026, 0, 5, 0, 10);
is("zero-padded", dayId(early), "2026-01-05");

console.log("\n— the log does not grow forever —");
const long = emptyLog();
for (let i = 1; i <= 60; i++) long.days[`2026-01-${String(i).padStart(2, "0")}`] = emptyDay();
const pruned = pruneDays(long);
is("only the last 45 days are kept", Object.keys(pruned.days).length, 45);
is("...and they are the most recent ones", Object.keys(pruned.days)[0], "2026-01-16");
is("tombstones go when their day would have",
  Object.keys(pruneDays({ days: {}, removed: { old: Date.now() - 90 * 86400000, fresh: Date.now() } }).removed), ["fresh"]);

is("a log written before any of this is read as one", asLog({ "2026-01-01": emptyDay() }).days["2026-01-01"].breakfast, []);
is("...and gains somewhere to record removals", asLog({ "2026-01-01": emptyDay() }).removed, {});
is("nothing at all is an empty log", asLog(null), { days: {}, removed: {} });

const food = (id, calories, servings = 1) => ({
  id, servings, food: { name: "Celery, raw", portion: "100 g" },
  per: { calories, protein: 1, carbs: 3, fat: 0 },
});
const mixed = dayTotals({
  ...emptyDay(),
  breakfast: [{ id: "r1", recipeId: "oats", servings: 1 }],
  snacks: [food("f1", 14, 2), food("f2", 190)],
}, recipes);
is("a food carries its own numbers", mixed.calories, 320 + 14 * 2 + 190);
is("...and its macros, multiplied by the portion", mixed.protein, 12 + 1 * 2 + 1);
is("nothing about it is uncounted", mixed.unknown, 0);
is("a food with no calories is still uncounted",
  dayTotals({ ...emptyDay(), snacks: [{ id: "f3", servings: 1, per: { calories: 0 }, food: { name: "x" } }] }, recipes).unknown, 1);
is("a food needs no recipe to exist",
  dayTotals({ ...emptyDay(), lunch: [food("f4", 250)] }, []).calories, 250);

const entry = (id, recipeId) => ({ id, recipeId, servings: 1 });
const oneDay = (meal, entries, removed = {}) => ({ days: { "2026-09-12": { ...emptyDay(), [meal]: entries } }, removed });

const both = mergeLogs(oneDay("breakfast", [entry("d-a1", "oats")]), oneDay("lunch", [entry("d-b2", "chili")]));
is("each device's meal survives the other",
  [both.days["2026-09-12"].breakfast.length, both.days["2026-09-12"].lunch.length], [1, 1]);
is("two entries in the same meal both keep",
  mergeLogs(oneDay("dinner", [entry("d-a1", "x")]), oneDay("dinner", [entry("d-b2", "y")]))
    .days["2026-09-12"].dinner.map((e) => e.id), ["d-a1", "d-b2"]);
is("...in the order they were logged, whichever device did it",
  mergeLogs(oneDay("dinner", [entry("d-b2", "x")]), oneDay("dinner", [entry("d-a1", "y")]))
    .days["2026-09-12"].dinner.map((e) => e.id), ["d-a1", "d-b2"]);
is("the same entry from both sides appears once",
  mergeLogs(oneDay("breakfast", [entry("d-a1", "oats")]), oneDay("breakfast", [entry("d-a1", "oats")]))
    .days["2026-09-12"].breakfast.length, 1);

const gone = oneDay("breakfast", [], { "d-a1": Date.now() });
const kept = oneDay("breakfast", [entry("d-a1", "oats")]);
is("a device that still remembers a removed entry does not put it back",
  mergeLogs(gone, kept).days["2026-09-12"].breakfast, []);
is("...whichever way round they meet", mergeLogs(kept, gone).days["2026-09-12"].breakfast, []);
is("the tombstone is carried forward", Object.keys(mergeLogs(kept, gone).removed), ["d-a1"]);

is("the newer profile wins", newerBody({ kg: 80, at: 1 }, { kg: 82, at: 2 }).kg, 82);
is("...whichever side it is on", newerBody({ kg: 80, at: 3 }, { kg: 82, at: 2 }).kg, 80);
is("one side missing", newerBody(null, { kg: 82, at: 2 }).kg, 82);
is("the other side missing", newerBody({ kg: 80, at: 1 }, null).kg, 80);
is("neither", newerBody(null, null), null);

/* Walking back through the calendar.
   Every one of these is a case where "subtract 86400000 milliseconds" gives the
   wrong answer: a month boundary, a leap day, and the mornings the clocks move,
   when a local day is 23 or 25 hours long. */
console.log("\n— stepping between days —");
is("back one inside a month", shiftDay("2026-09-12", -1), "2026-09-11");
is("forward one inside a month", shiftDay("2026-09-12", 1), "2026-09-13");
is("back over the start of a month", shiftDay("2026-09-01", -1), "2026-08-31");
is("back over a short month", shiftDay("2026-03-01", -1), "2026-02-28");
is("...and over a leap one", shiftDay("2024-03-01", -1), "2024-02-29");
is("back over New Year", shiftDay("2026-01-01", -1), "2025-12-31");
is("forward over the end of a year", shiftDay("2025-12-31", 1), "2026-01-01");
is("the morning the clocks go forward is still one day", shiftDay("2026-03-08", 1), "2026-03-09");
is("and the morning they go back", shiftDay("2026-11-01", 1), "2026-11-02");
is("a month back lands where a calendar says", shiftDay("2026-09-12", -30), "2026-08-13");
is("nothing in gives the same thing back", shiftDay("nonsense", -1), "nonsense");

console.log("\n— how far back you can look —");
is("a month of days, counting today", HISTORY_DAYS, 31);
is("the oldest day offered", earliestDay("2026-09-12"), "2026-08-13");
is("the picker never reaches past what the store keeps", HISTORY_DAYS <= DAY_HISTORY, true);

console.log("\n— naming a day —");
is("today is called today", dayLabel("2026-09-12", "2026-09-12"), "Today");
is("and the one before it", dayLabel("2026-09-11", "2026-09-12"), "Yesterday");
is("anything older gets a month in words", /september/i.test(dayLabel("2026-09-09", "2026-09-12")), true);
is("...rather than the key it is stored under", dayLabel("2026-09-09", "2026-09-12") === "2026-09-09", false);

console.log("\n— a day with nothing on it —");
is("a fresh day is empty", dayIsEmpty(emptyDay()), true);
is("nothing at all is empty", dayIsEmpty(null), true);
is("one thing eaten is not", dayIsEmpty({ ...emptyDay(), lunch: [{ id: "x" }] }), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
