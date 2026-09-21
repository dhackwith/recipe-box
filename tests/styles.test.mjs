/**
 * The stylesheet, checked for names used twice for different things.
 *
 * This exists because it has now happened three times. `.rb-actions` was the
 * Edit/Print/Remove bar before a new action bar reused the name and drew rules
 * around both. `.rb-shot` was the photo frame on a recipe tile before made-it
 * photographs reused it, which leaked a 220px max-width onto every tile in the
 * box — so the grid on a phone came out half the width of its column, and the
 * only symptom was that it looked wrong.
 *
 * Nothing about that is visible in a diff: the two rules sit six hundred lines
 * apart, both are correct on their own, and the harm is done by the cascade.
 * So the invariant is checked here instead — a bare class selector, the thing
 * that establishes what an element IS, may be written once and once only.
 * Refinements are still free: pseudo-classes, descendants, and media queries
 * are all a class talking about itself.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* The stylesheet is a template literal, so ${UI} and friends carry braces that
   would wreck any brace counting. They are values, never structure, so they are
   flattened to a placeholder before anything else looks at the text. */
function stylesheet(text) {
  const open = text.indexOf("const css = `");
  if (open < 0) throw new Error("could not find the stylesheet — has RecipeBox.jsx moved on?");
  const from = open + "const css = `".length;
  let end = from;
  while (end < text.length) {
    if (text[end] === "`" && text[end - 1] !== "\\") break;
    end += 1;
  }
  return text.slice(from, end)
    .replace(/\$\{[^{}]*\}/g, "X")
    /* Comments go too. Without this the text of a comment is read as part of
       the selector of whatever follows it, so every rule that is explained —
       which is most of the ones worth checking — becomes invisible here. */
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/* Rules that are not inside an @media (or any other at-rule) block. A class
   restated inside a media query is narrowing itself, which is the point of
   media queries; a class restated at the top level is a second opinion about
   what it is. */
function topLevelRules(css) {
  const rules = [];
  let i = 0;
  let start = 0;
  while (i < css.length) {
    if (css[i] !== "{") { i += 1; continue; }
    const selector = css.slice(start, i).trim();
    /* Walk to the brace that closes this block, whatever nests inside it. An
       at-rule's contents are skipped wholesale rather than descended into: a
       class restated inside @media or @print is narrowing itself, which is the
       entire point of writing one. */
    let depth = 1;
    let j = i + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
      j += 1;
    }
    if (selector && !selector.startsWith("@")) rules.push(selector);
    i = j;
    start = j;
  }
  return rules;
}

/* ".rb-thing" and nothing else — not ".rb-thing:hover", not ".rb-a .rb-b". */
const BARE = /^\.([A-Za-z][A-Za-z0-9_-]*)$/;

function bareClassCounts(text) {
  const counts = new Map();
  for (const rule of topLevelRules(stylesheet(text))) {
    for (const part of rule.split(",")) {
      const m = BARE.exec(part.trim());
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
  }
  return counts;
}

console.log("\n— one name, one meaning —");
const counts = bareClassCounts(src);
const repeated = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
is("no class is defined twice at the top level", repeated, []);
is("and there were classes to check at all", counts.size > 40, true);

/* Proof the check can fail. Without this the test above passes just as happily
   when the parser has quietly stopped finding anything. */
console.log("\n— the check itself works —");
const sabotaged = src.replace("const css = `", "const css = `\n    .rb-tile { color: red; }\n");
is("a class defined a second time is caught", bareClassCounts(sabotaged).get("rb-tile"), 2);
is("...and named", [...bareClassCounts(sabotaged).entries()].filter(([, n]) => n > 1).map(([n2]) => n2), ["rb-tile"]);

/* The two that caused this. */
console.log("\n— the ones that went wrong before —");
is("rb-shot belongs to the recipe tile alone", counts.get("rb-shot"), 1);
is("made-it photos are called something else", counts.get("rb-madeshot"), 1);
is("rb-actions is not reused either", counts.get("rb-actions") ?? 1, 1);

/* Every class the app asks for should exist somewhere in the stylesheet, or it
   is a name that does nothing — the other half of the same mistake. */
console.log("\n— every class named in the app is styled —");
const css = stylesheet(src);
/* Class names reach the markup several ways — a plain string, a template
   literal, a ternary picking between two — so rather than parse JSX, this reads
   every quoted string in the code (the stylesheet itself cut out first, or it
   would simply agree with itself) and takes the rb- names out of them. */
/* Only what is really a className. Scanning every rb- string instead would
   sweep up the localStorage keys — rb-mode, rb-day-log, rb-shopping-list — which
   share the prefix and are not classes at all. */
const used = new Set();
for (const m of src.matchAll(/className=/g)) {
  let i = m.index + "className=".length;
  let value = "";
  if (src[i] === '"') {
    const close = src.indexOf('"', i + 1);
    value = src.slice(i + 1, close);
  } else if (src[i] === "{") {
    /* An expression: a template literal, a ternary, a call. Read to its
       matching brace and take the quoted pieces out of whatever is inside. */
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") depth -= 1;
      j += 1;
    }
    value = src.slice(i + 1, j - 1).replace(/[`"']/g, " ");
  }
  for (const name of value.split(/[\s${}?:]+/)) {
    if (/^rb-[A-Za-z0-9_-]+$/.test(name)) used.add(name);
  }
}
const unstyled = [...used].filter((name) => !css.includes(`.${name}`));
is("no class is asked for that nothing styles", unstyled, []);
is("and there were classes to check", used.size > 20, true);

/* A grid track will not fall below the min-content width of what sits in it,
   and a link pasted into a step is one unbreakable run wide. That set the floor
   for the whole ingredients-and-method column, which then reached past the
   sheet and had every line in it clipped at the right edge — on a phone, in one
   recipe, while every other recipe looked fine. The floor has to be written
   down as zero, in the stylesheet and in the two rows laid out inline. */
console.log("\n— the recipe card's columns can be squeezed —");
const detailCols = [...css.matchAll(/\.rb-detail\s*\{[^}]*grid-template-columns:\s*([^;}]+)/g)].map((m) => m[1].trim());
is("the detail grid says what its columns are, twice", detailCols.length, 2);
is("and neither flexible column keeps its content's width", detailCols.filter((c) => c.replace(/minmax\([^)]*\)/g, "").includes("1fr")), []);
is("the step's text column has a floor of zero", src.includes('gridTemplateColumns: "38px minmax(0, 1fr)"'), true);
is("so does the ingredient's name column", src.includes('gridTemplateColumns: qty ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)"'), true);

/* Pointing at one of their messages opens the reaction bar, and picking a face
   from it used to leave the bar sitting there under the pointer that had just
   used it — the pick had happened, and nothing said so. A message whose bar has
   been used carries .is-hushed, and that rule has to be written AFTER the three
   that open the bar: all four are one class and one refinement deep, so the
   cascade settles it on source order alone, and moving the rule up the
   stylesheet would quietly bring the bug back. */
console.log("\n— the reaction bar closes once it has been used —");
const opensBar = ["@media (hover: hover) { .rb-msg-hold:hover .rb-react-bar", ".rb-msg-hold:focus-within .rb-react-bar", ".rb-msg-wrap.is-open .rb-react-bar"];
const hushAt = css.indexOf(".rb-msg-hold.is-hushed .rb-react-bar");
const hushRule = hushAt < 0 ? "" : css.slice(hushAt, css.indexOf("}", hushAt));
is("a used bar is hushed", hushAt > -1, true);
is("unseen, and out of reach while it is", [hushRule.includes("opacity: 0"), hushRule.includes("pointer-events: none")], [true, true]);
is("and the rules that open it were all found", opensBar.filter((r) => css.includes(r)).length, 3);
is("every one of which it is written after", opensBar.filter((r) => css.indexOf(r) > hushAt), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
