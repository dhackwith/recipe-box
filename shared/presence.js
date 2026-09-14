/**
 * Who is about, in three states: active, away and offline.
 *
 * Every open page checks in (functions/api/messages.js, POST { here, idle }),
 * even from a background tab, saying how many seconds ago its person last
 * did anything on it. Two stamps come of that:
 *   presence.at  — the page was open then (the check-in itself)
 *   activity.at  — the person was doing something then (check-in time − idle)
 *
 * ACTIVE  a page checked in within OPEN_MS, and its person did something
 *         within AWAY_MS — the green light.
 * AWAY    a page is still open, but nothing has happened on it for AWAY_MS —
 *         the yellow zzz.
 * OFFLINE no page has checked in for OPEN_MS — the gray ×, with when they
 *         were last active.
 *
 * Activity has a table of its own rather than a new column on presence, so the
 * live database needed no change; reading everybody is still one query.
 */

import { haveTables } from "./schema.js";

/* A page checks in every 45 seconds while showing, every 90 while hidden
   (and browsers slow background timers further), so three minutes of
   silence means it has closed. */
export const OPEN_MS = 3 * 60 * 1000;
/* Devon's five minutes without doing anything, and a person is away. */
export const AWAY_MS = 5 * 60 * 1000;
/* An idle figure larger than this isn't believed. */
const IDLE_MAX_S = 7 * 24 * 60 * 60;

const SCHEMA = ["CREATE TABLE IF NOT EXISTS activity (person TEXT PRIMARY KEY, at TEXT NOT NULL)"];

const ready = new WeakMap();
export function ensureActivity(db) {
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      if (await haveTables(db, ["activity"])) return;
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((err) => { ready.delete(db); throw err; }));
  }
  return ready.get(db);
}

/* When somebody was last doing something, from a check-in's idle seconds. A
   page that doesn't say (one from before this) counts as active now. */
export function activeAt(now, idle) {
  const seconds = Number(idle);
  const trusted = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, IDLE_MAX_S) : 0;
  return new Date(now - trusted * 1000).toISOString();
}

/* The state from the two stamps. */
export function stateOf(openAt, activityAt, now = Date.now()) {
  const open = openAt ? Date.parse(openAt) : NaN;
  if (!Number.isFinite(open) || now - open > OPEN_MS) return "offline";
  const active = activityAt ? Date.parse(activityAt) : open;
  return Number.isFinite(active) && now - active <= AWAY_MS ? "active" : "away";
}
