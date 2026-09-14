/**
 * What the hub does with notices, kept apart from the Durable Object so it can
 * be tested in plain Node (live/src/index.js is the Worker around it).
 *
 * Each notice goes to every page its person has open. The `to` is taken off
 * first: a page already knows who it is.
 */
export function deliver(notes, socketsFor) {
  let sent = 0;
  for (const note of Array.isArray(notes) ? notes : []) {
    if (!note || typeof note.to !== "string" || !note.to) continue;
    const { to, ...rest } = note;
    const text = JSON.stringify(rest);
    for (const ws of socketsFor(to)) {
      try {
        ws.send(text);
        sent++;
      } catch {
        /* that page is going; its close will tidy it away */
      }
    }
  }
  return sent;
}

/* A person id as the site makes them: roster words and g- guest ids. Anything
   else never came from the site, and isn't used as a tag. */
export const okPerson = (v) => typeof v === "string" && /^[A-Za-z0-9_.@+-]{1,120}$/.test(v);
