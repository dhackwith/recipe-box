/**
 * Favorites: starring, un-starring, and two devices agreeing on the result.
 */

import { asFavorites, emptyFavorites, isFavorite, favoriteIds, setFavorite, mergeFavorites, OFF_LIFE } from "../src/favorites.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const T = 1_700_000_000_000;

/* ── on one device ── */
let f = emptyFavorites();
f = setFavorite(f, "soup", true, T);
is("a star is a favorite", isFavorite(f, "soup"), true);
is("...and nothing else is", isFavorite(f, "bread"), false);
f = setFavorite(f, "soup", false, T + 1000);
is("un-starring takes it away", isFavorite(f, "soup"), false);
is("...but remembers that it did", f.stars.soup, { on: false, at: T + 1000 });
const behind = setFavorite(setFavorite(emptyFavorites(), "cake", true, T + 5000), "cake", false, T);
is("a change on a clock that is behind still moves the stamp forward", behind.stars.cake.at > T + 5000, true);
is("the list of favorites holds only stars",
  [...favoriteIds(setFavorite(setFavorite(emptyFavorites(), "a", true, T), "b", false, T))], ["a"]);

/* ── two devices ── */
const phone = setFavorite(emptyFavorites(), "soup", true, T);
const laptop = setFavorite(phone, "soup", false, T + 60_000);
is("the later change wins: un-starred on the laptop after starring on the phone",
  isFavorite(mergeFavorites(phone, laptop, T + 70_000), "soup"), false);
is("...whichever side is doing the merging", isFavorite(mergeFavorites(laptop, phone, T + 70_000), "soup"), false);
const reStar = setFavorite(laptop, "soup", true, T + 120_000);
is("starring it again later brings it back", isFavorite(mergeFavorites(laptop, reStar, T + 130_000), "soup"), true);
is("stars on different recipes on each device all survive",
  [...favoriteIds(mergeFavorites(setFavorite(emptyFavorites(), "a", true, T), setFavorite(emptyFavorites(), "b", true, T), T))].sort(),
  ["a", "b"]);
is("a tie goes to the star",
  isFavorite(mergeFavorites({ stars: { x: { on: false, at: T } } }, { stars: { x: { on: true, at: T } } }, T), "x"), true);

const m1 = mergeFavorites(setFavorite(setFavorite(emptyFavorites(), "b", true, T), "a", true, T), setFavorite(emptyFavorites(), "c", true, T), T);
const m2 = mergeFavorites(setFavorite(emptyFavorites(), "c", true, T), setFavorite(setFavorite(emptyFavorites(), "a", true, T), "b", true, T), T);
is("the merged record is written the same whichever order it came in, so an unchanged sync writes nothing",
  JSON.stringify(m1), JSON.stringify(m2));
is("merging with itself changes nothing", JSON.stringify(mergeFavorites(m1, m1, T)), JSON.stringify(m1));

/* ── housekeeping ── */
const old = { stars: { gone: { on: false, at: T }, kept: { on: true, at: T } } };
is("an old un-star is forgotten", mergeFavorites(old, emptyFavorites(), T + OFF_LIFE + 1).stars.gone, undefined);
is("...but an old star never is", isFavorite(mergeFavorites(old, emptyFavorites(), T + OFF_LIFE + 1), "kept"), true);

/* ── what was stored ── */
is("junk is not a favorites record", asFavorites("nope"), null);
is("...nor is a record without stars", asFavorites({}), null);
is("broken entries are dropped and good ones kept",
  asFavorites({ stars: { a: { on: true, at: T }, b: { on: "yes", at: T }, c: null } }), { stars: { a: { on: true, at: T } } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
