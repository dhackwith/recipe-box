/**
 * The page's side of an audio call (functions/api/calls.js, shared/calls.js):
 * talking to the endpoint, what the call card says, the ring, and the one step
 * of setting a call up that doesn't need React.
 */

import { STUN_SERVERS, RING_MS } from "../shared/calls.js";

export { STUN_SERVERS, RING_MS };
export const CALLS_API = "/api/calls";

/* A browser that can make a call: WebRTC and a microphone to ask for. */
export function callsSupported(w = globalThis) {
  return !!(w.RTCPeerConnection && w.navigator?.mediaDevices?.getUserMedia);
}

export async function callsCall(method, query = "", body) {
  const res = await fetch(CALLS_API + query, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  const fail = (message, status) => Object.assign(new Error(message), { status });
  if (!res.ok) throw fail((data && data.error) || `Couldn't reach calls (${res.status})`, res.status);
  /* A dev server answers with the page itself, which isn't JSON. */
  if (data === null) throw fail("Calls aren't available here — this needs the deployed site", 501);
  return data;
}

/* How long a call has been going: 0:07, 12:40, 1:02:05. */
export function talkClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const firstOf = (name) => String(name || "").trim().split(/\s+/)[0] || "They";

/* Why a call ended, from where you sit. */
export function endedLabel(reason, outgoing, name) {
  const first = firstOf(name);
  switch (reason) {
    case "declined": return outgoing ? `${first} can't talk right now` : "Call declined";
    case "missed": return outgoing ? `${first} didn't answer` : `Missed call from ${first}`;
    case "cancelled": return outgoing ? "Call cancelled" : `Missed call from ${first}`;
    case "dropped": return "The call dropped";
    case "failed": return "Couldn't connect. One of your networks won't allow a direct call — try both being on Wi-Fi.";
    default: return "Call ended";
  }
}

/* The line under the name on the call card. */
export function callStatus({ phase, outgoing, reason, error, name, since, now = Date.now() }) {
  switch (phase) {
    case "calling": return "Calling…";
    case "connecting": return "Connecting…";
    case "active": return talkClock(now - (since || now));
    case "ended": return error || endedLabel(reason, outgoing, name);
    default: return "";
  }
}

/* What went wrong with the microphone, in words somebody can act on. */
export function micError(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Calls need your microphone. Allow it for this site in your browser, then try again.";
    case "NotFoundError": return "No microphone was found on this device.";
    case "NotReadableError": return "Your microphone is busy with something else.";
    default: return "Your microphone couldn't be started.";
  }
}
export const isMicError = (err) => /^(NotAllowed|NotFound|NotReadable|Security|Overconstrained)Error$/.test(err?.name || "");

/* Waits for the browser to finish finding its routes, so the offer or answer
   sent carries all of them and nothing more has to follow it. STUN answers in
   well under a second; a slow network gets `ms`, then whatever has been found
   goes. */
export function iceGathered(pc, ms = 2500) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/* A ring, made on the spot rather than a sound file: two short bursts every
   three seconds (and a buzz, where a phone can) for somebody calling you, a
   long quiet tone every four while you wait for them. Browsers only let a page
   make a sound once somebody has used it, so a page nobody has touched rings
   silently — the card still shows. Returns the way to stop it. */
export function playTone(kind) {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  /* A buzz too, but only once somebody has touched the page: before that the
     browser refuses, and says so in the console every time. */
  const buzz = (pattern) => {
    const nav = globalThis.navigator;
    if (!nav?.vibrate || nav.userActivation?.hasBeenActive === false) return;
    try { nav.vibrate(pattern); } catch { /* not a phone */ }
  };
  let ctx = null;
  try { ctx = Ctx ? new Ctx() : null; } catch { ctx = null; }
  ctx?.resume?.().catch(() => {});
  const beep = (at, length, level) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.02);
    gain.gain.setValueAtTime(level, at + length - 0.04);
    gain.gain.linearRampToValueAtTime(0, at + length);
    gain.connect(ctx.destination);
    for (const hz of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + length);
    }
  };
  const cycle = () => {
    if (kind === "incoming") buzz([400, 200, 400]);
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    if (kind === "incoming") { beep(t, 0.4, 0.16); beep(t + 0.6, 0.4, 0.16); }
    else beep(t, 1.2, 0.05);
  };
  cycle();
  const every = setInterval(cycle, kind === "incoming" ? 3000 : 4000);
  return () => {
    clearInterval(every);
    if (kind === "incoming") buzz(0);
    ctx?.close?.().catch(() => {});
  };
}
