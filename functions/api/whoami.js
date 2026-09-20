/**
 * Who you are signed in as.
 *
 * Anybody who reaches this has already been let through the Access allowlist,
 * so it is also everything needed to give a newcomer a proper place on the
 * roster in shared/access.js: the address they signed in with and the full
 * name Google or GitHub knows them by. It only ever describes the person
 * asking, so no address but your own is handed out.
 *
 * GET -> {
 *   email,     the verified address, lower case
 *   fullName,  the name from Google or GitHub; null for an emailed PIN, or
 *              when Access doesn't say
 *   provider,  "google", "github", "onetimepin", or null when Access doesn't say
 *   name,      what the site calls you: the roster's name, else fullName, else
 *              one made from the address
 *   id, onRoster, owner
 * }
 */

import { providerIdentity, personFor, isPerson, isOwner } from "../../shared/access.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequest({ request }) {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

  const who = await providerIdentity(request);
  if (!who) return json({ error: "Could not tell who is signed in" }, 403);

  const me = personFor(who.email, who.name);
  return json({
    email: who.email,
    fullName: who.name,
    provider: who.provider,
    name: me.name,
    id: me.id,
    onRoster: isPerson(me.id),
    owner: isOwner(who.email),
  });
}
