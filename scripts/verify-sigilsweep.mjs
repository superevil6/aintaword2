// Verifier for sigilsweep — the shipping gate.
//
//   node scripts/verify-sigilsweep.mjs
//
// Asserts the daily puzzles every player will get are sound: each has a valid
// answer among distinct options, the answer really belongs to the tier's
// symmetry class and stroke count, sets hold distinct marks, the wire format
// round-trips, and the scoring keeps patience ahead of blind guessing. Runs
// over a wide day range so a bad seed can't slip through.

import {
  generateDailySet, TIERS, serializePuzzle, deserializePuzzle,
  farFromClarity, angularDistance,
} from "../src/games/sigilsweep/generator.js";
import { sigilKey, mirrorScore, acceptable, connected } from "../src/games/sigilsweep/sigil.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/sigilsweep/difficulty.js";
import { dailySeedFor } from "../src/games/sigilsweep/results.js";
import {
  scorePick, worthAt, blindGuessEV, patientEV, BASE, FLOOR, HALF_LIFE_DEG,
} from "../src/games/sigilsweep/scoring.js";

const DAYS = 200;
const FROM = "2026-07-23";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${msg}`); }
};

function dayKey(from, offset) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── daily puzzles ────────────────────────────────────────────────────────────
console.log(`Verifying ${DAYS} days × ${DIFFICULTY_ORDER.length} tiers…`);
for (let i = 0; i < DAYS; i++) {
  const day = dayKey(FROM, i);
  for (const id of DIFFICULTY_ORDER) {
    const cfg = TIERS[id];
    const count = DIFFICULTIES[id].rounds;
    const set = generateDailySet(dailySeedFor(id, day), id, count);
    ok(set.length === count, `${day} ${id}: expected ${count} puzzles, got ${set.length}`);

    const answerKeys = new Set();
    for (const p of set) {
      ok(p.options.length === cfg.options, `${day} ${id}: expected ${cfg.options} options, got ${p.options.length}`);

      // options are distinct
      const keys = p.options.map(sigilKey);
      ok(new Set(keys).size === keys.length, `${day} ${id}: options not distinct`);

      // answer index points at the answer
      ok(p.answerIndex >= 0 && p.answerIndex < p.options.length, `${day} ${id}: answer index out of range`);
      ok(sigilKey(p.options[p.answerIndex]) === sigilKey(p.answer), `${day} ${id}: answerIndex does not point at the answer`);

      // every option is a well-formed mark of the tier's stroke count
      for (const o of p.options) {
        ok(o.length === cfg.strokes, `${day} ${id}: an option has ${o.length} strokes, want ${cfg.strokes}`);
        ok(connected(o), `${day} ${id}: an option is disconnected`);
        ok(acceptable(o, cfg.sym), `${day} ${id}: an option fails the quality gate`);
      }

      // symmetry class holds for answer AND decoys (a mismatch would leak the
      // answer without watching the sweep)
      if (cfg.sym === "mirror") {
        for (const o of p.options) {
          ok(mirrorScore(o) > 0.999, `${day} ${id}: an option is not mirror-symmetric`);
        }
      }
      if (cfg.sym === "none") {
        ok(mirrorScore(p.answer) <= 0.6, `${day} ${id}: hard-tier answer is too symmetric`);
      }

      // a symmetric puzzle must not open already resolved
      if (cfg.sym !== "none") {
        ok(farFromClarity(p.startDeg), `${day} ${id}: start angle ${p.startDeg}° opens on a clarity axis`);
      }

      // wire format round-trips exactly
      const back = deserializePuzzle({ ...serializePuzzle(p), t: id });
      ok(back.options.every((o, k) => sigilKey(o) === sigilKey(p.options[k])),
        `${day} ${id}: options did not survive the wire round-trip`);
      ok(back.answerIndex === p.answerIndex && back.wedgeDeg === p.wedgeDeg && back.startDeg === p.startDeg,
        `${day} ${id}: puzzle metadata did not survive the wire round-trip`);

      answerKeys.add(sigilKey(p.answer));
    }
    ok(answerKeys.size === set.length, `${day} ${id}: set has duplicate answer marks`);
  }
}

// ── determinism ──────────────────────────────────────────────────────────────
for (const id of DIFFICULTY_ORDER) {
  const a = generateDailySet(dailySeedFor(id, FROM), id, DIFFICULTIES[id].rounds).map((p) => sigilKey(p.answer)).join(",");
  const b = generateDailySet(dailySeedFor(id, FROM), id, DIFFICULTIES[id].rounds).map((p) => sigilKey(p.answer)).join(",");
  ok(a === b, `${id}: daily set not deterministic`);
}

// ── tier ladder invariants (one variable per step) ───────────────────────────
ok(TIERS.easy.sym === "mirror" && TIERS.easy.wedgeDeg === 180, "easy: whole disc, mirror-symmetric");
ok(TIERS.medium.sym === "mirror" && TIERS.medium.wedgeDeg === 90, "medium: slit, still mirror-symmetric");
ok(TIERS.hard.sym === "none" && TIERS.hard.wedgeDeg === 90, "hard: slit, asymmetric");
ok(TIERS.easy.wedgeDeg > TIERS.medium.wedgeDeg, "easy→medium narrows the wedge");
ok(TIERS.medium.sym === TIERS.easy.sym && TIERS.hard.sym !== TIERS.medium.sym,
  "medium→hard is the step that drops symmetry (and only that)");
ok([TIERS.easy, TIERS.medium, TIERS.hard].every((t) => t.strokes === 7), "stroke count held at 7 across tiers");
ok(TIERS.easy.options < TIERS.medium.options && TIERS.medium.options < TIERS.hard.options,
  "options grow easy→medium→hard");

// ── angle helpers ────────────────────────────────────────────────────────────
ok(angularDistance(10, 350) === 20, "angularDistance wraps around 360");
ok(angularDistance(90, 90) === 0, "angularDistance of equal bearings is 0");
ok(!farFromClarity(90) && !farFromClarity(270), "clarity axes (90°, 270°) are rejected");
ok(farFromClarity(0) && farFromClarity(180), "the horizontal split is safely far from clarity");

// ── scoring ──────────────────────────────────────────────────────────────────
ok(worthAt(0) === BASE, "an instant read is worth BASE");
ok(worthAt(HALF_LIFE_DEG) === Math.round(BASE / 2), "worth halves after one half-life");
ok(worthAt(1e6) === FLOOR, "a very slow read bottoms out at FLOOR");
ok(scorePick({ correct: false, degrees: 0 }) === 0, "a wrong pick scores 0, never negative");
ok(scorePick({ correct: true, degrees: 0, guessIndex: 1 }) < scorePick({ correct: true, degrees: 0, guessIndex: 0 }),
  "a second-try correct pick is worth less than a first-try one");
ok(scorePick({ correct: true, degrees: 200 }) < scorePick({ correct: true, degrees: 0 }),
  "worth decays as the sweep advances");

// THE anti-degenerate gate: patience must beat blind guessing by a clear margin
// at every tier, or the game is a coin-flip. Model a solve at 420° swept, 92%.
for (const id of DIFFICULTY_ORDER) {
  const blind = blindGuessEV(TIERS[id].options);
  const patient = patientEV(420, 0.92);
  ok(patient / blind >= 1.5, `${id}: patience only beats blind guessing ${(patient / blind).toFixed(2)}× (want ≥1.5)`);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} verify-sigilsweep: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
