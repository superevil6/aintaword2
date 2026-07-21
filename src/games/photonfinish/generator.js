// Photon Finish — puzzle generation.
//
// ── What the quality bar is for ────────────────────────────────────────────
//
// The failure this whole file exists to prevent is a board that is solvable
// and fair and still not a PUZZLE — one you reach by sweeping a beam until the
// light goes green, with no thought at any point. Two things defend against
// that:
//
//   routes  — each finish line must be reachable by several visibly distinct
//     ROUTES (the gates a beam threads on the way in). More than one, so there
//     is a choice; few enough to enumerate by eye. This is the measure that
//     matches how the board is actually solved: you look at it and work out
//     which line threads the right gates, rather than feeling your way there.
//
//   coupling — the beams push each other where they cross, so the goals cannot
//     be solved independently. With two beams that is one interaction. With
//     three it could be a tangle no one can reason about, so a three-beam board
//     is required to form a CHAIN (see `couplingStructure`): one beam solvable
//     on its own, each later beam depending only on earlier ones. That keeps it
//     solvable in sequence — solve the source, it fixes the push it gives the
//     next, and so on — rather than as a simultaneous system.
//
// ── Cost, and why this runs offline ────────────────────────────────────────
//
// Coupling means a board cannot be verified one beam at a time. The joint
// aiming space is STEPS^beams, which is 360^3 for a three-beam board — far too
// much to sweep, so the fraction of it that solves is SAMPLED, not enumerated.
// Everything else (routes, per-beam aim windows) stays per-beam and cheap. All
// of it is seconds of work, which is why generation lives in a build script.

import { Rng } from "../../core/rng.js";
import {
  SIZE, TAU, DEG, tracePath, evaluatePaths, pathCrossings, goalHitsOnPath,
  solveWindow, arcCenter, normalizeAngle, angleDelta, segSeg,
} from "./optics.js";
import { MIN_LEVEL, MAX_LEVEL } from "./levels.js";

// ── Layout ─────────────────────────────────────────────────────────────────

const GATE_LEN = [11, 15];
const GATE_MARGIN = 14;
const MIN_GATE_SEP = 17;

const MIRROR_LEN = [26, 38];
const MIRROR_JITTER = 8;

const EMITTER_BAND = 0.3;
const EMITTER_X_MARGIN = 16;
const MIN_EMITTER_SEP = 20;
const MIN_EMITTER_CLEARANCE = 8;

const GOAL_BAND = 33;
const GOAL_LEN = 13;
const GOAL_MARGIN = 8;
const GOAL_CLEAR = 5;
const MIN_GOAL_RUN = 13;
const MIN_GOAL_SEP = 24;
const MIN_GOAL_GATE_DIST = 6;

/** The chaos guard — reflection multiplies angular error near a corner. */
const CORNER_CLEAR = 6;
const MIRROR_END_CLEAR = 3.5;

// ── Budgets ────────────────────────────────────────────────────────────────

/** Angular resolution of the precomputed path table. 1 degree. */
const STEPS = 360;
/** Random aimings to harvest goals from, per layout. */
const AIM_TRIES = 3000;
/** Aimings sampled to estimate the solved fraction. */
const SAMPLE = 100000;
/** Starts for the (reported-only) coordinate-descent reachability probe. */
const DESCENT_TRIES = 24;
const DESCENT_ROUNDS = 4;
/** Miss grading for the error surface — see boardError. */
const MISS_PENALTY = 5;
const MISS_SPREAD = 4;
const MISS_SCALE = 12;
/** A route narrower than this is a sliver, not an option. 4 degrees. */
const MIN_ROUTE_STEPS = 4;
const LAYOUT_TRIES = 220;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segSegDist(a1, a2, b1, b2) {
  if (segSeg(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegDist(a1, b1, b2), pointSegDist(a2, b1, b2),
    pointSegDist(b1, a1, a2), pointSegDist(b2, a1, a2),
  );
}

function pointSegDist(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function mid(seg) {
  return seg.mid || { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
}

// ── Terrain ────────────────────────────────────────────────────────────────

function makeMirror(profile, rng) {
  if (!profile.mirror) return null;
  const cx = SIZE / 2 + (rng.float() * 2 - 1) * MIRROR_JITTER;
  const cy = SIZE / 2 + (rng.float() * 2 - 1) * MIRROR_JITTER;
  const len = MIRROR_LEN[0] + rng.float() * (MIRROR_LEN[1] - MIRROR_LEN[0]);
  const angle = rng.float() * Math.PI;
  const dx = (Math.cos(angle) * len) / 2;
  const dy = (Math.sin(angle) * len) / 2;
  return { a: { x: cx - dx, y: cy - dy }, b: { x: cx + dx, y: cy + dy } };
}

function makeGates(profile, mirror, rng) {
  const gates = [];
  const span = SIZE - 2 * GATE_MARGIN;

  for (let i = 0; i < profile.gates; i++) {
    let placed = null;
    for (let tries = 0; tries < 150 && !placed; tries++) {
      const cx = GATE_MARGIN + rng.float() * span;
      const cy = GATE_MARGIN + rng.float() * span;
      const len = GATE_LEN[0] + rng.float() * (GATE_LEN[1] - GATE_LEN[0]);
      const angle = rng.float() * Math.PI;
      const a = { x: cx - Math.cos(angle) * len / 2, y: cy - Math.sin(angle) * len / 2 };
      const b = { x: cx + Math.cos(angle) * len / 2, y: cy + Math.sin(angle) * len / 2 };

      if (gates.some((g) => dist(mid(g), { x: cx, y: cy }) < MIN_GATE_SEP)) continue;
      if (gates.some((g) => segSeg(g.a, g.b, a, b))) continue;
      if (mirror && (segSeg(mirror.a, mirror.b, a, b) ||
        pointSegDist({ x: cx, y: cy }, mirror.a, mirror.b) < 9)) continue;

      placed = { a, b, mid: { x: cx, y: cy } };
    }
    if (!placed) return null;
    gates.push(placed);
  }

  // Deal the light/dark split explicitly so a board can never come out
  // all-light (nothing can go down) or all-dark (nothing can go up).
  const order = rng.shuffle(gates.map((_, i) => i));
  order.forEach((idx, rank) => { gates[idx].dark = rank < profile.darkGates; });
  return gates;
}

function makeEmitters(profile, gates, mirror, rng) {
  const emitters = [];
  const bandTop = SIZE * (0.5 - EMITTER_BAND / 2);
  const bandHeight = SIZE * EMITTER_BAND;

  for (let i = 0; i < profile.emitters; i++) {
    let placed = null;
    for (let tries = 0; tries < 300 && !placed; tries++) {
      const p = {
        x: EMITTER_X_MARGIN + rng.float() * (SIZE - 2 * EMITTER_X_MARGIN),
        y: bandTop + rng.float() * bandHeight,
      };
      if (emitters.some((e) => dist(e, p) < MIN_EMITTER_SEP)) continue;
      if (gates.some((g) => pointSegDist(p, g.a, g.b) < MIN_EMITTER_CLEARANCE)) continue;
      if (mirror && pointSegDist(p, mirror.a, mirror.b) < 9) continue;
      placed = p;
    }
    if (!placed) return null;
    emitters.push({ id: i, x: placed.x, y: placed.y });
  }
  return emitters;
}

function pathIsRobust(path, mirror) {
  for (const b of path.bounces) {
    if (b.kind === "wall") {
      if (Math.min(b.x, SIZE - b.x) < CORNER_CLEAR &&
          Math.min(b.y, SIZE - b.y) < CORNER_CLEAR) return false;
    } else if (mirror) {
      if (dist(b, mirror.a) < MIRROR_END_CLEAR) return false;
      if (dist(b, mirror.b) < MIRROR_END_CLEAR) return false;
    }
  }
  return true;
}

function makeGoal(seg, point, level) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const h = GOAL_LEN / 2;
  const a = { x: point.x - nx * h, y: point.y - ny * h };
  const b = { x: point.x + nx * h, y: point.y + ny * h };
  const inside = (p) =>
    p.x >= GOAL_MARGIN && p.x <= SIZE - GOAL_MARGIN &&
    p.y >= GOAL_MARGIN && p.y <= SIZE - GOAL_MARGIN;
  if (!inside(a) || !inside(b)) return null;
  return { a, b, level };
}

/**
 * Places on this beam's coupled trace where a goal could legally sit.
 *
 * `requireCoupled` differs by tier. A two-beam board wants BOTH goals to sit
 * after a crossing that changed the beam — that is what forces the interaction.
 * A chain board must NOT: if every beam's goal were coupled, every beam would
 * be influenced by another, and N beams each influenced by another cannot avoid
 * a cycle. A chain needs a SOURCE beam whose goal is reached on gates alone, so
 * chain tiers relax this and enforce the structure globally instead.
 */
function spotsOnTrace(trace, board, profile) {
  const spots = [];
  let coupled = false;
  let changes = 0;
  let evIdx = 0;

  for (const seg of trace.segments) {
    while (evIdx < trace.events.length && trace.events[evIdx].d <= seg.d0 + 1e-9) {
      const ev = trace.events[evIdx];
      if (ev.levelAfter !== ev.levelBefore) {
        changes++;
        if (ev.kind === "beam") coupled = true;
      }
      evIdx++;
    }

    if (changes < profile.minChanges) continue;
    if (profile.requireCoupled && !coupled) continue;
    if (!profile.goalLevels.includes(seg.level)) continue;

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const usable = segLen - 2 * GOAL_CLEAR;
    if (usable <= 0) continue;

    for (let s = 0; s <= 4; s++) {
      const f = (GOAL_CLEAR + (usable * s) / 4) / segLen;
      const point = { x: seg.x1 + (seg.x2 - seg.x1) * f, y: seg.y1 + (seg.y2 - seg.y1) * f };
      if (seg.d0 + segLen * f < MIN_GOAL_RUN) continue;
      if (point.y > GOAL_BAND && point.y < SIZE - GOAL_BAND) continue;

      const goal = makeGoal(seg, point, seg.level);
      if (!goal) continue;
      if (board.gates.some((g) => pointSegDist(point, g.a, g.b) < MIN_GOAL_GATE_DIST)) continue;
      if (board.gates.some((g) => segSeg(g.a, g.b, goal.a, goal.b))) continue;
      if (board.mirror && segSeg(board.mirror.a, board.mirror.b, goal.a, goal.b)) continue;
      if (board.emitters.some((e) => pointSegDist(e, goal.a, goal.b) < 7)) continue;

      spots.push({ goal, level: seg.level, point });
    }
  }

  return spots;
}

// ── Coupling structure ─────────────────────────────────────────────────────

/**
 * Distance along beam i at which it satisfies its own goal, at this aiming.
 * The winning crossing (right level), nearest the emitter if there are several.
 */
function goalDistances(board, state) {
  return board.goals.map((goal, i) => {
    const wins = state.goals[i].crossings
      .filter((c) => c.beam === i && c.level === goal.level)
      .map((c) => c.d);
    return wins.length ? Math.min(...wins) : Infinity;
  });
}

/**
 * Is the coupling a solvable-in-sequence CHAIN?
 *
 * Build the influence graph: beam j influences beam i when their crossing lands
 * before beam i's goal AND changes beam i's brightness there. An edge j->i
 * means "j must be settled before i can be". The board is sequentially solvable
 * exactly when that graph is a connected DAG — connected so no beam is an
 * independent side-puzzle, acyclic so there is an order to solve them in.
 *
 * A cycle is the "soup" case: i depends on j depends on i, a simultaneous
 * system with no entry point, which is the thing that makes three coupled
 * beams unreasonable rather than hard.
 *
 * @returns {{connected:boolean, order:number[]|null}} order is the solve
 *   sequence, or null when the graph has a cycle (a simultaneous system).
 */
function couplingStructure(board, state) {
  const N = board.emitters.length;
  const gd = goalDistances(board, state);
  const incoming = Array.from({ length: N }, () => new Set());

  for (let i = 0; i < N; i++) {
    for (const ev of state.traces[i].events) {
      if (ev.kind !== "beam") continue;
      if (ev.levelAfter === ev.levelBefore) continue;
      if (ev.d >= gd[i]) continue;                 // after i's goal — irrelevant to it
      incoming[i].add(ev.beam);
    }
  }

  // Weakly connected? A beam coupled to nothing is an independent slider, which
  // is the original sin this whole design exists to avoid — so connectivity is
  // demanded of EVERY tier, cycle or not.
  const adj = Array.from({ length: N }, () => new Set());
  for (let i = 0; i < N; i++) {
    for (const j of incoming[i]) { adj[i].add(j); adj[j].add(i); }
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const u = stack.pop();
    for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
  }
  const connected = seen.size === N;

  // Acyclic? Kahn's algorithm; if it cannot remove every node there is a cycle.
  // A cycle is fine for two beams (a solvable 2-variable system) and fatal for
  // a chain tier, which the caller decides.
  const indeg = incoming.map((set) => set.size);
  const outgoing = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) for (const j of incoming[i]) outgoing[j].push(i);
  const ready = [];
  for (let i = 0; i < N; i++) if (indeg[i] === 0) ready.push(i);
  const order = [];
  while (ready.length) {
    const u = ready.pop();
    order.push(u);
    for (const v of outgoing[u]) if (--indeg[v] === 0) ready.push(v);
  }

  // Longest-chain shape: a PATH (3->2->1) has every beam with at most one
  // influence in and one out; a STAR (one beam feeding two) does not. A path is
  // the deeper puzzle — you must solve strictly in sequence, no beam settled
  // in parallel — so hard demands it.
  const maxIn = Math.max(0, ...incoming.map((set) => set.size));
  const outCount = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (const j of incoming[i]) outCount[j]++;
  const isPath = order != null && maxIn <= 1 && Math.max(0, ...outCount) <= 1;

  return { connected, order: order && order.length === N ? order : null, isPath };
}

// ── Findability ────────────────────────────────────────────────────────────

function boardError(board, paths) {
  const state = evaluatePaths(board, paths);
  let err = 0;
  for (let gi = 0; gi < board.goals.length; gi++) {
    const goal = board.goals[gi];
    const crossings = state.goals[gi].crossings;
    if (crossings.length) {
      err += Math.min(...crossings.map((c) => Math.abs(c.level - goal.level)));
      continue;
    }
    let near = Infinity;
    for (const leg of paths.flatMap((p) => p.legs)) {
      near = Math.min(near, segSegDist(
        { x: leg.x1, y: leg.y1 }, { x: leg.x2, y: leg.y2 }, goal.a, goal.b,
      ));
    }
    err += MISS_PENALTY + Math.min(MISS_SPREAD, near / MISS_SCALE);
  }
  return err;
}

/**
 * Fraction of the whole aiming space that solves the board.
 *
 * SAMPLED, not swept: the space is STEPS^beams, which is 46 million for three
 * beams. A hundred thousand random aimings estimate a fraction of a tenth of a
 * percent closely enough to reject boards that solve too often.
 */
function sampleSolvedFraction(board, table, rng) {
  const N = board.emitters.length;
  const idx = new Array(N);
  let solved = 0;
  for (let k = 0; k < SAMPLE; k++) {
    for (let n = 0; n < N; n++) idx[n] = rng.int(0, STEPS - 1);
    if (evaluatePaths(board, idx.map((s, n) => table[n][s])).solved) solved++;
  }
  return solved / SAMPLE;
}

/**
 * Reported, never gated: how often coordinate descent on the visible error
 * reaches a solution. A local searcher badly underestimates a human, who reads
 * the board and plans a route rather than feeling downhill — so this is a floor
 * on solvability, useful for spotting a pure-needle board, not a pass/fail.
 */
function descentReach(board, table, rng) {
  const N = board.emitters.length;
  let reached = 0;
  for (let t = 0; t < DESCENT_TRIES; t++) {
    const idx = Array.from({ length: N }, () => rng.int(0, STEPS - 1));
    for (let round = 0; round < DESCENT_ROUNDS; round++) {
      for (let n = 0; n < N; n++) {
        let bestE = Infinity, bestS = idx[n];
        for (let s = 0; s < STEPS; s++) {
          idx[n] = s;
          const e = boardError(board, idx.map((v, m) => table[m][v]));
          if (e < bestE) { bestE = e; bestS = s; }
        }
        idx[n] = bestS;
      }
      if (evaluatePaths(board, idx.map((s, m) => table[m][s])).solved) { reached++; break; }
    }
  }
  return reached / DESCENT_TRIES;
}

function routesToGoal(board, table, beam, goalIndex, steps) {
  const goal = board.goals[goalIndex];
  const routes = new Map();
  for (let s = 0; s < steps; s++) {
    const path = table[beam][s];
    const hits = goalHitsOnPath(path, goal);
    if (!hits.length) continue;
    const d = hits[0].d;
    const sig = path.gateHits.filter((h) => h.d < d).map((h) => h.gate).join(",");
    routes.set(sig, (routes.get(sig) || 0) + 1);
  }
  return routes;
}

function goalsFarApart(goals) {
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      if (dist(mid(goals[i]), mid(goals[j])) < MIN_GOAL_SEP) return false;
      if (segSeg(goals[i].a, goals[i].b, goals[j].a, goals[j].b)) return false;
    }
  }
  return true;
}

/**
 * Choose one spot per beam, honouring the brightness constraints, and reject
 * assignments whose goals crowd each other.
 *
 * With `goalExtremes` the board must hold one DARKEST goal (level 0) and one
 * LIGHTEST (level 4), the rest free. The two extremes are handed to different
 * beams — which ones is rolled — and only a beam that actually has a spot at
 * that level can take the role, so this both selects and rejects: an aiming
 * where no beam was driven to 0, or none to 4, simply has no valid assignment.
 *
 * The extremes are the clamped ends of the scale, so as individual targets they
 * forgive overshoot; the point of pinning them is the shape of the board (one
 * beam pushed all the way down, one all the way up), not extra precision. The
 * difficulty stays in the coupling and the free third goal.
 */
function chooseGoals(spotsByBeam, profile, rng) {
  const N = spotsByBeam.length;
  const TRIES = 30;

  for (let t = 0; t < TRIES; t++) {
    const want = new Array(N).fill(null); // desired level per beam, or null=free
    if (profile.goalExtremes) {
      const order = rng.shuffle([...Array(N).keys()]);
      want[order[0]] = MIN_LEVEL;
      want[order[1]] = MAX_LEVEL;
    }

    const picks = [];
    let ok = true;
    for (let i = 0; i < N; i++) {
      const pool = want[i] == null
        ? spotsByBeam[i]
        : spotsByBeam[i].filter((s) => s.level === want[i]);
      if (!pool.length) { ok = false; break; }
      picks.push(rng.pick(pool));
    }
    if (!ok) continue;
    if (!goalsFarApart(picks.map((p) => p.goal))) continue;
    return picks;
  }
  return null;
}

// ── Entry point ────────────────────────────────────────────────────────────

export function generatePuzzle(profile, rng = new Rng("photonfinish")) {
  const N = profile.emitters;

  for (let layout = 0; layout < LAYOUT_TRIES; layout++) {
    const mirror = makeMirror(profile, rng);
    const gates = makeGates(profile, mirror, rng);
    if (!gates) continue;
    const emitters = makeEmitters(profile, gates, mirror, rng);
    if (!emitters) continue;

    const board = { gates, mirror, emitters, goals: [], maxBounces: profile.maxBounces };

    // Trace every angle for every beam ONCE. Paths do not depend on the other
    // beams, so this table serves the harvest, the sampling and the descent
    // probe alike.
    const table = emitters.map((e) =>
      Array.from({ length: STEPS }, (_, s) =>
        tracePath(e, (s / STEPS) * TAU, board, { maxBounces: profile.maxBounces })));

    let found = null;

    for (let attempt = 0; attempt < AIM_TRIES && !found; attempt++) {
      const at = Array.from({ length: N }, () => rng.int(0, STEPS - 1));
      const paths = at.map((s, n) => table[n][s]);
      if (!paths.every((p) => pathIsRobust(p, mirror))) continue;

      const state = evaluatePaths(board, paths);
      const spotsByBeam = [];
      let haveAll = true;
      for (let i = 0; i < N; i++) {
        const spots = spotsOnTrace(state.traces[i], board, profile);
        if (!spots.length) { haveAll = false; break; }
        spotsByBeam.push(spots);
      }
      if (!haveAll) continue;

      const picks = chooseGoals(spotsByBeam, profile, rng);
      if (!picks) continue;

      board.goals = picks.map((p) => p.goal);
      const solved = evaluatePaths(board, paths);
      if (!solved.solved) { board.goals = []; continue; }

      // The structural gate. Every tier must be connected — no independent
      // side-puzzle beam. A chain tier additionally must be acyclic, so it is
      // solvable one beam at a time rather than all at once.
      const { connected, order, isPath } = couplingStructure(board, solved);
      if (!connected) { board.goals = []; continue; }
      if (profile.chain && !order) { board.goals = []; continue; }
      if (profile.chainPath && !isPath) { board.goals = []; continue; }

      found = { at, order: order || [] };
    }

    if (!found) continue;

    const angles = found.at.map((s) => (s / STEPS) * TAU);

    // Precision, per beam: how finely you must aim once the others are right.
    const windows = [];
    let ok = true;
    for (let i = 0; i < N && ok; i++) {
      const win = solveWindow(board, angles, i, { steps: 720 });
      const here = win.arcs.find(
        (arc) => Math.abs(angleDelta(arcCenter(arc), angles[i])) <= arc.width / DEG / 2 + 1e-6,
      );
      if (!here) { ok = false; break; }
      if (here.width < profile.minWindow || here.width > profile.maxWindow) { ok = false; break; }
      windows.push({ width: here.width, total: win.total });
    }
    if (!ok) continue;

    // Each finish line reachable by several distinct routes, none a sliver.
    const routes = Array.from({ length: N }, (_, i) => routesToGoal(board, table, i, i, STEPS));
    if (routes.some((r) => r.size < profile.minRoutes || r.size > profile.maxRoutes)) continue;
    if (routes.some((r) => [...r.values()].filter((n) => n >= MIN_ROUTE_STEPS).length < 2)) continue;

    const solvedFraction = sampleSolvedFraction(board, table, rng);
    if (solvedFraction > profile.maxSolvedFraction) continue;

    let crossings = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) crossings += pathCrossings(table[i][found.at[i]], table[j][found.at[j]]).length;
    }

    return {
      ...board,
      solution: angles,
      start: startAiming(board, angles, rng),
      stats: {
        windows,
        solvedFraction,
        reachable: descentReach(board, table, rng),
        routes: routes.map((r) => r.size),
        order: found.order,
        goalLevels: board.goals.map((g) => g.level),
        crossings,
      },
    };
  }

  return null;
}

function startAiming(board, solution, rng) {
  const trace = (a, i) => tracePath(board.emitters[i], a, board, { maxBounces: board.maxBounces });
  for (let tries = 0; tries < 80; tries++) {
    const start = solution.map((s) => normalizeAngle(s + (40 + rng.float() * 280) / DEG));
    if (!evaluatePaths(board, start.map(trace)).solved) return start;
  }
  return solution.map((s, i) => (i === 0 ? normalizeAngle(s + Math.PI) : s));
}
