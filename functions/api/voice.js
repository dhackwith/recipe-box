/**
 * A group's voice channel (shared/voice.js): joining, listening to the others,
 * muting, and leaving. Only members of the group, only with the Realtime app's
 * keys set (REALTIME_APP_ID, REALTIME_APP_SECRET), and never handing a page
 * anybody's relay session.
 *
 * GET  ?room=<n>                 -> who's in the channel: [{ id, name, muted }], and you
 * POST { join: n, sdp, mid }     -> your microphone goes up: { answer, room }
 * POST { ready: n }              -> your connection is up; the group is told
 * POST { pull: n, people: [ids] }-> listen to them: { offer, tracks: [{ id, mid }] }
 * POST { answer: n, sdp }        -> the page's answer to that offer
 * POST { mute: n, muted }        -> say whether you're muted
 * POST { here: n }               -> still in, every VOICE_HERE_MS
 * POST { leave: n }              -> out
 */

import { identity, providerIdentity, personFor } from "../../shared/access.js";
import { ensureGuests, arrive, directory } from "../../shared/guests.js";
import { poke } from "../../shared/live.js";
import { ensureGroups, groupRow, membersOf, toMembers } from "../../shared/groups.js";
import { ensureVoice, roomOf, realtime, isSdp, isMid } from "../../shared/voice.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const okId = (v) => typeof v === "string" && /^[A-Za-z0-9_.@+-]{1,120}$/.test(v);
const nowIso = () => new Date().toISOString();

export async function onRequest({ request, env }) {
  if (!env || !env.MESSAGES) return json({ error: "Voice isn't switched on for this site yet" }, 501);
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_SECRET) {
    return json({ error: "Voice channels need the Realtime app's keys in the site's settings" }, 501);
  }
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in" }, 403);

  const db = env.MESSAGES;
  const me = personFor(email);
  const url = new URL(request.url);
  const book = directory(db);
  const rt = realtime(env);

  /* One of your groups, or null. */
  const yours = async (raw) => {
    const id = parseInt(raw, 10);
    if (!Number.isFinite(id)) return null;
    const row = await groupRow(db, id);
    if (!row) return null;
    const members = await membersOf(db, id);
    return members.includes(me.id) ? { id, members } : null;
  };
  const describe = async (g) => {
    const rows = await roomOf(db, g.id);
    const names = await book();
    const mine = rows.find((r) => r.person === me.id);
    return {
      room: rows.filter((r) => r.ready).map((r) => ({ id: r.person, name: names.nameOf(r.person), muted: !!r.muted })),
      you: mine ? { muted: !!mine.muted, ready: !!mine.ready } : null,
    };
  };
  const tell = (g) => poke(env, toMembers(g.members, g.id, "voice"));
  const notFound = () => json({ error: "That group isn't there" }, 404);

  try {
    await ensureGroups(db);
    await ensureVoice(db);
    await ensureGuests(db);
    await arrive(db, email, () => providerIdentity(request));

    if (request.method === "GET") {
      const g = await yours(url.searchParams.get("room"));
      return g ? json(await describe(g)) : notFound();
    }
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Send it as JSON" }, 400);
    const which = body.join ?? body.ready ?? body.pull ?? body.answer ?? body.mute ?? body.here ?? body.leave;
    if (which === undefined) return json({ error: "What should happen in the voice channel?" }, 400);
    const g = await yours(which);
    if (!g) return notFound();
    const mine = await db.prepare("SELECT session, track, ready FROM voice_members WHERE group_id = ?1 AND person = ?2").bind(g.id, me.id).first();

    if (body.join !== undefined) {
      if (!isSdp(body.sdp) || !isMid(body.mid)) return json({ error: "Your microphone couldn't be set up" }, 400);
      /* One channel at a time: any other you're in, you leave. */
      const { results: elsewhere } = await db
        .prepare("SELECT group_id FROM voice_members WHERE person = ?1 AND group_id != ?2")
        .bind(me.id, g.id)
        .all();
      for (const r of elsewhere || []) {
        await db.prepare("DELETE FROM voice_members WHERE group_id = ?1 AND person = ?2").bind(r.group_id, me.id).run();
        await poke(env, toMembers(await membersOf(db, r.group_id), r.group_id, "voice"));
      }
      const session = await rt.newSession();
      const pushed = await rt.push(session, body.sdp, body.mid);
      const track = (pushed.tracks || [])[0];
      if (!pushed.sessionDescription || !pushed.sessionDescription.sdp || (track && track.errorCode)) {
        return json({ error: "The voice channel couldn't take your microphone — try again" }, 502);
      }
      const at = nowIso();
      await db
        .prepare(`INSERT INTO voice_members (group_id, person, session, track, muted, ready, joined, seen)
                  VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?5)
                  ON CONFLICT (group_id, person) DO UPDATE SET session = ?3, track = ?4, muted = 0, ready = 0, joined = ?5, seen = ?5`)
        .bind(g.id, me.id, session, (track && track.trackName) || "mic", at)
        .run();
      return json({ answer: pushed.sessionDescription.sdp, ...(await describe(g)) });
    }

    if (!mine) {
      if (body.leave !== undefined || body.here !== undefined) return json({ ok: true, ...(await describe(g)) });
      return json({ error: "Join the voice channel first" }, 409);
    }

    if (body.ready !== undefined) {
      await db.prepare("UPDATE voice_members SET ready = 1, seen = ?1 WHERE group_id = ?2 AND person = ?3").bind(nowIso(), g.id, me.id).run();
      await tell(g);
      return json(await describe(g));
    }

    if (body.pull !== undefined) {
      if (!mine.ready) return json({ error: "Your voice connection isn't up yet" }, 409);
      const wanted = new Set((Array.isArray(body.people) ? body.people : []).filter((p) => okId(p) && p !== me.id));
      const rows = (await roomOf(db, g.id)).filter((r) => r.ready && wanted.has(r.person));
      if (!rows.length) return json({ offer: null, tracks: [] });
      const pulled = await rt.pull(mine.session, rows.map((r) => ({ session: r.session, track: r.track })));
      const tracks = (pulled.tracks || [])
        .filter((t) => !t.errorCode && t.mid)
        .map((t) => ({ id: rows.find((r) => r.session === t.sessionId)?.person, mid: t.mid }))
        .filter((t) => t.id);
      const offer = pulled.requiresImmediateRenegotiation && pulled.sessionDescription ? pulled.sessionDescription.sdp : null;
      return json({ offer, tracks });
    }

    if (body.answer !== undefined) {
      if (!isSdp(body.sdp)) return json({ error: "That answer couldn't be read" }, 400);
      await rt.renegotiate(mine.session, body.sdp);
      return json({ ok: true });
    }

    if (body.mute !== undefined) {
      await db.prepare("UPDATE voice_members SET muted = ?1, seen = ?2 WHERE group_id = ?3 AND person = ?4")
        .bind(body.muted ? 1 : 0, nowIso(), g.id, me.id).run();
      await tell(g);
      return json(await describe(g));
    }

    if (body.here !== undefined) {
      await db.prepare("UPDATE voice_members SET seen = ?1 WHERE group_id = ?2 AND person = ?3").bind(nowIso(), g.id, me.id).run();
      return json({ ok: true });
    }

    await db.prepare("DELETE FROM voice_members WHERE group_id = ?1 AND person = ?2").bind(g.id, me.id).run();
    await tell(g);
    return json({ ok: true, ...(await describe(g)) });
  } catch (err) {
    if (err && err.realtime) return json({ error: "The voice service didn't answer — try again in a moment" }, 502);
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
