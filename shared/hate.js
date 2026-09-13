/**
 * The one thing this site will not keep.
 *
 * Everybody with the link can write in the box, and it is a family's box: the
 * recipes, the notes, the "I made this" log, even the shopping list. Swearing
 * is nobody's business but theirs. Slurs are, so racial and ethnic slurs,
 * slurs aimed at gay and trans people, and the stock phrases of hate groups
 * are refused — in the browser, so it is said plainly, and again on the
 * server, because the browser is the thing being checked.
 *
 * WHAT IS NOT ON THE LIST. "Fuck", "shit", "arse" and "cunt" are not slurs and
 * are left alone. Neither are words a kitchen owns: cracker, homo (milk), negro
 * (frijoles negros), and retard (as in retarding dough) are all slurs in some
 * mouths and ordinary in a recipe, and a filter that blocks a recipe is a
 * filter people learn to work around.
 *
 * HOW IT MATCHES. Whole words only, which is what keeps fagioli, spicy,
 * raccoon, squawk, Pakistani and niger seed writable. Text is read through
 * accents, look-alike Cyrillic and Greek letters, numbers and symbols standing
 * in for letters, and repeated letters, so n1gg3r and f a g g o t are the words
 * they are pretending not to be. Longer terms may be spaced out; short ones may
 * not, because three letters with gaps allowed match half the language.
 *
 * WHY THE LIST IS SCRAMBLED. It is stored under ROT13 so that a repository full
 * of family recipes does not also contain a page of slurs in plain sight. The
 * tests build their cases from the decoded list rather than spelling any out.
 *
 * NOTHING OLD IS HELD AGAINST ANYONE. The box is saved as one record, so a
 * check that looked at the whole of it would let one old line block every later
 * save. newHate() compares against what is already stored and objects only to
 * what is new.
 */

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

const WORDS_ROT13 = ["avttre","avttref","avttn","avttnf","avttnm","avtthu","avttnu","fnaqavttre","fnaqavttref","snttbg","snttbgf","sntbg","sntbgf","snt","sntf","snttl","pbba","pbbaf","fcvp","fcvpf","jrgonpx","jrgonpxf","ornare","ornaref","puvax","puvaxf","tbbx","tbbxf","xvxr","xvxrf","xlxr","enturnq","enturnqf","gbjryurnq","gbjryurnqf","cnxv","cnxvf","wvtnobb","wvttnobb","qnexvr","qnexvrf","qnexl","tbyyvjbt","tbyyljbt","jbt","jbtf","erqfxva","erqfxvaf","fdhnj","vawha","vawhaf","mvccreurnq","mvccreurnqf","fynagrlr","fynagrlrf","puvatpubat","jvttre","jvttref","qlxr","qlxrf","genaal","genaavrf","genaavr","furznyr","furznyrf","cbbsgre","cbbsgref","zhmmvr","zhmmvrf","ubybubnk","wrjrq","xxx","lvq","lvqf","avt"];
const PHRASES_ROT13 = ["cbepu zbaxrl","whatyr ohaal","fnaq avttre","fynag rlr","puvat pubat","urvy uvgyre","fvrt urvy","juvgr cbjre","juvgr cevqr","tnf gur wrjf","onggl obl","puevfg xvyyre","enpr genvgbe","xvyy nyy wrjf","xvyy nyy oynpxf","xvyy nyy tnlf","xvyy nyy zhfyvzf","fnaq zbaxrl"];

/** The terms, in the clear. Exported for the tests, which build from them. */
export const TERMS = [...WORDS_ROT13, ...PHRASES_ROT13].map(rot13);

/* Letters that look like other letters. NFKD handles accents; these are the
   substitutions it cannot see, from Cyrillic, Greek and the dingbats. */
const LOOKALIKE = {
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t",
  "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ѵ": "v",
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u",
  "ı": "i", "ɡ": "g", "ʀ": "r", "ѐ": "e",
};
/* Numbers and symbols standing in for letters. */
const LEET = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "¡": "i",
};

/** Text as the matcher reads it: lower case, unaccented, undisguised. */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\x00-\x7f]/gu, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/[0-9@$!|+¡]/g, (ch) => LEET[ch] ?? ch);
}

/* A letter may be repeated; between the letters of a longer term there may be
   punctuation or a space or two. */
const escape = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GAP = "[^a-z0-9]{0,2}";
const SPACED = 6;        // a term this long or longer may be written spaced out

const letters = (word, gaps) => [...word].map((ch) => `${escape(ch)}+`).join(gaps ? GAP : "");
const wordPattern = (word) => letters(word, word.length >= SPACED);
const phrasePattern = (phrase) => phrase.split(" ").map((w) => letters(w, true)).join("[^a-z0-9]{1,3}");

const PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${[
    ...WORDS_ROT13.map((w) => wordPattern(rot13(w))),
    ...PHRASES_ROT13.map((p) => phrasePattern(rot13(p))),
  ].join("|")})(?![a-z0-9])`,
  "g",
);

/* Where a term on the list is, in one exact form, somebody's name instead.
   "Van Dyke" is a surname and a shade of brown; the word on its own is still
   refused, so this exempts the phrase and nothing wider. */
const ALLOWED = [/\bvan dyke\b/g];

/** What a piece of text is refused for, or an empty list. */
export function hateIn(text) {
  let read = normalize(text);
  for (const allowed of ALLOWED) read = read.replace(allowed, " ");
  return read.match(PATTERN) || [];
}

/**
 * Every refusable thing in a value — a string, or any object or array of them.
 * Pictures are skipped: base64 is not prose, and a stray run of letters inside
 * one would refuse a photograph nobody can read.
 */
export function findHate(value) {
  const hits = [];
  const walk = (v) => {
    if (typeof v === "string") {
      if (!/^data:/i.test(v.trim())) hits.push(...hateIn(v));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return hits;
}

export const hasHate = (value) => findHate(value).length > 0;

/**
 * What `next` says that `previous` did not. A box saved years ago with one bad
 * line should not stop somebody fixing a typo in a different recipe today.
 */
export function newHate(next, previous) {
  const before = new Set(findHate(previous));
  return [...new Set(findHate(next))].filter((hit) => !before.has(hit));
}

export const HATE_MESSAGE = "That has language this site doesn't allow — take it out and try again";
