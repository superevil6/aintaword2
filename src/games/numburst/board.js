// Numburst — board model and the explosion simulation.
//
// SCAFFOLDING. The rules here are a first readable guess at the idea, not a
// tuned game. Everything flagged "OPEN" below is a knob that changes what the
// game actually is, and none of them have been measured yet.
//
// The model:
//
//   An orb holds an integer. Its drawn radius is proportional to that integer,
//   so a 5 really is five times the size of a 1 — that size IS the readout,
//   the printed number is the confirmation. Bombs carry a value too; dropping
//   one on an orb subtracts that value. An orb at zero or below dies, and a
//   dying orb explodes with a blast radius scaled to the value it died at, so
//   killing something big is how you reach everything around it. Damage from
//   a blast can kill in turn, which is where chains come from.
//
// Deliberately free of DOM and CSS imports: a future scripts/build-numburst.mjs
// needs to import this from Node to generate and verify daily boards, the same
// way verify-colorpath.mjs imports colorpath/difficulty.js.

import { Rng } from "../../core/rng.js";

/**
 * Board coordinate space. Square, unitless — the view scales it to pixels.
 *
 * The SIDE LENGTH is per-board (`board.size`), sized to the orbs that landed on
 * it, because a pile only looks right in a box it nearly fills. Easy's 14 small
 * orbs in the same box as Hard's 28 large ones would settle into a thin crust
 * along the floor with two thirds of the field empty above it.
 */
export const DEFAULT_SIZE = 100;

/**
 * Assumed fraction of the box the settled pile fills.
 *
 * Random packing of same-size circles runs ~0.82; a mix of sizes packs better
 * because the small ones fill the gaps between the large. Tuned down from
 * there so the pile lands a little short of the ceiling and the board reads as
 * a heap rather than as a full container. Raise it to crowd the box, lower it
 * for more headroom.
 */
export const PACKING = 0.62;

/**
 * Fraction of the box left empty above the settled pile.
 *
 * Near zero on purpose: the board should read as a jar filled to the brim, not
 * as a heap sitting in a room. The fit loop grows the box in small steps to
 * land close to this, so tightening it costs generation time rather than
 * risking orbs pushed out through the ceiling.
 */
export const HEADROOM = 0.012;

/**
 * Drawn radius per point of value.
 *
 * OPEN: linear, straight from the idea ("1 is smallest, 5 is five times
 * bigger"). Worth testing against radius ∝ √value, which makes AREA
 * proportional instead — linear radius means a 9 covers 81× the ink of a 1 and
 * may simply eat the board.
 */
export const RADIUS_UNIT = 1.7;

/**
 * How far a dying orb throws damage, as a multiple of its own radius.
 *
 * OPEN: this single number is probably the whole difficulty curve. Too low and
 * chains never start; too high and every board is one lucky tap.
 */
export const BLAST_FACTOR = 2.6;

export function radiusOf(value) {
  return RADIUS_UNIT * value;
}

export function blastRadiusOf(value) {
  return radiusOf(value) * BLAST_FACTOR;
}

/**
 * Generate a pile of orbs.
 *
 * Roll the values first, size the box to hold them, drop them in from above,
 * then let settle() pack them. Positions are never rejection-sampled for
 * overlap any more — the settler resolves overlaps for us, and dropping from a
 * loose scatter is what produces a heap instead of a polka-dot grid.
 */
export function generateBoard(profile, rng = new Rng("numburst")) {
  const { orbCount, maxValue } = profile;

  const orbs = [];
  for (let i = 0; i < orbCount; i++) {
    const value = rollValue(maxValue, profile.skew, rng);
    orbs.push({ id: i, x: 0, y: 0, value, max: value, r: radiusOf(value), alive: true });
  }

  // Drop positions as FRACTIONS, rolled once. The fit loop below re-drops the
  // same orbs into differently sized boxes, and it must reuse these rather
  // than roll fresh ones — otherwise each attempt is a different board and the
  // seed stops determining what you get.
  const drops = orbs.map(() => ({ fx: rng.float(), fy: rng.float() }));

  let size = sizeFor(orbs);

  // Estimating how densely a mixed bag of circles packs is not reliable enough
  // to do in one shot — the same formula overshoots on Easy's 14 orbs and
  // undershoots on Hard's 28, because boundary effects scale with the count.
  // So: settle, look at whether the pile broke through the ceiling, and grow
  // the box until it doesn't. Converges in a couple of rounds and is honest
  // about the answer instead of trusting the estimate.
  for (let attempt = 0; attempt < 14; attempt++) {
    // Scatter across the full width, starting everything ABOVE the ceiling in
    // a column as tall as the box. Dropping from a spread-out start is what
    // lets the pile find its own shape; starting them level drops a slab.
    orbs.forEach((o, i) => {
      o.x = o.r + drops[i].fx * Math.max(0, size - 2 * o.r);
      o.y = -drops[i].fy * size;
    });

    settle(orbs, size);

    const top = Math.min(...orbs.map((o) => o.y - o.r));
    if (top >= size * HEADROOM) break;
    size *= 1.07;
  }

  return { orbs, size, bombs: { ...profile.bombs } };
}

/**
 * Roll one orb's value, weighted hard toward the low end.
 *
 * Weight falls off as 1/value^skew, so at skew 2 roughly two thirds of a board
 * are 1s and a 9 turns up about once in a hundred. Uniform rolling gave a board
 * of mostly mid-sized orbs, which read as visual mush: nothing was obviously
 * cheap and nothing was obviously the prize.
 *
 * The skew is doing double duty. It floods the field with chaff, which is what
 * makes the board look full — and because area grows with the SQUARE of the
 * value, a handful of big orbs still own most of the pile's bulk while being
 * rare enough to be landmarks.
 */
export function rollValue(maxValue, skew = 2, rng = new Rng("numburst")) {
  const weights = [];
  let total = 0;
  for (let v = 1; v <= maxValue; v++) {
    const w = 1 / Math.pow(v, skew);
    weights.push(w);
    total += w;
  }
  let t = rng.float() * total;
  for (let v = 1; v <= maxValue; v++) {
    t -= weights[v - 1];
    if (t <= 0) return v;
  }
  return maxValue; // float dust only
}

/** Side of the square box that a set of orbs should settle into. */
export function sizeFor(orbs) {
  const area = orbs.reduce((sum, o) => sum + Math.PI * o.r * o.r, 0);
  return Math.max(30, Math.sqrt(area / PACKING));
}

/**
 * Settle orbs under gravity until nothing is moving, mutating in place.
 *
 * Position-based relaxation, NOT a physics engine. Each tick every orb is
 * displaced straight down by a fixed step, then overlaps are resolved by
 * pushing each pair apart along the line between their centres, then everyone
 * is clamped inside the walls. Repeat until the largest displacement in a tick
 * falls under EPS, at which point the pile is asleep for good.
 *
 * The reason this cannot jitter: there is NO velocity anywhere in it. Nothing
 * accumulates, so nothing can overshoot a contact, reverse, and ring — the
 * classic endless-wiggle failure mode. The cost is that it is not physical:
 * orbs do not accelerate as they fall and heavy ones do not shove light ones
 * aside. For a pile that has to look right and then hold still, that trade is
 * the right way round.
 *
 * Fully deterministic — fixed iteration order, no randomness, no wall clock —
 * so the same board settles identically for every player, which is what a
 * daily puzzle requires.
 */
export function settle(orbs, size, { ticks = 800, passes = 6, rounds = 8 } = {}) {
  const live = orbs.filter((o) => o.alive);

  // Run the annealer until it is a FIXPOINT — until another full run moves
  // nothing. One run leaves the pile merely metastable: it is at rest, but a
  // fresh coarse-gravity pass can still dislodge a marginal contact and let
  // part of the heap re-arrange. That matters because every burst re-settles
  // the survivors, and a pile that shuffles on each re-settle would show orbs
  // nowhere near the explosion drifting for no reason the player can see.
  //
  // Settling to a fixpoint means an untouched pile is genuinely final: the
  // only orbs that move after a burst are the ones the burst actually
  // undermined.
  for (let round = 0; round < rounds; round++) {
    const before = live.map((o) => ({ x: o.x, y: o.y }));
    anneal(live, size, ticks, passes);
    let drift = 0;
    for (let i = 0; i < live.length; i++) {
      drift = Math.max(drift, Math.hypot(live[i].x - before[i].x, live[i].y - before[i].y));
    }
    if (drift < 0.05) break;
  }

  return orbs;
}

/** One coarse-to-fine gravity anneal. Mutates in place. */
function anneal(live, size, ticks, passes) {
  const prev = live.map((o) => ({ x: o.x, y: o.y }));

  // Gravity in three passes of decreasing step, coarse to fine.
  //
  // The step size sets how much overlap survives at rest: every tick injects
  // one step of penetration and separation only removes half of what it finds
  // per pass, so through a deep stack it runs permanently a beat behind. A big
  // step falls fast but leaves orbs visibly biting into each other; a small one
  // is clean but takes forever to cross the box. Doing both in sequence gets
  // the speed of the first and the finish of the last.
  //
  // Annealing rather than a separation-only polish at the end, deliberately.
  // Polishing pushes orbs apart with gravity switched off, which lifts them out
  // of contact — the pile then LOOKS settled but isn't, and the next settle()
  // after a burst drops it again by a couple of units for no reason the player
  // can see. Every phase here ends in equilibrium, so re-settling an untouched
  // pile moves nothing.
  for (const step of [0.5, 0.12, 0.03]) {
    const eps = step * 0.02;

    for (let tick = 0; tick < ticks; tick++) {
      for (let i = 0; i < live.length; i++) {
        prev[i].x = live[i].x;
        prev[i].y = live[i].y;
        live[i].y += step;
      }

      // Several relaxation passes per tick of gravity — but per TICK, not per
      // orb. One pass leaves deep stacks interpenetrating, because separating
      // A from B shoves B into C and only the next pass notices.
      for (let k = 0; k < passes; k++) separate(live, size);

      let moved = 0;
      for (let i = 0; i < live.length; i++) {
        moved = Math.max(moved, Math.hypot(live[i].x - prev[i].x, live[i].y - prev[i].y));
      }
      if (moved < eps) break; // asleep for this phase
    }
  }
}

/** One relaxation pass: push every overlapping pair apart, then hit the walls. */
function separate(live, size) {
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d >= min) continue;

      if (d < 1e-6) {
        // Exactly concentric: there is no separating direction to compute, so
        // pick one deterministically. Alternating by index rather than at
        // random keeps the board identical for every player.
        dx = (i + j) % 2 === 0 ? 1 : -1;
        dy = 0;
        d = 1;
      }

      // Half the penetration each, so neither orb is privileged and a stack
      // settles symmetrically.
      const push = (min - d) / 2;
      const ux = (dx / d) * push;
      const uy = (dy / d) * push;
      a.x -= ux; a.y -= uy;
      b.x += ux; b.y += uy;
    }
  }

  // Walls and floor last, so an orb crushed against the floor by the pass above
  // ends the pass legally placed rather than sunk through it. There is no
  // ceiling: orbs fall in from above and must not be trapped on the way down.
  for (const o of live) {
    o.x = Math.min(size - o.r, Math.max(o.r, o.x));
    o.y = Math.min(size - o.r, o.y);
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Drop a bomb of `bombValue` on orb `id` and resolve every chain it starts.
 *
 * Pure: returns a new board rather than mutating, so the eventual solver can
 * explore a move tree without cloning by hand.
 *
 * Resolution is a queue, not recursion — blast waves settle in breadth-first
 * rounds. OPEN: that ordering is observable. If two dying orbs both reach a
 * third, breadth-first means it takes both hits before it can die; a
 * depth-first reading would let the first kill it and re-explode sooner. The
 * two give different scores on the same board.
 *
 * @returns {{board: object, destroyed: object[], score: number, chain: number}}
 */
export function detonate(board, id, bombValue, { collapse = true } = {}) {
  const orbs = board.orbs.map((o) => ({ ...o }));
  const byId = new Map(orbs.map((o) => [o.id, o]));
  const target = byId.get(id);

  const destroyed = [];
  let chain = 0;

  if (!target || !target.alive) {
    return { board: { ...board, orbs }, destroyed, score: 0, chain };
  }

  // Round zero is the bomb itself; every later round is one wave of blasts.
  let wave = applyDamage([{ orb: target, amount: bombValue }]);

  while (wave.length) {
    chain++;
    destroyed.push(...wave);
    const next = [];
    for (const dead of wave) {
      const reach = blastRadiusOf(dead.max);
      for (const o of orbs) {
        if (!o.alive || o.id === dead.id) continue;
        // Centre-to-centre against the blast radius. OPEN: ignoring the
        // victim's own radius means a big orb is no easier to clip than a
        // small one sitting at the same distance, which reads wrong on screen.
        if (dist(dead, o) <= reach) next.push({ orb: o, amount: dead.max });
      }
    }
    wave = applyDamage(next);
  }

  // OPEN: score is the raw sum of what died, so a chain is worth exactly what
  // the same kills would be worth one at a time. If chains are meant to be the
  // point, they need a multiplier — but that is a design decision to make
  // after seeing whether chains are hard to set up.
  const score = destroyed.reduce((sum, o) => sum + o.max, 0);

  const bombs = { ...board.bombs };
  bombs[bombValue] = Math.max(0, (bombs[bombValue] || 0) - 1);

  // Survivors drop into the holes the blast left. Same settler as generation,
  // so a mid-game pile obeys exactly the rules the starting pile did.
  //
  // OPEN, and it is a real design fork: collapsing means the board you planned
  // your next shot against no longer exists once you fire. That is either the
  // best thing here — every shot rearranges the problem — or it makes chains
  // impossible to plan and has to go. Pass {collapse: false} to try it frozen.
  if (collapse && destroyed.length) settle(orbs, board.size ?? DEFAULT_SIZE);

  return { board: { ...board, orbs, bombs }, destroyed, score, chain };

  /** Apply a batch of hits simultaneously; return whatever died. */
  function applyDamage(hits) {
    const dead = [];
    for (const { orb, amount } of hits) {
      if (!orb.alive) continue;
      orb.value -= amount;
      if (orb.value <= 0) {
        orb.alive = false;
        orb.value = 0;
        dead.push(orb);
      }
    }
    return dead;
  }
}

/** Total value still standing — the obvious "how much did you leave" readout. */
export function remainingValue(board) {
  return board.orbs.reduce((sum, o) => sum + (o.alive ? o.value : 0), 0);
}

/** Sum of every orb the board started with, for scoring out of a maximum. */
export function totalValue(board) {
  return board.orbs.reduce((sum, o) => sum + o.max, 0);
}

export function bombsLeft(board) {
  return Object.values(board.bombs).reduce((a, b) => a + b, 0);
}
