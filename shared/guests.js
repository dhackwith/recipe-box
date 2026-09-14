/**
 * Guests: people Cloudflare Access lets in who aren't on the roster in
 * shared/access.js yet.
 *
 * Devon lets people in through the Access allowlist before giving them a
 * proper entry on the roster, and wants them in the friends list meanwhile —
 * able to message everybody, and be messaged. So anybody who uses the site
 * is written down here the first time, under their guest id (a hash of their
 * address, never the address itself) and a name made from the address, and
 * the messenger treats the roster and this table together as everyone.
 *
 * Their address is kept here too, server-side only, for one reason: moving
 * their conversations when their id changes.
 *  - Before guests had ids, somebody off the roster was keyed by their bare
 *    address. On their first visit since, those rows are moved to the guest id.
 *  - When Devon adds a guest to the roster, their id becomes the roster id. On
 *    their first visit after that, everything under the guest id moves to it
 *    and the guest row goes.
 * Either way it is done once, the first time the person is seen by an isolate.
 */

import { personFor, isPerson, addressKey, people } from "./access.js";
import { ensureLoves } from "./loves.js";
import { haveTables } from "./schema.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS guests (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL UNIQUE, at TEXT NOT NULL)`,
];

/* Made when missing, once per isolate and database, like the other tables. */
const ready = new WeakMap();
export function ensureGuests(db) {
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      if (await haveTables(db, ["guests"])) return;
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((err) => { ready.delete(db); throw err; }));
  }
  return ready.get(db);
}

/* The other id in a pair "a:b" that contains ?1, and that pair rebuilt around
   ?2 instead, sorted as pairOf sorts. Plain comparisons, not LIKE, because an
   address can hold an underscore, which LIKE reads as a wildcard. */
const holds = (col) => `(substr(${col}, 1, length(?1) + 1) = ?1 || ':' OR substr(${col}, -(length(?1) + 1)) = ':' || ?1)`;
const otherIn = (col) =>
  `(CASE WHEN substr(${col}, 1, length(?1) + 1) = ?1 || ':' THEN substr(${col}, length(?1) + 2) ELSE substr(${col}, 1, length(${col}) - length(?1) - 1) END)`;
const rebuilt = (col) => `(CASE WHEN ${otherIn(col)} < ?2 THEN ${otherIn(col)} || ':' || ?2 ELSE ?2 || ':' || ${otherIn(col)} END)`;

/**
 * Everything keyed by one person id moved to another: their messages and the
 * conversations they are in, read markers, blocks either way, hearts, and
 * last-seen. One transaction, so nobody sees a conversation half moved.
 */
export async function rekey(db, from, to) {
  if (!from || !to || from === to) return;
  await ensureLoves(db);
  /* Every statement mentions ?2, so each can be bound the same two values. */
  const step = (sql) => db.prepare(sql).bind(from, to);
  await db.batch([
    step(`UPDATE messages SET sender = CASE WHEN sender = ?1 THEN ?2 ELSE sender END,
                              recipient = CASE WHEN recipient = ?1 THEN ?2 ELSE recipient END
          WHERE sender = ?1 OR recipient = ?1`),
    step(`UPDATE messages SET pair = CASE WHEN sender < recipient THEN sender || ':' || recipient ELSE recipient || ':' || sender END
          WHERE sender = ?2 OR recipient = ?2`),
    step("UPDATE OR REPLACE reads SET person = ?2 WHERE person = ?1"),
    step(`UPDATE OR REPLACE reads SET pair = ${rebuilt("pair")} WHERE ${holds("pair")}`),
    step("UPDATE OR IGNORE blocks SET blocker = ?2 WHERE blocker = ?1"),
    step("UPDATE OR IGNORE blocks SET blocked = ?2 WHERE blocked = ?1"),
    step("DELETE FROM blocks WHERE (blocker = ?1 OR blocked = ?1) AND ?2 IS NOT NULL"),
    step("UPDATE OR IGNORE loves SET person = ?2 WHERE person = ?1"),
    step("DELETE FROM loves WHERE person = ?1 AND ?2 IS NOT NULL"),
    step(`UPDATE loves SET pair = ${rebuilt("pair")} WHERE kind = 'm' AND ${holds("pair")}`),
    step("DELETE FROM presence WHERE person = ?1 AND ?2 IS NOT NULL"),
  ]);
}

/* Addresses already dealt with by this isolate, per database. */
const seen = new WeakMap();

/**
 * Whoever is signed in, noted: a guest is written down (and their old
 * address-keyed rows moved) the first time; somebody on the roster who used to
 * be a guest has their guest rows moved to their roster id. After the first
 * time in an isolate this costs nothing.
 */
export async function arrive(db, email) {
  const address = addressKey(email);
  const me = personFor(email);
  if (!address || !me) return;
  let done = seen.get(db);
  if (!done) { done = new Set(); seen.set(db, done); }
  if (done.has(address)) return;

  await ensureGuests(db);
  if (isPerson(me.id)) {
    const was = await db.prepare("SELECT id FROM guests WHERE address = ?1").bind(address).first();
    if (was) {
      await rekey(db, was.id, me.id);
      await db.prepare("DELETE FROM guests WHERE id = ?1").bind(was.id).run();
    }
  } else {
    const made = await db
      .prepare("INSERT OR IGNORE INTO guests (id, name, address, at) VALUES (?1, ?2, ?3, ?4)")
      .bind(me.id, me.name, address, new Date().toISOString())
      .run();
    if (made?.meta?.changes) await rekey(db, address, me.id);
  }
  done.add(address);
}

/**
 * Everybody who can be messaged — the roster, then guests by name — and a name
 * for any id, loaded once and only when a request needs it. Addresses never
 * leave this: only ids and names.
 */
export function directory(db) {
  let loaded = null;
  return () => {
    if (!loaded) {
      loaded = (async () => {
        await ensureGuests(db);
        const { results } = await db.prepare("SELECT id, name FROM guests ORDER BY name, id").all();
        const everyone = [...people(), ...(results || []).map((r) => ({ id: r.id, name: r.name }))];
        const names = new Map(everyone.map((p) => [p.id, p.name]));
        return { everyone, has: (id) => names.has(id), nameOf: (id) => names.get(id) || "Someone" };
      })();
      loaded.catch(() => { loaded = null; });
    }
    return loaded;
  };
}
