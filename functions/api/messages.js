/**
 * Private messages between the people in the box.
 *
 * Not KV. Everything else here is KV, which allows about a thousand writes a
 * day and serves reads from a cache up to a minute old: fine for a note on a
 * recipe, useless for a conversation. This is D1, bound as MESSAGES, where the
 * free allowance is a hundred thousand writes a day (db/messages.sql).
 *
 * WHO IS WRITING is taken from the verified Access token and nothing else, the
 * same as a note's author. The page cannot name a sender, and cannot ask for a
 * conversation it is not part of: a conversation is looked up by the pair built
 * from the reader and the other person, so there is no way to spell the name of
 * somebody else's.
 *
 * BLOCKING is plain rather than quiet, which is what Devon asked for: somebody
 * you have blocked is told they cannot message you. A blocked conversation also
 * leaves your inbox. Blocks are one-way and each end keeps their own.
 *
 * WAITING, rather than asking again and again. A request for new messages holds
 * on for up to WAIT_MS, answering the moment something arrives, so a message
 * lands in about a second without the page asking twenty times a minute.
 * Cloudflare does not limit how long a request may stay open while the client
 * is connected, and waiting is not CPU time.
 *
 * GET  ?people                  -> who can be messaged, and who you have blocked
 * GET  ?inbox                   -> every conversation, newest first, with unread counts
 * GET  ?with=<id>&since=<n>     -> that conversation; &wait=1 to hold for new ones
 * POST { to, text }             -> send
 * POST { read, with }           -> mark read up to a message id
 * POST { block } / { unblock }  -> keep your own block list
 * DELETE ?id=<n>                -> take back something you sent
 */

import { identity, personFor, personName, people, isPerson } from "../../shared/access.js";
import { hasHate } from "../../shared/hate.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const TEXT_MAX = 4000;
const PAGE = 200;
/* How long a waiting request holds on, and how often it looks. Twenty-odd
   seconds is short enough that a dropped connection recovers quickly and long
   enough that an open chat costs a couple of requests a minute. */
const WAIT_MS = 25000;
const TICK_MS = 900;

/* One name for a conversation, whichever end you look from. */
const pairOf = (a, b) => [a, b].sort().join(":");
const okId = (v) => typeof v === "string" && /^[A-Za-z0-9_.@+-]{1,120}$/.test(v);
const nowIso = () => new Date().toISOString();

const shape = (row, me) => ({
  id: row.id,
  text: row.deleted ? "" : row.text,
  at: row.at,
  mine: row.sender === me,
  from: row.sender,
  deleted: !!row.deleted,
});

async function blockersBetween(env, me, them) {
  const { results } = await env.MESSAGES
    .prepare("SELECT blocker FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)")
    .bind(me, them)
    .all();
  return (results || []).map((r) => r.blocker);
}

async function blockedBy(env, me) {
  const { results } = await env.MESSAGES
    .prepare("SELECT blocked FROM blocks WHERE blocker = ?1 ORDER BY blocked")
    .bind(me)
    .all();
  return (results || []).map((r) => r.blocked);
}

async function conversation(env, pair, since) {
  const { results } = await env.MESSAGES
    .prepare("SELECT id, sender, recipient, text, at, deleted FROM messages WHERE pair = ?1 AND id > ?2 ORDER BY id LIMIT ?3")
    .bind(pair, since, PAGE)
    .all();
  return results || [];
}

export async function onRequest({ request, env }) {
  if (!env || !env.MESSAGES) {
    return json({ error: "Messages aren't switched on for this site yet" }, 501);
  }

  const email = await identity(request);
  if (!email) {
    return json({ error: "Could not tell who is signed in, so there is nobody to send this as" }, 403);
  }
  const me = personFor(email);
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      /* Who there is to talk to. Names and ids only: nobody's address leaves
         the server, because the page has no use for one. */
      if (url.searchParams.get("people") !== null) {
        return json({ me, people: people().filter((p) => p.id !== me.id), blocked: await blockedBy(env, me.id) });
      }

      /* The inbox: one row per conversation, newest first, with how many of
         their messages you have not read. Conversations with somebody you have
         blocked are not shown. */
      if (url.searchParams.get("inbox") !== null) {
        const blocked = new Set(await blockedBy(env, me.id));
        const { results } = await env.MESSAGES
          .prepare(`SELECT m.pair AS pair, MAX(m.id) AS last_id,
                           SUM(CASE WHEN m.recipient = ?1 AND m.id > COALESCE(r.last_read, 0) AND m.deleted = 0 THEN 1 ELSE 0 END) AS unread
                    FROM messages m
                    LEFT JOIN reads r ON r.person = ?1 AND r.pair = m.pair
                    WHERE m.sender = ?1 OR m.recipient = ?1
                    GROUP BY m.pair`)
          .bind(me.id)
          .all();

        const threads = [];
        for (const row of results || []) {
          const other = row.pair.split(":").find((id) => id !== me.id) || me.id;
          if (blocked.has(other)) continue;
          const last = await env.MESSAGES
            .prepare("SELECT id, sender, recipient, text, at, deleted FROM messages WHERE id = ?1")
            .bind(row.last_id)
            .first();
          threads.push({
            with: other,
            name: personName(other),
            unread: Number(row.unread) || 0,
            last: last ? shape(last, me.id) : null,
          });
        }
        threads.sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0));
        return json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) });
      }

      /* One conversation. The pair is built here from the reader and the other
         person, so this can only ever answer with the reader's own. */
      const withId = url.searchParams.get("with");
      if (!okId(withId)) return json({ error: "who with?" }, 400);
      const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
      const pair = pairOf(me.id, withId);
      const blockers = await blockersBetween(env, me.id, withId);

      let rows = await conversation(env, pair, since);
      /* Hold on for something new rather than being asked again in a second. */
      if (!rows.length && url.searchParams.get("wait") !== null) {
        const until = Date.now() + WAIT_MS;
        while (!rows.length && Date.now() < until) {
          await new Promise((r) => setTimeout(r, TICK_MS));
          rows = await conversation(env, pair, since);
        }
      }

      return json({
        with: withId,
        name: personName(withId),
        messages: rows.map((row) => shape(row, me.id)),
        youBlockedThem: blockers.includes(me.id),
        theyBlockedYou: blockers.includes(withId),
      });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return json({ error: "Send it as JSON" }, 400);

      /* Your own block list. One-way: blocking somebody says nothing about
         whether they have blocked you. */
      if (body.block !== undefined || body.unblock !== undefined) {
        const who = body.block ?? body.unblock;
        if (!okId(who) || who === me.id) return json({ error: "who?" }, 400);
        if (body.block !== undefined) {
          await env.MESSAGES
            .prepare("INSERT OR IGNORE INTO blocks (blocker, blocked, at) VALUES (?1, ?2, ?3)")
            .bind(me.id, who, nowIso())
            .run();
        } else {
          await env.MESSAGES.prepare("DELETE FROM blocks WHERE blocker = ?1 AND blocked = ?2").bind(me.id, who).run();
        }
        return json({ blocked: await blockedBy(env, me.id) });
      }

      /* How far you have read. */
      if (body.read !== undefined) {
        const withId = body.with;
        const upTo = Math.max(0, parseInt(body.read, 10) || 0);
        if (!okId(withId)) return json({ error: "who with?" }, 400);
        await env.MESSAGES
          .prepare(`INSERT INTO reads (person, pair, last_read) VALUES (?1, ?2, ?3)
                    ON CONFLICT (person, pair) DO UPDATE SET last_read = MAX(last_read, ?3)`)
          .bind(me.id, pairOf(me.id, withId), upTo)
          .run();
        return json({ read: upTo });
      }

      /* Sending. */
      const to = body.to;
      if (!okId(to) || to === me.id) return json({ error: "who to?" }, 400);
      if (!isPerson(to)) return json({ error: "That isn't somebody this box knows" }, 400);

      const text = String(body.text ?? "").trim().slice(0, TEXT_MAX);
      if (!text) return json({ error: "a message needs something in it" }, 400);
      if (hasHate(text)) return json({ error: "That message has language this site doesn't allow" }, 400);

      /* Said plainly, both ways round: being told is kinder than talking to a
         wall, and knowing you blocked somebody explains why you cannot write. */
      const blockers = await blockersBetween(env, me.id, to);
      if (blockers.includes(to)) return json({ error: `You can't message ${personName(to)}` }, 403);
      if (blockers.includes(me.id)) {
        return json({ error: `You've blocked ${personName(to)} — unblock them to send a message` }, 403);
      }

      const at = nowIso();
      const written = await env.MESSAGES
        .prepare("INSERT INTO messages (pair, sender, recipient, text, at) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(pairOf(me.id, to), me.id, to, text, at)
        .run();
      const id = written?.meta?.last_row_id ?? null;
      return json({ message: { id, text, at, mine: true, from: me.id, deleted: false } }, 201);
    }

    if (request.method === "DELETE") {
      const id = parseInt(url.searchParams.get("id") || "", 10);
      if (!Number.isFinite(id)) return json({ error: "which message?" }, 400);
      /* Only your own, and only its words: the message stays as a gap in the
         conversation, because a hole where a line was is easier to read than a
         conversation that silently renumbers itself. */
      const done = await env.MESSAGES
        .prepare("UPDATE messages SET deleted = 1, text = '' WHERE id = ?1 AND sender = ?2")
        .bind(id, me.id)
        .run();
      if (!done?.meta?.changes) return json({ error: "that isn't yours to take back" }, 403);
      return json({ id, deleted: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
