/**
 * Headings inside a recipe: reading them out of the form, showing them above
 * the right lines, and never disturbing the positions everything else counts on.
 */

import { asSections, bySection, parseSections, sectionLines, remapSections, hasSections, NAME_MAX } from "../shared/sections.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── what was stored, checked ── */
is("a heading past the end of the list is dropped", asSections([{ at: 9, name: "Sauce" }], 3), []);
is("...and so is one with no name", asSections([{ at: 0, name: "  " }], 3), []);
is("...and a fractional or negative position", asSections([{ at: 1.5, name: "a" }, { at: -1, name: "b" }], 3), []);
is("two headings on the same line keep the first", asSections([{ at: 1, name: "Sauce" }, { at: 1, name: "Crumb" }], 3), [{ at: 1, name: "Sauce" }]);
is("they come back in order", asSections([{ at: 2, name: "B" }, { at: 0, name: "A" }], 3), [{ at: 0, name: "A" }, { at: 2, name: "B" }]);
is("nothing stored is no headings", asSections(undefined, 3), []);
is("headings on an empty list are no headings", asSections([{ at: 0, name: "A" }], 0), []);
is("a name is squeezed to one line", asSections([{ at: 0, name: " For  the\nsauce " }], 2), [{ at: 0, name: "For the sauce" }]);
is("a very long name is cut", asSections([{ at: 0, name: "x".repeat(200) }], 2)[0].name.length, NAME_MAX);
is("hasSections says when there is something to show", [hasSections([]), hasSections([{ at: 0, name: "A" }])], [false, true]);

/* ── cutting a list into runs ── */
const ing = ["225 g flour", "1 tsp salt", "2 eggs", "60 ml milk"];
is("a list with no headings is one unnamed run",
  bySection(ing, []),
  [{ name: "", at: 0, items: [{ value: "225 g flour", index: 0 }, { value: "1 tsp salt", index: 1 }, { value: "2 eggs", index: 2 }, { value: "60 ml milk", index: 3 }] }]);

const cut = bySection(ing, [{ at: 0, name: "Dough" }, { at: 2, name: "Wash" }]);
is("a heading at 0 names the whole first run", cut.map((r) => r.name), ["Dough", "Wash"]);
is("the items keep their real positions", cut.map((r) => r.items.map((i) => i.index)), [[0, 1], [2, 3]]);

const lead = bySection(ing, [{ at: 2, name: "Wash" }]);
is("lines before the first heading are an unnamed run", lead.map((r) => r.name), ["", "Wash"]);
is("...holding the lines that came first", lead[0].items.map((i) => i.value), ["225 g flour", "1 tsp salt"]);
is("an empty list has no runs at all", bySection([], [{ at: 0, name: "A" }]), []);

/* ── the form: lines in ── */
const typed = parseSections(["# Dough", "225 g flour", "1 tsp salt", "## Wash", "2 eggs", "60 ml milk"]);
is("a heading line becomes a heading, not an ingredient", typed.items, ing);
is("...above the line that follows it", typed.sections, [{ at: 0, name: "Dough" }, { at: 2, name: "Wash" }]);
is("a string is split on newlines for you", parseSections("# A\nflour").items, ["flour"]);
is("blank lines are ignored", parseSections(["", "flour", "   ", "salt"]).items, ["flour", "salt"]);
is("a heading with nothing under it labels nothing, so it is dropped",
  parseSections(["flour", "# Sauce"]), { items: ["flour"], sections: [] });
is("two headings in a row: the one the reader would see wins",
  parseSections(["# First", "# Second", "flour"]).sections, [{ at: 0, name: "Second" }]);
is("a bare # with no words is not a heading", parseSections(["#", "flour"]).items, ["flour"]);
is("a step that merely mentions a number is untouched",
  parseSections(["Heat the pan to #3 on the dial"]).items, ["Heat the pan to #3 on the dial"]);

/* ── the form: lines back out ── */
is("editing gives back what was typed",
  sectionLines(ing, [{ at: 0, name: "Dough" }, { at: 2, name: "Wash" }]),
  ["# Dough", "225 g flour", "1 tsp salt", "# Wash", "2 eggs", "60 ml milk"]);
is("a recipe with no headings reads back as a plain list", sectionLines(ing, []), ing);

const roundTrip = parseSections(sectionLines(ing, [{ at: 2, name: "Wash" }]));
is("a round trip through the form changes nothing", roundTrip, { items: ing, sections: [{ at: 2, name: "Wash" }] });

const steps = [{ title: "Mix", text: "Whisk it." }, { title: "", text: "Rest an hour." }];
is("a step is flattened by whatever the caller hands in",
  sectionLines(steps, [{ at: 1, name: "Later" }], (s) => (s.title ? `${s.title}: ${s.text}` : s.text)),
  ["Mix: Whisk it.", "# Later", "Rest an hour."]);

/* ── when lines move ── */
is("a heading follows its line up the list when one above it goes",
  remapSections([{ at: 2, name: "Wash" }], 3, (at) => at - 1), [{ at: 1, name: "Wash" }]);
is("a heading whose line was the last of the recipe goes with it",
  remapSections([{ at: 3, name: "Wash" }], 3, () => 3), []);
is("a heading that no longer points anywhere is dropped",
  remapSections([{ at: 1, name: "Wash" }], 2, () => null), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
