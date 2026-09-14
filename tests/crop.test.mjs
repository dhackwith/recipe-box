/**
 * Choosing the part of a photo that becomes a round picture (src/crop.js).
 */

import { ZOOM_MAX, cropStart, cropClamp, cropMove, cropZoom, cropRect, cropView } from "../src/crop.js";

let pass = 0, fail = 0;
const near = (a, b) => JSON.stringify(a, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)) ===
  JSON.stringify(b, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v));
const is = (label, got, want) => {
  const ok = near(got, want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

/* A wide photo, 400 by 200, shown in a frame 200 pixels across. */
const W = 400, H = 200, FRAME = 200;
const start = cropStart(W, H);

/* ── where it starts: the middle square, which is what was saved before ── */
is("a wide photo starts on its middle square", cropRect(W, H, start), { sx: 100, sy: 0, side: 200 });
is("a tall photo starts on its middle square", cropRect(200, 400, cropStart(200, 400)), { sx: 0, sy: 100, side: 200 });
is("a square photo starts as the whole photo", cropRect(300, 300, cropStart(300, 300)), { sx: 0, sy: 0, side: 300 });

/* ── dragging ── */
is("dragging the photo left shows more of its right", cropRect(W, H, cropMove(W, H, start, -50, 0, FRAME)), { sx: 150, sy: 0, side: 200 });
is("dragging it right shows more of its left", cropRect(W, H, cropMove(W, H, start, 60, 0, FRAME)), { sx: 40, sy: 0, side: 200 });
is("it stops at the photo's edge", cropRect(W, H, cropMove(W, H, start, -1000, 0, FRAME)), { sx: 200, sy: 0, side: 200 });
is("...on the other side too", cropRect(W, H, cropMove(W, H, start, 1000, 0, FRAME)), { sx: 0, sy: 0, side: 200 });
is("with no room up or down, dragging up or down does nothing", cropRect(W, H, cropMove(W, H, start, 0, 80, FRAME)), { sx: 100, sy: 0, side: 200 });
is("a drag in a smaller frame moves further through the photo",
  cropRect(W, H, cropMove(W, H, start, -50, 0, 100)), { sx: 200, sy: 0, side: 200 });

/* ── zooming ── */
const zoomed = cropZoom(W, H, start, 2);
is("zoom 2 is a square half as wide, about the same middle", cropRect(W, H, zoomed), { sx: 150, sy: 50, side: 100 });
is("zoomed in, there's room to drag up and down", cropRect(W, H, cropMove(W, H, zoomed, 0, 100, FRAME)), { sx: 150, sy: 0, side: 100 });
is("zoomed in, a drag moves less of the photo per pixel", cropRect(W, H, cropMove(W, H, zoomed, -50, 0, FRAME)), { sx: 175, sy: 50, side: 100 });
is("zoom stops at the most", cropZoom(W, H, start, 10).zoom, ZOOM_MAX);
is("...and can't go below showing the whole short side", cropZoom(W, H, start, 0.5).zoom, 1);
const atEdge = cropMove(W, H, zoomed, -1000, -1000, FRAME);
is("zooming back out near an edge pulls the square back inside", cropRect(W, H, cropZoom(W, H, atEdge, 1)), { sx: 200, sy: 0, side: 200 });

/* ── the preview ── */
is("the preview puts the middle square in the frame", cropView(W, H, start, FRAME), { left: -100, top: 0, width: 400, height: 200 });
is("in percentages of the frame", cropView(W, H, start, 100), { left: -50, top: 0, width: 200, height: 100 });
is("zoomed in, the photo is drawn twice as large", cropView(W, H, zoomed, 100), { left: -150, top: -50, width: 400, height: 200 });

/* ── nonsense ── */
is("a missing crop is the middle", cropRect(W, H, undefined), { sx: 100, sy: 0, side: 200 });
is("a broken crop is the middle", cropClamp(W, H, { cx: NaN, cy: "x", zoom: "big" }), { cx: 200, cy: 100, zoom: 1 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
