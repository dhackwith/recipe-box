/**
 * Video in calls: the parts that don't need a camera — what a camera is asked
 * for, the camera-state message, which slot carries video, when the big screen
 * shows, and the grid a group call will use.
 */

const {
  cameraConstraints, nextFacing, STATE_CHANNEL, stateMessage, readState,
  videoTransceiver, onScreen, gridFor, cameraError,
} = await import("../src/video.js");

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

console.log("\n— the camera —");
is("face to face asks for 720p", [cameraConstraints().width.ideal, cameraConstraints().height.ideal], [1280, 720]);
is("...from the front camera", cameraConstraints().facingMode, "user");
is("a group asks for 360p, since the relay counts the data", [cameraConstraints("user", { group: true }).width.ideal, cameraConstraints("user", { group: true }).height.ideal], [640, 360]);
is("the back camera can be asked for", cameraConstraints("environment").facingMode, "environment");
is("flipping goes back and forth", [nextFacing("user"), nextFacing("environment"), nextFacing(undefined)], ["environment", "user", "environment"]);
is("a refused camera says how to fix it", cameraError({ name: "NotAllowedError" }).startsWith("Video needs your camera"), true);
is("no camera says so", cameraError({ name: "NotFoundError" }), "No camera was found on this device.");
is("anything else still says something", cameraError(null), "Your camera couldn't be started.");

console.log("\n— saying whether the camera is on —");
is("the state channel isn't the bye channel", STATE_CHANNEL.id !== 0, true);
is("a message round-trips", [readState(stateMessage({ camera: true })), readState(stateMessage({ camera: false }))], [{ camera: true }, { camera: false }]);
is("anything else is ignored", [readState("bye"), readState("{}"), readState('{"camera":"yes"}'), readState("null")], [null, null, null, null]);

console.log("\n— the slot video goes in —");
const track = (kind) => ({ receiver: { track: { kind } } });
is("found among the connection's slots", videoTransceiver({ getTransceivers: () => [track("audio"), track("video")] }), track("video"));
is("a call from a page older than video has none", videoTransceiver({ getTransceivers: () => [track("audio")] }), null);
is("a stopped slot doesn't count", videoTransceiver({ getTransceivers: () => [{ ...track("video"), stopped: true }] }), null);

console.log("\n— when the big screen shows —");
is("nobody's camera on: the card", onScreen({ phase: "active", camera: false, theirCamera: false }), false);
is("your camera on: the screen", onScreen({ phase: "calling", camera: true }), true);
is("their camera on: the screen", onScreen({ phase: "active", theirCamera: true }), true);
is("an ended call goes back to the card, to say why", onScreen({ phase: "ended", camera: true }), false);
is("no call, nothing", onScreen(null), false);

console.log("\n— the grid —");
is("one picture fills it", gridFor(1), { cols: 1, rows: 1 });
is("two sit side by side", gridFor(2), { cols: 2, rows: 1 });
is("...or stacked on a phone", gridFor(2, true), { cols: 1, rows: 2 });
is("four make a square", gridFor(4), { cols: 2, rows: 2 });
is("five go three across", gridFor(5), { cols: 3, rows: 2 });
is("a full group of twelve", gridFor(12), { cols: 4, rows: 3 });
is("...is two across on a phone", gridFor(12, true), { cols: 2, rows: 6 });
is("nonsense counts as one", gridFor(0), { cols: 1, rows: 1 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
