// Photon Finish — the optics model.
//
// The world:
//
//   A square board, 0..SIZE on both axes, y pointing DOWN (screen convention,
//   so the renderer needs no flip).
//
//   WALLS bound the board and reflect. They no longer tint: with a clamped
//   brightness scale, a wall that changed the level on every bounce drowned
//   out the gates, which are supposed to be the thing you route through.
//
//   The MIRROR is a short reflecting segment near the middle, denying the
//   straight line.
//
//   GATES are short segments that raise (light) or lower (dark) the brightness
//   of any beam crossing them. Short on purpose — a gate is a thing you thread
//   through, not a line bisecting the board.
//
//   EMITTERS fire one beam each, at any angle, starting at NEUTRAL.
//
//   GOALS are segments wanting one exact brightness.
//
// ── Geometry is separated from brightness, deliberately ────────────────────
//
// `tracePath` computes only where a beam GOES — its legs, its bounces, and how
// far along it meets each gate. `foldLevels` then walks that path and works out
// the brightness. Nothing about the path depends on the other beam.
//
// That split is what makes the game affordable now that beams couple. Beam A's
// brightness depends on beam B, so a board can no longer be verified one beam
// at a time and generation has to sweep the pair jointly — 720x720 aimings. Re-
// tracing both beams at every one of those would be hopeless, but the paths can
// be computed once per angle and reused across the whole sweep, leaving only
// the cheap part (find the crossings, re-fold the levels) in the inner loop.

import { NEUTRAL, applyGate, couple, clampLevel } from "./levels.js";

/** Board side. Unitless; the renderer maps it onto whatever pixels it has. */
export const SIZE = 100;

const EPS = 1e-9;
const NUDGE = 1e-6;

export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;

export function normalizeAngle(a) {
  return ((a % TAU) + TAU) % TAU;
}

/** Shortest signed difference a - b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = normalizeAngle(a) - normalizeAngle(b);
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

export function raySegment(p, d, a, b) {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denom = cross(d.x, d.y, sx, sy);
  if (Math.abs(denom) < 1e-12) return null;
  const qx = a.x - p.x;
  const qy = a.y - p.y;
  const t = cross(qx, qy, sx, sy) / denom;
  const u = cross(qx, qy, d.x, d.y) / denom;
  if (t <= EPS || u < 0 || u > 1) return null;
  return { t, u };
}

/** Do two segments cross? @returns the point plus both parameters, or null. */
export function segSeg(a1, a2, b1, b2) {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) < 1e-12) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = cross(qx, qy, sx, sy) / denom;
  const u = cross(qx, qy, rx, ry) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + rx * t, y: a1.y + ry * t, t, u };
}

// ── Walls ──────────────────────────────────────────────────────────────────

export const WALL_SIDES = ["top", "right", "bottom", "left"];

const WALL_NORMALS = {
  top:    { x: 0,  y: 1  },
  bottom: { x: 0,  y: -1 },
  left:   { x: 1,  y: 0  },
  right:  { x: -1, y: 0  },
};

function reflect(d, n) {
  const dot = d.x * n.x + d.y * n.y;
  return { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y };
}

function wallHit(p, d) {
  let t = Infinity;
  let side = null;

  if (d.x > EPS)       { t = (SIZE - p.x) / d.x; side = "right"; }
  else if (d.x < -EPS) { t = (0 - p.x) / d.x;    side = "left"; }

  if (d.y > EPS) {
    const ty = (SIZE - p.y) / d.y;
    if (ty < t) { t = ty; side = "bottom"; }
  } else if (d.y < -EPS) {
    const ty = (0 - p.y) / d.y;
    if (ty < t) { t = ty; side = "top"; }
  }

  if (!side || !Number.isFinite(t)) return null;
  return { t, side, point: { x: p.x + d.x * t, y: p.y + d.y * t } };
}

// ── Path: where a beam goes ────────────────────────────────────────────────

/**
 * Follow a beam through its bounces, ignoring brightness entirely.
 *
 * @returns {{legs, gateHits, bounces, length}}
 *   legs     — straight pieces, each carrying d0/d1, its distance along the
 *              whole path, which is what puts gate hits and beam crossings
 *              into a single order
 *   gateHits — {d, gate} for every gate crossed, sorted
 */
export function tracePath(origin, angle, board, { maxBounces = 3 } = {}) {
  const gates = board.gates || [];
  const mirror = board.mirror || null;

  let p = { x: origin.x, y: origin.y };
  let d = { x: Math.cos(angle), y: Math.sin(angle) };
  let travelled = 0;

  const legs = [];
  const gateHits = [];
  const bounces = [];

  for (let leg = 0; leg <= maxBounces; leg++) {
    const wall = wallHit(p, d);
    if (!wall) break;

    let stop = { t: wall.t, kind: "wall", side: wall.side, point: wall.point };

    if (mirror) {
      const hit = raySegment(p, d, mirror.a, mirror.b);
      if (hit && hit.t < stop.t) {
        stop = {
          t: hit.t, kind: "mirror",
          point: { x: p.x + d.x * hit.t, y: p.y + d.y * hit.t },
        };
      }
    }

    for (let i = 0; i < gates.length; i++) {
      const hit = raySegment(p, d, gates[i].a, gates[i].b);
      if (hit && hit.t < stop.t - EPS) gateHits.push({ d: travelled + hit.t, gate: i });
    }

    legs.push({
      x1: p.x, y1: p.y,
      x2: stop.point.x, y2: stop.point.y,
      d0: travelled, d1: travelled + stop.t,
    });
    travelled += stop.t;

    if (leg === maxBounces) break; // out of bounces — the beam dies here

    let normal;
    if (stop.kind === "wall") {
      normal = WALL_NORMALS[stop.side];
    } else {
      const mx = mirror.b.x - mirror.a.x;
      const my = mirror.b.y - mirror.a.y;
      const len = Math.hypot(mx, my) || 1;
      normal = { x: -my / len, y: mx / len };
      if (normal.x * d.x + normal.y * d.y > 0) { normal.x = -normal.x; normal.y = -normal.y; }
    }

    bounces.push({ ...stop.point, kind: stop.kind, side: stop.side, d: travelled });

    d = reflect(d, normal);
    p = { x: stop.point.x + d.x * NUDGE, y: stop.point.y + d.y * NUDGE };
  }

  gateHits.sort((a, b) => a.d - b.d);
  return { legs, gateHits, bounces, length: travelled };
}

/** A point at distance `d` along a path. */
export function pointAtDistance(path, d) {
  for (const leg of path.legs) {
    if (d <= leg.d1 || leg === path.legs[path.legs.length - 1]) {
      const span = leg.d1 - leg.d0 || 1;
      const f = Math.max(0, Math.min(1, (d - leg.d0) / span));
      return { x: leg.x1 + (leg.x2 - leg.x1) * f, y: leg.y1 + (leg.y2 - leg.y1) * f };
    }
  }
  return { x: path.legs[0]?.x1 ?? 0, y: path.legs[0]?.y1 ?? 0 };
}

// ── Brightness: what the beam is, along that path ──────────────────────────

/**
 * Walk a path and work out the brightness at every point.
 *
 * `extras` carries whatever is not a gate — in practice the crossings with the
 * other beam, each as {d, other}. They are merged with the gate hits and
 * applied in path order, which is what makes route order matter.
 */
export function foldLevels(path, board, start = NEUTRAL, extras = []) {
  const gates = board.gates || [];
  const events = path.gateHits
    .map((h) => ({ d: h.d, kind: "gate", gate: h.gate }))
    .concat(extras.map((e) => ({ ...e, kind: "beam" })))
    .sort((a, b) => a.d - b.d);

  const segments = [];
  let level = clampLevel(start);
  let from = 0;

  const push = (d0, d1, lv) => {
    if (d1 - d0 < 1e-9) return;
    for (const leg of path.legs) {
      const a = Math.max(d0, leg.d0);
      const b = Math.min(d1, leg.d1);
      if (b - a < 1e-9) continue;
      const span = leg.d1 - leg.d0 || 1;
      const f0 = (a - leg.d0) / span;
      const f1 = (b - leg.d0) / span;
      segments.push({
        x1: leg.x1 + (leg.x2 - leg.x1) * f0, y1: leg.y1 + (leg.y2 - leg.y1) * f0,
        x2: leg.x1 + (leg.x2 - leg.x1) * f1, y2: leg.y1 + (leg.y2 - leg.y1) * f1,
        d0: a, d1: b, level: lv,
      });
    }
  };

  for (const ev of events) {
    push(from, ev.d, level);
    ev.levelBefore = level;
    level = ev.kind === "gate" ? applyGate(level, gates[ev.gate]) : couple(level, ev.other);
    ev.levelAfter = level;
    ev.at = pointAtDistance(path, ev.d);
    from = ev.d;
  }
  push(from, path.length, level);

  return { segments, events, endLevel: level, path };
}

/** The brightness at distance `d` along a folded beam. */
export function levelAt(folded, d) {
  const segs = folded.segments;
  for (let i = 0; i < segs.length; i++) {
    if (d < segs[i].d1) return segs[i].level;
  }
  return segs.length ? segs[segs.length - 1].level : NEUTRAL;
}

/** Where two paths cross, with the distance along each. Geometry only. */
export function pathCrossings(pathA, pathB) {
  const out = [];
  for (const la of pathA.legs) {
    for (const lb of pathB.legs) {
      const hit = segSeg(
        { x: la.x1, y: la.y1 }, { x: la.x2, y: la.y2 },
        { x: lb.x1, y: lb.y1 }, { x: lb.x2, y: lb.y2 },
      );
      if (!hit) continue;
      out.push({
        x: hit.x, y: hit.y,
        dA: la.d0 + (la.d1 - la.d0) * hit.t,
        dB: lb.d0 + (lb.d1 - lb.d0) * hit.u,
      });
    }
  }
  return out;
}

/** Where a path meets a goal. Geometry only, so it can be precomputed. */
export function goalHitsOnPath(path, goal) {
  const out = [];
  for (const leg of path.legs) {
    const hit = segSeg(
      { x: leg.x1, y: leg.y1 }, { x: leg.x2, y: leg.y2 }, goal.a, goal.b,
    );
    if (hit) out.push({ x: hit.x, y: hit.y, d: leg.d0 + (leg.d1 - leg.d0) * hit.t });
  }
  return out;
}

// ── Scoring ────────────────────────────────────────────────────────────────

/**
 * Score a set of already-traced paths.
 *
 * Split out from `evaluate` so the generator can trace once per angle and then
 * score thousands of pairings without re-tracing anything.
 *
 * The coupling uses a SNAPSHOT: both beams are first folded with gates alone,
 * and at a crossing each takes the other's snapshot brightness. Reading a
 * partially-updated beam instead would make A depend on B depend on A, with no
 * guarantee of a fixed point.
 */
export function evaluatePaths(board, paths) {
  const snaps = paths.map((p) => foldLevels(p, board));
  const extras = paths.map(() => []);

  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      for (const c of pathCrossings(paths[i], paths[j])) {
        const li = levelAt(snaps[i], c.dA);
        const lj = levelAt(snaps[j], c.dB);
        extras[i].push({ d: c.dA, other: lj, beam: j });
        extras[j].push({ d: c.dB, other: li, beam: i });
      }
    }
  }

  const traces = paths.map((p, i) => foldLevels(p, board, NEUTRAL, extras[i]));

  const goals = board.goals.map((goal) => {
    const crossings = [];
    traces.forEach((trace, i) => {
      for (const h of goalHitsOnPath(paths[i], goal)) {
        crossings.push({ beam: i, at: h, d: h.d, level: levelAt(trace, h.d) });
      }
    });
    return { crossings, met: crossings.some((c) => c.level === goal.level) };
  });

  return { paths, traces, goals, solved: goals.length > 0 && goals.every((g) => g.met) };
}

export function evaluate(board, angles) {
  const paths = board.emitters.map((e, i) =>
    tracePath(e, angles[i] ?? 0, board, { maxBounces: board.maxBounces ?? 3 }));
  return evaluatePaths(board, paths);
}

export function isSolved(board, angles) {
  return evaluate(board, angles).solved;
}

/**
 * Every arc of angles for emitter `i` that solves the board, holding the
 * others where they are. Widths in DEGREES.
 *
 * Note this is no longer the whole story about difficulty, only about
 * PRECISION. Beams couple, so moving emitter i changes what emitter j is
 * carrying too — a narrow window here does not mean the board resists being
 * scrubbed. That question is answered by the generator's joint measurements.
 */
export function solveWindow(board, angles, i, { steps = 720 } = {}) {
  const maxBounces = board.maxBounces ?? 3;
  // The other beams' PATHS do not move while emitter i turns; only their
  // brightness does, and that is recomputed inside evaluatePaths.
  const paths = board.emitters.map((e, j) =>
    j === i ? null : tracePath(e, angles[j], board, { maxBounces }));

  const hits = new Array(steps);
  for (let s = 0; s < steps; s++) {
    paths[i] = tracePath(board.emitters[i], (s / steps) * TAU, board, { maxBounces });
    hits[s] = evaluatePaths(board, paths).solved;
  }

  const arcs = [];
  const stepRad = TAU / steps;
  const start = hits.indexOf(false);
  if (start === -1) return { arcs: [{ from: 0, to: TAU, width: 360 }], total: 360 };

  let run = -1;
  for (let k = 0; k < steps; k++) {
    const s = (start + k) % steps;
    if (hits[s]) {
      if (run === -1) run = s;
    } else if (run !== -1) {
      const width = ((s - run + steps) % steps) * stepRad;
      arcs.push({ from: run * stepRad, to: s * stepRad, width: width * DEG });
      run = -1;
    }
  }

  return { arcs, total: arcs.reduce((sum, a) => sum + a.width, 0) };
}

export function arcCenter(arc) {
  return normalizeAngle(arc.from + arc.width / DEG / 2);
}
