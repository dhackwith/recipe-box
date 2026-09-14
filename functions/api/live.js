/**
 * A page's live connection (shared/live.js): a WebSocket to the hub, which
 * tells the page when a message, heart or call concerns it.
 *
 * Who is connecting is taken from the verified Access token, as everywhere
 * else, and handed to the hub by this endpoint. Anything the page itself says
 * about who it is — a ?person= in the address, say — is ignored.
 *
 * GET (WebSocket upgrade) -> 101 and a connection that receives notices
 */

import { identity, personFor } from "../../shared/access.js";
import { connect } from "../../shared/live.js";

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequest({ request, env }) {
  if (!env || !env.LIVE) return json({ error: "Live updates aren't switched on for this site yet" }, 501);
  if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return json({ error: "This address is for a live connection" }, 426);
  }
  const email = await identity(request);
  if (!email) return json({ error: "Could not tell who is signed in" }, 403);
  return connect(env, request, personFor(email).id);
}
