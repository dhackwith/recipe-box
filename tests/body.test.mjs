/**
 * The day's numbers.
 *
 * Two things matter beyond the arithmetic: that nothing ever suggests eating
 * under the resting burn, and that somebody who picks neither sex still gets an
 * answer rather than a broken page.
 */

import {
  restingBurn, dailyTargets, bmi, ACTIVITY, GOALS,
  lbToKg, kgToLb, feetInchesToCm, cmToFeetInches,
} from "../src/body.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const near = (label, got, want, slack = 1) => {
  const ok = Math.abs(got - want) <= slack;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `   got ${got}, wanted about ${want}`}`);
};

console.log("\n— Mifflin-St Jeor, against worked examples —");
near("30yo man, 180cm, 80kg", restingBurn({ sex: "male", kg: 80, cm: 180, age: 30 }), 1780);
near("30yo woman, 165cm, 65kg", restingBurn({ sex: "female", kg: 65, cm: 165, age: 30 }), 1370);
near("50yo man, 175cm, 90kg", restingBurn({ sex: "male", kg: 90, cm: 175, age: 50 }), 1748);
is("no answer without the numbers", restingBurn({ sex: "male", kg: 0, cm: 180, age: 30 }), null);
is("...or without an age", restingBurn({ sex: "male", kg: 80, cm: 180, age: 0 }), null);

console.log("\n— somebody who picks neither still gets a figure —");
const neither = restingBurn({ sex: "", kg: 80, cm: 180, age: 30 });
const male = restingBurn({ sex: "male", kg: 80, cm: 180, age: 30 });
const female = restingBurn({ sex: "female", kg: 80, cm: 180, age: 30 });
is("it sits between the two the formula carries", neither > female && neither < male, true);

console.log("\n— a day's target —");
const man = { sex: "male", kg: 80, cm: 180, age: 30, activity: "moderate", goal: "maintain" };
const t = dailyTargets(man);
near("maintenance is the resting burn times activity", t.calories, 1780 * 1.55, 6);
is("the resting figure is reported too", t.rest > 1770 && t.rest < 1790, true);
is("maintenance is not floored", t.floored, false);

const losing = dailyTargets({ ...man, goal: "lose" });
is("losing slowly is below maintaining", losing.calories < t.calories, true);
near("...by about fifteen per cent", losing.calories, t.calories * 0.85, 10);
const gaining = dailyTargets({ ...man, goal: "gain" });
is("gaining slowly is above maintaining", gaining.calories > t.calories, true);

console.log("\n— and never below the resting burn —");
/* The clamp in dailyTargets is a net, not a worker: the gentlest activity (1.2)
   times the only deficit on offer (0.85) still comes to 1.02 of resting, so no
   combination can reach it. That is the property worth pinning — it says the
   goals themselves are safe, rather than that the clamp catches them. Widen a
   goal past a 17% cut and this is the test that goes red. */
const bodies = [
  { sex: "female", kg: 48, cm: 155, age: 55 },
  { sex: "male", kg: 80, cm: 180, age: 30 },
  { sex: "", kg: 62, cm: 168, age: 71 },
  { sex: "female", kg: 110, cm: 150, age: 19 },
];
let everBelow = false;
let everFloored = false;
for (const body of bodies) {
  for (const a of ACTIVITY) {
    for (const g of GOALS) {
      const d = dailyTargets({ ...body, activity: a.id, goal: g.id });
      if (d.calories < d.rest) everBelow = true;
      if (d.floored) everFloored = true;
    }
  }
}
is("no body, activity and goal lands under resting", everBelow, false);
is("...so the clamp never has to fire", everFloored, false);

console.log("\n— macros —");
near("protein tracks body weight, not the calories", t.protein, 1.6 * 80, 1);
is("protein does not move when the goal does", dailyTargets({ ...man, goal: "lose" }).protein, t.protein);
is("carbohydrate is what is left, so it does", dailyTargets({ ...man, goal: "lose" }).carbs < t.carbs, true);
const kcalFromMacros = t.protein * 4 + t.fat * 9 + t.carbs * 4;
near("the three add back up to the target", kcalFromMacros, t.calories, 6);

console.log("\n— BMI, and what it is worth —");
is("180cm and 80kg", bmi({ kg: 80, cm: 180 }).value, 24.7);
is("...lands in the usual range", bmi({ kg: 80, cm: 180 }).band, "in the usual range");
is("a lighter build", bmi({ kg: 50, cm: 175 }).band, "under the usual range");
is("a heavier one", bmi({ kg: 95, cm: 170 }).band, "well over the usual range");
is("nothing to go on", bmi({ kg: 0, cm: 0 }), null);

console.log("\n— units —");
near("154 lb is about 70 kg", lbToKg(154), 69.85, 0.1);
near("...and back again", kgToLb(lbToKg(154)), 154, 0.001);
near("5 foot 10 is about 178 cm", feetInchesToCm(5, 10), 177.8, 0.1);
is("...and back again", cmToFeetInches(177.8), { feet: 5, inches: 10 });
is("a round metre eighty", cmToFeetInches(182.88), { feet: 6, inches: 0 });

console.log("\n— the lists the form offers —");
is("the five standard levels", ACTIVITY.map((a) => a.factor), [1.2, 1.375, 1.55, 1.725, 1.9]);
is("...named the way every calculator names them",
  ACTIVITY.map((a) => a.label), ["Sedentary", "Lightly active", "Moderately active", "Very active", "Extra active"]);
is("sedentary is the floor, extra active the ceiling",
  [ACTIVITY[0].id, ACTIVITY[ACTIVITY.length - 1].id], ["sedentary", "extra"]);
is("three goals, none of them drastic", GOALS.map((g) => g.id), ["maintain", "lose", "gain"]);
is("nothing cuts more than fifteen per cent", Math.min(...GOALS.map((g) => g.adjust)) >= 0.85, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
