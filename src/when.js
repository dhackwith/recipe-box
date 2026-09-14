/**
 * When a note was written, in the reader's own time.
 *
 * Notes are stamped by the server as an exact moment in UTC, so nothing about
 * the writer's time zone is stored and nothing needs to be: the same moment is
 * "Friday at 2:42 PM" to somebody in California and "Saturday at 9:42 am" to
 * somebody in New Zealand, and each device knows which it is. Both functions
 * leave the zone and clock style to the device unless told otherwise, which is
 * only ever done by the tests.
 *
 * Dates stay written the way the site writes them — "13 September" — and the
 * clock follows the reader's locale, so an American sees "2:42 PM" and a New
 * Zealander "2:42 pm".
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* The calendar day a moment falls on in a given zone. */
function dayIn(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;

/**
 * "Today at 2:42 PM", "Yesterday at 9:15 pm", "13 September at 9:42 am", and
 * the year too once it isn't this one. inSentence gives the form that follows
 * other words: "today at …", "on 13 September at …".
 */
export function whenAt(iso, { now = new Date(), timeZone, locale, inSentence = false } = {}) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";

  const day = dayIn(date, timeZone);
  const today = dayIn(now, timeZone);
  const yesterday = dayIn(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(date);

  let label;
  if (sameDay(day, today)) label = inSentence ? "today" : "Today";
  else if (sameDay(day, yesterday)) label = inSentence ? "yesterday" : "Yesterday";
  else label = `${inSentence ? "on " : ""}${day.d} ${MONTH_NAMES[day.m - 1]}${day.y === today.y ? "" : ` ${day.y}`}`;

  return `${label} at ${time}`;
}

/**
 * The short form that follows "Last seen": "8:39 PM" today, "yesterday", and
 * "on 13 September" (with the year once it isn't this one) before that. Short
 * so it fits on one line under a name in a chat's title bar.
 */
export function seenAt(iso, { now = new Date(), timeZone, locale } = {}) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";

  const day = dayIn(date, timeZone);
  const today = dayIn(now, timeZone);
  const yesterday = dayIn(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);

  if (sameDay(day, today)) return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  if (sameDay(day, yesterday)) return "yesterday";
  return `on ${day.d} ${MONTH_NAMES[day.m - 1]}${day.y === today.y ? "" : ` ${day.y}`}`;
}

/** The whole thing, zone included, for anyone who wants to be sure. */
export function whenFull(iso, { timeZone, locale } = {}) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}
