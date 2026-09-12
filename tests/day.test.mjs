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

const { dayTotals, dayId, pruneDays, emptyDay, numOf, MEALS } = await import(
  "data:text/javascript," + encodeURIComponent(
    src.slice(a, b) + "\nexport { dayTotals, dayId, pruneDays, emptyDay, numOf, MEALS };")
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
const long = {};
for (let i = 1; i <= 60; i++) long[`2026-01-${String(i).padStart(2, "0")}`] = emptyDay();
const pruned = pruneDays(long);
is("only the last 45 days are kept", Object.keys(pruned).length, 45);
is("...and they are the most recent ones", Object.keys(pruned)[0], "2026-01-16");
is("a short log is left alone", Object.keys(pruneDays({ "2026-01-01": emptyDay() })).length, 1);

console.log("\n— the meals themselves —");
is("four of them, in the order of a day", MEALS.map((m) => m.id), ["breakfast", "lunch", "dinner", "snacks"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
