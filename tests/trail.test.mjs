/**
 * Back buttons on the tool pages. The bug that started this: recipes, then the
 * meal plan, then the shopping list, then back twice — and the second back went
 * nowhere, because the meal plan remembered coming from itself.
 */

import { trailTo, backFrom } from "../src/trail.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* ── the reported bug ── */
{
  let t = trailTo([], "list", "plan");
  t = trailTo(t, "plan", "shopping");
  let b = backFrom(t);
  is("back from the shopping list goes to the meal plan", b.to, "plan");
  b = backFrom(b.trail);
  is("...and back from the meal plan goes to the recipes, not to itself", b.to, "list");
  is("...with nothing left to go back through", b.trail, []);
}

/* ── moving between tools by their own buttons ── */
{
  let t = trailTo([], "list", "plan");
  t = trailTo(t, "plan", "shopping");
  t = trailTo(t, "shopping", "plan");
  is("returning to a page already on the path cuts the path back to it", t, ["list"]);
  is("...so back from it goes where it first came from", backFrom(t).to, "list");
}
{
  let t = trailTo([], "detail", "today");
  t = trailTo(t, "today", "plan");
  t = trailTo(t, "plan", "shopping");
  is("three tools deep, back retraces all three",
    [backFrom(t).to, backFrom(backFrom(t).trail).to, backFrom(backFrom(backFrom(t).trail).trail).to],
    ["plan", "today", "detail"]);
}
is("opening the page you're already on changes nothing", trailTo(["list"], "plan", "plan"), ["list"]);
is("with nowhere recorded, back goes to the recipes", backFrom([]), { to: "list", trail: [] });

/* ── a recipe opened from the meal plan ── */
{
  const t = trailTo(trailTo([], "list", "plan"), "plan", "detail");
  is("a recipe opened from the plan goes back to the plan", backFrom(t).to, "plan");
  is("...and the plan then goes back to the recipes", backFrom(backFrom(t).trail).to, "list");
}

/* ── no walk can ever make back loop ──
   Random journeys through every page, with a fixed seed so a failure can be
   replayed. After each one, going back must never revisit a page and must end
   at the recipes. */
{
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pages = ["list", "detail", "form", "plan", "shopping", "today"];
  let problems = 0;
  for (let walk = 0; walk < 500; walk++) {
    let at = "list";
    let t = [];
    for (let step = 0; step < 30; step++) {
      const to = pages[Math.floor(random() * pages.length)];
      t = trailTo(t, at, to);
      at = to;
      if (t.includes(at) || new Set(t).size !== t.length) problems++;
    }
    const seen = new Set([at]);
    for (let hops = 0; ; hops++) {
      const b = backFrom(t);
      if (seen.has(b.to) && b.to !== "list") { problems++; break; }
      seen.add(b.to);
      t = b.trail;
      if (b.to === "list" && !t.length) break;
      if (hops > pages.length) { problems++; break; }
    }
  }
  is("500 random journeys: the path never repeats, never holds the current page, and back always ends at the recipes", problems, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
