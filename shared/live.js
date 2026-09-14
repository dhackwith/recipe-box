/**
 * Telling open pages that something changed, the moment it does.
 *
 * WHY. The messenger used to find out about new messages, hearts and calls by
 * holding a request open and asking the database about once a second. Every
 * one of those looks costs a little processing, and a held request added up to
 * 13–21 ms of it (measured on the live site), where the free plan allows 10 ms a
 * request. Cloudflare let most through and cut some off with a 503, most often
 * after a break, when everything starts cold.
 *
 * HOW. A small separate Worker (live/, a Durable Object bound here as LIVE)
 * holds one WebSocket for each open page and does nothing until told. Whenever
 * something changes, the endpoint that changed it sends a notice through the
 * hub to the people concerned, and their pages ask for the change in an
 * ordinary quick request. An open connection with nothing happening costs no
 * processing at all: the hub sleeps and the connection stays up.
 *
 * NOTICES CARRY NO CONTENT. A notice says what kind of thing changed and whose
 * conversation or which call — never the words, the file or the heart itself —
 * so a notice that went astray would give nothing away, and everything still
 * goes through the same checks (Access, blocks, pairs) as before.
 *
 * WITHOUT THE HUB (no LIVE binding) nothing here does anything and pages go on
 * asking the old way.
 */

/* Everybody's pages share one hub: a family's worth of connections is nothing. */
export const HUB = "hub";

const hubOf = (env) => env.LIVE.get(env.LIVE.idFromName(HUB));

/** A notice for each end of a conversation or call, each naming the other. */
export const bothEnds = (a, b, kind, extra = {}) =>
  a === b ? [{ to: a, with: b, kind, ...extra }] : [{ to: a, with: b, kind, ...extra }, { to: b, with: a, kind, ...extra }];

/**
 * Sends notices to whichever of their people have a page open. A notice is a
 * nicety on top of a change that has already been made, so it never fails that
 * change: pages also ask on their own now and then, and pick up anything missed.
 */
export async function poke(env, notes) {
  if (!env || !env.LIVE || !notes || !notes.length) return;
  try {
    await hubOf(env).fetch("https://live/poke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
  } catch {
    /* the pages' own occasional check will catch it */
  }
}

/** A page's WebSocket, handed to the hub as `person` — who the caller has
    already verified. The hub has no address of its own, so this is the only
    way to reach it. */
export function connect(env, request, person) {
  const url = new URL("https://live/connect");
  url.searchParams.set("person", person);
  return hubOf(env).fetch(new Request(url, request));
}
