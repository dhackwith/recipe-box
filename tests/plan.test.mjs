/**
 * The week's plan.
 *
 * Two things here are worth more than the rest. Weeks have to start on the
 * right day whatever day you ask from — the arithmetic that finds "the Monday
 * on or before" is the sort that works for six days out of seven and quietly
 * fails on the seventh. And a week has to become a shopping list by totalling
 * per recipe rather than per slot: the list holds one share per recipe and
 * replaces it, so the same dinner twice in a week has to arrive as one doubled
 * line, not as two that overwrite each other into one.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

/* The plan is built on the day log — same shape, same merge — so the slice runs
   from the day model through to the shopping list that follows it. */
const a = src.indexOf("const DAY_KEY =");
const b = src.indexOf("const LIST_KEY =");
if (a < 0 || b < 0) throw new Error("could not find the plan model — has RecipeBox.jsx moved on?");
/* Back up to the banner that opens the shopping list section, so the slice is
   the day model plus the plan built on it, and nothing after. */
const cut = src.lastIndexOf("/* ", b);

const NAMES = [
  "weekStart", "weekDays", "weekLabel", "weekdayShort", "dayNumber",
  "prunePlan", "planShopping", "planCount",
  "MEALS", "emptyDay", "dayId", "shiftDay", "mergeLogs", "asLog",
  "PLAN_BACK", "PLAN_AHEAD", "WEEK_STARTS_ON",
].join(", ");

const {
  weekStart, weekDays, weekLabel, weekdayShort, dayNumber,
  prunePlan, planShopping, planCount,
  MEALS, emptyDay, dayId, shiftDay, mergeLogs, asLog,
  PLAN_BACK, PLAN_AHEAD, WEEK_STARTS_ON,
} = await import("data:text/javascript," + encodeURIComponent(src.slice(a, cut) + "export { " + NAMES + " };"));

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* 2026-09-07 is a Monday; 2026-09-13 the Sunday that closes the same week. */
console.log("\n— finding the start of a week —");
is("Monday starts the week", WEEK_STARTS_ON, 1);
is("a Monday is its own week's start", weekStart("2026-09-07"), "2026-09-07");
is("a Tuesday belongs to the Monday before it", weekStart("2026-09-08"), "2026-09-07");
is("a Saturday too", weekStart("2026-09-12"), "2026-09-07");
/* The one that catches a naive implementation: Sunday is day 0, so a shift
   computed without the +7 wrap lands six days into the FOLLOWING week. */
is("and a Sunday closes that week rather than opening the next", weekStart("2026-09-13"), "2026-09-07");
is("the Monday after is a new week", weekStart("2026-09-14"), "2026-09-14");
is("a week that reaches back over a month", weekStart("2026-10-01"), "2026-09-28");
is("...and over a year", weekStart("2026-01-01"), "2025-12-29");
is("nothing in gives the same thing back", weekStart("nonsense"), "nonsense");

console.log("\n— the days of a week —");
const week = weekDays("2026-09-07");
is("seven of them", week.length, 7);
is("Monday first", week[0], "2026-09-07");
is("Sunday last", week[6], "2026-09-13");
is("consecutive", week, ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
is("a week that crosses a month is still seven days", weekDays("2026-09-28").length, 7);
is("...and runs into the next", weekDays("2026-09-28")[6], "2026-10-04");
is("every day of a week agrees which week it is in",
  weekDays("2026-09-07").every((d) => weekStart(d) === "2026-09-07"), true);

console.log("\n— naming a week —");
is("a week is named at all", weekLabel("2026-09-07").length > 0, true);
is("...with both ends in it", /7/.test(weekLabel("2026-09-07")) && /13/.test(weekLabel("2026-09-07")), true);
is("a week across two months names both",
  /september/i.test(weekLabel("2026-09-28")) && /october/i.test(weekLabel("2026-09-28")), true);
is("a column heading is a weekday", /^[A-Za-z]{2,4}\.?$/.test(weekdayShort("2026-09-07")), true);
is("and a date is its number", dayNumber("2026-09-07"), 7);

/* The heart of it. */
console.log("\n— what a week asks you to buy —");
const planWith = (slots) => {
  const days = {};
  for (const [date, meal, recipeId, servings] of slots) {
    days[date] = days[date] || emptyDay();
    days[date][meal].push({ id: `${date}-${meal}-${recipeId}`, recipeId, servings });
  }
  return { days, removed: {} };
};

const twice = planWith([
  ["2026-09-08", "dinner", "sangria", 6],
  ["2026-09-11", "dinner", "sangria", 6],
]);
is("the same recipe twice in a week is one line", planShopping(twice, week).length, 1);
is("...at the total the week asks for", planShopping(twice, week)[0], { recipeId: "sangria", servings: 12 });

const mixed = planWith([
  ["2026-09-07", "breakfast", "oats", 2],
  ["2026-09-07", "dinner", "stew", 4],
  ["2026-09-09", "lunch", "oats", 1],
]);
const shop = planShopping(mixed, week);
is("different recipes stay apart", shop.length, 2);
is("oats are totalled across the meals they appear in",
  shop.find((r) => r.recipeId === "oats").servings, 3);
is("stew is left alone", shop.find((r) => r.recipeId === "stew").servings, 4);

is("a day outside the week asked about is not counted",
  planShopping(planWith([["2026-09-14", "dinner", "stew", 4]]), week), []);
is("an empty week asks for nothing", planShopping({ days: {}, removed: {} }, week), []);
is("a slot with no recipe is skipped",
  planShopping({ days: { "2026-09-08": { ...emptyDay(), dinner: [{ id: "x", servings: 4 }] } }, removed: {} }, week), []);
is("a slot for nobody is skipped",
  planShopping(planWith([["2026-09-08", "dinner", "stew", 0]]), week), []);
is("rubbish in", planShopping({}, week), []);

console.log("\n— how much is on a week —");
is("two dinners is two meals", planCount(twice, week), 2);
is("three things across three meals", planCount(mixed, week), 3);
is("an empty week is nothing", planCount({ days: {} }, week), 0);
is("next week's dinner is not this week's", planCount(planWith([["2026-09-14", "dinner", "stew", 4]]), week), 0);

console.log("\n— keeping the plan a sensible size —");
const today = "2026-09-12";
const wide = {
  days: {
    [shiftDay(today, -PLAN_BACK - 1)]: emptyDay(),   // just too old
    [shiftDay(today, -1)]: emptyDay(),               // yesterday
    [today]: emptyDay(),
    [shiftDay(today, PLAN_AHEAD)]: emptyDay(),       // the last day you may plan
    [shiftDay(today, PLAN_AHEAD + 1)]: emptyDay(),   // one past it
  },
  removed: { old: Date.now() - (PLAN_BACK + 5) * 86400000, fresh: Date.now() },
};
const kept = prunePlan(wide, today);
is("a day older than the window goes", shiftDay(today, -PLAN_BACK - 1) in kept.days, false);
is("yesterday stays", shiftDay(today, -1) in kept.days, true);
is("today stays", today in kept.days, true);
is("the furthest day you may plan stays", shiftDay(today, PLAN_AHEAD) in kept.days, true);
is("a day past that goes", shiftDay(today, PLAN_AHEAD + 1) in kept.days, false);
is("a stale tombstone goes with it", "old" in kept.removed, false);
is("a fresh one stays", "fresh" in kept.removed, true);
is("the plan looks ahead, not only back", PLAN_AHEAD > PLAN_BACK, true);

/* The plan is stored in the day log's shape precisely so this works. */
console.log("\n— two devices, one plan —");
const laptop = planWith([["2026-09-08", "dinner", "stew", 4]]);
const phone = planWith([["2026-09-09", "lunch", "oats", 2]]);
const both = mergeLogs(laptop, phone);
is("what each device added survives the other", planCount(both, week), 2);
is("the laptop's dinner is there", both.days["2026-09-08"].dinner.length, 1);
is("and the phone's lunch", both.days["2026-09-09"].lunch.length, 1);

const tookOff = { ...laptop, removed: { "2026-09-08-dinner-stew": Date.now() } };
const after = mergeLogs(tookOff, laptop);
is("taking something off is not undone by a device that still remembers it",
  planCount(after, week), 0);

is("a plan saved before any of this reads as empty rather than breaking", asLog(null), { days: {}, removed: {} });
is("every meal of the day can be planned", MEALS.length, 4);
is("the plan and the tracker file days the same way", dayId(new Date(2026, 8, 12)), "2026-09-12");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
