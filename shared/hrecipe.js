/**
 * h-recipe — the third way a page can say "this bit is an ingredient".
 *
 * Microformats hang their labels on class names rather than attributes: an
 * element classed h-recipe (hrecipe, in the older spelling) holds the recipe,
 * and p-name, p-ingredient, e-instructions and friends name its parts.
 *
 * It matters because of WordPress.com's Jetpack recipe block, which Smitten
 * Kitchen and a great many other blogs use. Jetpack labels the name, yield,
 * time and ingredients with microdata as well, but its directions and notes
 * carry only classes — so a microdata-only read brought every ingredient home
 * and not one step. Jetpack's own class names are read alongside the
 * microformat ones, so its notes, which no standard names, come too.
 *
 * What comes out is shaped like a JSON-LD Recipe node, the same as
 * microdata.js, so the endpoint can use it to fill whatever microdata left
 * empty and nothing downstream can tell where a field came from.
 */

import { attrs, decode, VOID } from "./microdata.js";

const ROOT = ["h-recipe", "hrecipe"];
const NAME = ["p-name", "fn", "jetpack-recipe-title"];
const AUTHOR = ["p-author", "author"];
const SUMMARY = ["p-summary", "summary"];
const YIELD = ["p-yield", "yield", "jetpack-recipe-servings"];
const DURATION = ["dt-duration", "duration", "jetpack-recipe-time"];
const PHOTO = ["u-photo", "photo", "jetpack-recipe-image"];
const INGREDIENT = ["p-ingredient", "ingredient", "jetpack-recipe-ingredient"];
const INSTRUCTIONS = ["e-instructions", "instructions", "jetpack-recipe-directions"];
const NOTES = ["jetpack-recipe-notes"];

/* Block-level tags. One of these opening inside a <p> ends the paragraph, as
   it does in a browser, and Jetpack's markup relies on that: it wraps each
   section as <p><div>…</div></p> and scatters stray </p> tags through the
   directions. Taken literally, the first of those would close the <p> outside
   the directions and end them after a single paragraph. */
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre",
  "section", "table", "ul",
]);

/* Where one line of text ends and the next begins. */
const BREAK = /<\s*\/?\s*(?:br|p|li|div|h[1-6]|ul|ol|dl|dt|dd|tr|section|article|blockquote|pre)\b[^>]*>/gi;
const TAGS = /<[^>]*>/g;

const tidy = (s) => decode(s).replace(/\s+/g, " ").trim();
const textOf = (fragment) => tidy(fragment.replace(BREAK, " ").replace(TAGS, ""));
export const linesOf = (fragment) =>
  fragment.replace(/\s+/g, " ").replace(BREAK, "\n").split("\n").map((s) => tidy(s.replace(TAGS, ""))).filter(Boolean);

/**
 * Every element on the page, in document order, each knowing its parent and
 * where its contents start and end in the returned source.
 */
export function elements(html) {
  /* Comments and scripts are never content, and a class name quoted inside
     one must not be mistaken for the real thing. */
  const src = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  const TAG = /<(\/?)([a-zA-Z][-a-zA-Z0-9:]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
  const all = [];
  const open = [];
  const unwind = (depth, at) => { while (open.length > depth) open.pop().end = at; };

  let m;
  while ((m = TAG.exec(src))) {
    const tag = m[2].toLowerCase();
    const names = open.map((el) => el.tag);

    if (m[1]) {
      const at = names.lastIndexOf(tag);
      if (at >= 0) unwind(at, m.index);    // a close tag with nothing to close is ignored
      continue;
    }

    if (BLOCK.has(tag)) {
      const p = names.lastIndexOf("p");
      if (p >= 0) unwind(p, m.index);
    }
    /* "<li>a<li>b" is two items, but only within the same list. */
    if (tag === "li") {
      const li = names.lastIndexOf("li");
      if (li > Math.max(names.lastIndexOf("ul"), names.lastIndexOf("ol"))) unwind(li, m.index);
    }

    const a = attrs(m[3] || "");
    const el = {
      tag,
      attrs: a,
      classes: new Set((a.class || "").split(/\s+/).filter(Boolean)),
      parent: open[open.length - 1] || null,
      start: TAG.lastIndex,
      end: src.length,
    };
    all.push(el);
    if (VOID.has(tag) || /\/\s*$/.test(m[3] || "")) el.end = el.start;
    else open.push(el);
  }
  return { src, all };
}

const has = (el, names) => names.some((n) => el.classes.has(n));

function inside(el, ancestor) {
  for (let p = el.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/* Whether anything between el and stop carries one of these classes. */
function under(el, names, stop) {
  for (let p = el.parent; p && p !== stop; p = p.parent) if (has(p, names)) return true;
  return false;
}

/**
 * The page's h-recipe as a JSON-LD-shaped node, or null. Only the first
 * recipe on the page is read, and only what sits inside it — a sidebar of
 * popular posts has names and ingredients of its own.
 */
export function findHRecipe(html) {
  const { src, all } = elements(html);
  const root = all.find((el) => has(el, ROOT));
  if (!root) return null;

  const within = all.filter((el) => inside(el, root));
  const inner = (el) => src.slice(el.start, el.end);
  /* Every element with one of these classes, less any nested inside another
     of them (or inside something listed in skip), so nothing is read twice. */
  const every = (names, skip = []) => within.filter((el) => has(el, names) && !under(el, [...names, ...skip], root));

  const node = { "@type": "Recipe" };
  const set = (key, value) => {
    if (value && (!Array.isArray(value) || value.length)) node[key] = value;
  };

  /* An author's h-card has a p-name of its own, which is not the recipe's. */
  const name = every(NAME, AUTHOR)[0];
  set("name", name && textOf(inner(name)));

  const author = every(AUTHOR)[0];
  const by = author && textOf(inner(author));
  if (by) node.author = { "@type": "Person", name: by };

  const summary = every(SUMMARY)[0];
  set("description", summary && textOf(inner(summary)));

  const yieldEl = every(YIELD)[0];
  set("recipeYield", yieldEl && textOf(inner(yieldEl)));

  /* A duration's datetime is the tidy ISO value when it is one; Jetpack puts
     words there instead, so then the visible text is as good as anything. */
  const duration = every(DURATION)[0];
  if (duration) {
    const iso = [duration, ...within.filter((el) => inside(el, duration))]
      .find((el) => el.tag === "time" && /^P/i.test(el.attrs.datetime || ""));
    set("totalTime", iso ? iso.attrs.datetime : textOf(inner(duration)));
  }

  const photo = every(PHOTO)[0];
  if (photo) {
    const img = photo.tag === "img" ? photo : within.find((el) => el.tag === "img" && inside(el, photo));
    set("image", img?.attrs.src);
  }

  set("recipeIngredient", every(INGREDIENT).map((el) => textOf(inner(el))).filter(Boolean));
  set("recipeInstructions", every(INSTRUCTIONS).flatMap((el) => linesOf(inner(el))));
  set("notes", every(NOTES).flatMap((el) => linesOf(inner(el))).join("\n"));

  return node.name || node.recipeIngredient || node.recipeInstructions ? node : null;
}
