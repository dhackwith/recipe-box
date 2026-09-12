/**
 * Working out roughly what a day needs.
 *
 * Everything here is an estimate and the wording in the app says so. Two people
 * of the same height, weight, age and sex can differ by several hundred
 * calories a day, and no formula sees any of the reasons why.
 *
 * Deliberately conservative about what it will suggest:
 *   - the goals on offer are maintain, a gentle loss and a gentle gain. There is
 *     no aggressive deficit, because a number on a family recipe site is not the
 *     place for one.
 *   - no suggestion ever goes below the resting figure — the calories a body
 *     spends doing nothing at all. Cutting under that is a thing to do with a
 *     doctor, not with a web page, so the number is clamped and the app says
 *     why rather than quietly showing something lower.
 */

/* Mifflin-St Jeor. The usual starting point, and about as good as an equation
   gets without measuring somebody directly. */
export function restingBurn({ sex, kg, cm, age }) {
  if (!(kg > 0) || !(cm > 0) || !(age > 0)) return null;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  /* The formula only carries these two terms, which is a real limitation of it
     rather than a statement about anybody. Anyone who picks neither gets the
     midpoint of the two, which is the honest answer here. */
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base - 78;
}

export const ACTIVITY = [
  { id: "sedentary", label: "Mostly sitting", note: "Desk work, little exercise", factor: 1.2 },
  { id: "light", label: "Lightly active", note: "On your feet some, or 1–3 workouts a week", factor: 1.375 },
  { id: "moderate", label: "Moderately active", note: "3–5 workouts a week", factor: 1.55 },
  { id: "active", label: "Very active", note: "Hard exercise 6–7 days, or physical work", factor: 1.725 },
];

export const GOALS = [
  { id: "maintain", label: "Stay where I am", adjust: 1 },
  { id: "lose", label: "Lose slowly", adjust: 0.85, note: "About 15% under maintenance" },
  { id: "gain", label: "Gain slowly", adjust: 1.1, note: "About 10% over maintenance" },
];

const round5 = (n) => Math.round(n / 5) * 5;

/**
 * What a day looks like for this body: resting burn, the burn with movement,
 * the suggested target, and the macros to aim at within it.
 *
 * `floored` is true when the goal would have gone under the resting figure and
 * was held there instead — the app shows that rather than hiding it.
 */
export function dailyTargets(profile) {
  const rest = restingBurn(profile);
  if (rest == null) return null;

  const activity = ACTIVITY.find((a) => a.id === profile.activity) || ACTIVITY[0];
  const goal = GOALS.find((g) => g.id === profile.goal) || GOALS[0];

  const burn = rest * activity.factor;
  const wanted = burn * goal.adjust;
  const floored = wanted < rest;
  const calories = round5(Math.max(wanted, rest));

  /* Protein from body weight rather than from a share of the calories, which is
     the way it is normally prescribed and does not drift when the target moves.
     Fat gets a quarter of the day; carbohydrate takes what is left, which is
     what makes it the number that moves when a goal changes. */
  const protein = Math.round(1.6 * profile.kg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { rest: round5(rest), burn: round5(burn), calories, floored, protein, fat, carbs };
}

/* BMI, with the caveat attached rather than left for somebody to remember. It
   is a ratio of weight to height and nothing else: it cannot tell muscle from
   fat, and it reads differently across builds and ancestries. Useful as one
   number among several, misleading as a verdict. */
export function bmi({ kg, cm }) {
  if (!(kg > 0) || !(cm > 0)) return null;
  const value = kg / (cm / 100) ** 2;
  const band =
    value < 18.5 ? "under the usual range" :
    value < 25 ? "in the usual range" :
    value < 30 ? "over the usual range" : "well over the usual range";
  return { value: Math.round(value * 10) / 10, band };
}

/* ── units ──────────────────────────────────────────────────────────
   Stored in metric because the formulas are, entered in whichever the person
   thinks in. The recipes are in cups and ounces, so imperial is the default. */
export const lbToKg = (lb) => (Number(lb) || 0) * 0.45359237;
export const kgToLb = (kg) => (Number(kg) || 0) / 0.45359237;
export const inToCm = (inches) => (Number(inches) || 0) * 2.54;
export const cmToIn = (cm) => (Number(cm) || 0) / 2.54;
export const feetInchesToCm = (ft, inches) => inToCm((Number(ft) || 0) * 12 + (Number(inches) || 0));
export const cmToFeetInches = (cm) => {
  const total = Math.round(cmToIn(cm));
  return { feet: Math.floor(total / 12), inches: total % 12 };
};
