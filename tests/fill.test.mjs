/**
 * The Workers AI gap-filler, with the model stubbed out. What matters here is
 * not what a model says but what survives checking: steps that aren't on the
 * page, and equipment the page never mentions, must never reach the form.
 */

import { recipeText, stepTexts, groundedSteps, groundedEquipment, suggest, MODEL } from "../shared/fill.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* A recipe card that labels its name and ingredients but not its method —
   the shape that leaves steps for the model to find. */
const dalPage = `<!doctype html><html><body><nav>Home · Recipes · About</nav>
<article><h1>Weeknight Dal</h1><p>We ate this every Tuesday growing up.</p>
<div class="h-recipe"><h2 class="p-name">Weeknight Dal</h2>
<ul><li class="p-ingredient">1 cup red lentils</li><li class="p-ingredient">1 onion, chopped</li></ul>
<h3>Method</h3>
<p>Rinse the lentils in a sieve until the water runs clear.</p>
<p>Soften the onion in a heavy saucepan over medium heat &#8212; about 8 minutes. Don&#8217;t let it brown.</p>
<p>Add the lentils and 3 cups of water, simmer for 20 minutes, then whisk until creamy.</p>
</div></article>
<aside><h4>Popular</h4><p>Best brownies, made in a stand mixer.</p></aside><footer>© 2026</footer></body></html>`;

/* ── what the model is shown ── */
const text = recipeText(dalPage);
is("the recipe card is read", text.includes("Rinse the lentils in a sieve"), true);
is("...with entities decoded", text.includes("Don’t let it brown"), true);
is("...but not the story above it", text.includes("every Tuesday"), false);
is("...nor the sidebar beside it", text.includes("stand mixer"), false);
is("with no card, the article is read, less its furniture",
  recipeText(`<body><nav>Menu</nav><article><header><button>Jump to recipe</button></header><p>Stir well.</p><footer>Share this</footer></article><aside>Ads</aside></body>`),
  "Stir well.");
is("a very long page is cut to size", recipeText(`<article><p>${"word ".repeat(10000)}</p></article>`).length, 16000);

is("existing steps are read from every shape", stepTexts([
  "<p>One.</p><p>Two.</p>",
  { "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Three." }] },
  "Four.\nFive.",
]), ["One.", "Two.", "Three.", "Four.", "Five."]);
is("no instructions is no steps", stepTexts(undefined), []);

/* ── steps: kept only when they are really on the page ── */
const real = [
  "Rinse the lentils in a sieve until the water runs clear.",
  "Soften the onion in a heavy saucepan over medium heat — about 8 minutes. Don't let it brown.",
  "Add the lentils and 3 cups of water, simmer for 20 minutes, then whisk until creamy.",
];
is("steps copied from the page are kept", groundedSteps(real, text), real);
is("...even with punctuation and case changed",
  groundedSteps(["rinse the lentils in a sieve, until the water runs clear"], text).length, 1);
is("a number the model added is taken off",
  groundedSteps(["1. Rinse the lentils in a sieve until the water runs clear."], text), [real[0]]);
is("an invented step is dropped",
  groundedSteps([...real, "Garnish with fresh coriander and serve with rice."], text), real);
is("a reworded step is dropped",
  groundedSteps([real[0], real[1], "Simmer the lentils in water until soft, then whisk."], text), [real[0], real[1]]);
is("when a third or more are made up, none are trusted",
  groundedSteps([real[0], "Preheat the grill to high.", "Serve it on buttered toast."], text), []);
is("an ingredient offered as a step is dropped without counting against the rest",
  groundedSteps(["1 cup red lentils", real[0]], text, ["1 cup red lentils", "1 onion, chopped"]), [real[0]]);
is("a fragment too short to check is dropped quietly", groundedSteps(["Stir.", real[0]], text), [real[0]]);
is("nothing offered is nothing kept", groundedSteps(undefined, text), []);
is("non-strings are ignored", groundedSteps([42, null, real[0]], text), [real[0]]);

/* ── equipment: kept only when the page gives reason to believe it ── */
is("equipment the page mentions is kept, capitalised",
  groundedEquipment(["sieve", "heavy saucepan", "whisk"], text), ["Sieve", "Heavy saucepan", "Whisk"]);
is("equipment it never mentions is dropped", groundedEquipment(["Stand mixer", "Sieve"], text), ["Sieve"]);
is("a size word alone does not ground it", groundedEquipment(["Heavy skillet"], text), []);
is("plurals still match", groundedEquipment(["Saucepans"], text), ["Saucepans"]);
is("the oven and stove are left out", groundedEquipment(["Oven", "Stove"], text), []);
is("duplicates are dropped", groundedEquipment(["Whisk", "whisk"], text), ["Whisk"]);
is("a size stays attached to what it sizes", groundedEquipment(["9x5-inch loaf pan"], "Butter a loaf pan."), ["9x5-inch loaf pan"]);
is("a bullet or number the model added is removed", groundedEquipment(["- whisk", "2) sieve"], text), ["Whisk", "Sieve"]);
is("an essay is not a piece of equipment",
  groundedEquipment(["a whisk, or failing that a fork held at an angle"], text), []);
is("no more than twelve", groundedEquipment(Array.from({ length: 20 }, (_, i) => `whisk ${i}`), "whisk").length, 12);

/* ── asking only for what is missing ── */
const stub = (answer) => {
  const calls = [];
  return {
    calls,
    run: async (model, input) => {
      calls.push({ model, input });
      if (answer instanceof Error) throw answer;
      return { response: answer };
    },
  };
};
const fieldsAsked = (ai) => Object.keys(ai.calls[0].input.response_format.json_schema.properties);

{
  const ai = stub({ equipment: ["whisk", "stand mixer"] });
  const got = await suggest(ai, { name: "Eggs", recipeInstructions: ["Whisk the eggs."] }, "<p>not read</p>");
  is("with steps known, only equipment is asked for", fieldsAsked(ai), ["equipment"]);
  is("...read from the steps, not the page", ai.calls[0].input.messages[1].content.includes("Whisk the eggs."), true);
  is("...with a small answer budget", ai.calls[0].input.max_tokens, 300);
  is("...of the JSON-mode model", ai.calls[0].model, MODEL);
  is("...and only grounded equipment comes back", got, { steps: [], equipment: ["Whisk"] });
}
{
  const ai = stub("```json\n" + JSON.stringify({ steps: [...real, "Serve with warm naan."], equipment: ["sieve", "whisk"] }) + "\n```");
  const got = await suggest(ai, { name: "Weeknight Dal", recipeIngredient: ["1 cup red lentils"] }, dalPage);
  is("with no steps, both are asked for", fieldsAsked(ai), ["steps", "equipment"]);
  is("...from the recipe card's text", ai.calls[0].input.messages[1].content.includes("Rinse the lentils"), true);
  is("...an answer in a code fence still reads, invented step dropped", got.steps, real);
  is("...with the equipment checked against the page", got.equipment, ["Sieve", "Whisk"]);
}
{
  const ai = stub({ steps: ["x"] });
  is("nothing missing asks nothing",
    await suggest(ai, { recipeInstructions: ["Stir it."], tool: [{ "@type": "HowToTool", name: "Spoon" }] }, dalPage),
    { steps: [], equipment: [] });
  is("...and costs nothing", ai.calls.length, 0);
}
{
  const ai = stub({ steps: real });
  await suggest(ai, { name: "Dal", tool: ["Sieve"] }, dalPage);
  is("equipment already listed is not asked for again", fieldsAsked(ai), ["steps"]);
}
{
  const ai = stub({ equipment: [] });
  is("no steps and no page text to find them in asks nothing", await suggest(ai, { name: "Dal" }, "<p>Hi</p>"), { steps: [], equipment: [] });
  is("...and costs nothing", ai.calls.length, 0);
}
{
  let threw = false;
  try { await suggest(stub("not json at all"), { recipeInstructions: ["Whisk."] }, ""); } catch { threw = true; }
  is("an unreadable answer is an error, not an empty suggestion", threw, true);
}

/* ── through the real handler, network stubbed ── */
const { onRequest } = await import("../functions/api/fetch-recipe.js");
const ask = async (html, env, kind = "fill") => {
  globalThis.fetch = async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  const res = await onRequest({
    request: new Request("https://thehackwithtable.com/api/fetch-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/a-recipe", kind }),
    }),
    env,
  });
  return { status: res.status, data: JSON.parse(await res.text()) };
};

const off = await ask(dalPage, {});
is("without a Workers AI binding, fill says it isn't switched on", off.status, 501);

const on = await ask(dalPage, { AI: stub({ steps: real, equipment: ["sieve"] }) });
is("with one, it answers", on.status, 200);
is("...with checked steps", on.data.steps, real);
is("...and checked equipment", on.data.equipment, ["Sieve"]);
is("...and nothing else: not the page, not the recipe", Object.keys(on.data).sort(), ["equipment", "steps"]);

const spent = await ask(dalPage, { AI: stub(new Error("4006: you have used up your daily free allocation of 10,000 neurons")) });
is("a used-up daily allowance is a 429", spent.status, 429);
is("...that says when it comes back", /midnight UTC/.test(spent.data.error || ""), true);

const broken = await ask(dalPage, { AI: stub(new Error("JSON Mode couldn't be met")) });
is("a model that can't answer is a 502", broken.status, 502);

const plain = await ask(dalPage, { AI: stub(new Error("should not be called")) }, null);
is("a plain import never touches the model", plain.status === 200 && !!plain.data.recipe, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
