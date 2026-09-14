/**
 * The page's live connection (shared/live.js, live/src/index.js).
 *
 * One WebSocket for the whole page. The site sends a short notice down it
 * whenever a message, heart, read or call concerns this person, and the
 * page's loops ask for that change in an ordinary quick request, instead of
 * holding a request open and having the site look every second — which cost
 * more processing than Cloudflare's free plan allows, and came back as 503s.
 *
 * Without a connection — the hub isn't set up, or the network dropped — the
 * loops go back to asking the old way until it returns.
 */

/* Keeps an idle connection from being closed along the way. The hub answers
   without waking up. */
export const PING_MS = 30 * 1000;
/* Even with a connection, each loop still asks this often, in case a notice
   was lost. */
export const RESYNC_MS = 5 * 60 * 1000;

export const liveUrl = (loc = globalThis.location) =>
  `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}/api/live`;

/* After a failed or lost connection, how long before trying again: longer
   each time, up to five minutes (which is also how often a site without the
   hub is asked whether it has one yet). */
export const reconnectDelay = (failures) => Math.min(5 * 60 * 1000, 2000 * 2 ** Math.max(0, failures - 1));

/* A connection that drops — a laptop waking, a phone changing networks — is
   usually back within a few seconds. Only after this many tries in a row fail
   do the loops go back to holding requests open, because a held request is
   the expensive kind that ran past the free plan's limit. Until then they ask
   quickly every RECONNECTING_MS. */
export const DEGRADED_AFTER = 3;
export const RECONNECTING_MS = 10 * 1000;

export function createLive({ url, WebSocketImpl = globalThis.WebSocket, retryDelay = reconnectDelay } = {}) {
  const notices = new Set();
  const states = new Set();
  let ws = null;
  let connected = false;
  let failures = 0;
  let retry = null;
  let ping = null;
  let stopped = true;

  const setConnected = (on) => {
    if (connected === on) return;
    connected = on;
    for (const f of [...states]) f(on);
  };

  const schedule = () => {
    if (stopped) return;
    failures += 1;
    clearTimeout(retry);
    retry = setTimeout(open, retryDelay(failures));
  };

  function open() {
    if (stopped || ws || !WebSocketImpl) return;
    let sock;
    try {
      sock = new WebSocketImpl(url);
    } catch {
      schedule();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      failures = 0;
      clearInterval(ping);
      ping = setInterval(() => { try { sock.send("ping"); } catch { /* closing */ } }, PING_MS);
      setConnected(true);
    };
    sock.onmessage = (e) => {
      if (ws !== sock || e.data === "pong") return;
      let notice;
      try { notice = JSON.parse(e.data); } catch { return; }
      if (!notice || typeof notice !== "object") return;
      for (const f of [...notices]) f(notice);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      clearInterval(ping);
      ws = null;
      setConnected(false);
      schedule();
    };
    sock.onerror = () => { try { sock.close(); } catch { /* already closed */ } };
  }

  return {
    start() { stopped = false; open(); },
    stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      const sock = ws;
      ws = null;
      try { sock?.close(); } catch { /* already closed */ }
      setConnected(false);
    },
    /* Coming back to the page, or back online: try now rather than waiting out
       the last delay. */
    nudge() {
      if (stopped || ws) return;
      failures = 0;
      clearTimeout(retry);
      open();
    },
    get connected() { return connected; },
    /* A connection is being made but hasn't opened or failed yet. */
    get connecting() { return !!ws && !connected; },
    /* Live updates have really failed — several tries in a row, or a browser
       without WebSockets — rather than dropped for a moment. */
    get degraded() { return !connected && (!WebSocketImpl || failures >= DEGRADED_AFTER); },
    onNotice(f) { notices.add(f); return () => notices.delete(f); },
    onState(f) { states.add(f); return () => states.delete(f); },
  };
}

/**
 * What a loop waits on between looks: a notice it cares about, the connection
 * coming or going, or `ms` passing. clear() is called just before asking, so a
 * notice that lands while the answer is on its way isn't lost — the next sleep
 * returns at once instead.
 */
export function watcher(live, match) {
  let dirty = false;
  let wake = null;
  const rouse = () => {
    dirty = true;
    const w = wake;
    wake = null;
    w?.();
  };
  const offNotice = live.onNotice((n) => { if (match(n)) rouse(); });
  const offState = live.onState(rouse);
  return {
    clear() { dirty = false; },
    sleep(ms) {
      if (dirty) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(() => { wake = null; resolve(); }, ms);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    },
    close() {
      offNotice();
      offState();
      rouse();
    },
  };
}
