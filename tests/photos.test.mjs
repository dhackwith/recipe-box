/**
 * The photos an import offers to choose from. Mostly about what must not be
 * offered: a recipe page is full of pictures that aren't the recipe.
 */

import { pagePhotos } from "../shared/photos.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* A blog post shaped like the real ones: a featured image with a srcset, a
   lazy-loaded photo with its <noscript> twin, the same photo again at another
   size, and all the furniture around a recipe that must never be offered. */
const base = "https://blog.example.com/2026/08/plum-cake/";
const post = `<html><head>
<meta property="og:image" content="https://cdn.example.com/uploads/2026/08/plum-cake-hero-scaled.jpg?fit=1200%2C800">
<meta name="msapplication-TileImage" content="/icons/tile-144.png">
<script>var x = '<img src="https://elsewhere.example/script-photo.jpg" width="900">';</script>
</head><body>
<header class="site-header"><img src="/brand/big-banner-photo.jpg" width="1600" height="400" alt="Blog"></header>
<main>
<article class="post tag-social category-cakes">
  <header class="entry-header">
    <img class="attachment-full" width="750" height="500" alt="Plum cake on a plate"
      src="https://cdn.example.com/uploads/2026/08/plum-cake-hero-scaled.jpg?fit=750%2C500"
      srcset="https://cdn.example.com/uploads/2026/08/plum-cake-hero-scaled.jpg?w=2560 2560w, https://cdn.example.com/uploads/2026/08/plum-cake-hero-300x200.jpg 300w, https://cdn.example.com/uploads/2026/08/plum-cake-hero-1536x1024.jpg 1536w">
  </header>
  <div class="entry-content">
    <p><img src="/uploads/2026/08/halved-plums.jpg" width="640" height="427" alt="Halved plums"></p>
    <p><img src="data:image/gif;base64,R0lGOD" data-src="/uploads/2026/08/batter-in-pan.jpg" width="640" height="427" alt="Batter in the pan"><noscript><img src="/uploads/2026/08/batter-in-pan.jpg" width="640" height="427"></noscript></p>
    <p><img src="/uploads/2026/08/halved-plums-1024x683.jpg" width="1024" height="683"></p>
    <img src="/uploads/2026/08/pin-it-button.svg" width="400">
    <img src="/uploads/tracking-pixel-image.jpg" width="1" height="1">
    <img src="/uploads/2026/08/site-icon-512.png" width="512" height="512">
    <div class="jp-relatedposts-items"><img src="/uploads/related-apple-cake.jpg" width="1200" height="630"></div>
    <div class="mntl-author-tooltip"><img src="/uploads/writer-portrait.jpg" width="800" height="800"></div>
    <div class="h-recipe"><img class="u-photo" src="/uploads/2026/08/plum-cake-slice.jpg" width="900" height="600" alt="A slice"></div>
  </div>
  <section id="comments"><img src="https://secure.gravatar.com/avatar/abc?s=96" width="96" height="96"></section>
</article>
<article class="card"><img src="/uploads/2026/07/other-recipe-photo.jpg" width="800" height="533"></article>
</main>
<aside class="sidebar"><img src="/uploads/cookbook-cover-photo.jpg" width="1024" height="1024"></aside>
</body></html>`;

const recipe = { image: { "@type": "ImageObject", url: "https://cdn.example.com/uploads/2026/08/plum-cake-slice.jpg" } };
const photos = pagePhotos(post, recipe, base);

is("the recipe's photos, each once, best first", photos.map((p) => p.src), [
  "https://cdn.example.com/uploads/2026/08/plum-cake-slice.jpg",
  "https://cdn.example.com/uploads/2026/08/plum-cake-hero-scaled.jpg?fit=1200%2C800",
  "https://blog.example.com/uploads/2026/08/halved-plums.jpg",
  "https://blog.example.com/uploads/2026/08/batter-in-pan.jpg",
]);
is("a later sighting lends the recipe image its description", photos[0].alt, "A slice");
is("...and the link-preview image a small thumbnail from the header's srcset",
  photos[1].thumb, "https://cdn.example.com/uploads/2026/08/plum-cake-hero-300x200.jpg");
is("a photo with no smaller size is its own thumbnail", photos[2].thumb, photos[2].src);
is("a lazy-loaded photo is read from data-src, not its placeholder", photos[3].alt, "Batter in the pan");

const offered = JSON.stringify(photos);
for (const [what, word] of [
  ["the sidebar", "cookbook-cover"], ["another recipe's card", "other-recipe"], ["comment avatars", "gravatar"],
  ["related posts", "related-apple-cake"], ["the author", "writer-portrait"], ["SVGs", ".svg"], ["tracking pixels", "tracking-pixel"],
  ["icons", "site-icon"], ["the site header", "big-banner"], ["a script", "script-photo"], ["tile icons", "tile-144"],
]) is(`nothing from ${what}`, offered.includes(word), false);

/* ── picking sizes ── */
is("the smallest size that is big enough is kept, the smallest over 240 shown",
  pagePhotos(`<article><img width="750" src="/a-750.jpg" srcset="/cake-photo-300x200.jpg 300w, /cake-photo-1536x1024.jpg 1536w, /cake-photo.jpg 2560w"></article>`, {}, "https://x.test/"),
  [{ src: "https://x.test/cake-photo-1536x1024.jpg", thumb: "https://x.test/cake-photo-300x200.jpg", alt: "" }]);
is("with nothing big enough, the biggest there is",
  pagePhotos(`<article><img srcset="/pie-photo-400.jpg 400w, /pie-photo-800.jpg 800w"></article>`, {}, "https://x.test/")[0].src,
  "https://x.test/pie-photo-800.jpg");
is("a srcset of only small sizes is not a photo",
  pagePhotos(`<article><img srcset="/tiny-thumb-a.jpg 100w, /tiny-thumb-b.jpg 200w"></article>`, {}, "https://x.test/"), []);

/* ── the recipe's own image, in every shape structured data writes it ── */
is("strings, relative addresses and contentUrl all count",
  pagePhotos("", { image: ["/one-photo.jpg", { contentUrl: "https://x.test/two-photo.jpg" }, "https://x.test/three-photo.jpg"] }, "https://x.test/r").map((p) => p.src),
  ["https://x.test/one-photo.jpg", "https://x.test/two-photo.jpg", "https://x.test/three-photo.jpg"]);

/* ── where to look ── */
is("with no article, the page is searched, less its sidebar",
  pagePhotos(`<body><div><img src="/big-dinner-photo.jpg" width="800"></div><aside><img src="/cover-of-book.jpg" width="800"></aside></body>`, {}, "https://x.test/").map((p) => p.src),
  ["https://x.test/big-dinner-photo.jpg"]);
is("wrappers are judged by whole words: img-placeholder and share-hover hide nothing",
  pagePhotos(`<article><div class="img-placeholder"><div class="pin-share-hover sharedaddy"><img src="/real-step-photo.jpg" width="800"></div></div>
    <div class="comments-area"><img src="/commenter-photo.jpg" width="800"></div></article>`, {}, "https://x.test/").map((p) => p.src),
  ["https://x.test/real-step-photo.jpg"]);
is("an icon is judged by whole words: a silicone mat is a photo",
  pagePhotos(`<article><img src="/silicone-mat-baking.jpg" width="800"><img src="/brand-logo-large.png" width="800"></article>`, {}, "https://x.test/").map((p) => p.src),
  ["https://x.test/silicone-mat-baking.jpg"]);
is("generic file names are matched by the whole address, so two stay two",
  pagePhotos(`<article><img src="/a/image.jpg" width="800"><img src="/b/image.jpg" width="800"></article>`, {}, "https://x.test/").length, 2);
is("no more than twelve",
  pagePhotos(`<article>${Array.from({ length: 20 }, (_, i) => `<img src="/step-photo-${i}.jpg" width="800">`).join("")}</article>`, {}, "https://x.test/").length, 12);
is("a relative address with no usable base is skipped",
  pagePhotos(`<article><img src="/rel-photo-name.jpg" width="800"><img src="https://x.test/abs-photo-name.jpg" width="800"></article>`, {}, "not a url").map((p) => p.src),
  ["https://x.test/abs-photo-name.jpg"]);
is("empty input is safe", pagePhotos(undefined, undefined, undefined), []);

/* ── through the real handler ── */
const { onRequest } = await import("../functions/api/fetch-recipe.js");
const ask = async (html, kind) => {
  globalThis.fetch = async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  const res = await onRequest({
    request: new Request("https://thehackwithtable.com/api/fetch-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: base, kind }),
    }),
    env: {},
  });
  return { status: res.status, data: JSON.parse(await res.text()) };
};

const page = await ask(`<html><head><meta property="og:image" content="/uploads/loaf-hero-photo.jpg"></head><body><article>
<div itemscope itemtype="https://schema.org/Recipe"><h3 itemprop="name">Loaf</h3><li itemprop="recipeIngredient">1 egg</li></div>
<img src="/uploads/loaf-sliced-photo.jpg" width="800" alt="Sliced"></article></body></html>`);
is("an import comes back with its photos", page.data.photos?.map((p) => p.src), [
  "https://blog.example.com/uploads/loaf-hero-photo.jpg",
  "https://blog.example.com/uploads/loaf-sliced-photo.jpg",
]);
is("...alongside the recipe, as before", page.data.recipe?.name, "Loaf");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
