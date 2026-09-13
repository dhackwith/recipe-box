/**
 * The way back out of the tool pages — the meal plan, the shopping list and
 * the nutrition tracker — each of which can be opened from anywhere, including
 * from one another.
 *
 * It used to be a single remembered "came from" page, and that broke as soon
 * as one tool was opened from another: recipes, then the meal plan, then the
 * shopping list, then back, left the meal plan remembering that it had come
 * from the meal plan, so its back button went nowhere at all.
 *
 * Now it is a path. Opening a page adds the page you were on; opening a page
 * that is already on the path cuts the path back to it instead, exactly as if
 * you had gone back to it. So the path never repeats and never holds the page
 * you are on, and going back always ends at the recipes.
 */

/** The path after going from one page to another. */
export function trailTo(trail, from, to) {
  if (from === to) return trail;
  const at = trail.indexOf(to);
  if (at >= 0) return trail.slice(0, at);
  return [...trail.filter((page) => page !== from), from];
}

/** Where going back leads, and the path once you are there. */
export function backFrom(trail) {
  if (!trail.length) return { to: "list", trail: [] };
  return { to: trail[trail.length - 1], trail: trail.slice(0, -1) };
}
