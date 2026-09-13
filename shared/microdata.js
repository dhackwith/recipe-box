/**
 * Microdata — the other way a page can say "this bit is an ingredient".
 *
 * JSON-LD keeps its description in a tidy block of its own, which is why
 * reading it costs one JSON.parse. Microdata instead hangs the labels on the
 * visible markup: itemscope opens a thing, itemtype says what kind of thing,
 * and itemprop names each part of it. Older blogs and a few legacy recipe
 * plugins publish only this.
 *
 * What comes out is shaped exactly like a JSON-LD Recipe node, so everything
 * downstream — findRecipe's caller, and the whole client-side mapping — cannot
 * tell which of the two a page used.
 *
 * Written by hand rather than with HTMLRewriter, which exists only inside the
 * Workers runtime and would have put this beyond the reach of plain `node
 * tests/`. The parser below is deliberately small and deliberately forgiving:
 * real recipe pages are not well-formed XML and never will be.
 */

/* Elements that never have a closing tag, so the stack must not wait for one. */
export const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/* Tags that close an open sibling of their own kind. "<li>a<li>b" is two list
   items on any real page, and a stack that waits for </li> would nest them. */
const CLOSES_SELF = new Set(["li", "p", "option", "td", "th", "tr", "dd", "dt"]);

/* Where a value lives when the element is not itself a nested thing. A time's
   real value is its datetime, an image's is its src, and a meta carries its
   value in content while showing nothing at all. */
const FROM_ATTR = {
  meta: "content",
  img: "src", audio: "src", video: "src", embed: "src", iframe: "src", source: "src", track: "src",
  a: "href", area: "href", link: "href",
  object: "data",
  data: "value",
  time: "datetime",
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };

export const decode = (s) =>
  String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key[0] === "#") {
      const n = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });

const tidy = (s) => decode(s).replace(/\s+/g, " ").trim();

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function attrs(raw) {
  const out = {};
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(raw))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/* A property seen once is a value; seen again it becomes a list. JSON-LD
   publishes recipeIngredient as an array and a name as a string, and the client
   already copes with either, so matching that is the least surprising thing. */
function addProp(item, name, value) {
  if (value === "" || value == null) return;
  if (!(name in item.props)) { item.props[name] = value; return; }
  if (Array.isArray(item.props[name])) item.props[name].push(value);
  else item.props[name] = [item.props[name], value];
}

/**
 * Every top-level microdata item on the page, each as { type, props }.
 * Nested items appear as the value of whichever property holds them.
 */
export function parseMicrodata(html) {
  const roots = [];
  const open = [];            // { tag, item, prop, text, parent }
  const TAG = /<(\/?)([a-zA-Z][-a-zA-Z0-9:]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;

  let last = 0;
  let m;
  const addText = (chunk) => {
    if (!chunk) return;
    for (const frame of open) if (frame.text !== null) frame.text += chunk;
  };

  while ((m = TAG.exec(html))) {
    addText(html.slice(last, m.index));
    last = TAG.lastIndex;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const rest = m[3] || "";

    /* Nothing inside a script or a style is content; skip to its end so a
       stray "<" in JavaScript cannot derail the stack. */
    if (!closing && (tag === "script" || tag === "style")) {
      const end = html.toLowerCase().indexOf(`</${tag}`, TAG.lastIndex);
      TAG.lastIndex = end < 0 ? html.length : end;
      last = TAG.lastIndex;
      continue;
    }

    if (closing) {
      const at = open.map((f) => f.tag).lastIndexOf(tag);
      if (at >= 0) for (let i = open.length - 1; i >= at; i--) shut(open.pop());
      continue;
    }

    const a = attrs(rest);
    const selfClosing = VOID.has(tag) || /\/\s*$/.test(rest);

    if (CLOSES_SELF.has(tag) && open.length && open[open.length - 1].tag === tag) shut(open.pop());

    const hasScope = "itemscope" in a;
    const prop = a.itemprop ? a.itemprop.trim() : null;
    if (!hasScope && !prop) {
      if (!selfClosing) open.push({ tag, item: null, prop: null, text: null, parent: null });
      continue;
    }

    const parent = [...open].reverse().find((f) => f.item)?.item || null;
    const item = hasScope ? { type: a.itemtype || "", props: {} } : null;

    const frame = {
      tag,
      item,
      prop,
      /* Only collect text when the value has to come from the page itself. */
      text: prop && !item && !FROM_ATTR[tag] ? "" : null,
      parent,
      attrValue: prop && !item ? a[FROM_ATTR[tag]] : undefined,
    };

    if (selfClosing) shut(frame);
    else open.push(frame);
  }
  addText(html.slice(last));
  while (open.length) shut(open.pop());

  function shut(frame) {
    if (!frame || (!frame.prop && !frame.item)) return;
    if (frame.item) {
      /* An itemscope carrying no itemprop is a thing in its own right, even
         when it sits inside another one — which is exactly how a Recipe is
         usually published, tucked within the BlogPosting that wraps it. Filing
         it under its parent, or dropping it for having no parent to file it
         under, loses the recipe on most pages that have one. */
      if (frame.prop && frame.parent) addProp(frame.parent, frame.prop, frame.item);
      else roots.push(frame.item);
      return;
    }
    const raw = frame.attrValue !== undefined ? frame.attrValue : frame.text;
    if (frame.parent) addProp(frame.parent, frame.prop, tidy(raw || ""));
  }

  return roots;
}

const typeIs = (type, want) =>
  String(type || "").split(/\s+/).some((t) => t.replace(/\/$/, "").split("/").pop().toLowerCase() === want);

/* Depth-first, so a Recipe nested inside an Article is still found. */
function firstOfType(items, want, depth = 0) {
  if (depth > 8) return null;
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.props) continue;
    if (typeIs(item.type, want)) return item;
    const nested = Object.values(item.props).flat().filter((v) => v && typeof v === "object");
    const hit = firstOfType(nested, want, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* An item, and anything it holds, rendered the way JSON-LD would have. */
function asNode(item) {
  const node = { "@type": String(item.type || "").split("/").pop() || "Thing" };
  for (const [k, v] of Object.entries(item.props)) {
    const one = (x) => (x && typeof x === "object" && x.props ? asNode(x) : x);
    node[k] = Array.isArray(v) ? v.map(one) : one(v);
  }
  return node;
}

/**
 * The page's Recipe as a JSON-LD-shaped node, or null. Called only when the
 * page published no ld+json at all, so the cost is paid by the pages that
 * would otherwise have failed outright.
 */
export function findMicrodataRecipe(html) {
  const item = firstOfType(parseMicrodata(String(html || "")), "recipe");
  return item ? asNode(item) : null;
}
