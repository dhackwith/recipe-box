/**
 * Reading a recipe in other units.
 *
 * The arithmetic is the easy half and is barely tested here. What is tested is
 * the judgement: that a cup comes back as 240ml rather than 236.588, that a
 * teaspoon is left alone because metric kitchens have teaspoons too, that
 * "8 minutes" is not a measurement, and that an ounce of brandy and an ounce of
 * flour are not the same kind of ounce.
 */

import {
  convertMeasure, convertText, convertIngredient, toNumber, prettyNumber, SYSTEMS, isSystem,
} from "../src/units.js";

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const metric = (t) => convertText(t, "metric");
const us = (t) => convertText(t, "us");

console.log("\n— numbers people would actually write —");
is("a cup is 240ml, not 236.588", metric("2 cups flour"), "480 ml flour");
is("half a cup", metric("½ cup sugar"), "120 ml sugar");
is("a quarter cup", metric("¼ cup oil"), "60 ml oil");
is("a pound lands on a round number", metric("1 lb beef"), "455 g beef");
is("half a pound", metric("½ lb butter"), "225 g butter");
is("four ounces of something solid", metric("4 oz chocolate"), "115 g chocolate");
is("past a litre it changes unit", metric("2 quarts stock"), "1.89 l stock");
is("and past a kilo", metric("3 lb flour"), "1.36 kg flour");
is("a mixed number", metric("1½ cups milk"), "360 ml milk");

console.log("\n— spoons stay spoons —");
/* Converting these is right and useless: metric kitchens own teaspoons, and
   nobody has ever written "5 ml of vanilla" on a recipe card. */
is("a teaspoon is left alone going metric", metric("1 tsp vanilla"), "1 tsp vanilla");
is("so is a tablespoon", metric("2 tbsp olive oil"), "2 tbsp olive oil");
is("...and the long spelling", metric("1 tablespoon honey"), "1 tablespoon honey");
is("but small millilitres become spoons going the other way", us("15 ml vanilla"), "1 tbsp vanilla");
is("...and very small ones become teaspoons", us("5 ml salt"), "1 tsp salt");

console.log("\n— the other direction —");
is("millilitres become cups", us("500 ml wine"), "2⅛ cups wine");
is("a round cup comes back round", us("240 ml water"), "1 cup water");
is("one cup is singular", us("240 ml stock"), "1 cup stock");
is("litres too", us("1.5 l wine"), "6¼ cups wine");
is("grams become ounces", us("200 g sugar"), "7 oz sugar");
/* A fraction rather than a decimal, because that is how the rest of the app
   prints a quantity and a recipe should not change voice halfway down. */
is("...and bigger ones pounds", us("500 g beef"), "1⅛ lb beef");
is("centimetres become inches", us("23 cm tin"), "9 inches tin");
is("inches become centimetres", metric("9 inch tin"), "22.9 cm tin");

console.log("\n— an ounce is two different things —");
/* The measure cannot say which; only what is being measured can. */
is("an ounce of brandy pours", metric("6 oz Spanish brandy"), "175 ml Spanish brandy");
is("an ounce of juice pours", metric("12 oz fresh orange juice"), "355 ml fresh orange juice");
is("an ounce of club soda pours", metric("12 oz club soda"), "355 ml club soda");
is("an ounce of flour does not", metric("8 oz flour"), "225 g flour");
is("an ounce of chocolate does not", metric("2 oz dark chocolate"), "55 g dark chocolate");
is("said explicitly, it always pours", metric("8 fl oz cream"), "235 ml cream");
is("a pound is never a volume, whatever it is a pound of",
  metric("1 lb tomato juice"), "455 g tomato juice");

console.log("\n— what must not be touched —");
is("minutes are not a measurement", metric("Simmer for 8 minutes"), "Simmer for 8 minutes");
is("neither are steps", metric("Repeat step 2 of 6"), "Repeat step 2 of 6");
is("nor servings", metric("Serves 6"), "Serves 6");
is("nor a count of things", metric("2 oranges, sliced"), "2 oranges, sliced");
is("nor cloves", metric("3 cloves garlic"), "3 cloves garlic");
is("a unit nobody recognises is left as it is", metric("2 knobs butter"), "2 knobs butter");
is("as written changes nothing at all", convertText("2 cups flour", "as-written"), "2 cups flour");
is("...and neither does nonsense", convertText("2 cups flour", "klingon"), "2 cups flour");
is("empty in, empty out", convertText("", "metric"), "");
is("nothing in", convertText(null, "metric"), null);
/* "in" is a preposition far more often than it is an inch. */
is("a bare in is not an inch", metric("Fry 2 in butter"), "Fry 2 in butter");

console.log("\n— ovens —");
is("a US oven in metric", metric("Bake at 425°F"), "Bake at 220°C");
is("...a common one", metric("Bake at 350°F"), "Bake at 175°C");
is("...written out", metric("Bake at 400 degrees F"), "Bake at 205°C");
is("a metric oven in US", us("Bake at 180°C"), "Bake at 350°F");
is("...and a hot one", us("Bake at 220°C"), "Bake at 425°F");
is("a bare degree sign is read by the number it carries", metric("Bake at 425°"), "Bake at 220°C");
is("...and the other way", us("Bake at 200°"), "Bake at 400°F");
is("an oven already in the right scale is left alone", metric("Bake at 200°C"), "Bake at 200°C");
is("a temperature is not converted twice", metric(metric("Bake at 425°F")), "Bake at 220°C");

console.log("\n— ranges —");
is("both ends move", metric("1–2 cups stock"), "240–480 ml stock");
is("...with one unit between them, not two", /ml.*ml/.test(metric("1–2 cups stock")), false);
is("a written range", metric("2 to 3 lb beef"), "905 to 1.36 kg beef");
is("a hyphen range going the other way", us("200-400 g flour"), "7-14.1 oz flour");

console.log("\n— a whole ingredient line —");
is("the sangria, in metric",
  convertIngredient("1500 ml dry Spanish red wine (Garnacha or Tempranillo)", "us"),
  "6¼ cups dry Spanish red wine (Garnacha or Tempranillo)");
is("brackets are converted too, unlike when scaling",
  metric("1 can (14 oz) crushed tomatoes"), "1 can (395 g) crushed tomatoes");
/* Scaling deliberately leaves a pan alone — doubling a recipe does not change
   the tin. Converting one must not, because the tin is the same size either
   way and only its description changes. */
is("a pan is resized in words, not in fact", metric("a 9 inch cake pan"), "a 22.9 cm cake pan");

console.log("\n— one measurement at a time —");
is("a cup", convertMeasure(1, "cup", "metric"), { amount: "240", unit: "ml" });
is("an unknown unit", convertMeasure(1, "sprig", "metric"), null);
is("no unit", convertMeasure(1, "", "metric"), null);
is("nothing", convertMeasure(null, "cup", "metric"), null);
is("a negative amount", convertMeasure(-2, "cup", "metric"), null);
is("zero", convertMeasure(0, "cup", "metric"), null);
is("a unit already in the target system is left to the caller", convertMeasure(1, "ml", "metric"), null);

console.log("\n— the quantity reader that came along with it —");
is("a vulgar fraction", toNumber("½"), 0.5);
is("a mixed number", toNumber("1½"), 1.5);
is("a written fraction", toNumber("3/4"), 0.75);
is("a mixed written fraction", toNumber("1 1/2"), 1.5);
is("a decimal", toNumber("2.5"), 2.5);
is("rubbish", toNumber("lots"), null);
is("a half prints as a glyph", prettyNumber(0.5), "½");
is("and a mixed number", prettyNumber(1.5), "1½");
is("big numbers stay decimal", prettyNumber(12.34), "12.3");

console.log("\n— the settings on offer —");
is("three of them", SYSTEMS.length, 3);
is("as written is one", isSystem("as-written"), true);
is("and anything else is not", isSystem("imperial"), false);

console.log("\n— amounts the recipe already gives —");
/* The Smitten Kitchen loaf that raised this: sugar shown as 80 ml when the
   recipe itself says 72 grams, and butter as "(85 g or 85 grams)". */
is("the weight a recipe gives is shown, not its cup converted",
  metric("1/3 cup (72 grams) plus 1 tablespoon (15 grams) light brown sugar, divided"),
  "72 g plus 15 g light brown sugar, divided");
is("...on a plain line", metric("1/3 cup (65 grams) granulated sugar"), "65 g granulated sugar");
is("...and from a bracket giving both, its metric half",
  metric("6 tablespoons (3 ounces or 85 grams) unsalted butter, cold is fine"), "85 g unsalted butter, cold is fine");
is("...after a mixed number", metric("1⅓ cups (180 grams) all-purpose flour"), "180 g all-purpose flour");
is("...after a pound", metric("1¼ pounds (565 grams) peaches, pitted"), "565 g peaches, pitted");
is("...the author's number, not rounded to a five", metric("½ cup (113 grams) butter"), "113 g butter");
is("...weight before volume when a bracket gives both", metric("1 cup (240 ml or 200 g) sugar"), "200 g sugar");
is("...a volume when that is all it gives", metric("1 cup (240 ml) whole milk"), "240 ml whole milk");
is("...a stick of butter", metric("1 stick (113 g) butter"), "113 g butter");
is("...a pan's size in centimetres", metric("a 9 inch (23 cm) square pan"), "a 23 cm square pan");
is("US takes the ounces a metric recipe gives", us("225 g (8 oz) butter"), "8 oz butter");

is("in US, a bracket that gives both is left exactly as written",
  us("6 tablespoons (3 ounces or 85 grams) unsalted butter"), "6 tablespoons (3 ounces or 85 grams) unsalted butter");
is("...and in metric when no measure leads it", metric("butter (3 ounces or 85 grams)"), "butter (3 ounces or 85 grams)");
is("a bracket only restating an amount already in the reader's system is dropped, not doubled",
  metric("225 g (8 oz) butter"), "225 g butter");
is("...the other way too", us("1 cup (240 ml) whole milk"), "1 cup whole milk");
is("but a bracket giving a different kind of amount stays: a weight beside a cup",
  us("1/3 cup (72 grams) light brown sugar"), "1/3 cup (2½ oz) light brown sugar");

is("a cup with nothing beside it still converts", metric("1 cup sugar"), "240 ml sugar");
is("a bracket saying more than an amount converts as it did",
  metric("2 cups (about 1 lb) cherries"), "480 ml (about 455 g) cherries");
is("a count's bracket is left alone", metric("2 eggs (100 g)"), "2 eggs (100 g)");
is("a can's bracket still converts", metric("1 can (14 oz) crushed tomatoes"), "1 can (395 g) crushed tomatoes");

console.log("\n— scaling a line —");
const { scaleLine } = await import("../src/units.js");
is("the leading amount scales", scaleLine("2 cups flour", 2), "4 cups flour");
is("a bracket restating a leading measure scales with it",
  scaleLine("1/3 cup (72 grams) light brown sugar", 2), "⅔ cup (144 grams) light brown sugar");
is("...both halves of an either-or",
  scaleLine("6 tablespoons (3 ounces or 85 grams) butter", 1.5), "9 tablespoons (4½ ounces or 127.5 grams) butter");
is("...so metric shows the right weight at double servings",
  metric(scaleLine("1/3 cup (72 grams) light brown sugar", 2)), "144 g light brown sugar");
is("a can's size does not scale", scaleLine("1 can (14 oz) crushed tomatoes", 2), "2 can (14 oz) crushed tomatoes");
is("a bracket further along the line is left", scaleLine("2 cups cherries (about 1 lb)", 2), "4 cups cherries (about 1 lb)");
is("at the recipe's own servings nothing changes", scaleLine("1/3 cup (72 grams) sugar", 1), "1/3 cup (72 grams) sugar");
is("a line with no amount is left", scaleLine("Salt to taste", 3), "Salt to taste");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
