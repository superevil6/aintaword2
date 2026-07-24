// Canvas rendering for sigilsweep.
//
// Kept apart from game.js so the controller stays testable under jsdom, which
// has no 2D canvas context: every entry point here no-ops on a missing context
// rather than throwing. The e2e harness drives the real game loop and simply
// gets no pixels.

const LINE_RATIO = 0.17;   // stroke width as a fraction of one lattice unit
const FIT = 0.7;           // fraction of the canvas the 3-unit-tall lattice fills

/** The lattice unit size that fits a sigil into a square of this size. */
export function unitFor(size) {
  return (size * FIT) / 3;
}

function ctxOf(canvas) {
  try {
    return canvas?.getContext?.("2d") ?? null;
  } catch {
    return null;
  }
}

/** Draw a sigil centred on the current origin. */
export function drawGlyph(ctx, strokes, unit, color) {
  ctx.lineWidth = unit * LINE_RATIO;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  for (const s of strokes) {
    const ax = s.a.x * unit, ay = s.a.y * unit;
    const bx = s.b.x * unit, by = s.b.y * unit;
    ctx.beginPath();
    if (s.type === "line") {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    } else if (s.type === "curve") {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay;
      const L = Math.hypot(dx, dy) || 1;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx - (dy / L) * s.bow * unit, my + (dx / L) * s.bow * unit, bx, by);
      ctx.stroke();
    } else if (s.type === "dot") {
      ctx.arc(ax, ay, s.r * unit, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.type === "ring") {
      ctx.arc(ax, ay, s.r * unit, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** The whole sigil, unobscured — used for the option tiles and the reveal. */
export function drawStatic(canvas, strokes, color = "#f2efe8") {
  const ctx = ctxOf(canvas);
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  drawGlyph(ctx, strokes, unitFor(Math.min(w, h)), color);
  ctx.restore();
}

function clipSector(ctx, a0, a1, r) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, a0, a1);
  ctx.closePath();
  ctx.clip();
}

/**
 * THE MECHANIC.
 *
 * A split line runs through the centre at angle `t`. The sector on one side of
 * it, [t, t+wedge], shows the TRUE slice of the sigil. The sector on the other
 * side, [t−wedge, t], shows that same slice REFLECTED back across the line —
 * so the figure on screen is always symmetric about the split, and half of what
 * the player is looking at is a lie.
 *
 * Reflection about a line through the origin at angle t is the matrix
 * [cos2t, sin2t; sin2t, −cos2t], which is what the ctx.transform below applies.
 *
 * At wedge = 180° the two sectors tile the whole disc: nothing is hidden, but
 * half of it is still mirrored. Narrower wedges leave the rest of the disc dark,
 * so the mark has to be assembled from memory as the slit travels.
 *
 * Nothing persists between frames — that is deliberate, and it is what makes
 * this a memory game rather than a look-at-it game.
 */
export function drawSweep(canvas, strokes, { angleRad, wedgeRad, color = "#f2efe8", axis = null }) {
  const ctx = ctxOf(canvas);
  if (!ctx) return;
  const size = Math.min(canvas.width, canvas.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);

  const unit = unitFor(size);
  const R = size; // generous: the clip only has to cover the drawn glyph

  ctx.save();
  clipSector(ctx, angleRad, angleRad + wedgeRad, R);
  drawGlyph(ctx, strokes, unit, color);
  ctx.restore();

  ctx.save();
  clipSector(ctx, angleRad - wedgeRad, angleRad, R);
  const c = Math.cos(2 * angleRad), s = Math.sin(2 * angleRad);
  ctx.transform(c, s, s, -c, 0, 0);
  drawGlyph(ctx, strokes, unit, color);
  ctx.restore();

  if (axis) {
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(angleRad) * R, -Math.sin(angleRad) * R);
    ctx.lineTo(Math.cos(angleRad) * R, Math.sin(angleRad) * R);
    ctx.stroke();
  }

  ctx.restore();
}

/** Size a canvas's backing store to its CSS box at the device pixel ratio. */
export function fitCanvas(canvas, cssSize) {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  return canvas;
}
