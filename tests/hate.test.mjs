/**
 * The content filter. Cases are built from the list itself rather than spelled
 * out, so this file stays readable: for every term, the term in a sentence, and
 * the disguises — spaced out, numbers for letters, letters repeated, accented,
 * and written in Cyrillic look-alikes — all have to be caught.
 *
 * The other half matters as much: a recipe site is full of words that contain
 * slurs, and every one of them has to stay writable.
 */

import { TERMS, hateIn, hasHate, findHate, newHate, normalize, HATE_MESSAGE } from "../shared/hate.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── every term, plainly written ── */
is("there is a list to check against", TERMS.length > 60, true);
is("every term is caught in a sentence",
  TERMS.filter((t) => !hasHate(`you absolute ${t}, honestly`)), []);
is("...at the start of a line", TERMS.filter((t) => !hasHate(`${t} — and worse`)), []);
is("...shouted", TERMS.filter((t) => !hasHate(t.toUpperCase())), []);

/* ── the disguises ── */
const spacedOut = (t) => [...t].join(" ");
const dotted = (t) => [...t].join(".");
const doubled = (t) => t.replace(/[aeiou]/, (v) => v + v);
const leet = (t) => t.replace(/a/g, "4").replace(/e/g, "3").replace(/i/g, "1").replace(/o/g, "0").replace(/s/g, "5");
const cyrillic = (t) => t.replace(/a/g, "а").replace(/e/g, "е").replace(/o/g, "о").replace(/c/g, "с").replace(/p/g, "р");
const accented = (t) => t.replace(/a/g, "á").replace(/e/g, "é").replace(/i/g, "í").replace(/o/g, "ó");

const longTerms = TERMS.filter((t) => t.replace(/ /g, "").length >= 6);
is("a long term spaced out is still the word", longTerms.filter((t) => !hasHate(`what a ${spacedOut(t)} thing to say`)), []);
is("...or written with dots between the letters", longTerms.filter((t) => !hasHate(dotted(t))), []);
is("a term with a letter doubled", TERMS.filter((t) => !hasHate(doubled(t))), []);
is("...with numbers for letters", TERMS.filter((t) => !hasHate(leet(t))), []);
is("...in Cyrillic look-alikes", TERMS.filter((t) => !hasHate(cyrillic(t))), []);
is("...under accents", TERMS.filter((t) => !hasHate(accented(t))), []);
is("...and in a longer piece of writing",
  hasHate(`Grandma's recipe, handed down, and then some ${TERMS[0]} wrote on it`), true);

/* ── what must stay writable ──
   A food site is full of words that contain slurs. Blocking any of these would
   be worse than the filter is good. */
const FINE = [
  "Pasta e fagioli with rosemary", "fagottini stuffed with ricotta", "Spicy harissa paste", "spice the coonawarra shiraz",
  "Raccoon Creek honey", "roast in a cocoon of foil", "Squawk when it boils over", "Niger seed for the birds",
  "Pakistani street food", "chinking the ice in the glass", "Scunthorpe pudding", "Van Dyke's brownies",
  "homogenised milk", "frijoles negros", "cracker crumbs", "retard the dough overnight in the fridge",
  "jeweled rice with barberries", "yiddish bakery classics",
];
for (const line of FINE) is(`allowed: "${line.slice(0, 34)}"`, hasHate(line), false);
/* One term on the list is also a surname, in one exact form only. */
is("the surname is allowed, the word alone is not",
  [hasHate("Van Dyke brown icing"), hasHate("what a dyke")], [false, true]);
is("swearing is nobody's business", hasHate("this fucking shit pissed me off, arse, cunt and all"), false);
is("...even enthusiastically", hasHate("FUCK yes, best damn pie, bloody hell"), false);

/* ── the one deliberate loss ── */
is("British faggots are caught too, as asked", hasHate("a dish of faggots and peas"), true);

/* ── across a whole record ── */
const recipe = {
  title: "Plum cake", steps: [{ title: "Bake", text: "Bake 40 minutes" }],
  notes: `left by a ${TERMS[0]}`, thumb: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
};
is("a bad line anywhere in a recipe is found", hasHate(recipe), true);
is("...and named nowhere in the message", HATE_MESSAGE.includes(TERMS[0]), false);
is("a clean recipe passes", hasHate({ ...recipe, notes: "left by my grandmother" }), false);
is("a photograph is never read as prose",
  hasHate({ thumb: `data:image/jpeg;base64,${Buffer.from(TERMS[0]).toString("base64")}` }), false);
is("nothing at all is fine", [hasHate(undefined), hasHate(null), hasHate("")], [false, false, false]);

/* ── what is already stored is not held against anyone ── */
const oldBox = { recipes: [{ title: "Old recipe", notes: `written by a ${TERMS[0]}` }] };
const edited = { recipes: [{ title: "Old recipe, fixed", notes: `written by a ${TERMS[0]}` }] };
is("an old line does not block a later save", newHate(edited, oldBox), []);
is("...but a new one does", newHate({ ...edited, extra: `and a ${TERMS[1]}` }, oldBox).length > 0, true);
is("a fresh box with nothing behind it is judged on its own", newHate(oldBox, null).length > 0, true);

/* ── the pieces ── */
is("normalising reads through a disguise", normalize("N1GG3R").includes("nigg"), true);
is("what is found is not echoed back", hateIn("clean text"), []);
is("findHate lists each hit", findHate({ a: TERMS[0], b: TERMS[0] }).length, 2);

/* ── and that the server refuses it too ── */
const { onRequest } = await import("../functions/api/storage.js");
const kv = new Map();
const env = {
  RECIPES: {
    get: async (k) => (kv.has(k) ? kv.get(k) : null),
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  },
};
const put = (key, value) =>
  onRequest({
    env,
    request: new Request(`https://thehackwithtable.com/api/storage?key=${key}&shared=true`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
    }),
  });

const cleanBox = JSON.stringify({ recipes: [{ title: "Plum cake", notes: "grandmother's" }] });
is("a clean box saves", (await put("recipe-box", cleanBox)).status, 200);
const dirtyBox = JSON.stringify({ recipes: [{ title: "Plum cake", notes: `by a ${TERMS[0]}` }] });
is("a box with a new slur in it is refused", (await put("recipe-box", dirtyBox)).status, 400);
is("...and is not what is stored", kv.get("shared:recipe-box"), cleanBox);

kv.set("shared:recipe-box", dirtyBox);
const stillDirty = JSON.stringify({ recipes: [{ title: "Plum cake, fixed", notes: `by a ${TERMS[0]}` }] });
is("editing around a line that was already there is allowed", (await put("recipe-box", stillDirty)).status, 200);
is("a typed list item is checked too", (await put("grocery-list", JSON.stringify({ items: [{ text: TERMS[1] }] }))).status, 400);
is("a step photo is not prose and is never refused",
  (await put("stepimg:sphate0001", "data:image/jpeg;base64,/9j/4AAQSkZJRg==")).status, 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
