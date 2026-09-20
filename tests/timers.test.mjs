/**
 * Step timers: reading a duration out of the words of a step, and naming that
 * duration on the button.
 *
 * The part that matters: the label and the timer are the same promise. A step
 * that says 75 seconds gets a button that says 75 seconds — not "1 min", which
 * is the timer quietly disagreeing with the recipe above it.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

const a = src.indexOf("const DUR_RE =");
const b = src.indexOf("/* ══", a);
if (a < 0 || b < 0) throw new Error("could not find the step timers — has RecipeBox.jsx moved on?");

const NAMES = "stepParts, stepDuration, clock, durLabel";
const { stepParts, stepDuration, clock, durLabel } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(a, b) + "export { " + NAMES + " };")
);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── the label says what the timer will do ── */
is("seconds under a minute are seconds", durLabel(45), "45 sec");
is("a whole minute stays short", durLabel(60), "1 min");
is("...and so do whole minutes", durLabel(600), "10 min");
is("a minute and a bit keeps the bit", durLabel(75), "1 min 15 sec");
is("...however odd the bit", durLabel(150), "2 min 30 sec");
is("a whole hour stays short", durLabel(3600), "1 hr");
is("half past the hour is minutes, not a decimal", durLabel(5400), "1 hr 30 min");
is("an hour with a stray minute keeps it", durLabel(3700), "1 hr 1 min 40 sec");
is("nothing at all is still a duration", durLabel(0), "0 sec");
is("a fraction of a second is rounded, not printed", durLabel(90.4), "1 min 30 sec");

/* ── the label agrees with the timer that runs ── */
for (const secs of [45, 75, 150, 600, 3600, 5400, 3700]) {
  const parsed = [...durLabel(secs).matchAll(/(\d+)\s*(hr|min|sec)/g)]
    .reduce((t, [, n, u]) => t + Number(n) * (u === "hr" ? 3600 : u === "min" ? 60 : 1), 0);
  is(`"${durLabel(secs)}" adds back up to ${secs}`, parsed, secs);
}

/* ── reading the duration out of the step ── */
is("a step in seconds is read in seconds", stepDuration("Blend on high for 75 seconds, stopping once to scrape down."), 75);
is("...and that is what the button says", durLabel(stepDuration("Blend on high for 75 seconds.")), "1 min 15 sec");
is("minutes are read as minutes", stepDuration("Simmer for 20 minutes."), 1200);
is("a range takes the longer end", stepDuration("Bake 25-30 min until golden."), 1800);
is("hours are read as hours", stepDuration("Rest in the fridge for 2 hours."), 7200);
is("a fractional minute lands on the second", durLabel(stepDuration("Whisk for 1.5 minutes.")), "1 min 30 sec");
is("an explicit timer wins over the words", stepDuration({ text: "Blend for 75 seconds.", seconds: 90 }), 90);
is("a zero says this step has no timer", stepDuration({ text: "Blend for 75 seconds.", seconds: 0 }), null);
is("a step with no duration has no timer", stepDuration("Season to taste."), null);
is("something too brief to time is left alone", stepDuration("Rest for 5 seconds."), null);

/* ── the running clock, for company ── */
is("the clock counts down in minutes and seconds", clock(75), "1:15");
is("...and adds hours when there are any", clock(3661), "1:01:01");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
