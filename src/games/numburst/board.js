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
//   one on an orb subtracts that value. An orb at zero or below bursts, dealing
//   its value LESS ONE to every orb it is touching, which can kill in turn —
//   that is where chains come from, and the -1 is what makes them run downhill
//   and die out instead of consuming the board.
//
//   The packing is static. Orbs are jammed into place once, with no gravity at
//   all, and never move again; a burst leaves a hole and the hole stays. See
//   pack() for why gravity was removed outright.
//
// Deliberately free of DOM and CSS imports: a future scripts/build-numburst.mjs
// needs to import this from Node to generate and verify daily boards, the same
// way verify-colorpath.mjs imports colorpath/difficulty.js.

import { Rng } from "../../core/rng.js";

/**
 * Board coordinate space. Square, unitless — the view scales it to pixels.
 *
 * The SIDE LENGTH is per-board (`board.size`), searched for at generation to
 * fit the orbs that were rolled. Easy's sparse handful in the same box as
 * Hard's crowd would read as a scatter rather than as a packed jar.
 */
export const DEFAULT_SIZE = 100;

/**
 * Starting guess at the fraction of the box the orbs will fill.
 *
 * Only a seed for the box-size search, which measures the real answer. Random
 * packing of same-size circles runs ~0.82 and a mix packs better still, because
 * small ones fill the gaps between large ones — but how much better depends on
 * the mix that got rolled, which is exactly why it is searched rather than
 * assumed.
 */
export const PACKING = 0.62;

/**
 * Fraction of the box left empty above the settled pile. Near zero on purpose:
 * the board should read as a jar filled to the brim.
 */
export const HEADROOM = 0.012;

/**
 * How much tighter the sizing probe aims than the final target. Compensates for
 * the probe relaxing with fewer passes, and so packing looser, than the settle
 * that follows it.
 */
export const PROBE_BIAS = 0.06;

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
 * Gap, in board units, still counted as a touch.
 *
 * A blast travels by CONTACT, so what counts as contact decides what chains.
 * Settled orbs rest against each other with a little slack — a shade of
 * residual overlap here, a hairline gap there — and demanding an exact
 * tangency would make chains fail for reasons invisible on screen. This is
 * generous enough to forgive the settler and tight enough that a gap you can
 * actually see is not a connection.
 */
export const CONTACT_SLOP = 0.6;

/**
 * Smallest value an orb can be generated at.
 *
 * Two, not one, because a 1 bursts for nothing — burstDamageOf is value less
 * one — so every 1 on the board was a dead end that absorbed a hit and stopped
 * the chain. On Hard that was 116 of 170 orbs: two thirds of the board unable
 * to participate in the only mechanic the game has. Starting at 2 means every
 * orb passes SOMETHING on, so every orb is part of the circuit.
 *
 * Orbs can still be reduced BELOW this by damage; a 2 knocked down to 1 is a
 * wounded orb, drawn at its original size, and one more point kills it. What
 * changed is only what the generator is allowed to roll.
 */
export const MIN_VALUE = 2;

export function radiusOf(value) {
  return RADIUS_UNIT * value;
}

/**
 * Damage a bursting orb deals to everything it touches: its value less one.
 *
 * The -1 is what stops a chain being free. A 1 bursts for nothing at all, so
 * the chaff is inert and has to be spent as a fuse rather than as a payload; a
 * 6 passes on 5, enough to keep going but always decaying. Every chain
 * therefore runs downhill and dies out on its own, which is what makes the
 * board a puzzle about where to start it rather than a fireworks show.
 */
export function burstDamageOf(value) {
  return Math.max(0, value - 1);
}

/** Are these two orbs touching, within slop? */
export function touching(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r + CONTACT_SLOP;
}

/**
 * Generate a packed board of orbs.
 *
 * Roll the values, scatter them across a box, then pack() shoves them apart
 * until nothing overlaps. The box size is searched for rather than calculated:
 * how densely a mixed bag of circles jams is not something a formula predicts
 * well, because it depends on the size mix that happened to be rolled.
 */
export function generateBoard(profile, rng = new Rng("numburst")) {
  const { orbCount, maxValue } = profile;

  const orbs = [];
  for (let i = 0; i < orbCount; i++) {
    const value = rollValue(maxValue, profile.skew, rng);
    orbs.push({ id: i, x: 0, y: 0, value, max: value, r: radiusOf(value), alive: true });
  }

  // Scatter positions as FRACTIONS, rolled once. The fit loop re-scatters the
  // same orbs into differently sized boxes and must reuse these rather than
  // roll fresh ones, or each attempt is a different board and the seed stops
  // determining what you get.
  const drops = orbs.map(() => ({ fx: rng.float(), fy: rng.float() }));

  let size = sizeFor(orbs);

  // Grow when the pile breaks through the ceiling, shrink when it leaves too
  // much air. How densely a mixed bag of circles packs is not predictable from
  // a formula — it depends on the size mix that got rolled — so the height is
  // measured rather than assumed.
  for (let attempt = 0; attempt < 14; attempt++) {
    scatter(orbs, drops, size);
    pack(orbs, size, { passes: 160 });
    anneal(orbs, size, GRAVITY, { passes: 3 }); // cheap probe

    // Aim the probe slightly BELOW the ceiling: it relaxes with half the passes
    // of the real settle and so packs looser, and a probe sized to just fit
    // produced finished boards sitting in a fifth of a box of empty air.
    const top = Math.min(...orbs.map((o) => o.y - o.r));
    const target = size * (HEADROOM - PROBE_BIAS);
    if (top < target - size * 0.02) size *= 1.035;
    else if (top > target + size * 0.02) size *= 0.975;
    else break;
  }

  // Settle properly, then verify nothing ended up through the ceiling, where
  // it would render at a negative offset and be cut off at the top of frame.
  // Only ever grows, so the tight fit the probe found is preserved.
  for (let fix = 0; fix < 5; fix++) {
    scatter(orbs, drops, size);
    settle(orbs, size, { rounds: 80 });
    if (Math.min(...orbs.map((o) => o.y - o.r)) >= 0) break;
    size *= 1.03;
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
  // Weight is measured from MIN_VALUE rather than from zero, so the falloff
  // keeps its shape as the floor moves: the smallest allowed value is always
  // the most common, whatever that value happens to be.
  const weights = [];
  let total = 0;
  for (let v = MIN_VALUE; v <= maxValue; v++) {
    const w = 1 / Math.pow(v - MIN_VALUE + 1, skew);
    weights.push(w);
    total += w;
  }
  let t = rng.float() * total;
  for (let v = MIN_VALUE; v <= maxValue; v++) {
    t -= weights[v - MIN_VALUE];
    if (t <= 0) return v;
  }
  return maxValue; // float dust only
}

/**
 * Lay orbs out across the whole box, overlapping, ready to be settled.
 *
 * Deliberately NOT a drop from above the ceiling, which is what this used to
 * be. A long fall sorts a mixed pile by size: small orbs sift down through the
 * gaps between big ones the entire way, the same way a jar of mixed nuts
 * separates when shaken. Measured on the old version, orb value correlated
 * with depth at r = -0.71 — the ones formed a layer of silt on the floor and
 * every big orb floated near the top. As a board that is much worse than it
 * sounds: it means the payload and the fuse are always in the same two places,
 * so there is nothing to read and no reason to look.
 *
 * Starting the orbs spread through the box, overlapping, gives the settler
 * almost nothing to do vertically — it resolves the overlaps roughly in place
 * and compacts a little, so sizes stay where they were put. The overlaps look
 * alarming but are exactly what the relaxation passes are for.
 */
function scatter(orbs, drops, size) {
  orbs.forEach((o, i) => {
    o.x = o.r + drops[i].fx * Math.max(0, size - 2 * o.r);
    o.y = o.r + drops[i].fy * Math.max(0, size - 2 * o.r);
  });
}

/** Side of the square box that a set of orbs should settle into. */
export function sizeFor(orbs) {
  const area = orbs.reduce((sum, o) => sum + Math.PI * o.r * o.r, 0);
  return Math.max(30, Math.sqrt(area / PACKING));
}

/**
 * Pack the orbs: shove them apart until nothing overlaps, and stop.
 *
 * There is NO gravity here, and that is the whole design. An earlier version
 * dropped the orbs in, let them pile up, and re-settled the survivors after
 * every burst. Three things were wrong with it, and removing gravity fixed all
 * three at once:
 *
 *   1. Gravity SORTS a mixed pile. Small orbs sift down through the gaps
 *      between big ones, so a board that reached its density by falling ended
 *      up with the ones as silt on the floor and the big orbs riding on top —
 *      measured at r = -0.71 between value and depth, and no amount of tuning
 *      got it past -0.41. With no gravity the correlation is about -0.05: the
 *      orbs stay wherever they were scattered, which was uniform.
 *
 *   2. Re-settling cost 330ms on a big board and up to 600ms in the worst
 *      case, on a desktop. On a phone that is a visible freeze on every shot,
 *      for a game meant to be played on a phone.
 *
 *   3. A collapsing pile rearranges the board you were planning against. With
 *      the pile fixed, the contact graph a player reads before firing is the
 *      same graph the next shot resolves against.
 *
 * Separation alone has no preferred direction: orbs shove each other apart
 * until they jam, then hold. Nothing accumulates, so nothing can oscillate,
 * and the result is a dense even packing with the size mix left undisturbed.
 *
 * Fully deterministic — fixed iteration order, no randomness, no wall clock —
 * so every player gets the identical board, which is what a daily requires.
 */
export function settle(orbs, size, opts = {}) {
  pack(orbs, size);
  return collapse(orbs, size, opts);
}

/**
 * Gravity, as a ladder of [step, tickBudget] phases from coarse to fine.
 *
 * The step sets how much overlap survives at rest — each tick injects one step
 * of penetration and separation only removes half of what it finds per pass —
 * so a big step is fast and dirty and a small one is slow and clean. Running
 * them in sequence buys the speed of the first and the finish of the last.
 *
 * There is no really coarse stride, because gravity now runs on a heap that
 * pack() has ALREADY brought to density. A brim-full pile is under compression
 * and only marginally stable; hitting it with a large stride does not settle
 * it, it churns it — which once cost 26 seconds a board and shuffled orbs
 * nowhere near the blast.
 *
 * The same ladder serves generation and mid-game collapse, and that is a
 * correctness requirement rather than tidiness: a board must ship at the
 * fixpoint of the very function that will re-settle it after a burst, or the
 * first shot drops the whole pile for no reason the player can see.
 */
const GRAVITY = [[0.25, 220], [0.08, 120], [0.03, 80]];

/**
 * Re-settle a pile that is already packed — after a burst, or to prove a fresh
 * board is final.
 *
 * Runs to a FIXPOINT: repeats until another full pass moves nothing. A single
 * pass leaves the pile merely metastable, at rest but still able to re-arrange,
 * and since this runs after every burst that would show orbs nowhere near the
 * explosion drifting for no visible reason.
 */
export function collapse(orbs, size, { rounds = 16, ...opts } = {}) {
  const live = orbs.filter((o) => o.alive);

  for (let round = 0; round < rounds; round++) {
    const before = live.map((o) => ({ x: o.x, y: o.y }));
    anneal(live, size, GRAVITY, opts);
    let drift = 0;
    for (let i = 0; i < live.length; i++) {
      drift = Math.max(drift, Math.hypot(live[i].x - before[i].x, live[i].y - before[i].y));
    }
    if (drift < 0.05) break;
  }

  return orbs;
}

/**
 * Record a collapse for playback as animation.
 *
 * The simulation runs once, up front, and the intermediate positions are kept.
 * Stepping the solver from inside a requestAnimationFrame loop would tie the
 * physics to the frame rate, so a slow phone would reach a different outcome
 * from a fast desktop — unacceptable for a daily. Recording keeps the result
 * identical everywhere and leaves playback as pure interpolation.
 */
export function collapseFrames(orbs, size, { every = 3, maxFrames = 70, ...opts } = {}) {
  const live = orbs.filter((o) => o.alive);
  const ids = live.map((o) => o.id);
  const frames = [];
  let tick = 0;

  const snap = () => {
    const f = new Float64Array(live.length * 2);
    for (let i = 0; i < live.length; i++) {
      f[i * 2] = live[i].x;
      f[i * 2 + 1] = live[i].y;
    }
    frames.push(f);
  };

  snap(); // frame zero is where the pile stood when the player fired
  collapse(orbs, size, {
    ...opts,
    onTick: () => { if (tick++ % every === 0 && frames.length < maxFrames) snap(); },
  });
  snap(); // and the last frame is the settled truth, not a sample

  return { frames, ids };
}

/** One gravity anneal down the given ladder. Mutates in place. */
function anneal(orbs, size, steps, { passes = 6, onTick = null } = {}) {
  const live = orbs.filter((o) => o.alive);
  const prev = live.map((o) => ({ x: o.x, y: o.y }));
  const order = live.map((_, i) => i);
  const maxR = live.reduce((m, o) => Math.max(m, o.r), 0);

  for (const [step, ticks] of steps) {
    const eps = step * 0.02;

    for (let tick = 0; tick < ticks; tick++) {
      for (let i = 0; i < live.length; i++) {
        prev[i].x = live[i].x;
        prev[i].y = live[i].y;
        live[i].y += step;
      }

      // Sort once per TICK, not once per pass: six sorts of the board per tick
      // dominated the profile, and within one tick nothing moves far enough to
      // change the sweep order meaningfully.
      order.sort((i, j) => live[i].x - live[j].x);
      for (let k = 0; k < passes; k++) separate(live, size, order, maxR);

      if (onTick) onTick(live);

      let moved = 0;
      for (let i = 0; i < live.length; i++) {
        moved = Math.max(moved, Math.hypot(live[i].x - prev[i].x, live[i].y - prev[i].y));
      }
      if (moved < eps) break; // asleep for this phase
    }
  }
}

export function pack(orbs, size, { passes = 320 } = {}) {
  const live = orbs.filter((o) => o.alive);
  const order = live.map((_, i) => i);
  const maxR = live.reduce((m, o) => Math.max(m, o.r), 0);

  for (let k = 0; k < passes; k++) {
    // Re-sorting every pass was six sorts of the board per tick and dominated
    // the profile; within a few passes nothing moves far enough to change the
    // sweep order meaningfully, and anything missed is caught next time.
    if (k % 4 === 0) order.sort((i, j) => live[i].x - live[j].x);
    separate(live, size, order, maxR);
  }

  return orbs;
}

/** Deepest overlap left between any two orbs — how well the packing worked. */
export function worstOverlap(orbs) {
  const live = orbs.filter((o) => o.alive);
  let worst = 0;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return worst;
}

function separate(live, size, order, maxR) {
  for (let ii = 0; ii < order.length; ii++) {
    const a = live[order[ii]];
    const reach = a.r + maxR;

    for (let jj = ii + 1; jj < order.length; jj++) {
      const b = live[order[jj]];
      if (b.x - a.x > reach) break; // nothing further along can reach back

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d >= min) continue;

      if (d < 1e-6) {
        // Exactly concentric: there is no separating direction to compute, so
        // pick one deterministically. Alternating by index rather than at
        // random keeps the board identical for every player.
        dx = (order[ii] + order[jj]) % 2 === 0 ? 1 : -1;
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
  // ends the pass legally placed rather than sunk through it. No ceiling: pack()
  // can push orbs out through the top, and gravity is what brings them back
  // down. The fit loop grows the box for any that stay up there.
  for (const o of live) {
    o.x = Math.min(size - o.r, Math.max(o.r, o.x));
    o.y = Math.min(size - o.r, o.y);
  }
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
 * @returns {{
 *   board: object,
 *   destroyed: object[],
 *   waves: {hits: {from: number|null, to: number, amount: number, after: number,
 *                  died: boolean}[], destroyed: object[], multiplier: number,
 *           raw: number, score: number}[],
 *   score: number,
 *   chain: number
 * }} `waves` is the blow-by-blow account the view animates: one entry per ring
 *    of the cascade, each listing who hit whom for how much and what the target
 *    was left holding. `from` is null for the bomb's own strike.
 */
export function detonate(board, id, bombValue, { settleAfter = true } = {}) {
  const orbs = board.orbs.map((o) => ({ ...o }));
  const byId = new Map(orbs.map((o) => [o.id, o]));
  const target = byId.get(id);

  const destroyed = [];
  const waves = [];
  let chain = 0;

  if (!target || !target.alive) {
    return { board: { ...board, orbs }, destroyed, waves, score: 0, chain };
  }

  // The bomb itself is the first strike; every round after it is one wave of
  // blasts travelling outward.
  let pending = [{ from: null, orb: target, amount: bombValue }];

  while (pending.length) {
    chain++;

    // Resolve the whole wave SIMULTANEOUSLY, recording each individual blow.
    // The record is what the view narrates: an arrow per hit, a floating
    // number per hit, and the target's new value the instant it is struck. All
    // of that used to be unrecoverable, because only the final board survived.
    const hits = [];
    const dead = [];
    for (const { from, orb, amount } of pending) {
      if (!orb.alive) continue;
      orb.value -= amount;
      const died = orb.value <= 0;
      if (died) {
        orb.alive = false;
        orb.value = 0;
        orb.wave = chain;
        dead.push(orb);
      }
      hits.push({ from, to: orb.id, amount, after: orb.value, died });
    }

    // Score the wave at its own depth. The bomb's own kills count once, the
    // orbs those kills take out count double, and so on outward.
    //
    // Flat scoring made the game's best moment worth exactly its worst: a
    // five-wave cascade taking twenty-four orbs paid the same as picking those
    // twenty-four off one at a time, so there was no reason to hunt for a chain
    // rather than just spend bombs. The multiplier is the whole reward curve.
    const raw = dead.reduce((sum, o) => sum + o.max, 0);
    waves.push({ hits, destroyed: dead, multiplier: chain, raw, score: raw * chain });
    destroyed.push(...dead);

    const next = [];
    for (const corpse of dead) {
      const amount = burstDamageOf(corpse.max);
      if (amount === 0) continue; // a 1 bursts for nothing; the chain stops here

      // Contact only — a burst hits what it was actually touching, nothing
      // across a gap. Against a packed pile that makes the board a graph you
      // can read off the screen: chains run along visible chains of orbs, so a
      // player can trace a route before spending anything. The old radius
      // version reached over the top of neighbors, which meant the reason a
      // chain worked was never visible.
      //
      // Contact is measured on positions from BEFORE the collapse, which is
      // the arrangement the player was looking at when they fired.
      for (const o of orbs) {
        if (!o.alive || o.id === corpse.id) continue;
        if (touching(corpse, o)) next.push({ from: corpse.id, orb: o, amount });
      }
    }
    pending = next;
  }

  const score = waves.reduce((sum, w) => sum + w.score, 0);

  const bombs = { ...board.bombs };
  bombs[bombValue] = Math.max(0, (bombs[bombValue] || 0) - 1);

  // Survivors drop into the hole the blast left, using the same gravity that
  // generated the board. This is what keeps the pile in mutual contact as it is
  // eaten away — without it, holes accumulate and orbs strand themselves out of
  // reach of any chain. Pass {settleAfter: false} to read a shot without
  // committing to it, which is how the view resolves the blast against the
  // arrangement the player was actually looking at.
  if (settleAfter && destroyed.length) collapse(orbs, board.size ?? DEFAULT_SIZE);

  return { board: { ...board, orbs, bombs }, destroyed, waves, score, chain };
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
