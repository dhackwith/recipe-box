/**
 * Photos on a recipe's steps.
 *
 * A recipe is one record inside the family's box, and the whole box is read on
 * every visit, so step photos are not kept in it. Each lives under a key of its
 * own, `stepimg:<id>`, and a step carries only the ids. The page shows them
 * through /api/storage?image=<id>, as image bytes a browser can lazy-load and
 * cache, so nothing is fetched until somebody opens a recipe that has them.
 *
 * Steps are edited as lines of text and photos belong to steps, so an edit to
 * that text has to carry each step's photos to wherever its line went.
 */

export const STEP_PHOTO_MAX = 3;
/* Wide enough to fill cooking mode on a laptop; small enough that a recipe
   with a photo on every step is a few megabytes, not a few dozen. */
export const STEP_PHOTO_WIDTH = 1200;
export const STEP_PHOTO_QUALITY = 0.74;

export const stepImageKey = (id) => `stepimg:${id}`;
export const stepImageUrl = (id) => `/api/storage?image=${encodeURIComponent(id)}`;

/* Letters and digits only, which is all the server accepts as an id. */
export const newStepPhotoId = () =>
  `sp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** The steps a block of step text holds: one for each line with anything on it. */
export const stepLines = (text) =>
  String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

/** Every photo id on a recipe's steps. */
export const stepPhotoIds = (steps) =>
  [].concat(steps ?? []).flatMap((s) =>
    s && Array.isArray(s.photos) ? s.photos.filter((id) => typeof id === "string" && id) : []);

/**
 * Each new line's photos, carried over from the old lines.
 *
 * A line whose text is unchanged keeps its photos wherever it moved to, so
 * inserting, deleting or reordering steps doesn't shuffle pictures onto the
 * wrong ones. A line that was only edited — the number of steps unchanged —
 * keeps the photos of the step in its place, so typing into a step doesn't
 * lose them. A line that is genuinely new starts with none.
 */
export function carryStepPhotos(oldLines, newLines, oldPhotos) {
  const photosAt = (k) => (Array.isArray(oldPhotos?.[k]) ? oldPhotos[k] : []);
  const carried = newLines.map(() => null);
  const taken = new Set();

  newLines.forEach((line, i) => {
    const k = oldLines.findIndex((old, j) => !taken.has(j) && old === line);
    if (k < 0) return;
    taken.add(k);
    carried[i] = photosAt(k);
  });

  if (oldLines.length === newLines.length) {
    newLines.forEach((_, i) => {
      if (carried[i] !== null || taken.has(i)) return;
      taken.add(i);
      carried[i] = photosAt(i);
    });
  }

  return carried.map((photos) => photos || []);
}
