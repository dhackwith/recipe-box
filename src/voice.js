/**
 * The page's side of a group voice channel (functions/api/voice.js,
 * shared/voice.js): talking to the endpoint, waiting for the relay connection,
 * and telling who is speaking.
 */

import { VOICE_HERE_MS } from "../shared/voice.js";

export { VOICE_HERE_MS };
export const VOICE_API = "/api/voice";
const REQUEST_TIMEOUT_MS = 20 * 1000;

export async function voiceCall(method, query = "", body) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let res;
  let data = null;
  try {
    res = await fetch(VOICE_API + query, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
    try { data = await res.json(); } catch { data = null; }
  } catch (err) {
    if (abort.signal.aborted) throw Object.assign(new Error("The site took too long to answer"), { status: 0 });
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw Object.assign(new Error((data && data.error) || `Couldn't reach the voice channel (${res.status})`), { status: res.status });
  }
  if (data === null) throw Object.assign(new Error("Voice channels aren't available here — this needs the deployed site"), { status: 501 });
  return data;
}

/* Resolves true once a connection is up, or false if it fails or `ms` passes. */
export function connectedWithin(pc, ms) {
  const up = () => pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
  const down = () => pc.connectionState === "failed" || pc.iceConnectionState === "failed";
  if (up()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer);
      pc.removeEventListener("connectionstatechange", check);
      pc.removeEventListener("iceconnectionstatechange", check);
      resolve(value);
    };
    const check = () => { if (up()) done(true); else if (down()) done(false); };
    const timer = setTimeout(() => done(false), ms);
    pc.addEventListener("connectionstatechange", check);
    pc.addEventListener("iceconnectionstatechange", check);
  });
}

/* How loud a slice of audio is, 0 to 1, from an analyser's byte samples
   (128 is silence). */
export function loudness(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (const s of samples) {
    const v = (s - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
/* Louder than this counts as talking. */
export const SPEAKING_LEVEL = 0.04;

/* Listens to streams and reports who is speaking, five times a second, only
   when that changes. Without Web Audio it quietly does nothing. */
export function createSpeakingMeter(onChange, AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext) {
  const none = { add() {}, remove() {}, stop() {} };
  if (!AudioCtx) return none;
  let ctx;
  try { ctx = new AudioCtx(); } catch { return none; }
  ctx.resume?.().catch(() => {});
  const meters = new Map();
  let state = {};
  const timer = setInterval(() => {
    const next = {};
    for (const [id, m] of meters) {
      m.analyser.getByteTimeDomainData(m.buf);
      next[id] = loudness(m.buf) > SPEAKING_LEVEL;
    }
    const keys = new Set([...Object.keys(state), ...Object.keys(next)]);
    if ([...keys].some((k) => !!state[k] !== !!next[k])) {
      state = next;
      onChange({ ...next });
    }
  }, 200);
  const meter = {
    add(id, stream) {
      meter.remove(id);
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        meters.set(id, { source, analyser, buf: new Uint8Array(analyser.fftSize) });
      } catch { /* a stream with no audio yet */ }
    },
    remove(id) {
      const m = meters.get(id);
      if (!m) return;
      try { m.source.disconnect(); } catch { /* already gone */ }
      meters.delete(id);
    },
    stop() {
      clearInterval(timer);
      for (const id of [...meters.keys()]) meter.remove(id);
      ctx.close?.().catch(() => {});
    },
  };
  return meter;
}
