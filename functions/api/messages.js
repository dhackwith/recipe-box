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
 * WHO IS ABOUT. Every person has one row saying when they were last seen, and
 * "last seen" means anywhere on the site: the page says it is here on the same
 * request that asks for the unread count, so one write every three quarters of
 * a minute covers the lights, the badge and being counted as present. Green is
 * ONLINE_MS; after that the light goes out and the time stands in its place.
 *
 * GET  ?people                  -> who can be messaged, who you have blocked, who is about
 * GET  ?inbox                   -> every conversation, newest first, with unread counts
 * GET  ?waiting[&wait=1&unread=n] -> who has written and not been read, and the lights;
 *                                  with wait, holds until the count is no longer n
 * GET  ?with=<id>&since=<n>     -> that conversation; &wait=1 to hold for new ones
 * POST { to, text }             -> send
 * POST { here }                 -> I am using the site: the unread count and the lights
 * POST { read, with }           -> mark read up to a message id
 * POST { block } / { unblock }  -> keep your own block list
 * DELETE ?id=<n>                -> take back something you sent, within a minute of sending;
 *                                  the owner may remove anybody's, at any age
 */

import { identity, personFor, personName, people, isPerson, isOwner } from "../../shared/access.js";
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
/* Devon's five minutes: used the site inside this, and the light is on. */
const ONLINE_MS = 5 * 60 * 1000;
/* How long you have to take back something you sent. After that it has been
   read, or could have been, and it stays. */
const TAKE_BACK_MS = 60 * 1000;
/* `deleted` says how a message went: 1 taken back by whoever sent it, 2
   removed by the owner, so each end can tell which happened. */
const TAKEN_BACK = 1;
const REMOVED = 2;

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
  removed: row.deleted === REMOVED,
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

/* Everybody's last-seen, as a list of people with a light each. Reading the
   whole table is one query of half a dozen rows, which is cheaper than asking
   about people one at a time. */
async function lights(env, ids) {
  const { results } = await env.MESSAGES.prepare("SELECT person, at FROM presence").all();
  const seen = new Map((results || []).map((r) => [r.person, r.at]));
  const now = Date.now();
  return ids.map(({ id, name }) => {
    const at = seen.get(id) || null;
    const when = at ? Date.parse(at) : NaN;
    return { id, name, seen: at, online: Number.isFinite(when) && now - when < ONLINE_MS };
  });
}

/* What the badge shows: everything said to you that you have not read, less
   anybody you have blocked. */
async function unreadFor(env, me) {
  const row = await env.MESSAGES
    .prepare(`SELECT SUM(CASE WHEN m.recipient = ?1 AND m.id > COALESCE(r.last_read, 0) AND m.deleted = 0 THEN 1 ELSE 0 END) AS unread
              FROM messages m
              LEFT JOIN reads r ON r.person = ?1 AND r.pair = m.pair
              WHERE (m.sender = ?1 OR m.recipient = ?1)
                AND m.sender NOT IN (SELECT blocked FROM blocks WHERE blocker = ?1)`)
    .bind(me)
    .first();
  return Number(row?.unread) || 0;
}

/* Who has written to you and not been read: one row per person, for the names
   that flash above the messenger. Anybody you have blocked is left out, the
   same as they are left out of the badge. */
async function waitingFor(env, me) {
  const { results } = await env.MESSAGES
    .prepare(`SELECT m.sender AS sender, COUNT(*) AS n
              FROM messages m
              LEFT JOIN reads r ON r.person = ?1 AND r.pair = m.pair
              WHERE m.recipient = ?1 AND m.deleted = 0 AND m.id > COALESCE(r.last_read, 0)
                AND m.sender NOT IN (SELECT blocked FROM blocks WHERE blocker = ?1)
              GROUP BY m.sender`)
    .bind(me)
    .all();
  return (results || []).map((r) => ({ id: r.sender, name: personName(r.sender), unread: Number(r.n) || 0 }));
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
        return json({
          me: { ...me, owner: isOwner(email) },
          people: await lights(env, people().filter((p) => p.id !== me.id)),
          blocked: await blockedBy(env, me.id),
        });
      }

      /* What is waiting. The page holds this request open rather than asking
         on a timer: it says which count it already knows, and the answer comes
         the moment that changes, so a name starts flashing a second after
         somebody writes rather than on the next quarter-minute. */
      if (url.searchParams.get("waiting") !== null) {
        const known = parseInt(url.searchParams.get("unread") || "", 10);
        const gather = async () => ({ unread: await unreadFor(env, me.id), waiting: await waitingFor(env, me.id) });
        let state = await gather();
        if (url.searchParams.get("wait") !== null && Number.isFinite(known)) {
          const until = Date.now() + WAIT_MS;
          while (state.unread === known && Date.now() < until) {
            await new Promise((r) => setTimeout(r, TICK_MS));
            state = await gather();
          }
        }
        return json({ ...state, people: await lights(env, people()) });
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

      /* Here, and what has happened while I was: one write, and the two things
         every page wants back from it. */
      if (body.here !== undefined) {
        await env.MESSAGES
          .prepare(`INSERT INTO presence (person, at) VALUES (?1, ?2)
                    ON CONFLICT (person) DO UPDATE SET at = ?2`)
          .bind(me.id, nowIso())
          .run();
        return json({ unread: await unreadFor(env, me.id), people: await lights(env, people()) });
      }

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
      return json({ message: { id, text, at, mine: true, from: me.id, deleted: false, removed: false } }, 201);
    }

    if (request.method === "DELETE") {
      const id = parseInt(url.searchParams.get("id") || "", 10);
      if (!Number.isFinite(id)) return json({ error: "which message?" }, 400);
      /* Only its words go: the message stays as a gap in the conversation,
         because a hole where a line was is easier to read than a conversation
         that silently renumbers itself.

         Your own, within a minute of sending — after that it stays. The owner
         may remove anybody's at any age, and that is marked as removed rather
         than taken back, so nobody is left thinking the sender changed their
         mind. The time is the server's own stamp, never the page's clock. */
      const row = await env.MESSAGES
        .prepare("SELECT sender, at, deleted FROM messages WHERE id = ?1")
        .bind(id)
        .first();
      if (!row) return json({ error: "that message isn't there" }, 404);
      if (row.deleted) return json({ id, deleted: true, removed: row.deleted === REMOVED });

      const mine = row.sender === me.id;
      const fresh = Date.now() - Date.parse(row.at) < TAKE_BACK_MS;
      const owner = isOwner(email);
      if (!owner) {
        if (!mine) return json({ error: "that isn't yours to take back" }, 403);
        if (!fresh) return json({ error: "It's been more than a minute since you sent that, so it stays" }, 403);
      }
      const how = mine && fresh ? TAKEN_BACK : REMOVED;
      await env.MESSAGES
        .prepare("UPDATE messages SET deleted = ?1, text = '' WHERE id = ?2")
        .bind(how, id)
        .run();
      return json({ id, deleted: true, removed: how === REMOVED });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
