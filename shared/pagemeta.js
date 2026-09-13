/**
 * What a page says about itself outside its recipe: the description it offers
 * for link previews, and the tags its blog post was filed under.
 *
 * Smitten Kitchen, like a lot of blogs, puts neither inside the recipe block,
 * so an import came back with no description and no tags even though the page
 * plainly has both. They only ever fill a gap: whatever the recipe itself
 * published always wins.
 */

import { elements, linesOf } from "./hrecipe.js";

/* In order of preference. The link-preview blurb is written for people; the
   plain description tag is more often written for search engines. */
const DESCRIPTIONS = ["og:description", "twitter:description", "description"];

const MAX_TAG = 30;
const MAX_TAGS = 10;

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** { description, tags } from the page around a recipe; either may be empty. */
export function pageMeta(html) {
  const { src, all } = elements(html);
  const metas = all.filter((el) => el.tag === "meta");
  const keyOf = (el) => (el.attrs.property || el.attrs.name || "").toLowerCase();

  const description = DESCRIPTIONS
    .map((key) => tidy(metas.find((el) => keyOf(el) === key)?.attrs.content))
    .find(Boolean) || "";

  /* rel="tag" is how WordPress marks a post's own tags, and "category tag" its
     categories. A tag written as alternatives, "Peach / Nectarine", becomes
     two: a filter is one thing, and the importer drops any tag longer than two
     words, which would lose both. */
  const labels = [
    ...all
      .filter((el) => el.tag === "a" && /(^|\s)tag(\s|$)/i.test(el.attrs.rel || ""))
      .map((el) => linesOf(src.slice(el.start, el.end)).join(" ")),
    ...metas.filter((el) => keyOf(el) === "article:tag").map((el) => el.attrs.content),
  ];

  const seen = new Set();
  const tags = [];
  for (const label of labels) {
    for (const part of String(label ?? "").split("/")) {
      const tag = tidy(part);
      const key = tag.toLowerCase();
      if (!tag || tag.length > MAX_TAG || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return { description, tags: tags.slice(0, MAX_TAGS) };
}
