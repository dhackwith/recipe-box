/**
 * Profile pictures.
 *
 * Requires the same RECIPES binding as /api/storage.
 *
 * One picture per person, not per address: it is keyed by the roster id from
 * shared/access.js, so Nicholas's two addresses show one face. Only people on
 * the roster may keep one, because the id of somebody off the roster is their
 * email address, and a list of faces keyed by that would hand the address out
 * to everyone.
 *
 * The picture is a small square JPEG the browser has already cut, checked the
 * way a note photo is — JPEG through a canvas, nothing else, so no SVG or HTML
 * can be stored and served back — and it goes out as image bytes. Its address
 * carries a version that changes whenever the picture does, so a browser may
 * keep each version for good and still sees a new one at once.
 *
 * GET    ?faces          -> { me: { id, name, face, canHaveFace }, faces: { id: version } }
 * GET    ?face=<id>&v=   -> the picture
 * PUT    { face }        -> keep a new picture of yourself
 * DELETE                 -> take yours away
 *
 * Which faces exist is read from one KV listing, with the version kept as each
 * key's metadata, so the list costs a single call however many there are. A
 * listing can lag a minute behind a write; the person who changed their
 * picture is handed the new version directly, so only everybody else waits.
 */

import { identity, personFor, isPerson, isOwner } from "../../shared/access.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Characters of data URL. The app sends a 256px square, a few tens of
   thousands; this is a ceiling for something that has gone wrong. */
const FACE_MAX = 120_000;
const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=?=?$/;
const faceKey = (id) => `face:${id}`;

export async function onRequest({ request, env }) {
  if (!env.RECIPES) {
    return json({ error: "KV namespace RECIPES is not bound to this project" }, 500);
  }

  const email = await identity(request);
  if (!email) {
    return json({ error: "Could not tell who is signed in" }, 403);
  }
  const me = personFor(email);
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      /* One face, as a picture. Only a roster id is looked up, so this address
         can never be pointed at anything else that is stored. */
      const face = url.searchParams.get("face");
      if (face !== null) {
        if (!isPerson(face)) return json({ error: "nobody by that id" }, 404);
        const stored = await env.RECIPES.get(faceKey(face));
        if (!stored) return json({ error: "no picture" }, 404);
        const comma = stored.indexOf(",");
        if (comma < 0) return json({ error: "not a picture" }, 500);
        const binary = atob(stored.slice(comma + 1));
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

      const listed = await env.RECIPES.list({ prefix: "face:" });
      const faces = {};
      for (const k of listed.keys) {
        const id = k.name.slice("face:".length);
        if (isPerson(id)) faces[id] = String(k.metadata?.v || "1");
      }
      return json({
        /* owner rides along here because this is asked for on every page load;
           the page only uses it to offer Remove, and the server checks again. */
        me: { id: me.id, name: me.name, face: faces[me.id] || null, canHaveFace: isPerson(me.id), owner: isOwner(email) },
        faces,
      });
    }

    if (request.method === "PUT") {
      if (!isPerson(me.id)) {
        return json({ error: "Only people on the family list can keep a picture here" }, 403);
      }
      const body = await request.json().catch(() => null);
      const face = body && body.face;
      if (typeof face !== "string" || face.length > FACE_MAX || !JPEG_URL.test(face)) {
        return json({ error: "that picture couldn't be read — try a JPEG, or a smaller picture" }, 400);
      }
      const v = Date.now().toString(36);
      await env.RECIPES.put(faceKey(me.id), face, { metadata: { v } });
      return json({ face: v });
    }

    if (request.method === "DELETE") {
      if (isPerson(me.id)) await env.RECIPES.delete(faceKey(me.id));
      return json({ face: null });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500);
  }
}
