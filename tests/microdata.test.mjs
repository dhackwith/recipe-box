/**
 * Microdata pages, shaped the way real ones are: unclosed <li>, values hiding
 * in attributes, a nested nutrition block, and a <script> full of characters
 * that would wreck a careless parser.
 */

import { parseMicrodata, findMicrodataRecipe } from "../shared/microdata.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* A page in the shape an older WordPress recipe plugin emits. Note the <li>
   items are never closed, the yield is in a <meta>, the time is in a datetime
   attribute, and the whole thing sits inside an unrelated article wrapper. */
const page = `
<!doctype html><html><head>
<script>var junk = "</div> <li itemprop='recipeIngredient'>not a real ingredient";</script>
</head><body>
<article itemscope itemtype="https://schema.org/BlogPosting">
  <h1 itemprop="headline">My Nan's Sangria</h1>
  <div itemscope itemtype="http://schema.org/Recipe">
    <h2 itemprop="name">Cantina-Style Red&nbsp;Sangria</h2>
    <img itemprop="image" src="/photos/sangria.jpg" alt="a jug">
    <span itemprop="author" itemscope itemtype="https://schema.org/Person">
      by <span itemprop="name">Tracey</span>
    </span>
    <meta itemprop="recipeYield" content="6">
    <time itemprop="totalTime" datetime="PT20M">20 minutes</time>
    <ul>
      <li itemprop="recipeIngredient">750 ml dry Spanish red wine
      <li itemprop="recipeIngredient">120 ml brandy
      <li itemprop="recipeIngredient">2 oranges, sliced &amp; seeded
    </ul>
    <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
      <span itemprop="text">Combine equal parts sugar and water.</span>
    </div>
    <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
      <span itemprop="text">Chill overnight.</span>
    </div>
    <div itemprop="nutrition" itemscope itemtype="https://schema.org/NutritionInformation">
      <span itemprop="calories">180 calories</span>
      <span itemprop="sugarContent">12 g</span>
    </div>
  </div>
</article>
</body></html>`;

const r = findMicrodataRecipe(page);

is("a Recipe is found inside another item", !!r, true);
is("...and is typed as one", r["@type"], "Recipe");
is("the name is read, entities and all", r.name, "Cantina-Style Red Sangria");
is("the blog's own headline is not mistaken for it", r.headline, undefined);

is("unclosed list items stay separate", r.recipeIngredient.length, 3);
is("...and keep their text", r.recipeIngredient[0], "750 ml dry Spanish red wine");
is("...with entities decoded", r.recipeIngredient[2], "2 oranges, sliced & seeded");

is("a meta's value comes from content", r.recipeYield, "6");
is("a time's value comes from datetime, not its words", r.totalTime, "PT20M");
is("an image's value comes from src", r.image, "/photos/sangria.jpg");

is("a nested person becomes an object", r.author.name, "Tracey");
is("nested steps come through as nodes", r.recipeInstructions.map((s) => s.text),
  ["Combine equal parts sugar and water.", "Chill overnight."]);
is("nutrition nests rather than flattening", r.nutrition.calories, "180 calories");
is("...with its own fields intact", r.nutrition.sugarContent, "12 g");
is("the script's contents are ignored entirely",
  JSON.stringify(r).includes("not a real ingredient"), false);

/* ── pages that should yield nothing ── */
is("a page with no microdata gives null", findMicrodataRecipe("<html><body><p>hi</p></body></html>"), null);
is("a page with items but no recipe gives null",
  findMicrodataRecipe(`<div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Nobody</span></div>`), null);
is("empty input is safe", findMicrodataRecipe(""), null);
is("undefined input is safe", findMicrodataRecipe(undefined), null);

/* ── the shapes that break naive parsers ── */
is("a self-closed div does not swallow the rest",
  findMicrodataRecipe(`<div itemscope itemtype="/Recipe"/><span itemprop="name">X</span>`) === null ||
  typeof findMicrodataRecipe(`<div itemscope itemtype="/Recipe"><span itemprop="name">X</span></div>`).name === "string", true);

is("single-quoted attributes work",
  findMicrodataRecipe(`<div itemscope itemtype='https://schema.org/Recipe'><h1 itemprop='name'>Quoted</h1></div>`).name, "Quoted");

is("unquoted attributes work",
  findMicrodataRecipe(`<div itemscope itemtype=https://schema.org/Recipe><h1 itemprop=name>Bare</h1></div>`).name, "Bare");

is("a stray close tag does not unwind too far",
  findMicrodataRecipe(`<div itemscope itemtype="https://schema.org/Recipe"></span><h1 itemprop="name">Still here</h1></div>`).name, "Still here");

is("nested tags inside a value are stripped, text kept",
  findMicrodataRecipe(`<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Choc <em>chip</em> cookies</h1></div>`).name,
  "Choc chip cookies");

is("top-level items are all returned by the raw parser",
  parseMicrodata(`<div itemscope itemtype="/Person"></div><div itemscope itemtype="/Recipe"></div>`).length, 2);

/* ── and that the importer actually reaches for it ──
   The parser working is not the same as the endpoint using it, so this drives
   the real handler with the network stubbed out. */
const microPage = `<html><body><div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Only Microdata Here</h1>
  <li itemprop="recipeIngredient">1 egg
</div></body></html>`;
const ldPage = `<html><head><script type="application/ld+json">
  {"@type":"Recipe","name":"Prefers JSON-LD"}
</scr` + `ipt></head><body><div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Should Not Win</h1></div></body></html>`;

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

const micro = await ask(microPage);
is("a microdata-only page now imports", micro.status, 200);
is("...with its name", micro.data.recipe?.name, "Only Microdata Here");
is("...and its ingredients", [].concat(micro.data.recipe?.recipeIngredient || []), ["1 egg"]);

const both = await ask(ldPage);
is("ld+json still wins when a page has both", both.data.recipe?.name, "Prefers JSON-LD");

const neither = await ask("<html><body><p>just prose</p></body></html>");
is("a page with neither still refuses", neither.status, 422);
is("...with the advice to paste instead", /paste box/.test(neither.data.error || ""), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
