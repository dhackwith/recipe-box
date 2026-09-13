/**
 * GIFs from KLIPY, for the messenger.
 *
 * Shared between the search endpoint (functions/api/gifs.js), which turns
 * KLIPY's reply into the little the picker needs, and the page, which has to
 * tell a GIF message from an ordinary one.
 *
 * A GIF MESSAGE is a message whose whole text is the address of a GIF on
 * KLIPY's file server. Nothing is copied into the database — KLIPY's terms are
 * about showing their files, not keeping them, and a link costs one short row
 * where the file would cost megabytes — and the messages table needs no new
 * column. Only KLIPY's own file host counts, and only over https, so a message
 * can never be made to load a picture from anywhere else.
 */

export const GIF_HOST = "static.klipy.com";

/* The picker shows a small version and sends a middle-sized one: large enough
   to read in a chat window, a fraction of the full-size file. */
const PREVIEW_ORDER = ["sm", "xs", "md", "hd"];
const SEND_ORDER = ["md", "hd", "sm", "xs"];

/* The address of a GIF on KLIPY's file server, or null. */
export function gifUrl(text) {
  const s = String(text ?? "").trim();
  if (!s || /\s/.test(s) || s.length > 500) return null;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== GIF_HOST || url.username || url.password) return null;
  return url.href;
}

export const isGifMessage = (text) => gifUrl(text) !== null;

function pick(item, order) {
  for (const size of order) {
    const file = item?.file?.[size]?.gif;
    if (file && gifUrl(file.url)) {
      return { url: gifUrl(file.url), width: Number(file.width) || 0, height: Number(file.height) || 0 };
    }
  }
  return null;
}

/* KLIPY's search reply, cut down to what the picker shows: an id, a title for
   anybody who cannot see it, a preview and the one that gets sent. Sponsored
   items arrive mixed in with type "ad" and are left out, as is anything whose
   files are not on KLIPY's own host. */
export function readGifs(payload, max = 24) {
  const list = payload?.data?.data;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || item.type !== "gif") continue;
    const preview = pick(item, PREVIEW_ORDER);
    const send = pick(item, SEND_ORDER);
    if (!preview || !send) continue;
    out.push({
      id: String(item.slug || item.id),
      title: String(item.title || "").trim().slice(0, 120) || "GIF",
      preview,
      url: send.url,
      width: send.width,
      height: send.height,
    });
    if (out.length >= max) break;
  }
  return out;
}

export const hasMoreGifs = (payload) => payload?.data?.has_next === true;
