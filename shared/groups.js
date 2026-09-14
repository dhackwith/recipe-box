/**
 * Group chats: three to GROUP_MAX people in one conversation.
 *
 * A group's messages live in the messages table like any conversation, under
 * the pair "grp:<id>" — a name no two-person pair can have, because person ids
 * never contain a colon. So photos, GIFs, reactions, take back and live notices
 * all work in a group the way they do between two people, and every place that
 * asks "may this person see that conversation?" asks canSeePair.
 *
 * Who is in a group is group_members. Anybody in it may add people (up to
 * GROUP_MAX in all), rename it, and set its picture; only whoever made it may
 * take somebody out; anybody may leave, and a creator who leaves hands the
 * group to whoever has been in it longest. Blocks are between two people and
 * stay out of groups: leaving is how you stop hearing from one.
 *
 * Its picture, when somebody sets one, is a small square JPEG kept in the row
 * (the same checks as a profile picture) and served only to members. Without
 * one, pages draw the group from its members' faces.
 */

import { haveTables } from "./schema.js";

export const GROUP_MAX = 12;
export const GROUP_NAME_MAX = 60;
export const PICTURE_MAX = 120_000;
export const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=?=?$/;

export const isGroupChat = (v) => typeof v === "string" && /^grp:[1-9][0-9]{0,15}$/.test(v);
export const groupPair = (id) => `grp:${id}`;
export const groupIdOf = (pair) => (isGroupChat(pair) ? Number(pair.slice(4)) : null);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS groups (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', creator TEXT NOT NULL,
     picture TEXT NOT NULL DEFAULT '', picture_v TEXT NOT NULL DEFAULT '', at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS group_members (
     group_id INTEGER NOT NULL, person TEXT NOT NULL, added_by TEXT NOT NULL, at TEXT NOT NULL,
     PRIMARY KEY (group_id, person))`,
  "CREATE INDEX IF NOT EXISTS group_members_by_person ON group_members (person)",
];

/* Made when missing, once per isolate and database, like the other tables.
   The same statements are in db/messages.sql. */
const ready = new WeakMap();
export function ensureGroups(db) {
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      if (await haveTables(db, ["groups", "group_members"])) return;
      for (const sql of SCHEMA) await db.prepare(sql).run();
    })().catch((err) => { ready.delete(db); throw err; }));
  }
  return ready.get(db);
}

export const groupRow = (db, id) =>
  db.prepare("SELECT id, name, creator, picture_v, at FROM groups WHERE id = ?1").bind(id).first();

/* Members in the order they joined. */
export async function membersOf(db, id) {
  const { results } = await db
    .prepare("SELECT person FROM group_members WHERE group_id = ?1 ORDER BY at, rowid")
    .bind(id)
    .all();
  return (results || []).map((r) => r.person);
}

export async function isMember(db, id, person) {
  if (!Number.isFinite(id)) return false;
  return !!(await db.prepare("SELECT 1 AS yes FROM group_members WHERE group_id = ?1 AND person = ?2").bind(id, person).first());
}

/* Whether somebody may see a conversation: one of the two people in a pair, or
   a member of the group. */
export async function canSeePair(db, pair, person) {
  const id = groupIdOf(pair);
  return id !== null ? isMember(db, id, person) : String(pair).split(":").includes(person);
}

/* A notice for every member's open pages (shared/live.js). */
export const toMembers = (members, id, kind, extra = {}) =>
  [...new Set(members)].map((to) => ({ to, with: groupPair(id), kind, ...extra }));

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "Someone";

/* What a group without a name is called, from where you sit: the others'
   first names — "Nicholas and Tracey", "Nicholas, Tracey and Ashton",
   "Nicholas, Tracey and 3 others". */
export function defaultTitle(members, me, nameOf) {
  const others = members.filter((p) => p !== me).map((p) => firstName(nameOf(p)));
  if (!others.length) return "Just you";
  if (others.length === 1) return others[0];
  if (others.length <= 3) return `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
  return `${others.slice(0, 2).join(", ")} and ${others.length - 2} others`;
}

/* A group as a page is sent it. */
export const shapeGroup = (row, members, me, nameOf) => ({
  id: row.id,
  chat: groupPair(row.id),
  name: row.name,
  title: row.name || defaultTitle(members, me, nameOf),
  creator: row.creator,
  youMadeIt: row.creator === me,
  members: members.map((id) => ({ id, name: nameOf(id) })),
  picture: row.picture_v || null,
});

/* A group name as somebody typed it, tidied: one line, not endless. */
export const tidyName = (raw) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX);
