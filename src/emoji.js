/**
 * The quick emoji in a chat, and telling a message that is only emoji.
 *
 * The button beside Send sends one emoji as a message: a thumbs up until
 * somebody presses and holds it and chooses another from QUICK_EMOJI. The
 * choice is remembered on their device and used in every chat.
 */

export const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "😋"];
export const DEFAULT_QUICK_EMOJI = QUICK_EMOJI[0];

/** A stored choice, while it is still one of the emoji offered; the thumbs up otherwise. */
export const asQuickEmoji = (v) => (QUICK_EMOJI.includes(v) ? v : DEFAULT_QUICK_EMOJI);

/* One emoji as a person sees it: a pictograph with its variation selector or
   skin tone, and any others joined to it by zero-width joiners — 👨‍🍳 is one. */
const ONE = "\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})*)*";
const ONLY = new RegExp(`^\\s*(?:${ONE}\\s*){1,3}$`, "u");
const EACH = new RegExp(ONE, "gu");

/** How many emoji a message is made of, when that is all it is — up to three,
    which are shown large. Zero for anything else. */
export function emojiOnly(text) {
  const t = String(text || "");
  if (!t.trim() || !ONLY.test(t)) return 0;
  return (t.match(EACH) || []).length;
}
