/**
 * How notes are arranged into threads on a recipe page. The thread logic lives
 * inside RecipeBox.jsx, so it is sliced out and evaluated, the same way the
 * importer's client half is tested.
 */

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/RecipeBox.jsx", import.meta.url), "utf8");
const from = src.indexOf("const REPLY_INDENTS");
const to = src.indexOf("const NOTES_API", from);
if (from < 0 || to < 0) throw new Error("could not find threadNotes — has RecipeBox.jsx moved on?");
const { threadNotes, REPLY_INDENTS } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(from, to) + "\nexport { threadNotes, REPLY_INDENTS };")
);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const ids = (list) => list.map((e) => e.id);
const childIds = (kids, id) => ids(kids.get(id) || []);

{
  const { roots, kids } = threadNotes([{ id: "a" }, { id: "b", parent: null }, { id: "c" }]);
  is("notes with no parent are all at the top, in order", ids(roots), ["a", "b", "c"]);
  is("...and nothing hangs from them", kids.size, 0);
}

{
  const { roots, kids } = threadNotes([
    { id: "q" },
    { id: "other" },
    { id: "r1", parent: "q" },
    { id: "r2", parent: "q" },
    { id: "r1a", parent: "r1" },
  ]);
  is("replies are not at the top", ids(roots), ["q", "other"]);
  is("replies hang under what they answer, in the order written", childIds(kids, "q"), ["r1", "r2"]);
  is("a reply to a reply nests under that reply", childIds(kids, "r1"), ["r1a"]);
  is("an entry nobody answered has no replies", childIds(kids, "other"), []);
}

{
  const { roots } = threadNotes([{ id: "lost", parent: "note:gone" }, { id: "self", parent: "self" }]);
  is("a reply whose parent isn't in the list is shown at the top rather than lost", ids(roots), ["lost", "self"]);
}

{
  const { roots, kids } = threadNotes([{ id: "p", deleted: true }, { id: "r", parent: "p" }]);
  is("a placeholder still holds its replies", [ids(roots), childIds(kids, "p")], [["p"], ["r"]]);
}

is("the indent stops after a few levels, not one and not many", REPLY_INDENTS >= 2 && REPLY_INDENTS <= 4, true);
is("empty is fine", ids(threadNotes([]).roots), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
