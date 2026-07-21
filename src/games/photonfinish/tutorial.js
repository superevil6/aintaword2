// Animated demo shown on the difficulty picker.
//
// It teaches the one thing prose is worst at and the one thing that is genuinely
// new here: that where two beams cross, each PUSHES the other's brightness. The
// written rules beside it carry gates and clamping perfectly well; a crossing is
// the rule you have to see move.
//
// A fixed little scene, revealed in four beats: two beams start at 2, a light
// gate lifts one to 3, that beam lifts the other at their crossing, and both
// land on a finish line that wanted 3. The geometry is hand-placed rather than
// traced — it is an illustration, not a playable board — but it borrows the
// real beam and badge drawing so it reads as the same game.

import { levelHex, levelWidth, beamHex } from "./levels.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// ── The scene, in a 120 x 66 box ────────────────────────────────────────────

const A = { emit: { x: 12, y: 24 }, gate: { x: 46, y: 24 }, end: { x: 104, y: 24 } };
const B = { emit: { x: 20, y: 58 }, cross: { x: 66, y: 24 }, end: { x: 90, y: 8 } };
const A_GOAL = 3;
const B_GOAL = 3;

/** Perpendicular unit vector to a→b. */
function perp(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

const CAPTIONS = [
  "Two beams, each starting at brightness 2, aimed at a finish line.",
  "A light gate (+) adds one — beam 1 arrives at 3, exactly what its line wants.",
  "Where the beams cross, beam 1 lifts beam 2 toward its own brightness.",
  "Beam 2 lands at 3 as well. Both solved — that is the whole game.",
];

const READ_MS = 1500;
const HOLD_MS = 2600; // pause on the solved frame before looping

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function beamSeg(g, a, b, level, beam) {
  g.appendChild(el("line", {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    stroke: beamHex(level, beam), "stroke-width": levelWidth(level) * 1.3,
    "stroke-linecap": "round",
  }));
}

function badge(g, at, level, { r = 4, solved = false } = {}) {
  g.appendChild(el("circle", {
    cx: at.x, cy: at.y, r, fill: levelHex(level),
    stroke: solved ? "#33d69f" : "#0a0c16", "stroke-width": solved ? 1 : 0.4,
  }));
  const t = el("text", {
    x: at.x, y: at.y, "font-size": r * 1.15, "font-weight": 700,
    "text-anchor": "middle", "dominant-baseline": "central",
    fill: level >= 3 ? "#10131d" : "#f2f5ff", "font-family": "inherit",
  });
  t.textContent = String(level);
  g.appendChild(t);
}

function gate(g, at) {
  g.appendChild(el("line", {
    x1: at.x - 6, y1: at.y - 2.5, x2: at.x + 6, y2: at.y + 2.5,
    stroke: "#e9eeff", "stroke-width": 1.5, "stroke-linecap": "round", opacity: 0.85,
  }));
  g.appendChild(el("circle", { cx: at.x, cy: at.y, r: 3, fill: "#0d1018", stroke: "#e9eeff", "stroke-width": 0.5 }));
  const t = el("text", {
    x: at.x, y: at.y, "font-size": 4.5, "font-weight": 700,
    "text-anchor": "middle", "dominant-baseline": "central", fill: "#e9eeff", "font-family": "inherit",
  });
  t.textContent = "+";
  g.appendChild(t);
}

function finish(g, at, beamDir, level, lit) {
  const n = perp(beamDir.from, beamDir.to);
  const h = 7;
  g.appendChild(el("line", {
    x1: at.x - n.x * h, y1: at.y - n.y * h, x2: at.x + n.x * h, y2: at.y + n.y * h,
    stroke: lit ? "#33d69f" : "#aab5d8", "stroke-width": 2, "stroke-linecap": "round",
    opacity: lit ? 1 : 0.7, filter: lit ? "drop-shadow(0 0 1.4px #33d69f)" : "none",
  }));
  // The number it wants, off to one side so the beam never sits on it.
  badge(g, { x: at.x + n.x * (h + 4), y: at.y + n.y * (h + 4) }, level, { solved: lit });
}

/** Draw the whole scene at a given beat (0..3). */
function draw(step) {
  const svg = el("svg", { viewBox: "0 0 120 66", class: "pf-demo-svg" });

  // Beam 1: dim before the gate, and 3 after it once the gate has "fired".
  const aAfter = step >= 1 ? 3 : 2;
  beamSeg(svg, A.emit, A.gate, 2, 0);
  beamSeg(svg, A.gate, A.end, aAfter, 0);

  // Beam 2: dim to the crossing, then lifted to 3 once the crossing has fired.
  const bAfter = step >= 2 ? 3 : 2;
  beamSeg(svg, B.emit, B.cross, 2, 1);
  beamSeg(svg, B.cross, B.end, bAfter, 1);

  gate(svg, A.gate);

  // The crossing mark — the moment the whole game turns on.
  svg.appendChild(el("circle", {
    cx: B.cross.x, cy: B.cross.y, r: 2.4, fill: "none",
    stroke: step >= 2 ? "#4ad9e4" : "rgba(180,195,255,0.4)",
    "stroke-width": step >= 2 ? 0.7 : 0.4,
    "stroke-dasharray": step >= 2 ? "none" : "0.9 0.7",
  }));

  finish(svg, A.end, { from: A.gate, to: A.end }, A_GOAL, step >= 1);
  finish(svg, B.end, { from: B.cross, to: B.end }, B_GOAL, step >= 3);

  // Emitters last, on top.
  badge(svg, A.emit, 2, { r: 4.5 });
  badge(svg, B.emit, 2, { r: 4.5 });

  return svg;
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup — cancels the loop and removes the element
 */
export function mountTutorial(container) {
  const wrap = document.createElement("div");
  wrap.className = "pf-demo";
  // Decorative: the written rules beside it say the same thing, and a looping
  // animation is not something to read out.
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `<div class="pf-demo-stage"></div><p class="pf-demo-caption"></p>`;
  container.appendChild(wrap);

  const stage = wrap.querySelector(".pf-demo-stage");
  const caption = wrap.querySelector(".pf-demo-caption");

  const show = (step) => {
    stage.replaceChildren(draw(step));
    caption.textContent = CAPTIONS[step];
  };

  // Reduced motion: the finished frame, held, no loop.
  if (prefersReducedMotion()) {
    show(CAPTIONS.length - 1);
    return () => wrap.remove();
  }

  let step = 0;
  show(0);
  let timer = null;
  const tick = () => {
    step = (step + 1) % CAPTIONS.length;
    show(step);
    timer = setTimeout(tick, step === 0 ? HOLD_MS : READ_MS);
  };
  timer = setTimeout(tick, READ_MS);

  return () => {
    clearTimeout(timer);
    wrap.remove();
  };
}
