-- Private messages, blocks, and how far each person has read.
--
-- Run against the D1 database bound to the site as MESSAGES:
--   npx wrangler d1 execute recipe-box-messages --remote --file=db/messages.sql
-- It is safe to run again: every statement is IF NOT EXISTS.
--
-- Ids are people, not addresses (see shared/access.js): somebody with two
-- email addresses is one person, and one conversation.
--
-- `pair` is the two ids sorted and joined with a colon, so a conversation has
-- one name whichever end you look from, and the index below makes reading it
-- one lookup. It is written by the endpoint, never sent by the page.

CREATE TABLE IF NOT EXISTS messages (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  pair     TEXT    NOT NULL,
  sender   TEXT    NOT NULL,
  recipient TEXT   NOT NULL,
  text     TEXT    NOT NULL,
  at       TEXT    NOT NULL,
  deleted  INTEGER NOT NULL DEFAULT 0
);

-- Reading a conversation, newest last; and counting what is unread.
CREATE INDEX IF NOT EXISTS messages_by_pair ON messages (pair, id);
CREATE INDEX IF NOT EXISTS messages_to ON messages (recipient, id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  at      TEXT NOT NULL,
  PRIMARY KEY (blocker, blocked)
);

CREATE TABLE IF NOT EXISTS reads (
  person    TEXT    NOT NULL,
  pair      TEXT    NOT NULL,
  last_read INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person, pair)
);

-- When each person was last using the site, for the lights beside their name.
-- One row each, overwritten: this is the only thing here that is not history.
CREATE TABLE IF NOT EXISTS presence (
  person TEXT PRIMARY KEY,
  at     TEXT NOT NULL
);

-- Photos and files sent with a message. The endpoint also creates these if they
-- are missing, so a database set up before attachments needs nothing run by hand.
-- A file belongs to message 0 until its message is written, in the same
-- transaction that links the two, so nobody sees a message whose file is still
-- arriving. Its bytes are kept in pieces well inside D1's row size limit.
CREATE TABLE IF NOT EXISTS attachments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  message INTEGER NOT NULL DEFAULT 0,
  name    TEXT    NOT NULL,
  type    TEXT    NOT NULL,
  size    INTEGER NOT NULL,
  pieces  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_by_message ON attachments (message);

-- People Cloudflare Access lets in who aren't on the roster yet. id is g- and
-- a hash of the address; the address itself stays here, server-side, only to
-- move their conversations when that id changes. shared/guests.js also creates
-- this if it is missing.
CREATE TABLE IF NOT EXISTS guests (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  at      TEXT NOT NULL
);

-- Hearts on messages (kind 'm', target = message id, pair = its conversation)
-- and on notes (kind 'n', target = the note's KV key, pair = ''). One row per
-- person per thing, switched on and off; every change takes the next seq, so a
-- conversation can ask for what changed since it last looked. shared/loves.js
-- also creates this if it is missing.
CREATE TABLE IF NOT EXISTS loves (
  kind   TEXT    NOT NULL,
  target TEXT    NOT NULL,
  person TEXT    NOT NULL,
  pair   TEXT    NOT NULL DEFAULT '',
  loved  INTEGER NOT NULL,
  seq    INTEGER NOT NULL,
  at     TEXT    NOT NULL,
  PRIMARY KEY (kind, target, person)
);
CREATE INDEX IF NOT EXISTS loves_by_pair ON loves (pair, seq);

CREATE TABLE IF NOT EXISTS attachment_pieces (
  attachment INTEGER NOT NULL,
  n          INTEGER NOT NULL,
  data       BLOB    NOT NULL,
  PRIMARY KEY (attachment, n)
);

-- Audio calls (shared/calls.js). Only the setting up is kept: the caller's
-- offer and the answer, each a browser's description of how to reach it. The
-- call itself goes straight between the two browsers and never comes here.
-- state is ringing, active or ended; a call nobody ends is ended with a reason
-- the next time anybody asks about it. shared/calls.js also creates this.
CREATE TABLE IF NOT EXISTS calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pair        TEXT NOT NULL,
  caller      TEXT NOT NULL,
  callee      TEXT NOT NULL,
  state       TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  offer       TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT '',
  ended_at    TEXT NOT NULL DEFAULT '',
  caller_seen TEXT NOT NULL,
  callee_seen TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS calls_to ON calls (callee, state);
CREATE INDEX IF NOT EXISTS calls_from ON calls (caller, state);

-- Group chats (shared/groups.js). A group's messages are ordinary rows in
-- `messages` under the pair "grp:<id>" with an empty recipient. `picture` is a
-- small JPEG data URL somebody in the group chose, and picture_v changes with
-- it. shared/groups.js also creates these.
CREATE TABLE IF NOT EXISTS groups (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL DEFAULT '',
  creator   TEXT NOT NULL,
  picture   TEXT NOT NULL DEFAULT '',
  picture_v TEXT NOT NULL DEFAULT '',
  at        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  person   TEXT    NOT NULL,
  added_by TEXT    NOT NULL,
  at       TEXT    NOT NULL,
  PRIMARY KEY (group_id, person)
);
CREATE INDEX IF NOT EXISTS group_members_by_person ON group_members (person);

-- Who is in each group's voice channel (shared/voice.js). `session` is their
-- Realtime relay session, never sent to a page; `ready` once their connection
-- is up; `seen` refreshed every half minute, and rows silent for 75 seconds are
-- cleared. shared/voice.js also creates this.
CREATE TABLE IF NOT EXISTS voice_members (
  group_id INTEGER NOT NULL,
  person   TEXT    NOT NULL,
  session  TEXT    NOT NULL,
  track    TEXT    NOT NULL,
  muted    INTEGER NOT NULL DEFAULT 0,
  ready    INTEGER NOT NULL DEFAULT 0,
  joined   TEXT    NOT NULL,
  seen     TEXT    NOT NULL,
  PRIMARY KEY (group_id, person)
);
CREATE INDEX IF NOT EXISTS voice_by_person ON voice_members (person);

-- When each person last did anything on the site (shared/presence.js), beside
-- `presence`, which is when a page of theirs last checked in. Together they
-- make active, away (a page open but idle five minutes) or offline.
-- shared/presence.js also creates this.
CREATE TABLE IF NOT EXISTS activity (
  person TEXT PRIMARY KEY,
  at     TEXT NOT NULL
);
