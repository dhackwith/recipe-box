/**
 * The hub for live notices (shared/live.js explains why it exists).
 *
 * One Durable Object holds a WebSocket for every open page, tagged with whose
 * page it is. The site tells it when something changed and for whom (/poke),
 * and it passes the notice to that person's pages. Between notices it sleeps —
 * hibernating, with the connections still up — so an open page with nothing
 * happening costs no processing.
 *
 * It has no address of its own (workers_dev = false, no routes). The site
 * reaches it through its LIVE binding, and only after verifying who is signed
 * in (functions/api/live.js), so the person a connection is tagged with is
 * never taken from the page.
 */

import { DurableObject } from "cloudflare:workers";
import { deliver, okPerson } from "./hub.js";

export class Live extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /* Pages send "ping" now and then so an idle connection isn't closed along
       the way; the runtime answers "pong" itself, without waking the hub. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("expected a WebSocket", { status: 426 });
      }
      const person = url.searchParams.get("person");
      if (!okPerson(person)) return new Response("who?", { status: 400 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [person]);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/poke" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const sent = deliver(body && body.notes, (person) => this.ctx.getWebSockets(person));
      return Response.json({ sent });
    }

    return new Response("not found", { status: 404 });
  }

  /* Pages only ever say "ping", which is answered above without waking. Nothing
     else a page says is acted on. */
  async webSocketMessage() {}

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* already closed */ }
  }

  async webSocketError(ws) {
    try { ws.close(1011, "error"); } catch { /* already closed */ }
  }
}

export default {
  async fetch() {
    return new Response("Nothing here", { status: 404 });
  },
};
