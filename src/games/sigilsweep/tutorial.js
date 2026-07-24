// Animated demo shown on the difficulty picker.
//
// A live miniature of the real mechanic: one fixed mark, the split line
// sweeping through it, the mirrored half plainly visible. Showing beats
// telling here — the reflection trick is hard to describe but obvious once you
// watch it turn. A fixed, hand-picked mark (not a generated one) so the demo is
// stable and the "aha" reads clearly.

import { drawSweep, drawStatic, fitCanvas } from "./render.js";

const DEMO_PX = 132;
const ROTATION_MS = 5200;
const INK = "#ece7dc";

// A simple asymmetric mark so the mirrored side visibly disagrees with the true
// side as it turns — the whole point of the demo. Lattice nodes are col*4+row.
const DEMO_SIGIL = [
  { type: "line", a: { x: 0, y: -1.5 }, b: { x: 0, y: 1.5 }, len: 3 },
  { type: "line", a: { x: 0, y: -1.5 }, b: { x: 1, y: -0.5 }, len: Math.hypot(1, 1) },
  { type: "line", a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 }, len: 1 },
  { type: "curve", a: { x: 0, y: 1.5 }, b: { x: -1, y: 0.5 }, bow: 0.55, len: Math.hypot(1, 1) * 1.15 },
];
const WEDGE_RAD = (90 * Math.PI) / 180;

function prefersReducedMotion() {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; }
  catch { return false; }
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup — stops the loop and removes the element.
 */
export function mountTutorial(container) {
  const el = document.createElement("div");
  el.className = "sg-demo";
  el.setAttribute("aria-hidden", "true"); // the prose beside it carries the rule
  el.innerHTML = `<canvas class="sg-demo-canvas"></canvas>`;
  container.appendChild(el);

  const canvas = el.querySelector(".sg-demo-canvas");
  fitCanvas(canvas, DEMO_PX);

  if (prefersReducedMotion()) {
    // Hold the mark at a legible angle rather than spinning.
    drawSweep(canvas, DEMO_SIGIL, { angleRad: Math.PI / 5, wedgeRad: WEDGE_RAD, color: INK });
    return () => el.remove();
  }

  let raf = null;
  let start = null;
  const frame = (ts) => {
    start ??= ts;
    const angle = (((ts - start) / ROTATION_MS) * Math.PI * 2) % (Math.PI * 2);
    drawSweep(canvas, DEMO_SIGIL, { angleRad: angle, wedgeRad: WEDGE_RAD, color: INK });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    if (raf != null) cancelAnimationFrame(raf);
    el.remove();
  };
}

export { DEMO_SIGIL };
