/**
 * Reading a food off FoodData Central.
 *
 * The records come in four shapes and only one of them is per serving, so most
 * of what can go wrong here is silently mixing up per-100g and per-serving
 * numbers — a mistake that produces plausible figures rather than obvious ones.
 * The fixtures below are the real shapes, trimmed.
 */

import { readFood, readSearch, DATA_TYPES } from "../shared/food.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* SR Legacy: measured, per 100 g, nutrients in a flat list. */
const celery = {
  fdcId: 169988,
  dataType: "SR Legacy",
  description: "Celery, raw",
  foodNutrients: [
    { nutrientNumber: "203", nutrientName: "Protein", value: 0.69 },
    { nutrientNumber: "204", nutrientName: "Total lipid (fat)", value: 0.17 },
    { nutrientNumber: "205", nutrientName: "Carbohydrate, by difference", value: 2.97 },
    { nutrientNumber: "208", nutrientName: "Energy", value: 14 },
    { nutrientNumber: "268", nutrientName: "Energy", value: 59 },        // the same name, in kJ
  ],
};

/* Branded: the label, already per serving. */
const peanutButter = {
  fdcId: 2262074,
  dataType: "Branded",
  description: "PEANUT BUTTER, SMOOTH",
  brandName: "SOME BRAND",
  servingSize: 32,
  servingSizeUnit: "g",
  householdServingFullText: "2 tbsp",
  labelNutrients: {
    calories: { value: 190 },
    protein: { value: 7 },
    carbohydrates: { value: 8 },
    fat: { value: 16 },
  },
  foodNutrients: [{ nutrientNumber: "208", value: 594 }],   // per 100 g, and not what we want
};

/* Survey: how people actually eat it, including restaurant dishes. */
const burger = {
  fdcId: 784295,
  dataType: "Survey (FNDDS)",
  description: "Cheeseburger, on bun, with bacon and condiments",
  foodNutrients: [
    { nutrientNumber: "208", value: 273 },
    { nutrientNumber: "203", value: 15.4 },
    { nutrientNumber: "205", value: 19.2 },
    { nutrientNumber: "204", value: 14.6 },
  ],
};

console.log("\n— a measured whole food —");
const c = readFood(celery);
is("named as the database names it", c.name, "Celery, raw");
is("per 100 g, and it says so", c.portion, "100 g");
is("energy comes from the kcal row, not the kJ one", c.per.calories, 14);
is("the macros come with it", [c.per.protein, c.per.carbs, c.per.fat], [1, 3, 0]);
is("no brand on a whole food", c.brand, null);
is("the dataset is carried through", c.kind, "SR Legacy");

console.log("\n— a packet, where the label is per serving —");
const p = readFood(peanutButter);
is("the label wins over the per-100g row", p.per.calories, 190);
is("...for every macro", [p.per.protein, p.per.carbs, p.per.fat], [7, 8, 16]);
is("the portion is the one on the packet", p.portion, "2 tbsp (32 g)");
is("the brand is kept", p.brand, "SOME BRAND");

console.log("\n— a restaurant-shaped dish —");
const b = readFood(burger);
is("found by its plain description", b.name, "Cheeseburger, on bun, with bacon and condiments");
is("per 100 g like the rest of the measured data", b.portion, "100 g");
is("with its calories", b.per.calories, 273);

console.log("\n— records that cannot be read are dropped, not zeroed —");
is("no energy at all", readFood({ fdcId: 1, dataType: "SR Legacy", description: "Mystery", foodNutrients: [{ nutrientNumber: "203", value: 4 }] }), null);
is("no name", readFood({ fdcId: 2, dataType: "SR Legacy", description: "", foodNutrients: [{ nutrientNumber: "208", value: 10 }] }), null);
is("nothing at all", readFood(null), null);
is("a branded record with no label falls back to the measured row",
  readFood({ fdcId: 3, dataType: "Branded", description: "Thing", foodNutrients: [{ nutrientNumber: "208", value: 250 }] }).per.calories, 250);
is("...and then says per 100 g, because that is what it is",
  readFood({ fdcId: 3, dataType: "Branded", description: "Thing", foodNutrients: [{ nutrientNumber: "208", value: 250 }] }).portion, "100 g");

console.log("\n— the nested nutrient shape the API also uses —");
is("nutrient.number is read too",
  readFood({ fdcId: 4, dataType: "Foundation", description: "Nested", foodNutrients: [{ nutrient: { number: "208" }, amount: 88 }] }).per.calories, 88);

console.log("\n— a whole reply —");
const search = readSearch({ foods: [celery, peanutButter, burger, { fdcId: 9, description: "Broken" }] });
is("the unreadable one is left out", search.length, 3);
is("the order the database gave is kept", search.map((f) => f.id), ["169988", "2262074", "784295"]);
is("the same food twice appears once", readSearch({ foods: [celery, celery] }).length, 1);
is("a limit is honoured", readSearch({ foods: [celery, peanutButter, burger] }, 2).length, 2);
is("no foods at all", readSearch({}), []);
is("rubbish in", readSearch(null), []);

console.log("\n— which datasets get asked for —");
is("all four, dishes before packets", DATA_TYPES, ["Survey (FNDDS)", "Foundation", "SR Legacy", "Branded"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
