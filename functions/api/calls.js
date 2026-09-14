/**
 * Ringing, answering and hanging up an audio call (shared/calls.js).
 *
 * Only the setting up passes through here; the call itself goes straight
 * between the two browsers. As with messages, who is calling is taken from
 * the verified Access token and nothing else, a call is only ever shown to its
 * two people, and a block either way means no call.
 *
 * GET  ?ringing[&wait=1&known=<ids>] -> calls ringing for you; with wait, holds
 *                                       until that list is no longer <ids>
 * GET  ?call=<id>[&wait=1&state=<s>] -> one of your calls, and checks you in on
 *                                       it; with wait, holds until it isn't <s>
 * POST { to, offer }                 -> ring somebody
 * POST { answer: <id>, sdp }         -> pick up
 * POST { hangup: <id> }              -> turn it down, give up, or end it
 */

import { identity, personFor } from "../../shared/access.js";
import { ensureGuests, arrive, directory } from "../../shared/guests.js";
import {
  ensureCalls, lapsed, hangupReason, isSdp, shapeCall,
  RINGING, ACTIVE, ENDED, MISSED_TEXT, KEEP_ENDED_MS,
} from "../../shared/calls.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Held the same way as messages, and one query a look: the free plan allows
   fifty database queries a request. */
const WAIT_MS = 25000;
const TICK_MS = 1200;

const pairOf = (a, b) => [a, b].sort().join(":");
const okId = (v) => typeof v === "string" && /^[A-Za-z0-9_.@+-]{1,120}$/.test(v);
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readCall = (db, id) => db.prepare("SELECT * FROM calls WHERE id = ?1").bind(id).first();

/* Ends a call once, however many ask at the same moment: only the request
   whose update changed the row goes on to leave a missed call behind. The
   offer and answer go with it — nothing needs them after, and they hold each
   end's network addresses. */
async function endCall(db, row, reason) {
  const at = nowIso();
  const done = await db
    .prepare("UPDATE calls SET state = ?1, reason = ?2, ended_at = ?3, offer = '', answer = '' WHERE id = ?4 AND state != ?1")
    .bind(ENDED, reason, at, row.id)
    .run();
  if (done?.meta?.changes && row.state === RINGING && (reason === "missed" || reason === "cancelled")) {
    await db
      .prepare("INSERT INTO messages (pair, sender, recipient, text, at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(row.pair, row.caller, row.callee, MISSED_TEXT, at)
      .run();
  }
  return readCall(db, row.id);
}

/* A call as it stands now, ended first if it has lapsed. */
async function settle(db, row) {
  const why = lapsed(row);
  return why ? endCall(db, row, why) : row;
}

/* The call somebody is in, ringing or talking, if any. */
async function liveCallOf(db, person) {
  const { results } = await db
    .prepare("SELECT * FROM calls WHERE (caller = ?1 OR callee = ?1) AND state != ?2 ORDER BY id DESC")
    .bind(person, ENDED)
    .all();
  for (const row of results || []) {
    const now = await settle(db, row);
    if (now.state !== ENDED) return now;
  }
  return null;
}

async function blockersBetween(db, me, them) {
  const { results } = await db
    .prepare("SELECT blocker FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)")
    .bind(me, them)
    .all();
  return (results || []).map((r) => r.blocker);
}

export async function onRequest({ request, env }) {
  if (!env || !env.MESSAGES) {
    return json({ error: "Calls aren't switched on for this site yet" }, 501);
  }
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in, so there is nobody to call as" }, 403);

  const db = env.MESSAGES;
  const me = personFor(email);
  const url = new URL(request.url);
  const book = directory(db);

  try {
    await ensureCalls(db);
    await ensureGuests(db);
    await arrive(db, email);

    if (request.method === "GET") {
      /* Who is ringing you. Lapsed rings are ended once, up front; while
         waiting, they are only left out, so a look stays one query. */
      if (url.searchParams.get("ringing") !== null) {
        const look = async () => {
          const { results } = await db
            .prepare("SELECT * FROM calls WHERE callee = ?1 AND state = ?2 ORDER BY id")
            .bind(me.id, RINGING)
            .all();
          return results || [];
        };
        let rows = [];
        for (const row of await look()) {
          const now = await settle(db, row);
          if (now.state === RINGING) rows.push(now);
        }
        const known = url.searchParams.get("known") ?? "";
        const ids = () => rows.map((r) => r.id).join(",");
        if (url.searchParams.get("wait") !== null) {
          const until = Date.now() + WAIT_MS;
          while (ids() === known && Date.now() < until) {
            await sleep(TICK_MS);
            rows = (await look()).filter((r) => !lapsed(r));
          }
        }
        const names = await book();
        return json({
          ringing: rows.map((r) => ({ id: r.id, from: r.caller, name: names.nameOf(r.caller), at: r.at })),
        });
      }

      /* One call. Asking about it is also how each end says it is still
         there, so a call whose other end has gone is ended as dropped. */
      const id = parseInt(url.searchParams.get("call") || "", 10);
      if (!Number.isFinite(id)) return json({ error: "which call?" }, 400);
      let row = await readCall(db, id);
      if (!row || (row.caller !== me.id && row.callee !== me.id)) return json({ error: "not found" }, 404);
      row = await settle(db, row);
      if (row.state !== ENDED) {
        await db
          .prepare(`UPDATE calls SET ${row.caller === me.id ? "caller_seen" : "callee_seen"} = ?1 WHERE id = ?2`)
          .bind(nowIso(), id)
          .run();
      }
      const wanted = url.searchParams.get("state");
      if (url.searchParams.get("wait") !== null && wanted) {
        const until = Date.now() + WAIT_MS;
        while (row.state === wanted && row.state !== ENDED && Date.now() < until) {
          await sleep(TICK_MS);
          row = await readCall(db, id);
          if (lapsed(row)) row = await endCall(db, row, lapsed(row));
        }
      }
      return json({ call: shapeCall(row, me.id, (await book()).nameOf) });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return json({ error: "Send it as JSON" }, 400);

      /* Picking up: only the person rung, only while it rings, and only once —
         a second tab answering a moment later is told it already has been. */
      if (body.answer !== undefined) {
        const id = parseInt(body.answer, 10);
        let row = Number.isFinite(id) ? await readCall(db, id) : null;
        if (!row || (row.caller !== me.id && row.callee !== me.id)) return json({ error: "not found" }, 404);
        if (row.callee !== me.id) return json({ error: "You can't answer your own call" }, 400);
        if (!isSdp(body.sdp)) return json({ error: "That answer couldn't be read" }, 400);
        row = await settle(db, row);
        if (row.state !== RINGING) {
          return json({ error: row.state === ACTIVE ? "That call has already been answered" : "That call has ended" }, 409);
        }
        const at = nowIso();
        const done = await db
          .prepare("UPDATE calls SET state = ?1, answer = ?2, answered_at = ?3, callee_seen = ?3 WHERE id = ?4 AND state = ?5")
          .bind(ACTIVE, body.sdp, at, id, RINGING)
          .run();
        if (!done?.meta?.changes) return json({ error: "That call has already been answered" }, 409);
        return json({ call: shapeCall(await readCall(db, id), me.id, (await book()).nameOf) });
      }

      if (body.hangup !== undefined) {
        const id = parseInt(body.hangup, 10);
        let row = Number.isFinite(id) ? await readCall(db, id) : null;
        if (!row || (row.caller !== me.id && row.callee !== me.id)) return json({ error: "not found" }, 404);
        row = await settle(db, row);
        if (row.state !== ENDED) row = await endCall(db, row, hangupReason(row, me.id));
        return json({ call: shapeCall(row, me.id, (await book()).nameOf) });
      }

      /* Ringing somebody. */
      const to = body.to;
      if (!okId(to) || to === me.id) return json({ error: "who to?" }, 400);
      const names = await book();
      if (!names.has(to)) return json({ error: "That isn't somebody this box knows" }, 400);
      if (!isSdp(body.offer)) return json({ error: "That call couldn't be set up" }, 400);

      const blockers = await blockersBetween(db, me.id, to);
      if (blockers.includes(to)) return json({ error: `You can't call ${names.nameOf(to)}` }, 403);
      if (blockers.includes(me.id)) {
        return json({ error: `You've blocked ${names.nameOf(to)} — unblock them to call` }, 403);
      }
      if (await liveCallOf(db, me.id)) return json({ error: "You're already on a call" }, 409);
      if (await liveCallOf(db, to)) return json({ error: `${names.nameOf(to)} is on another call` }, 409);

      /* Calls that ended over a week ago are cleared away first, so the table
         only ever holds recent ones. */
      await db
        .prepare("DELETE FROM calls WHERE state = ?1 AND ended_at < ?2")
        .bind(ENDED, new Date(Date.now() - KEEP_ENDED_MS).toISOString())
        .run();
      const at = nowIso();
      const made = await db
        .prepare(`INSERT INTO calls (pair, caller, callee, state, offer, at, caller_seen)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`)
        .bind(pairOf(me.id, to), me.id, to, RINGING, body.offer, at)
        .run();
      const row = await readCall(db, made?.meta?.last_row_id);
      return json({ call: shapeCall(row, me.id, names.nameOf) }, 201);
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
