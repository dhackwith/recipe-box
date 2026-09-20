/**
 * Headings inside a recipe's ingredients and its method.
 *
 * "For the sauce", "For the crumb" — the thing almost every recipe with more
 * than one component needs, and the one shape the box had no room for. A
 * recipe that came in with subheadings used to arrive as one flat list.
 *
 * WHY THEY SIT BESIDE THE LIST RATHER THAN IN IT
 * An ingredient is a string and a step is a string or an object, and the rest
 * of the site addresses both BY POSITION: a tick on an ingredient, a done mark
 * on a step, a running timer, the photos under a step. Folding a heading into
 * the list as a thirteenth ingredient would shift every one of those indexes by
 * one and quietly move somebody's ticks onto the wrong lines. So a heading is
 * kept separately, as the index of the first item that falls under it:
 *
 *   ingredients: ["225 g flour", "1 tsp salt", "2 eggs", "60 ml milk"]
 *   ingredientSections: [{ at: 0, name: "Dough" }, { at: 2, name: "Wash" }]
 *
 * Nothing else in the site has to know they exist. The shopping list still
 * walks the ingredients, the scaler still scales them, a step photo still
 * belongs to step 3. Drop these two fields and the recipe still reads.
 *
 * `at: 0` is a heading above the whole list, which is what a recipe that names
 * every one of its parts looks like. A heading with nothing under it is not
 * kept — there would be nothing to show it above.
 */

/* What the form types to start a section: a markdown heading on its own line.
   The space after the hashes is required, exactly as markdown requires it, so
   a step that opens "#3 on the dial" stays a step. */
const HEADING = /^(#{1,6})(?:[ \t]+(.*))?$/;

/* A heading is a label, not a paragraph. Long enough for "For the topping",
   short enough that a stray "#" in front of a step can't swallow it. */
export const NAME_MAX = 60;

export const cleanName = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

/**
 * What was stored, checked against the list it labels.
 *
 * Sorted by position, at most one heading per position (the first wins, so a
 * round trip through the form is stable), nothing pointing past the end, and
 * nothing unnamed. Always returns an array, so a caller never has to guard.
 */
export function asSections(raw, count) {
  if (!Array.isArray(raw) || !(count > 0)) return [];
  const seen = new Set();
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const at = Number(s.at);
    const name = cleanName(s.name);
    if (!name || !Number.isInteger(at) || at < 0 || at >= count || seen.has(at)) continue;
    seen.add(at);
    out.push({ at, name });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Is there anything to show? Saves every caller an `?.length` dance. */
export const hasSections = (sections) => asSections(sections, Infinity).length > 0;

/**
 * The list, cut into the runs a reader sees.
 *
 * Returns [{ name, at, items: [{ value, index }] }], where `index` is the
 * item's position in the original list — the number every tick, timer and
 * photo is keyed by, so a caller renders from `index` and never from its
 * position within the run.
 *
 * The run before the first heading has `name: ""`. A recipe with no headings
 * at all comes back as one unnamed run, so one render path covers both.
 */
export function bySection(items, sections) {
  const list = Array.isArray(items) ? items : [];
  const cuts = asSections(sections, list.length);
  const runs = [];
  let open = { name: "", at: 0, items: [] };
  for (let i = 0; i < list.length; i++) {
    const cut = cuts.find((s) => s.at === i);
    if (cut) {
      if (open.items.length) runs.push(open);
      open = { name: cut.name, at: i, items: [] };
    }
    open.items.push({ value: list[i], index: i });
  }
  if (open.items.length) runs.push(open);
  return runs;
}

/**
 * Lines in, items and headings out — how the form reads a textarea.
 *
 * A line that is only a markdown heading starts a section. Anything else is an
 * item. A heading at the very end labels nothing and is dropped, as is a
 * heading immediately followed by another (the second one wins, because that
 * is the one the reader would see above the items).
 */
export function parseSections(lines) {
  const items = [];
  const sections = [];
  let pending = "";
  for (const raw of Array.isArray(lines) ? lines : String(lines ?? "").split("\n")) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const head = line.match(HEADING);
    if (head) {
      /* Hashes with nothing after them name nothing; the line is still not an
         ingredient, so it goes rather than landing in the list as "#". */
      const name = cleanName(head[2]);
      if (name) pending = name;
      continue;
    }
    if (pending) {
      sections.push({ at: items.length, name: pending });
      pending = "";
    }
    items.push(line);
  }
  return { items, sections: asSections(sections, items.length) };
}

/**
 * The other direction: items and headings back into the lines the form shows,
 * so opening a recipe for editing gives back what was typed.
 *
 * `render` turns an item into its line — ingredients are already strings, a
 * step has to be flattened back to "Title: text" first.
 */
export function sectionLines(items, sections, render = String) {
  return bySection(items, sections).flatMap((run) => [
    ...(run.name ? [`# ${run.name}`] : []),
    ...run.items.map((it) => render(it.value)),
  ]);
}

/**
 * Sections after items have moved, for the one place that reorders a list:
 * dropping a step photo or removing a line in the form. A heading whose item
 * is gone slides down to whatever took its place; one whose item was the last
 * of the recipe is dropped.
 */
export function remapSections(sections, count, moved) {
  const next = [];
  for (const s of asSections(sections, Infinity)) {
    const at = moved(s.at);
    if (Number.isInteger(at) && at >= 0 && at < count) next.push({ at, name: s.name });
  }
  return asSections(next, count);
}
