/**
 * The three things the roadmap listed as missing from the URL importer —
 * @graph unwrapping, HowToSection flattening and ISO durations — turned out to
 * already work. These hold them to it.
 *
 * The client-side half lives inside RecipeBox.jsx rather than in a module of
 * its own, so it is sliced out of the source and evaluated. That is ugly, and
 * it is still better than the alternative of not checking the part that decides
 * what an imported recipe actually says.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${from} — has RecipeBox.jsx moved on?`);
  return src.slice(a, b);
};

/* fold() lives far from the rest, so it is restated rather than dragged in */
const fold = "const fold = (v) => String(v || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n";
const { isoMinutes, schemaSteps, schemaServings } = await import(
  "data:text/javascript," +
    encodeURIComponent(fold + slice("const htmlToText", "function schemaImage") +
      "\nexport { isoMinutes, schemaSteps, schemaServings };")
);
const { findRecipe } = await import(new URL("../functions/api/fetch-recipe.js", here));

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── @graph, the shape every WordPress recipe plugin publishes ── */
is("@graph is unwrapped", findRecipe({ "@context": "https://schema.org", "@graph": [
  { "@type": "WebSite", name: "A Blog" },
  { "@type": "Person", name: "The Author" },
  { "@type": ["Recipe", "NewsArticle"], name: "Monster Cookies" },
] })?.name, "Monster Cookies");
is("a Recipe at the top still works", findRecipe({ "@type": "Recipe", name: "Plain" })?.name, "Plain");
is("mainEntity nesting works", findRecipe({ "@type": "WebPage", mainEntity: { "@type": "Recipe", name: "Nested" } })?.name, "Nested");
is("a page with no recipe gives nothing", findRecipe({ "@type": "WebSite", name: "x" }), null);

/* ── HowToSection, which sites use to split a recipe into components ── */
const steps = schemaSteps([
  { "@type": "HowToSection", name: "For the cake", itemListElement: [
    { "@type": "HowToStep", text: "Cream the butter and sugar." },
    { "@type": "HowToStep", name: "Fold", text: "Fold the flour through in three goes." },
    { "@type": "HowToStep", name: "Rest the batter", text: "Leave it on the side for twenty minutes." },
  ] },
  { "@type": "HowToSection", name: "For the icing", itemListElement: [
    { "@type": "HowToStep", text: "Beat until it holds a peak." },
  ] },
]);
is("every step comes out of its sections", steps.length, 4);
is("...in order", steps.map((s) => (typeof s === "string" ? s : s.text))[0], "Cream the butter and sugar.");
is("a name that adds something becomes a title", steps[2].title, "Rest the batter");
is("...but a name that only repeats the text does not", typeof steps[1], "string");
is("plain strings still work", schemaSteps(["One.", "Two."]).length, 2);
is("a single blob is split into lines", schemaSteps("First do this.\nThen do that.").length, 2);

/* ── ISO 8601 durations ── */
is("PT45M", isoMinutes("PT45M"), 45);
is("PT1H30M", isoMinutes("PT1H30M"), 90);
is("PT2H", isoMinutes("PT2H"), 120);
is("P1DT2H", isoMinutes("P1DT2H"), 1560);
is("PT90S rounds to the nearest minute", isoMinutes("PT90S"), 2);
is("a plain sentence is not a duration", isoMinutes("about an hour"), null);
is("nothing is not a duration", isoMinutes(""), null);

/* ── yields ── */
is("a bare number becomes Serves N", schemaServings("6"), "Serves 6");
is("a phrase is kept as written", schemaServings("12 cookies"), "12 cookies");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
