/**
 * Choosing which part of a photo becomes a round picture — somebody's profile
 * picture, or a group's.
 *
 * A crop is a square of the photo, described by its centre in the photo's own
 * pixels and a zoom: at zoom 1 the square is as wide as the photo's short side,
 * at 2 it is half that. It is kept in photo pixels rather than screen pixels,
 * so the preview (whatever size it is drawn) and the saved picture can't
 * disagree about what was chosen. Every function hands back a crop that stays
 * inside the photo, so no edge of the circle is ever left empty.
 */

export const ZOOM_MAX = 4;

/** The middle of the photo, as large as it goes: what was saved before cropping existed. */
export function cropStart(width, height) {
  return { cx: width / 2, cy: height / 2, zoom: 1 };
}

const sideOf = (width, height, zoom) => Math.min(width, height) / zoom;

/** The same crop, pulled back inside the photo and the zoom range. */
export function cropClamp(width, height, crop = {}) {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, Number(crop.zoom) || 1));
  const half = sideOf(width, height, zoom) / 2;
  const within = (v, size) => Math.min(size - half, Math.max(half, Number.isFinite(v) ? v : size / 2));
  return { cx: within(crop.cx, width), cy: within(crop.cy, height), zoom };
}

/**
 * Dragging the photo by dx, dy screen pixels, in a frame `frame` pixels wide.
 * The photo follows the finger, so the square moves the other way.
 */
export function cropMove(width, height, crop, dx, dy, frame) {
  const perPx = sideOf(width, height, cropClamp(width, height, crop).zoom) / frame;
  return cropClamp(width, height, { ...crop, cx: crop.cx - dx * perPx, cy: crop.cy - dy * perPx });
}

/** Zooming about the middle of the frame, as far as the photo's edges allow. */
export function cropZoom(width, height, crop, zoom) {
  return cropClamp(width, height, { ...crop, zoom });
}

/** The square to draw from the photo: its left, top and side, in photo pixels. */
export function cropRect(width, height, crop) {
  const c = cropClamp(width, height, crop);
  const side = sideOf(width, height, c.zoom);
  return { sx: c.cx - side / 2, sy: c.cy - side / 2, side };
}

/**
 * Where the whole photo sits for the preview, in a frame `frame` units wide.
 * Pass 100 to get percentages of the frame.
 */
export function cropView(width, height, crop, frame) {
  const { sx, sy, side } = cropRect(width, height, crop);
  const scale = frame / side;
  return { left: -sx * scale, top: -sy * scale, width: width * scale, height: height * scale };
}
