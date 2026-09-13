/**
 * A person's favorite recipes.
 *
 * Kept per person and on each of their devices, and merged between them the
 * way the shopping list is: every star and every un-star is stamped with when
 * it happened, so starring a recipe on the phone and un-starring it later on
 * the laptop settles on the later of the two, whichever device syncs first.
 *
 * An un-star is kept as an entry rather than deleted — otherwise a device that
 * had not heard about it would bring the star straight back. Those entries are
 * dropped after OFF_LIFE, long after every device has had its chance to sync.
 *
 * Shape: { stars: { [recipeId]: { on: boolean, at: number } } }, with the ids
 * always in sorted order, so two copies that agree are also written the same
 * and a sync with nothing new to say writes nothing.
 */

export const OFF_LIFE = 60 * 24 * 60 * 60 * 1000;

export const emptyFavorites = () => ({ stars: {} });

const okEntry = (e) => !!e && typeof e === "object" && typeof e.on === "boolean" && Number.isFinite(e.at);

/** What was stored, checked; null when it isn't a favorites record at all. */
export function asFavorites(raw) {
  if (!raw || typeof raw !== "object" || !raw.stars || typeof raw.stars !== "object") return null;
  const stars = {};
  for (const id of Object.keys(raw.stars).sort()) {
    const e = raw.stars[id];
    if (id && okEntry(e)) stars[id] = { on: e.on, at: e.at };
  }
  return { stars };
}

export const isFavorite = (favs, id) => !!favs?.stars?.[id]?.on;

export const favoriteIds = (favs) =>
  new Set(Object.entries(favs?.stars || {}).filter(([, e]) => e.on).map(([id]) => id));

/* Sorted, and without un-stars old enough that every device has heard of them. */
function tidy(stars, now) {
  const kept = {};
  for (const id of Object.keys(stars).sort()) {
    const e = stars[id];
    if (e.on || now - e.at <= OFF_LIFE) kept[id] = e;
  }
  return { stars: kept };
}

/** Star or un-star one recipe. The stamp always moves forward, even when this
    device's clock is behind the one that last touched it, so the change counts. */
export function setFavorite(favs, id, on, now = Date.now()) {
  const was = favs.stars[id];
  const at = was ? Math.max(now, was.at + 1) : now;
  return tidy({ ...favs.stars, [id]: { on, at } }, now);
}

/** Two devices' favorites, reconciled recipe by recipe: the later change wins,
    and a tie goes to the star, so nothing is lost to a coincidence. */
export function mergeFavorites(mine, theirs, now = Date.now()) {
  const stars = { ...mine.stars };
  for (const [id, e] of Object.entries(theirs.stars)) {
    const held = stars[id];
    if (!held || e.at > held.at || (e.at === held.at && e.on && !held.on)) stars[id] = e;
  }
  return tidy(stars, now);
}
