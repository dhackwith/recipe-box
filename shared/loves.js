/**
 * Loving a message or a note: a heart that everybody who can see the thing can
 * see too — both people in a conversation, or the whole family under a recipe.
 *
 * Kept in D1 (the MESSAGES database) for both, even though notes themselves
 * live in KV. A love is a tap, and taps are cheap to make and many: KV allows a
 * thousand writes a day, and adding a heart to a note stored as one JSON value
 * would mean rewriting the whole note, where two people tapping at once would
 * each erase the other's. Here a love is its own row, and two cannot collide.
 *
 * One row per person per thing, flipped on and off rather than deleted, so that
 * taking a love back is itself a change somebody can be told about. Every
 * change takes the next `seq`, and a conversation asks for the changes after
 * the last one it saw — the same way it asks for messages after the last id —
 * which is how a heart on an old message reaches the other end in a second.
 *
 * `kind` is "m" for a message (target is its id, pair is the conversation) or
 * "n" for a note (target is its KV key, pair is empty).
 */

import { haveTables } from "./schema.js";

export const MESSAGE = "m";
export const NOTE = "n";

/* Reactions on messages: one per person per message. Kept in the same `loved`
   column as a number — 0 is none — so nothing about the table changed when
   reactions arrived. 1 is ❤️ because every love given before then was stored
   as 1, so those hearts simply carry on as hearts. Notes only ever use 1. */
export const REACTIONS = ["❤️", "👍", "😂", "😢", "😠", "🤢"];
export const reactionCode = (emoji) => REACTIONS.indexOf(emoji) + 1;
export const reactionOf = (code) => REACTIONS[code - 1] || null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS loves (
     kind TEXT NOT NULL, target TEXT NOT NULL, person TEXT NOT NULL,
     pair TEXT NOT NULL DEFAULT '', loved INTEGER NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL,
     PRIMARY KEY (kind, target, person))`,
  "CREATE INDEX IF NOT EXISTS loves_by_pair ON loves (pair, seq)",
];

/* Made when missing, once per isolate, so nothing has to be run by hand. The
   same statements are in db/messages.sql. Keyed by database, because the tests
   hand each endpoint a fresh one. */
const ready = new WeakMap();
export function ensureLoves(db) {
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      if (await haveTables(db, ["loves"])) return;
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((err) => { ready.delete(db); throw err; }));
  }
  return ready.get(db);
}

/* On or off, in one statement, so the sequence number cannot be taken twice. */
export async function setLove(db, { kind, target, person, pair = "", on, emoji = "❤️" }) {
  await db
    .prepare(`INSERT INTO loves (kind, target, person, pair, loved, seq, at)
              VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM loves), ?6)
              ON CONFLICT (kind, target, person)
              DO UPDATE SET loved = excluded.loved, seq = excluded.seq, at = excluded.at`)
    .bind(kind, String(target), person, pair, on ? reactionCode(emoji) || 1 : 0, new Date().toISOString())
    .run();
}

/* Who loves each of these, in the order they did: a Map of target to person
   ids. One query however many things are asked about. Ordered by seq, which
   only ever rises, rather than by time: two hearts in the same millisecond
   would otherwise come back in either order. */
export async function lovesFor(db, kind, targets) {
  const out = new Map();
  const ids = [...new Set(targets.map(String))];
  if (!ids.length) return out;
  const { results } = await db
    .prepare(`SELECT target, person FROM loves
              WHERE kind = ?1 AND loved > 0 AND target IN (SELECT value FROM json_each(?2))
              ORDER BY seq`)
    .bind(kind, JSON.stringify(ids))
    .all();
  for (const r of results || []) {
    if (!out.has(r.target)) out.set(r.target, []);
    out.get(r.target).push(r.person);
  }
  return out;
}

/* Who reacted to each of these, and with what, in the order they did: a Map of
   target to [{ person, emoji }]. One query however many are asked about. */
export async function reactionsFor(db, kind, targets) {
  const out = new Map();
  const ids = [...new Set(targets.map(String))];
  if (!ids.length) return out;
  const { results } = await db
    .prepare(`SELECT target, person, loved FROM loves
              WHERE kind = ?1 AND loved > 0 AND target IN (SELECT value FROM json_each(?2))
              ORDER BY seq`)
    .bind(kind, JSON.stringify(ids))
    .all();
  for (const r of results || []) {
    if (!out.has(r.target)) out.set(r.target, []);
    out.get(r.target).push({ person: r.person, emoji: reactionOf(Number(r.loved)) || "❤️" });
  }
  return out;
}

/* The messages in a conversation whose loves have changed since `seq`, and the
   newest change there is, for the page to ask from next time. */
export async function loveChanges(db, pair, seq) {
  const { results } = await db
    .prepare("SELECT target, seq FROM loves WHERE kind = ?1 AND pair = ?2 AND seq > ?3 ORDER BY seq")
    .bind(MESSAGE, pair, seq)
    .all();
  const rows = results || [];
  return {
    targets: [...new Set(rows.map((r) => r.target))],
    seq: rows.length ? Number(rows[rows.length - 1].seq) : seq,
  };
}

/* Gone with the thing they were on. */
export async function dropLoves(db, kind, targets) {
  const ids = [...new Set(targets.map(String))];
  if (!ids.length) return;
  await db
    .prepare("DELETE FROM loves WHERE kind = ?1 AND target IN (SELECT value FROM json_each(?2))")
    .bind(kind, JSON.stringify(ids))
    .run();
}
