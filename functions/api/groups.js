/**
 * Making and running group chats (shared/groups.js). The conversation itself
 * goes through /api/messages with the group's chat id, "grp:<id>".
 *
 * Who is asking comes from the verified Access token. A group is only ever
 * shown to its members: to anybody else, it isn't there.
 *
 * GET  ?id=<n>                   -> one of your groups: title, members, picture version
 * GET  ?picture=<n>&v=           -> its picture, to members only
 * POST { create: [ids], name? }  -> a group of you and them (two or more others)
 * POST { rename: n, name }       -> any member; an empty name goes back to the members' names
 * POST { picture: n, image }     -> any member; a JPEG data URL, or null to remove it
 * POST { add: n, people: [ids] } -> any member, up to GROUP_MAX in all
 * POST { remove: n, person }     -> only whoever made the group
 * POST { leave: n }              -> yourself; a creator hands the group to the longest member
 */

import { identity, providerIdentity, personFor } from "../../shared/access.js";
import { ensureGuests, arrive, directory } from "../../shared/guests.js";
import { hasHate } from "../../shared/hate.js";
import { poke } from "../../shared/live.js";
import {
  ensureGroups, groupRow, membersOf, shapeGroup, toMembers, groupPair, tidyName,
  GROUP_MAX, PICTURE_MAX, JPEG_URL,
} from "../../shared/groups.js";
import { ensureVoice } from "../../shared/voice.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const okId = (v) => typeof v === "string" && /^[A-Za-z0-9_.@+-]{1,120}$/.test(v);
const nowIso = () => new Date().toISOString();
const idsIn = (v) => (Array.isArray(v) ? [...new Set(v.filter(okId))] : null);

export async function onRequest({ request, env }) {
  if (!env || !env.MESSAGES) return json({ error: "Group chats aren't switched on for this site yet" }, 501);
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in" }, 403);

  const db = env.MESSAGES;
  const me = personFor(email);
  const url = new URL(request.url);
  const book = directory(db);

  /* One of your groups, or null — "not there" and "not yours" look the same. */
  const yours = async (raw) => {
    const id = parseInt(raw, 10);
    if (!Number.isFinite(id)) return null;
    const row = await groupRow(db, id);
    if (!row) return null;
    const members = await membersOf(db, id);
    return members.includes(me.id) ? { id, row, members } : null;
  };
  const shaped = async (g) => shapeGroup(g.row, g.members, me.id, (await book()).nameOf);
  const notFound = () => json({ error: "That group isn't there" }, 404);

  try {
    await ensureGroups(db);
    await ensureVoice(db);
    await ensureGuests(db);
    await arrive(db, email, () => providerIdentity(request));

    if (request.method === "GET") {
      const pictureOf = url.searchParams.get("picture");
      if (pictureOf !== null) {
        const g = await yours(pictureOf);
        if (!g) return notFound();
        const stored = await db.prepare("SELECT picture FROM groups WHERE id = ?1").bind(g.id).first();
        if (!stored || !stored.picture) return json({ error: "no picture" }, 404);
        const binary = atob(stored.picture.slice(stored.picture.indexOf(",") + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Response(bytes, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      const g = await yours(url.searchParams.get("id"));
      return g ? json({ group: await shaped(g) }) : notFound();
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Send it as JSON" }, 400);

    /* A new group: you and at least two others, twelve people at most. Picking
       only one person is a conversation with them, which the page opens instead. */
    if (body.create !== undefined) {
      const others = (idsIn(body.create) || []).filter((p) => p !== me.id);
      if (others.length < 2) return json({ error: "A group needs at least two other people" }, 400);
      if (others.length + 1 > GROUP_MAX) return json({ error: `A group can have ${GROUP_MAX} people at most` }, 400);
      const names = await book();
      if (others.some((p) => !names.has(p))) return json({ error: "That isn't somebody this box knows" }, 400);
      const name = tidyName(body.name);
      if (hasHate(name)) return json({ error: "That name has language this site doesn't allow" }, 400);

      const at = nowIso();
      const made = await db.prepare("INSERT INTO groups (name, creator, at) VALUES (?1, ?2, ?3)").bind(name, me.id, at).run();
      const id = made?.meta?.last_row_id;
      await db.batch([me.id, ...others].map((person) =>
        db.prepare("INSERT INTO group_members (group_id, person, added_by, at) VALUES (?1, ?2, ?3, ?4)").bind(id, person, me.id, at)));
      const g = await yours(id);
      await poke(env, toMembers(g.members, id, "group"));
      return json({ group: await shaped(g) }, 201);
    }

    const which = body.rename ?? body.picture ?? body.add ?? body.remove ?? body.leave;
    const g = which === undefined ? null : await yours(which);
    if (which === undefined) return json({ error: "What should happen to the group?" }, 400);
    if (!g) return notFound();
    let told = g.members;

    if (body.rename !== undefined) {
      const name = tidyName(body.name);
      if (hasHate(name)) return json({ error: "That name has language this site doesn't allow" }, 400);
      await db.prepare("UPDATE groups SET name = ?1 WHERE id = ?2").bind(name, g.id).run();
    } else if (body.picture !== undefined) {
      if (body.image === null) {
        await db.prepare("UPDATE groups SET picture = '', picture_v = '' WHERE id = ?1").bind(g.id).run();
      } else {
        const image = body.image;
        if (typeof image !== "string" || image.length > PICTURE_MAX || !JPEG_URL.test(image)) {
          return json({ error: "That picture couldn't be read — try a JPEG, or a smaller picture" }, 400);
        }
        await db.prepare("UPDATE groups SET picture = ?1, picture_v = ?2 WHERE id = ?3")
          .bind(image, Date.now().toString(36), g.id).run();
      }
    } else if (body.add !== undefined) {
      const adding = (idsIn(body.people) || []).filter((p) => !g.members.includes(p));
      if (!adding.length) return json({ error: "Pick somebody who isn't in the group yet" }, 400);
      if (g.members.length + adding.length > GROUP_MAX) {
        return json({ error: `A group can have ${GROUP_MAX} people at most — there's room for ${GROUP_MAX - g.members.length} more` }, 400);
      }
      const names = await book();
      if (adding.some((p) => !names.has(p))) return json({ error: "That isn't somebody this box knows" }, 400);
      /* Somebody added can read what came before, but none of it counts as
         unread for them. */
      const last = await db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE pair = ?1").bind(groupPair(g.id)).first();
      const at = nowIso();
      await db.batch(adding.flatMap((person) => [
        db.prepare("INSERT OR IGNORE INTO group_members (group_id, person, added_by, at) VALUES (?1, ?2, ?3, ?4)").bind(g.id, person, me.id, at),
        db.prepare(`INSERT INTO reads (person, pair, last_read) VALUES (?1, ?2, ?3)
                    ON CONFLICT (person, pair) DO UPDATE SET last_read = MAX(last_read, ?3)`).bind(person, groupPair(g.id), Number(last?.id) || 0),
      ]));
      told = [...g.members, ...adding];
    } else if (body.remove !== undefined) {
      if (g.row.creator !== me.id) return json({ error: "Only the person who made the group can remove people" }, 403);
      const person = body.person;
      if (person === me.id) return json({ error: "To take yourself out, leave the group" }, 400);
      if (!okId(person) || !g.members.includes(person)) return json({ error: "They aren't in the group" }, 404);
      /* out of the group, and out of its voice channel */
      await db.batch([
        db.prepare("DELETE FROM group_members WHERE group_id = ?1 AND person = ?2").bind(g.id, person),
        db.prepare("DELETE FROM voice_members WHERE group_id = ?1 AND person = ?2").bind(g.id, person),
      ]);
    } else {
      await db.batch([
        db.prepare("DELETE FROM group_members WHERE group_id = ?1 AND person = ?2").bind(g.id, me.id),
        db.prepare("DELETE FROM voice_members WHERE group_id = ?1 AND person = ?2").bind(g.id, me.id),
      ]);
      const rest = g.members.filter((p) => p !== me.id);
      if (!rest.length) {
        await db.prepare("DELETE FROM groups WHERE id = ?1").bind(g.id).run();
      } else if (g.row.creator === me.id) {
        await db.prepare("UPDATE groups SET creator = ?1 WHERE id = ?2").bind(rest[0], g.id).run();
      }
    }

    await poke(env, toMembers(told, g.id, "group"));
    const after = await yours(g.id);
    return json(after ? { group: await shaped(after) } : { left: true, id: g.id });
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
