# Recipe template for the recipe box

Everything here targets the importer as it actually behaves — structured frontmatter,
`{id}` placeholders, explicit timers, equipment. Paste section 1 into whichever AI you
use and the output will import without touching a single field by hand.

Nothing here is particular to one assistant. It is a plain-text prompt and a schema, so
any model that can follow a format will do — and if one writes something the importer
cannot read, the rules in section 1 are what to hold it to.

---

## 1. The prompt to paste

> Give me a recipe for **[DISH]**.
>
> Output it as one markdown file and nothing else — no preamble, no closing commentary,
> no code fence around the whole thing. Follow this schema exactly:
>
> ```
> ---
> title: "Recipe Name"
> contributor: "Devon"
> description: "One or two sentences. What it tastes like, when to make it."
> servings: 4
> yield: "Makes about 6 cups"
> prep_time_minutes: 15
> cook_time_minutes: 30
> total_time_minutes: 45
> course: "Dinner"
> cuisine: "Italian"
> tags:
>   - weeknight
>   - one-pan
> equipment:
>   - 12-inch skillet
>   - kitchen scale
>   - instant-read thermometer
> ingredients:
>   - id: "onion"
>     group: "For the base"
>     amount: 1
>     name: "yellow onion, diced"
>   - id: "butter"
>     group: "For the base"
>     amount: 2
>     unit: "tbsp"
>     name: "unsalted butter"
>   - id: "thyme"
>     group: "To finish"
>     amount: 0.5
>     unit: "tsp"
>     name: "dried thyme"
>     optional: true
> nutrition:
>   calories: 320
>   fat: "18 g"
>   saturated_fat: "7 g"
>   carbs: "31 g"
>   fiber: "2 g"
>   sugars: "12 g"
>   protein: "8 g"
>   sodium: "410 mg"
> steps:
>   - id: "s1"
>     group: "For the base"
>     title: "Short imperative title"
>     content: "The instruction. Reference ingredients as {onion} and {butter} — the site
>       swaps in the real amounts. Say why a step matters, not just what to do."
>     timer_seconds: 300
> ---
>
> Any prose you want to add — background, substitutions, a table of swaps — goes
> below the closing `---`. It lands in the recipe's Notes.
> ```
>
> Rules:
> - `amount` is a plain number. Use decimals, not fractions: `0.75`, `1.3`, `2`.
> - Omit `unit` for countable things and fold the noun into `name` ("3 garlic cloves"
>   → `amount: 3`, `name: "garlic cloves"`).
> - Give every ingredient an `id`, and reference it in steps as `{id}`.
> - Give `timer_seconds` to **every** step with a definite duration, and not only the
>   long unattended ones. "Blend for 60 seconds", "whisk 90 seconds", "sear 2 minutes a
>   side", "knead 5 minutes" and "rest 10 minutes" all earn a button — a cook with wet
>   hands would far rather tap one than find a clock.
> - Write the duration into `content` as well. The prose has to read properly on its
>   own, and the two must agree: 60 seconds in the text, `timer_seconds: 60` beside it.
> - If a step has a duration, pin it down. "Blend until smooth" helps nobody hold a
>   blender; "blend for 60 seconds, until no flecks of skin are left" does.
> - It is all or nothing. Declaring `timer_seconds` on some steps but not others
>   suppresses the timers the site would otherwise read out of the prose on the rest,
>   so give the steps that genuinely have no duration `timer_seconds: 0`.
> - Durations left in the prose alone have to be 20 seconds or longer to be spotted.
>   An explicit `timer_seconds` has no floor, so declare anything shorter.
> - `servings` must be a bare number — it drives the serving-size scaler.
> - `prep_time_minutes` and `cook_time_minutes` are bare numbers of minutes. Give both
>   where the recipe has both: they are what the site sorts and filters the box by, and
>   "under 30 minutes" cannot be asked of a recipe that only wrote its time in words.
>   Keep `total_time_minutes` in step with them.
> - `course` is one of: Breakfast, Lunch, Dinner, Starter, Side, Salad, Soup, Snack,
>   Baking, Dessert, Drinks, Sauces and dressings, Preserves. Anything else is read as
>   near to that list as it can be, so prefer the words above.
> - `cuisine` is open — whatever is true, one or two words.
> - `group` is optional, and only earns its place on a recipe with genuinely separate
>   parts: a sauce and a base, a cake and its icing. Give it to every ingredient and
>   every step in that part, spelled the same each time, and leave it off entirely on a
>   recipe that is just one thing. Consecutive items sharing a group become one heading
>   above the first of them.
> - List `equipment` for anything beyond a knife and a bowl, including measuring tools.
> - Work out `nutrition` yourself: take each ingredient at the amount listed, look up
>   what that quantity contributes, total the recipe, then divide by `servings`. The
>   numbers you publish are for **one serving of the finished dish**, not for the
>   whole batch and not per ingredient.
> - `calories` is a bare number. Every other value is a quoted string carrying its
>   unit — `"18 g"`, `"410 mg"` — because the site prints them exactly as written.
> - Skip ingredients marked `optional: true`; they may never go in.
> - Count what is actually eaten. Frying oil that stays in the pan, a brine that gets
>   poured off, or a marinade that is discarded should not be counted in full.
> - Round honestly: calories to the nearest 5, grams to the nearest whole, milligrams
>   to the nearest 10. False precision reads as authority the estimate has not earned.
> - Omit any line you cannot estimate rather than guessing — the site renders only the
>   rows present, so a partial block is fine and a wrong one is not.

---

## 2. Blank schema

```markdown
---
title: ""
contributor: ""
description: ""
servings: 4
yield: ""
prep_time_minutes: 0
cook_time_minutes: 0
total_time_minutes: 0
course: ""
cuisine: ""
tags:
  - 
equipment:
  - 
ingredients:
  - id: ""
    group: ""
    amount: 0
    unit: ""
    name: ""
nutrition:
  calories: 0
  fat: ""
  saturated_fat: ""
  carbs: ""
  fiber: ""
  sugars: ""
  protein: ""
  sodium: ""
steps:
  - id: "s1"
    group: ""
    title: ""
    content: ""
    timer_seconds: 0
---

Prose goes here and becomes the recipe's Notes.
```

---

## 3. Filled example

```markdown
---
title: "Skillet Cornbread"
contributor: "Devon"
description: "Crisp-edged, barely sweet cornbread baked in a preheated cast iron pan."
servings: 8
prep_time_minutes: 10
cook_time_minutes: 25
total_time_minutes: 35
course: "Side"
cuisine: "American"
tags:
  - baking
  - quick
equipment:
  - 10-inch cast iron skillet
  - Kitchen scale
  - Whisk
ingredients:
  - id: "cornmeal"
    amount: 1.5
    unit: "cup"
    name: "medium-grind yellow cornmeal"
  - id: "flour"
    amount: 0.5
    unit: "cup"
    name: "all-purpose flour"
  - id: "buttermilk"
    amount: 1.25
    unit: "cup"
    name: "buttermilk"
  - id: "eggs"
    amount: 2
    name: "large eggs"
  - id: "butter"
    amount: 4
    unit: "tbsp"
    name: "unsalted butter"
  - id: "honey"
    amount: 1
    unit: "tbsp"
    name: "honey"
    optional: true
nutrition:
  calories: 195
  fat: "8 g"
  saturated_fat: "4 g"
  carbs: "24 g"
  fiber: "1 g"
  sugars: "2 g"
  protein: "6 g"
  sodium: "60 mg"
steps:
  - id: "s1"
    title: "Preheat the skillet"
    content: "Put the empty skillet in the oven and heat to 425°F. A cold pan is the
      difference between a crust and a crumb — the batter has to hit hot iron."
    timer_seconds: 900
  - id: "s2"
    title: "Mix dry, then wet"
    content: "Whisk {cornmeal} and {flour} together for 90 seconds — cornmeal clumps, and
      the lumps you leave here are the lumps you eat. In a second bowl beat {eggs} into
      {buttermilk}, then add {honey} if using."
    timer_seconds: 90
  - id: "s3"
    title: "Melt and combine"
    content: "Pull the skillet out, melt {butter} in it, and pour most of the butter into
      the wet bowl, leaving a slick behind. Combine wet and dry until just mixed."
    timer_seconds: 0
  - id: "s4"
    title: "Bake"
    content: "Pour the batter into the hot skillet — it should hiss. Bake until the top
      is golden and the edges pull away."
    timer_seconds: 1200
---

Buttermilk is doing real work here; regular milk with a splash of vinegar is a
passable substitute but the crumb will be tighter.
```

---

## 4. What the importer does with each field

| Field | Result |
|---|---|
| `title` | Recipe name |
| `contributor` (or `author`, `from`) | "from ___'s kitchen", and feeds the Cooks filter |
| `description` | The intro paragraph with the drop cap |
| `servings` | Bare number becomes "Serves N" and enables the scaler |
| `yield` | Shown in Notes when `servings` is also set |
| `total_time_minutes` / `prep_time_minutes` / `time` | The time line |
| `tags` + `category` | Merged, lowercased, deduped into filter chips |
| `equipment` (or `tools`, `appliances`) | The "You'll need" list, searchable by Equipment scope |
| `ingredients[]` | `amount` + `unit` + `name`, rendered as fractions (`0.75` → `¾`), pluralized above 1, `optional: true` appends "(optional)" |
| `steps[].title` | Headline in cooking mode |
| `steps[].content` | The instruction; `{id}` resolves to the full ingredient |
| `steps[].timer_seconds` | A one-tap timer button, at any length — `60` for a blend, `1200` for a bake. `0` means this step has no duration |
| `nutrition` | The "Nutrition" panel under the ingredients, as an estimated per-serving label. Accepts `saturated_fat`, `saturatedFat` or `saturatedFatContent`; only the rows you supply are drawn |
| Body prose | Notes, with `#` and `**` stripped |
| Anything else | Parsed and discarded — `slug`, `scalable` included |

---

## 5. The lightweight version

For a quick recipe where the structured form is overkill, this imports fine too:

```markdown
---
title: Grandma's Pozole
contributor: Rosa
servings: Serves 8
tags: dinner, holiday
nutrition:
  calories: 410
  fat: "22 g"
  protein: "31 g"
  sodium: "890 mg"
---

A Sunday recipe.

## Equipment
- Dutch oven
- Ladle

## Ingredients
- 2 lb pork shoulder
- 3 cloves garlic

## Steps
1. Brown the pork: Sear it 8 minutes a side.
2. Simmer for 2 hours.

## Notes
Better on day two.
```

Quantities still scale, and durations in the step text ("8 minutes", "2 hours", "45
seconds") are detected as timers automatically, since no `timer_seconds` is declared
anywhere — though anything under 20 seconds is passed over. What you give up is `{id}`
substitution and per-step control over which timers exist.

`nutrition` works here too — it is read from the frontmatter either way, and a partial
block like the one above is fine.

---

## 6. A note on the nutrition numbers

They are estimates and the site says so on the recipe, under the heading. They come
from a language model reading an ingredient list, not from weighing the finished dish,
so treat them as a guide rather than a label — and do not rely on them for allergies,
medical diets, or anything where being wrong matters.

The figures move with the serving scaler. Write them **per serving** — one portion,
not the whole batch. The recipe page multiplies them by the number of servings showing
on the stepper, so the panel always describes the amount actually being made, and its
heading names the count it is showing.
