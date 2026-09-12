/**
 * Turning what a recipe writes into what a shop sells.
 *
 * The hard half is not stripping words — it is knowing which ones to leave.
 * "Frozen banana" is a banana you freeze; "frozen peas" are bought frozen. Half
 * of these cases exist to make sure nothing useful is thrown away.
 */

import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const src = readFileSync(new URL("../src/RecipeBox.jsx", here), "utf8");

const a = src.indexOf("const DEGREE = new Set([");
const b = src.indexOf("function parseLine(line) {", a);
if (a < 0 || b < 0) throw new Error("could not find shoppingName — has RecipeBox.jsx moved on?");

const fold = "const fold = (v) => String(v || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n";
const { shoppingName } = await import(
  "data:text/javascript," + encodeURIComponent(fold + src.slice(a, b) + "\nexport { shoppingName };")
);

let pass = 0, fail = 0;
const is = (input, want) => {
  const got = shoppingName(input);
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}"${input}" → "${got}"${ok ? "" : `   (wanted "${want}")`}`);
};

console.log("\n— prep comes off —");
is("frozen banana", "banana");                    // the one that started this
is("melted butter", "butter");
is("softened cream cheese", "cream cheese");
is("finely chopped onion", "onion");
is("roughly chopped walnuts", "walnuts");
is("cooked rice", "rice");
is("room temperature eggs", "eggs");
is("peeled and deveined shrimp", "shrimp");
is("thinly sliced mushrooms", "mushrooms");
is("drained chickpeas", "chickpeas");
is("toasted walnuts", "walnuts");
is("shredded lettuce", "lettuce");
is("crushed walnuts", "walnuts");
is("ground walnuts", "walnuts");

console.log("\n— but not when the word is how it is sold —");
is("frozen peas", "frozen peas");
is("frozen spinach", "frozen spinach");
is("frozen blueberries", "frozen blueberries");
is("frozen puff pastry", "frozen puff pastry");
is("ground beef", "ground beef");
is("ground cinnamon", "ground cinnamon");
is("ground black pepper", "ground black pepper");
is("shredded mozzarella", "shredded mozzarella");
is("grated parmesan", "grated parmesan");
is("crushed tomatoes", "crushed tomatoes");
is("sliced almonds", "sliced almonds");
is("toasted sesame oil", "toasted sesame oil");
is("rolled oats", "rolled oats");
is("crumbled feta", "crumbled feta");

console.log("\n— and never these, which separate two things on the same shelf —");
is("dried oregano", "dried oregano");
is("fresh basil", "fresh basil");
is("smoked paprika", "smoked paprika");
is("canned chickpeas", "canned chickpeas");
is("unsalted butter", "unsalted butter");
is("raw honey", "raw honey");
is("whole milk", "whole milk");
is("large eggs", "large eggs");
is("salt and pepper", "salt and pepper");        // the joiner must not eat this

console.log("\n— nothing left to strip —");
is("banana", "banana");
is("butter", "butter");
is("", "");
is("   ", "");
is("chopped", "chopped");                        // never reduce a name to nothing

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
