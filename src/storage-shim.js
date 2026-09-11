/**
 * window.storage only exists inside the Claude artifact runtime. The recipe box
 * calls it for everything it persists, so this shim recreates the same four
 * methods against a Cloudflare Pages Function backed by KV.
 *
 * The contract the app expects:
 *   get(key, shared)    -> { key, value, shared }   THROWS if the key is missing
 *   set(key, value, sh) -> { key, value, shared }
 *   delete(key, shared) -> { key, deleted, shared }
 *   list(prefix, shared)-> { keys, prefix, shared }
 *
 * "shared" data is the family's single recipe box — the app only ever asks for
 * that. The server does not reliably learn who is signed in, so it cannot keep
 * anything per person; personal things (the shopping list, the theme) live in
 * localStorage instead.
 */
const API = "/api/storage";

async function call(method, params, body) {
  const url = new URL(API, window.location.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });

  if (res.status === 404) throw new Error(`Key not found: ${params.key}`);
  if (!res.ok) throw new Error(`Storage ${method} failed (${res.status})`);
  return res.json();
}

window.storage = {
  get: (key, shared = false) => call("GET", { key, shared }),
  set: (key, value, shared = false) => call("PUT", { key, shared }, { value }),
  delete: (key, shared = false) => call("DELETE", { key, shared }),
  list: (prefix = "", shared = false) => call("GET", { prefix, shared }),
};
