// sigilsweep puzzle generator.
//
// Contract: for a tier, build N distinct PUZZLES. Each puzzle is one answer
// sigil plus a set of decoys drawn from the same symmetry class (see sigil.js
// decoysFor for why the class must match — a symmetry mismatch leaks the answer
// without watching the sweep). The player is shown the sweep and picks the
// answer out of {answer ∪ decoys}, shuffled.
//
// Same shape as the other games' generators: deterministic in (seed, tier), a
// distinctness gate across a day's set, and a generateDailySet() the build and
// verify scripts share.

import { Rng } from "../../core/rng.js";
import { makeSigil, decoysFor, sigilKey, encodeSigil, decodeSigil } from "./sigil.js";

// A mirror-symmetric sigil resolves to the exact truth at the moment the split
// line lies along its own axis of symmetry — which is vertical, i.e. 90° and
// 270°. Opening the sweep there would hand the answer over on frame one, so
// starting angles keep this clear of those two points.
const CLARITY_DEG = [90, 270];
const CLARITY_GUARD = 25;

/** Shortest angular distance between two bearings, in degrees. */
export function angularDistance(a, b) {
  const d = Math.abs((a - b) % 360);
  return Math.min(d, 360 - d);
}

export function farFromClarity(deg) {
  return CLARITY_DEG.every((c) => angularDistance(deg, c) > CLARITY_GUARD);
}

// Per-tier knobs. The ladder changes ONE variable per step, so the player
// learns the mechanic one axis at a time:
//   easy → medium: the reveal narrows from the whole disc (180°) to a slit.
//   medium → hard: the mark stops being symmetric, so the mirrored side lies.
// Stroke count is held at 7 throughout — the level that gives enough distinct
// mirror-symmetric figures to fill a 122-day archive (measured: 4 strokes
// yields only ~112 distinct, below the archive length).
export const TIERS = {
  easy:   { sym: "mirror", strokes: 7, wedgeDeg: 180, options: 4 },
  medium: { sym: "mirror", strokes: 7, wedgeDeg: 90,  options: 5 },
  hard:   { sym: "none",   strokes: 7, wedgeDeg: 90,  options: 6 },
};

/**
 * One puzzle: an answer, its decoys, and the shuffled options with the answer's
 * index recorded. Returns null if the tier can't supply enough decoys for this
 * seed (the caller retries with a fresh salt).
 */
function tryBuild(seed, tier) {
  const cfg = TIERS[tier];
  if (!cfg) throw new Error(`unknown tier: ${tier}`);

  const answer = makeSigil(seed, cfg.strokes, cfg.sym);
  if (!answer) return null;

  const decoys = decoysFor(answer, seed, cfg.options - 1, cfg.sym, cfg.strokes);
  if (decoys.length < cfg.options - 1) return null;

  const rng = new Rng(`sigil:opts:${seed}`);
  const options = rng.shuffle([answer, ...decoys]);
  const answerKey = sigilKey(answer);
  const answerIndex = options.findIndex((o) => sigilKey(o) === answerKey);

  // For symmetric tiers the mark is legible whenever the split lines up with its
  // axis; open the sweep well away from those clarity angles so no puzzle starts
  // already solved. (Asymmetric marks never fully resolve, but a seeded start
  // still keeps two players' sweeps identical.)
  let startDeg = rng.int(0, 359);
  for (let g = 0; g < 40 && cfg.sym !== "none" && !farFromClarity(startDeg); g++) {
    startDeg = rng.int(0, 359);
  }

  return { tier, sym: cfg.sym, wedgeDeg: cfg.wedgeDeg, answer, options, answerIndex, startDeg };
}

/**
 * One valid puzzle for a tier from a seed. Deterministic in (seed, tier).
 * @throws if the gates can't be met in `attempts` draws (shouldn't happen).
 */
export function generatePuzzle(seed, tier, attempts = 200) {
  for (let i = 0; i < attempts; i++) {
    const puzzle = tryBuild(`${seed}:${i}`, tier);
    if (puzzle) return puzzle;
  }
  throw new Error(`sigilsweep: no valid ${tier} puzzle after ${attempts} attempts`);
}

/**
 * A daily set: N distinct puzzles for a tier. Distinct by the answer sigil, so
 * the same day never asks for the same mark twice.
 */
export function generateDailySet(seed, tier, count) {
  const puzzles = [];
  const seen = new Set();
  let salt = 0;
  while (puzzles.length < count && salt < count * 60) {
    const puzzle = generatePuzzle(`${seed}:${salt++}`, tier);
    const k = sigilKey(puzzle.answer);
    if (seen.has(k)) continue;
    seen.add(k);
    puzzles.push(puzzle);
  }
  if (puzzles.length < count) {
    throw new Error(`sigilsweep: only built ${puzzles.length}/${count} ${tier} puzzles`);
  }
  return puzzles;
}

// ── wire format ──────────────────────────────────────────────────────────────
// A day's file stores puzzles, not just a seed, so what ships IS the puzzle.
// Each puzzle serializes to its options (compact-encoded sigils), the answer
// index, and the start angle — everything the client needs to render an
// identical round without rerunning the generator.

export function serializePuzzle(p) {
  return {
    o: p.options.map(encodeSigil),
    a: p.answerIndex,
    s: p.startDeg,
    w: p.wedgeDeg,
    y: p.sym,
  };
}

export function deserializePuzzle(data) {
  const options = data.o.map(decodeSigil);
  return {
    tier: data.t,
    sym: data.y,
    wedgeDeg: data.w,
    startDeg: data.s,
    options,
    answerIndex: data.a,
    answer: options[data.a],
  };
}
