/**
 * Note times in the reader's own zone. The case that asked for this: several
 * people in Pacific Time and one in New Zealand, reading the same note.
 */

import { whenAt, whenFull } from "../src/when.js";

let pass = 0, fail = 0;
/* Clocks put a narrow no-break space before AM and PM in some locales, which
   is correct and invisible; compare with ordinary spaces. */
const plain = (s) => String(s).replace(/\s+/g, " ");
const is = (label, got, want) => {
  const ok = plain(JSON.stringify(got)) === plain(JSON.stringify(want));
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const LA = { timeZone: "America/Los_Angeles", locale: "en-US" };
const NZ = { timeZone: "Pacific/Auckland", locale: "en-NZ" };

/* Posted on a Saturday afternoon in California, which is already Sunday
   morning in New Zealand. Neither "now" is today for this note. */
const note = "2026-09-12T21:42:00.000Z";
const later = new Date("2026-09-20T00:00:00.000Z");

is("in Los Angeles it was Friday afternoon", whenAt(note, { ...LA, now: later }), "12 September at 2:42 PM");
is("in Auckland the same note was Saturday morning", whenAt(note, { ...NZ, now: later }), "13 September at 9:42 am");

/* ── today and yesterday are the reader's today and yesterday ── */
const soon = new Date("2026-09-13T00:30:00.000Z");     // 5:30 pm Sat 12th in LA, 12:30 pm Sun 13th in NZ
is("a few hours later it is today in Los Angeles", whenAt(note, { ...LA, now: soon }), "Today at 2:42 PM");
is("...and today in Auckland too", whenAt(note, { ...NZ, now: soon }), "Today at 9:42 am");

const dayBefore = "2026-09-11T20:00:00.000Z";          // 1 pm Fri 11th in LA, 8 am Sat 12th in NZ
is("yesterday in Los Angeles", whenAt(dayBefore, { ...LA, now: soon }), "Yesterday at 1:00 PM");
is("yesterday in Auckland", whenAt(dayBefore, { ...NZ, now: soon }), "Yesterday at 8:00 am");

const lateNight = new Date("2026-09-13T11:30:00.000Z"); // 4:30 am Sun 13th in LA, 11:30 pm Sun 13th in NZ
is("a note from the night before is yesterday in one place and today in the other",
  [whenAt("2026-09-13T06:30:00.000Z", { ...LA, now: lateNight }), whenAt("2026-09-13T06:30:00.000Z", { ...NZ, now: lateNight })],
  ["Yesterday at 11:30 PM", "Today at 6:30 pm"]);

/* ── in a sentence, for "made this …" ── */
is("today, mid-sentence", whenAt(note, { ...LA, now: soon, inSentence: true }), "today at 2:42 PM");
is("yesterday, mid-sentence", whenAt(dayBefore, { ...NZ, now: soon, inSentence: true }), "yesterday at 8:00 am");
is("an older date, mid-sentence", whenAt(note, { ...NZ, now: later, inSentence: true }), "on 13 September at 9:42 am");

/* ── the year, and the zone ── */
is("a note from another year says so", whenAt("2025-12-24T18:00:00.000Z", { ...LA, now: later }), "24 December 2025 at 10:00 AM");
is("the year it becomes in the reader's zone is the one that counts",
  whenAt("2025-12-31T20:00:00.000Z", { ...NZ, now: later }), "1 January at 9:00 am");
is("the full time names the Pacific zone", /PDT/.test(whenFull(note, LA)), true);
is("...and the New Zealand one", /NZST/.test(whenFull(note, NZ)), true);
is("the full time carries the reader's own day of the week",
  [/Saturday/.test(whenFull(note, LA)), /Sunday/.test(whenFull(note, NZ))], [true, true]);

/* ── the device's own zone, and nonsense ── */
is("with no zone given, the device's is used without complaint", typeof whenAt(note), "string");
is("a missing time is blank", whenAt(undefined), "");
is("a broken time is blank", [whenAt("not a date"), whenFull("not a date")], ["", ""]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
