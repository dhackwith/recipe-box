/**
 * D1's shape over Node's built-in SQLite, for tests that want the endpoints'
 * own SQL to run for real: prepare().bind().all()/first()/run(), and batch().
 * The same wrapper messages.test.mjs carries inline.
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function d1({ schema = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  if (schema) sqlite.exec(readFileSync(new URL("../db/messages.sql", import.meta.url), "utf8"));
  const db = {
    queries: 0,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      const api = {
        /* D1 takes an ArrayBuffer for a BLOB; Node's SQLite wants a typed array. */
        bind: (...a) => { args = a.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v)); return api; },
        all: async () => { db.queries++; return { results: stmt.all(...args) }; },
        first: async () => { db.queries++; return stmt.get(...args) ?? null; },
        run: async () => {
          db.queries++;
          const r = stmt.run(...args);
          return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
        },
      };
      return api;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return db;
}
