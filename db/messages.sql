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
