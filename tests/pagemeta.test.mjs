/**
 * The description and tags a page carries outside its recipe, and that the
 * importer uses them only where the recipe itself said nothing.
 */

import { pageMeta } from "../shared/pagemeta.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── descriptions ── */
is("the link-preview description is preferred",
  pageMeta(`<meta name="description" content="Best plum cake recipe, easy!"><meta property="og:description" content="A soft cake full of plums.">`).description,
  "A soft cake full of plums.");
is("...then the Twitter one",
  pageMeta(`<meta name="description" content="SEO words"><meta name="twitter:description" content="For people.">`).description, "For people.");
is("...then the plain description", pageMeta(`<meta name="description" content="Just this.">`).description, "Just this.");
is("an empty one is skipped for the next",
  pageMeta(`<meta property="og:description" content="  "><meta name="description" content="Fallback.">`).description, "Fallback.");
is("entities are decoded", pageMeta(`<meta property="og:description" content="Mom&#8217;s &amp; mine">`).description, "Mom’s & mine");
is("og:description written as name= still counts", pageMeta(`<meta name="og:description" content="Odd but common.">`).description, "Odd but common.");
is("no description is empty", pageMeta(`<p>nothing</p>`).description, "");

/* ── tags ── */
const post = `<html><head>
<meta property="article:tag" content="Baking">
<script>var t = '<a href="/x" rel="tag">From a script</a>';</script>
</head><body>
<footer class="entry-meta">
  <a href="/tag/cake/" rel="tag">Cake</a>, <a href="/tag/everyday-cakes/" rel="tag">Everyday <em>Cakes</em></a>,
  <a href="/tag/peach/" rel="tag">Peach / Nectarine</a>, <a href="/c/summer/" rel="category tag">Summer</a>,
  <a href="/tag/cake-2/" rel="tag">cake</a>
  <a href="/tag/long/" rel="tag">A tag so long that nobody would ever want it as a filter</a>
  <a href="https://example.com" rel="nofollow">Not a tag</a>
  <a href="/tagged" rel="tags">Not quite a tag</a>
</footer></body></html>`;
is("WordPress tag links become tags, alternatives split, in page order",
  pageMeta(post).tags, ["Cake", "Everyday Cakes", "Peach", "Nectarine", "Summer", "Baking"]);
is("nothing from inside a script is taken", pageMeta(post).tags.includes("From a script"), false);
is("no more than ten",
  pageMeta(Array.from({ length: 14 }, (_, i) => `<a rel="tag" href="/t${i}">tag ${i}</a>`).join("")).tags.length, 10);
is("no tags is an empty list", pageMeta(`<a href="/">Home</a>`).tags, []);
is("empty input is safe", pageMeta(undefined), { description: "", tags: [] });

/* ── and that the importer uses them only to fill gaps ── */
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

const jetpackish = await ask(`<html><head><meta property="og:description" content="A loaf cake full of peaches."></head><body>
<div class="h-recipe" itemscope itemtype="https://schema.org/Recipe"><h3 itemprop="name">Peach Loaf</h3>
<li itemprop="recipeIngredient">3 peaches</li></div>
<a href="/tag/cake/" rel="tag">Cake</a> <a href="/tag/peach/" rel="tag">Peach / Nectarine</a></body></html>`);
is("a recipe with no description takes the page's", jetpackish.data.recipe?.description, "A loaf cake full of peaches.");
is("...and with no keywords takes the post's tags", jetpackish.data.recipe?.keywords, ["Cake", "Peach", "Nectarine"]);

const own = await ask(`<html><head><meta property="og:description" content="The page's blurb."></head><body>
<div itemscope itemtype="https://schema.org/Recipe"><h3 itemprop="name">Own Words</h3>
<p itemprop="description">The recipe's own line.</p><li itemprop="recipeIngredient">1 egg</li></div></body></html>`);
is("a recipe's own description is never replaced", own.data.recipe?.description, "The recipe's own line.");

const ld = await ask(`<html><head><meta property="og:description" content="Blurb.">
<script type="application/ld+json">{"@type":"Recipe","name":"LD","keywords":"quick, weeknight"}</scr` + `ipt></head>
<body><a rel="tag" href="/t">Unrelated</a></body></html>`);
is("ld+json keywords are never replaced", ld.data.recipe?.keywords, "quick, weeknight");
is("...but an ld+json recipe with no description still gets one", ld.data.recipe?.description, "Blurb.");

const bare = await ask(`<html><body><div itemscope itemtype="https://schema.org/Recipe"><h3 itemprop="name">Bare</h3></div></body></html>`);
is("a page with neither adds no empty fields", Object.keys(bare.data.recipe || {}).sort(), ["@type", "name"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
