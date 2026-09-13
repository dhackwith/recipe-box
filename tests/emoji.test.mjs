/**
 * The quick emoji: what may be chosen, and which messages count as only emoji
 * (and so are shown large).
 */

import { QUICK_EMOJI, DEFAULT_QUICK_EMOJI, asQuickEmoji, emojiOnly } from "../src/emoji.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── the choice ── */
is("it starts as a thumbs up", DEFAULT_QUICK_EMOJI, "👍");
is("a small menu of different emoji", [QUICK_EMOJI.length, new Set(QUICK_EMOJI).size], [8, 8]);
is("a choice from the menu is kept", asQuickEmoji("😋"), "😋");
is("anything else goes back to the thumbs up", [asQuickEmoji("💩"), asQuickEmoji(null), asQuickEmoji("hello")], ["👍", "👍", "👍"]);
is("every emoji in the menu counts as one emoji", QUICK_EMOJI.map(emojiOnly), [1, 1, 1, 1, 1, 1, 1, 1]);

/* ── only emoji ── */
is("one emoji", emojiOnly("👍"), 1);
is("...with a skin tone", emojiOnly("👍🏽"), 1);
is("...joined into one, like a chef", emojiOnly("👨‍🍳"), 1);
is("...with spaces around it", emojiOnly("  🎉 "), 1);
is("three in a row", emojiOnly("😂😂😂"), 3);
is("more than three is just a message", emojiOnly("😂😂😂😂"), 0);
is("words with an emoji are just a message", emojiOnly("thanks 👍"), 0);
is("numbers are not emoji", emojiOnly("123"), 0);
is("nothing is not emoji", [emojiOnly(""), emojiOnly(null)], [0, 0]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
