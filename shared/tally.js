/**
 * How many people have starred each recipe.
 *
 * A star stays a private thing — your own favorites list is still yours, still
 * merged between your own devices by src/favorites.js, and nobody is told
 * which recipes you keep. What the family sees is the TOTAL: "★ 4" under a
 * title, and a Most loved order on the shelf. With a dozen people a count of
 * stars says more than an average of three ratings ever could, and it cannot
 * be swung by one person having a bad night.
 *
 * HOW THE COUNT IS KEPT
 * One key per person, `favs:<email>`, holding just the ids they have starred —
 * no stamps, no tombstones, none of the merge machinery, because this is a
 * projection of that record rather than a second copy of it. Counting is then
 * a prefix listing and one read each, which is a dozen reads on a family box,
 * and adding a star costs its owner one write.
 *
 * Whose key is whose never leaves the server: the endpoint adds the counts up
 * and sends only the totals, so reading it back tells you how many, never who.
 */

export const FAV_PREFIX = "favs:";

/* A recipe id as the box makes them ("r-1757...-a1b2", "seed-sangria") plus
   room for whatever an import names one, without accepting a whole document. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/* One person cannot star more than this. Far above a real box, low enough that
   a runaway client cannot push a megabyte into the count. */
export const STARS_MAX = 5000;

export const favKey = (email) => `${FAV_PREFIX}${String(email || "").toLowerCase()}`;

/** The email back out of a key, for nothing but tidying up after a rename. */
export const favOwner = (key) =>
  String(key || "").startsWith(FAV_PREFIX) ? key.slice(FAV_PREFIX.length) : "";

/**
 * A stored or submitted list of starred ids, checked: strings only, no
 * duplicates, sorted, capped. Sorted because an unchanged list must serialise
 * the same both times, or every sync would write.
 */
export function asIdList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  for (const v of list) {
    const id = typeof v === "string" ? v : "";
    if (ID.test(id)) seen.add(id);
    if (seen.size >= STARS_MAX) break;
  }
  return [...seen].sort();
}

/** What one person's key holds, read back. Never throws on rubbish. */
export function readIdList(stored) {
  if (typeof stored !== "string" || !stored) return [];
  try {
    return asIdList(JSON.parse(stored));
  } catch {
    return [];
  }
}

/**
 * Everybody's lists into one count per recipe.
 *
 * Recipes nobody has starred are simply absent rather than present as 0 — the
 * shelf treats a missing count as none, and sending a zero for every recipe in
 * the box would be most of the payload.
 */
export function tally(lists) {
  const counts = {};
  for (const list of lists || []) {
    for (const id of asIdList(list)) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/** Only the recipes that still exist, so a deleted one stops being counted. */
export function prune(counts, liveIds) {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds || []);
  const out = {};
  for (const [id, n] of Object.entries(counts || {})) {
    if (live.has(id) && n > 0) out[id] = n;
  }
  return out;
}
