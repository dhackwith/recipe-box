/**
 * Step photos in the recipe form. Steps are edited as lines of text, so the
 * thing most worth holding to is that a picture stays with its step however
 * the lines around it are typed, inserted, deleted or moved.
 */

import {
  STEP_PHOTO_MAX, stepImageKey, stepImageUrl, newStepPhotoId, stepLines, stepPhotoIds, carryStepPhotos,
} from "../src/stepphotos.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── the small pieces ── */
is("a step can have three photos", STEP_PHOTO_MAX, 3);
is("steps are the lines with something on them, trimmed", stepLines("  Whisk.\n\n   \nBake.  \n"), ["Whisk.", "Bake."]);
is("no text is no steps", stepLines(undefined), []);
is("every photo id on a recipe's steps, in order",
  stepPhotoIds([{ text: "a", photos: ["p1", "p2"] }, "plain step", { text: "b" }, { text: "c", photos: ["p3", 7, ""] }]),
  ["p1", "p2", "p3"]);
is("no steps, no ids", stepPhotoIds(undefined), []);
is("a photo's key", stepImageKey("sp123abc"), "stepimg:sp123abc");
is("a photo's address is escaped", stepImageUrl("a b"), "/api/storage?image=a%20b");
{
  const ids = Array.from({ length: 1000 }, newStepPhotoId);
  is("new ids are the shape the server accepts", ids.every((id) => /^[A-Za-z0-9_-]{6,64}$/.test(id)), true);
  is("...and don't repeat", new Set(ids).size, 1000);
}

/* ── carrying photos through an edit ── */
const A = [{ id: "a" }], B = [{ id: "b1" }, { id: "b2" }], C = [{ id: "c" }];
const lines = ["Whisk the eggs.", "Fold in the flour.", "Bake 40 minutes."];
const photos = [A, B, C];
const ids = (list) => list.map((p) => p.map((x) => x.id));

is("nothing changed, nothing moves", ids(carryStepPhotos(lines, lines, photos)), [["a"], ["b1", "b2"], ["c"]]);
is("typing into a step keeps its photos",
  ids(carryStepPhotos(lines, ["Whisk the eggs.", "Fold in the flour gently.", "Bake 40 minutes."], photos)),
  [["a"], ["b1", "b2"], ["c"]]);
is("inserting a step keeps every photo with its own step",
  ids(carryStepPhotos(lines, ["Heat the oven.", "Whisk the eggs.", "Fold in the flour.", "Bake 40 minutes."], photos)),
  [[], ["a"], ["b1", "b2"], ["c"]]);
is("deleting a step takes its photos with it and leaves the rest where they were",
  ids(carryStepPhotos(lines, ["Whisk the eggs.", "Bake 40 minutes."], photos)),
  [["a"], ["c"]]);
is("reordering steps moves their photos with them",
  ids(carryStepPhotos(lines, ["Bake 40 minutes.", "Whisk the eggs.", "Fold in the flour."], photos)),
  [["c"], ["a"], ["b1", "b2"]]);
is("two identical steps each keep their own, in order",
  ids(carryStepPhotos(["Stir.", "Stir."], ["Stir.", "Stir."], [[{ id: "first" }], [{ id: "second" }]])),
  [["first"], ["second"]]);
is("pressing Enter on a new blank line changes nothing",
  ids(carryStepPhotos(lines, stepLines(`${lines.join("\n")}\n`), photos)),
  [["a"], ["b1", "b2"], ["c"]]);
is("a step with no photos recorded has none", ids(carryStepPhotos(["x", "y"], ["x", "y"], [A])), [["a"], []]);
is("clearing every step leaves no photos", carryStepPhotos(lines, [], photos), []);
is("steps with no photos at all yet", carryStepPhotos([], ["One.", "Two."], undefined), [[], []]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
