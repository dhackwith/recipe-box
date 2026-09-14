/**
 * Video in calls: the camera, and how a call screen lays people out.
 *
 * A 1:1 call carries video straight between the two browsers, on the same
 * connection as the voice (src/calls.js). Every call is set up with room for a
 * camera each way, even a voice call, because a call's connection details are
 * sent once and never again — so turning a camera on mid-call only starts
 * sending into room that is already there.
 *
 * Whether each end's camera is on travels down the connection itself, as a
 * small message on its own channel. A camera switched off sends nothing, and
 * nothing isn't something the other end can notice quickly.
 *
 * Group video is meant to go through Cloudflare's relay the way group voice
 * does (shared/voice.js), as a second track beside the microphone. The camera
 * settings and the grid here are written for that too.
 */

/* What a camera is asked for. Face to face, 720p. In a group everybody pulls
   everybody's picture through the relay, which counts the data, so 360p. */
export function cameraConstraints(facing = "user", { group = false } = {}) {
  return group
    ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } }
    : { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
}

export const nextFacing = (facing) => (facing === "environment" ? "user" : "environment");

/* The channel each end says its camera state on. Negotiated with a fixed id,
   as the "bye" channel is (id 0), so it needs no setting up. A page from
   before video never makes id 1, and simply doesn't hear it. */
export const STATE_CHANNEL = { label: "state", id: 1 };

export const stateMessage = ({ camera }) => JSON.stringify({ camera: !!camera });

export function readState(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && typeof v.camera === "boolean" ? { camera: v.camera } : null;
  } catch {
    return null;
  }
}

/* The connection's slot for video, if the call was set up with one: a call
   from a page older than video has none, and its camera button stays off. */
export function videoTransceiver(pc) {
  return pc.getTransceivers().find((t) => !t.stopped && t.receiver?.track?.kind === "video") || null;
}

/* Whether the call needs the big screen rather than the card: somebody's
   camera is on, and the call isn't over. */
export const onScreen = (call) => !!(call && call.phase !== "ended" && (call.camera || call.theirCamera));

/* Columns and rows for n pictures: as near square as they go where there's
   room, and one or two columns on a narrow screen held upright. */
export function gridFor(n, narrow = false) {
  const count = Math.max(1, Math.floor(n) || 1);
  const cols = narrow ? (count <= 2 ? 1 : 2) : Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

/* What went wrong with the camera, in words somebody can act on. */
export function cameraError(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Video needs your camera. Allow it for this site in your browser, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Your camera is busy with something else.";
    default:
      return "Your camera couldn't be started.";
  }
}
