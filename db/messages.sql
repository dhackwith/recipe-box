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

