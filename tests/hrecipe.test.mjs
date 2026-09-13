/**
 * h-recipe pages, and in particular the Jetpack recipe block, whose markup is
 * copied here in shape (not in words) from a real Smitten Kitchen page: stray
 * </p> tags through the directions, <div>s wrapped in <p>s, subheadings loose
 * inside the ingredient list, and microdata on everything but the steps.
 */

import { findHRecipe } from "../shared/hrecipe.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const jetpack = `<!doctype html><html><head>
<script>var tpl = '<div class="hrecipe"><li class="ingredient">script junk</li></div>';</script>
</head><body>
<aside class="sidebar"><h3 class="p-name">Popular posts</h3><ul><li class="ingredient">sidebar decoy</li></ul></aside>
<div class="entry-content"><p>A long story about plums.</p>
<!-- <div class="hrecipe"><h3 class="fn">Commented out</h3></div> -->
<div class="hrecipe h-recipe jetpack-recipe" itemscope itemtype="https://schema.org/Recipe"><h3 class="p-name jetpack-recipe-title fn" itemprop="name">Plum Buckle</h3><ul class="jetpack-recipe-meta"><li class="jetpack-recipe-servings p-yield yield" itemprop="recipeYield"><strong>Servings: </strong>9 squares</li><li class="jetpack-recipe-time">
<time itemprop="totalTime" datetime="1 hour, give or take"><strong>Time:</strong> <span class="time">1 hour, give or take</span></time>
</li><li class="jetpack-recipe-print"><a href="#">Print</a></li></ul><div class="jetpack-recipe-content"></p>
<p><div class="jetpack-recipe-notes">Note: A 9-inch square pan is best &#8212; a smaller one overflows.</div></p>
<p><div class="jetpack-recipe-ingredients"><ul>
<h5>Cake</h5><li class="jetpack-recipe-ingredient p-ingredient ingredient" itemprop="recipeIngredient">1 cup (130 grams) flour</li><li class="jetpack-recipe-ingredient p-ingredient ingredient" itemprop="recipeIngredient">2 eggs</li>
<h5>Topping</h5><li class="jetpack-recipe-ingredient p-ingredient ingredient" itemprop="recipeIngredient">3 plums, sliced</li></ul></div></p>
<p><div class="jetpack-recipe-directions e-instructions">Heat oven to 350°F. Butter the pan.</p>
<p><strong>Make the batter:</strong> Whisk the flour and eggs until smooth.</p>
<p><strong>Finish:</strong> Top with plums and bake for 45 minutes. Let it cool before cutting &#8212; it sets as it cools.</p>
<p></div></p>
<p></div></div>
<p>Comments and more prose.</p><div class="instructions">decoy after the recipe</div>
</div></body></html>`;

const r = findHRecipe(jetpack);

is("a Jetpack recipe is found", !!r, true);
is("...typed as a Recipe", r["@type"], "Recipe");
is("its own name, not the sidebar's or a commented-out one", r.name, "Plum Buckle");
is("every ingredient, and only the ingredients", r.recipeIngredient,
  ["1 cup (130 grams) flour", "2 eggs", "3 plums, sliced"]);
is("nothing from inside a script leaks in", JSON.stringify(r).includes("script junk"), false);

is("the stray </p> tags do not end the directions early", r.recipeInstructions.length, 3);
is("...the first step is the text before any <p>", r.recipeInstructions[0], "Heat oven to 350°F. Butter the pan.");
is("...a bold lead-in stays in front of its step, ready to be a title",
  r.recipeInstructions[1], "Make the batter: Whisk the flour and eggs until smooth.");
is("...entities are decoded", r.recipeInstructions[2],
  "Finish: Top with plums and bake for 45 minutes. Let it cool before cutting — it sets as it cools.");
is("...and nothing after the recipe is taken for a step",
  r.recipeInstructions.some((s) => s.includes("decoy")), false);

is("Jetpack's note is read", r.notes, "Note: A 9-inch square pan is best — a smaller one overflows.");
is("the yield keeps its words (the client drops the label)", r.recipeYield, "Servings: 9 squares");
is("a datetime that is not ISO falls back to the visible text", r.totalTime, "Time: 1 hour, give or take");

/* ── microformats2, as an IndieWeb blog publishes it ── */
const mf2 = findHRecipe(`<article class="h-recipe">
  <span class="p-author h-card"><span class="p-name">Ann</span></span>
  <h1 class="p-name">Green Soup</h1>
  <p class="p-summary">Quick and <em>very</em> green.</p>
  <time class="dt-duration" datetime="PT40M">40 min</time>
  <img class="u-photo" src="/soup.jpg" alt="">
  <ul><li class="p-ingredient">1 litre water<li class="p-ingredient">spinach</ul>
  <ol class="e-instructions"><li>Boil the water.<li>Wilt the spinach, then blend.</ol>
</article>`);
is("mf2: the author's p-name is not the recipe's name", mf2.name, "Green Soup");
is("mf2: the author is read", mf2.author, { "@type": "Person", name: "Ann" });
is("mf2: the summary becomes the description, inline tags stripped", mf2.description, "Quick and very green.");
is("mf2: an ISO datetime wins over the words", mf2.totalTime, "PT40M");
is("mf2: the photo comes from src", mf2.image, "/soup.jpg");
is("mf2: unclosed list items stay separate", mf2.recipeIngredient, ["1 litre water", "spinach"]);
is("mf2: each list item is a step", mf2.recipeInstructions, ["Boil the water.", "Wilt the spinach, then blend."]);

/* ── the shapes that break naive readers ── */
is("class names match whole words only",
  findHRecipe(`<div class="h-recipe"><h1 class="p-name-wrapper">No</h1><h2 class="p-name">Yes</h2></div>`).name, "Yes");
is("an ingredient nested in another is counted once",
  findHRecipe(`<div class="hrecipe"><ul><li class="ingredient"><span class="p-ingredient">salt</span></li></ul></div>`).recipeIngredient,
  ["salt"]);
is("divs nested inside the directions do not end them",
  findHRecipe(`<div class="h-recipe"><div class="e-instructions"><div class="step">One.</div><div class="step">Two.</div></div><p>Not a step.</p></div>`).recipeInstructions,
  ["One.", "Two."]);
is("a <br> splits steps too",
  findHRecipe(`<div class="h-recipe"><p class="e-instructions">Stir.<br>Taste.<br/>Serve.</p></div>`).recipeInstructions,
  ["Stir.", "Taste.", "Serve."]);

/* ── pages that should yield nothing ── */
is("a page with no h-recipe gives null", findHRecipe(`<div class="p-name">Loose</div>`), null);
is("an empty h-recipe gives null", findHRecipe(`<div class="h-recipe"><p>Nothing labelled</p></div>`), null);
is("empty input is safe", findHRecipe(""), null);
is("undefined input is safe", findHRecipe(undefined), null);

/* ── and that the importer actually reaches for it ──
   Driven through the real handler with the network stubbed out. */
const { onRequest } = await import("../functions/api/fetch-recipe.js");
const ask = async (html) => {
  globalThis.fetch = async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  const res = await onRequest({
    request: new Request("https://thehackwithtable.com/api/fetch-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/a-recipe" }),
    }),
    env: {},
  });
  return { status: res.status, data: JSON.parse(await res.text()) };
};

const jp = await ask(jetpack);
is("a Jetpack page imports", jp.status, 200);
is("...with the ingredients microdata found", [].concat(jp.data.recipe?.recipeIngredient || []).length, 3);
is("...and the steps only the classes had", (jp.data.recipe?.recipeInstructions || []).length, 3);
is("...and the note", /9-inch square pan/.test(jp.data.recipe?.notes || ""), true);

const both = await ask(`<html><body><div class="h-recipe" itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">From microdata</h1><h2 class="p-name">From classes</h2>
  <div class="e-instructions"><p>Stir.</p></div></div></body></html>`);
is("microdata's own values are not overwritten", both.data.recipe?.name, "From microdata");
is("...but its gaps are filled", both.data.recipe?.recipeInstructions, ["Stir."]);

const classesOnly = await ask(`<html><body><div class="hrecipe"><h1 class="fn">Classes Only</h1>
  <ul><li class="ingredient">1 lemon</li></ul></div></body></html>`);
is("a page with only h-recipe imports", classesOnly.status, 200);
is("...with its name", classesOnly.data.recipe?.name, "Classes Only");

const ld = await ask(`<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Prefers JSON-LD"}</scr` +
  `ipt></head><body><div class="h-recipe"><h1 class="p-name">Should Not Win</h1>
  <div class="e-instructions"><p>Should not be added.</p></div></div></body></html>`);
is("ld+json still wins outright when a page has it", ld.data.recipe?.name, "Prefers JSON-LD");
is("...and is not mixed with the classes", ld.data.recipe?.recipeInstructions, undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
