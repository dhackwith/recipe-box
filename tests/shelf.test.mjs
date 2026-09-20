/**
 * Times, course and cuisine, and the order the shelf puts a box in.
 */

import {
  asMinutes, readMinutes, totalMinutes, minutesLabel, timeParts, MINUTES_MAX,
  asCourse, courseLabel, asCuisine, COURSES,
  SORTS, isSort, sortRecipes, DEFAULT_SORT,
  emptyFilters, countFilters, matchesFilters, browseShelf, cuisineCounts,
} from "../shared/shelf.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── minutes ── */
is("a stored figure comes back as a whole number", asMinutes("45"), 45);
is("nothing stored is nothing", [asMinutes(""), asMinutes(null), asMinutes(undefined)], [null, null, null]);
is("zero, negative and nonsense are nothing", [asMinutes(0), asMinutes(-5), asMinutes("soon")], [null, null, null]);
is("a week and a half is a typo, not a recipe", asMinutes(MINUTES_MAX + 1), null);
is("a day and a half of proving is fine", asMinutes(60 * 36), 2160);

is("a written line reads back as minutes", readMinutes("45 minutes"), 45);
is("hours and minutes add up", readMinutes("1 hour 30 minutes"), 90);
is("short forms too", [readMinutes("2 hrs"), readMinutes("20 mins"), readMinutes("1h")], [120, 20, 60]);
is("the hands-on part is what sorts: 'plus overnight' is not counted",
  readMinutes("20 minutes, plus overnight"), 20);
is("...nor is a second, separate duration", readMinutes("15 minutes, plus 4 hours chilling"), 15);
is("a line with no number is nothing", readMinutes("until it looks right"), null);
is("an empty line is nothing", readMinutes(""), null);

is("prep and cook make the total", totalMinutes({ prepMinutes: 15, cookMinutes: 30 }), 45);
is("one of the two on its own still counts", totalMinutes({ prepMinutes: 15 }), 15);
is("with no numbers, the written line answers", totalMinutes({ time: "1 hour 10 minutes" }), 70);
is("numbers beat the written line", totalMinutes({ prepMinutes: 5, cookMinutes: 5, time: "3 hours" }), 10);
is("a recipe that never said is unknown, not zero", totalMinutes({ title: "Toast" }), null);

is("a label reads the way a person would write it", minutesLabel(90), "1 hour 30 minutes");
is("a whole hour does not say zero minutes", minutesLabel(120), "2 hours");
is("one of each is singular", minutesLabel(61), "1 hour 1 minute");

is("the stats strip shows prep, cook and the total",
  timeParts({ prepMinutes: 15, cookMinutes: 30 }).map((r) => [r.label, r.text]),
  [["Prep", "15 minutes"], ["Cook", "30 minutes"], ["Total", "45 minutes"]]);
is("one figure alone gets no total row, because there is nothing to add",
  timeParts({ cookMinutes: 30 }).map((r) => r.label), ["Cook"]);
is("a written line is kept when it says more than the numbers do",
  timeParts({ prepMinutes: 20, time: "20 minutes, plus overnight" }).map((r) => [r.label, r.text]),
  [["Prep", "20 minutes"], ["In all", "20 minutes, plus overnight"]]);
is("a written line that only repeats the numbers is not shown twice",
  timeParts({ prepMinutes: 45, time: "45 minutes" }).map((r) => r.label), ["Prep"]);
is("an old recipe with only its written line still shows it",
  timeParts({ time: "about 20 minutes" }).map((r) => [r.label, r.text]), [["Time", "about 20 minutes"]]);
is("a recipe with no time at all shows nothing", timeParts({}), []);

/* ── course ── */
is("the list's own names work", asCourse("Dessert"), "dessert");
is("what recipe sites actually publish lands somewhere sensible",
  ["Main Course", "Entrées", "Main Dishes", "Appetizer", "Side Dish", "Beverages"].map(asCourse),
  ["dinner", "dinner", "dinner", "starter", "side", "drinks"]);
is("a breadcrumb is read from its pieces", asCourse("Main Dish, Chicken"), "dinner");
is("a phrase is read from its last word", asCourse("Weeknight Suppers"), "dinner");
is("nothing recognisable opens no new shelf", asCourse("Chef John's Favourites"), "");
is("nothing given is nothing", [asCourse(""), asCourse(null)], ["", ""]);
is("every course has a label", COURSES.every((c) => courseLabel(c.id) === c.label), true);
is("an unknown id has no label", courseLabel("pudding-course"), "");

/* ── cuisine ── */
is("a known cuisine keeps its usual capitals", [asCuisine("italian"), asCuisine("MIDDLE EASTERN")], ["Italian", "Middle Eastern"]);
is("an unknown one is kept, not dropped", asCuisine("basque"), "Basque");
is("only the first of a list", asCuisine("Italian, Western"), "Italian");
is("a whole sentence is not a cuisine", asCuisine("the sort of thing my grandmother made on Sundays"), "");
is("nothing given is nothing", asCuisine(""), "");

/* ── sorting ── */
const box = [
  { id: "a", title: "Bread", created: 300, prepMinutes: 20, cookMinutes: 40 },
  { id: "b", title: "Ants on a log", created: 100, prepMinutes: 5 },
  { id: "c", title: "Curry", created: 200, time: "1 hour" },
  { id: "d", title: "Dumplings", created: 400 },
];
const ids = (list) => list.map((r) => r.id);

is("newest first is the default", ids(sortRecipes(box, "nonsense")), ["d", "a", "c", "b"]);
is("...and is what DEFAULT_SORT names", ids(sortRecipes(box, DEFAULT_SORT)), ["d", "a", "c", "b"]);
is("oldest first turns it round", ids(sortRecipes(box, "oldest")), ["b", "c", "a", "d"]);
is("A to Z ignores case and reads numbers as numbers", ids(sortRecipes(box, "title")), ["b", "a", "c", "d"]);
/* Bread is 20 + 40 and Curry's written line is an hour: level, so the title
   settles it. Dumplings never said, so it goes last rather than first. */
is("quickest first, and a recipe that never said goes last", ids(sortRecipes(box, "quickest")), ["b", "a", "c", "d"]);
is("most loved, with the unloved at the bottom",
  ids(sortRecipes(box, "loved", { loved: { c: 4, a: 1 } })), ["c", "a", "b", "d"]);
is("most cooked works the same way",
  ids(sortRecipes(box, "cooked", { cooked: { d: 9 } })), ["d", "b", "a", "c"]);
is("a tie falls back to the title, so the order never wobbles",
  ids(sortRecipes(box, "loved", { loved: { a: 2, c: 2 } })), ["a", "c", "b", "d"]);
is("sorting leaves the box it was given alone", ids(box), ["a", "b", "c", "d"]);
is("every sort in the menu is a sort", SORTS.every((s) => isSort(s.id)), true);

/* ── filtering ── */
const f = emptyFilters();
is("an empty panel counts nothing and refuses nothing", [countFilters(f), matchesFilters(box[0], f)], [0, true]);

const tagged = { id: "x", title: "Soup", tags: ["vegetarian", "quick"], course: "soup", cuisine: "Thai", prepMinutes: 10 };
is("tags are AND, not OR", matchesFilters(tagged, { ...f, tags: ["vegetarian", "quick"] }), true);
is("...so one that does not match refuses it", matchesFilters(tagged, { ...f, tags: ["vegetarian", "baked"] }), false);
is("a tag matches whatever the case was", matchesFilters(tagged, { ...f, tags: ["VEGETARIAN"] }), true);
is("course must match", [matchesFilters(tagged, { ...f, course: "soup" }), matchesFilters(tagged, { ...f, course: "dessert" })], [true, false]);
is("cuisine must match, case aside", matchesFilters(tagged, { ...f, cuisine: "thai" }), true);
is("under 15 minutes keeps a 10 minute recipe", matchesFilters(tagged, { ...f, maxMinutes: 15 }), true);
is("...and refuses a longer one", matchesFilters({ prepMinutes: 40 }, { ...f, maxMinutes: 15 }), false);
is("a recipe that never said how long is not 'under 15 minutes'", matchesFilters({ title: "Toast" }, { ...f, maxMinutes: 15 }), false);
is("favorites only asks whoever is asking", [
  matchesFilters(tagged, { ...f, favOnly: true }, (id) => id === "x"),
  matchesFilters(tagged, { ...f, favOnly: true }, () => false),
], [true, false]);
is("the count adds every kind of narrowing",
  countFilters({ tags: ["a", "b"], course: "soup", cuisine: "Thai", maxMinutes: 30, favOnly: true }), 6);

/* ── browsing ── */
const shelf = browseShelf([
  { id: "1", course: "dinner", cuisine: "Italian" },
  { id: "2", course: "dinner", cuisine: "Thai" },
  { id: "3", course: "dinner", cuisine: "Italian" },
  { id: "4", course: "dessert", cuisine: "French" },
  { id: "5" },
]);
is("courses come out in the order a day happens in", shelf.map((s) => s.id), ["dinner", "dessert", ""]);
is("anything without a course still shows, at the bottom", shelf.at(-1).label, "Everything else");
is("each course counts its cuisines, commonest first",
  shelf[0].cuisines, [{ name: "Italian", count: 2 }, { name: "Thai", count: 1 }]);
is("every recipe appears exactly once", shelf.flatMap((s) => s.recipes.map((r) => r.id)).sort(), ["1", "2", "3", "4", "5"]);
is("an empty box browses to an empty shelf", browseShelf([]), []);
is("a cuisine nobody filled in is not counted", cuisineCounts([{ cuisine: "" }, { cuisine: "Thai" }]), [{ name: "Thai", count: 1 }]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
