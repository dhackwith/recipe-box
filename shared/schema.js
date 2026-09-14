/**
 * Which tables the D1 database already has, asked once.
 *
 * Several modules make their own tables when missing (loves, guests, calls,
 * attachments), so nothing has to be run by hand. Each used to send its CREATE
 * statements on the first request a fresh isolate served — about six queries
 * before any real work. That first request is the one that comes after a
 * break, when Cloudflare has started the code cold and every bit of processing
 * counts against the free plan's 10 ms. Now one query lists the tables, and a
 * module sends CREATE only for a table that isn't there.
 *
 * Kept per isolate and per database (the tests hand each endpoint a fresh one).
 */

const known = new WeakMap();

export function tablesIn(db) {
  if (!known.has(db)) {
    const asked = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .then(({ results }) => new Set((results || []).map((r) => r.name)));
    asked.catch(() => known.delete(db));
    known.set(db, asked);
  }
  return known.get(db);
}

/** Whether every one of these tables is already there. */
export async function haveTables(db, names) {
  const tables = await tablesIn(db);
  return names.every((n) => tables.has(n));
}
