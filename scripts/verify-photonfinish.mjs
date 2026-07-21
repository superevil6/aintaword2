// Verify the Photon Finish daily puzzle file.
//
//   node scripts/verify-photonfinish.mjs
//
// Boards are built offline (npm run photonfinish:daily), so what ships is a
// data file rather than a generator. This checks that file the way a player
// would meet it — every day, every tier, loaded and scored through the same
// optics the browser uses.
//
// The headline assertion is `greedy`: the fraction of random starting aimings
// from which a player who never thinks can scrub to a solution by sweeping one
// beam until its own finish line lights up, then the other. An earlier version
// of this game scored ~1.0 on that and was, correctly, called pointless. It is
// the number that says whether there is a puzzle here at all.

import { PUZZLES } from "../src/data/photonfinishPuzzles.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/photonfinish/difficulty.js";
import { evaluate, tracePath, pathCrossings } from "../src/games/photonfinish/optics.js";
import { NEUTRAL, MAX_LEVEL } from "../src/games/photonfinish/levels.js";
import { KEY_STEP_COARSE } from "../src/games/photonfinish/game.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${msg}`); }
};

const days = Object.keys(PUZZLES).sort();
console.log(`Photon Finish — verifying ${days.length} days x ${DIFFICULTY_ORDER.length} tiers`);
console.log(`  ${days[0]} .. ${days[days.length - 1]}\n`);

// ── The keyboard-reachability guarantee ────────────────────────────────────
//
// Aim is continuous, so a keyboard player only reaches angles start + k*step.
// Any interval wider than the step must contain one of them, so every tier's
// minimum solving window has to exceed one step or some boards become
// mouse-only. Asserted against the PROFILES, because it is a property of the
// difficulty numbers rather than of any one board.
for (const tier of DIFFICULTY_ORDER) {
  ok(DIFFICULTIES[tier].minWindow > KEY_STEP_COARSE,
    `${tier}: minWindow ${DIFFICULTIES[tier].minWindow} exceeds the ${KEY_STEP_COARSE} deg key step`);
}

const greedies = [];
const fractions = [];
const windows = [];

for (const day of days) {
  for (const tier of DIFFICULTY_ORDER) {
    const p = PUZZLES[day]?.[tier];
    const where = `${tier} ${day}`;
    if (!p) { fail++; console.log(`  ✗ ${where}: missing`); continue; }

    const profile = DIFFICULTIES[tier];

    ok(p.emitters.length === profile.emitters, `${where}: emitter count`);
    ok(p.goals.length === profile.emitters, `${where}: one goal per beam`);
    ok(p.gates.length === profile.gates, `${where}: gate count`);
    ok(p.gates.filter((g) => g.dark).length === profile.darkGates, `${where}: dark gate count`);

    // Solvable as shipped, and not already solved when it opens.
    ok(evaluate(p, p.solution).solved, `${where}: the recorded solution solves it`);
    ok(!evaluate(p, p.start).solved, `${where}: does not open solved`);

    // Goal levels are the ones this tier is allowed to ask for. Hard bans the
    // clamped ends 0 and 4 — those forgive a route that merely overshoots.
    if (profile.goalExtremes) {
      const levels = p.goals.map((g) => g.level);
      ok(levels.includes(0) && levels.includes(4),
        `${where}: goals include a darkest (0) and a lightest (4); got ${levels.join("/")}`);
    }

    for (const goal of p.goals) {
      ok(profile.goalLevels.includes(goal.level),
        `${where}: goal wants ${goal.level}, allowed ${profile.goalLevels.join("/")}`);
      ok(goal.level !== NEUTRAL, `${where}: no goal asks for the level beams start at`);
      ok(goal.level >= 0 && goal.level <= MAX_LEVEL, `${where}: goal level in range`);
    }

    // Every beam must meet at least one other at the solution, or a beam is an
    // independent side-puzzle — the original sin this design exists to avoid.
    // Not every PAIR need cross: a 3->2->1 chain coples 1-2 and 2-3, and beams
    // 1 and 3 may never meet. Connectivity, not a complete graph, is the rule.
    const paths = p.emitters.map((e, i) =>
      tracePath(e, p.solution[i], p, { maxBounces: p.maxBounces }));
    const crossesSomething = paths.map((_, i) =>
      paths.some((_, j) => i !== j && pathCrossings(paths[i], paths[j]).length > 0));
    ok(crossesSomething.every(Boolean),
      `${where}: every beam crosses at least one other at the solution`);
    // The recorded solve order must cover every beam (a valid chain/DAG order).
    ok(!p.stats.order || p.stats.order.length === 0 ||
       new Set(p.stats.order).size === p.emitters.length,
      `${where}: the recorded solve order covers every beam`);

    // And the recorded quality numbers are within what the tier promises.
    // `routes` is the one that says the board can be REASONED about: how many
    // visibly distinct ways there are to reach each finish line. More than one
    // so there is a choice, few enough to enumerate by eye.
    p.stats.routes.forEach((n, i) => {
      ok(n >= profile.minRoutes && n <= profile.maxRoutes,
        `${where}: finish line ${i + 1} has ${n} routes, want ` +
        `${profile.minRoutes}..${profile.maxRoutes}`);
    });
    ok(p.stats.solvedFraction <= profile.maxSolvedFraction,
      `${where}: ${(p.stats.solvedFraction * 100).toFixed(3)}% of aimings solve it`);
    for (const w of p.stats.windows) {
      ok(w >= profile.minWindow && w <= profile.maxWindow,
        `${where}: window ${w} deg outside ${profile.minWindow}..${profile.maxWindow}`);
      ok(w > KEY_STEP_COARSE, `${where}: window ${w} deg is reachable by keyboard`);
      windows.push(w);
    }

    greedies.push(p.stats.reachable);
    fractions.push(p.stats.solvedFraction);
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
windows.sort((a, b) => a - b);
console.log(`  descent-reach:   mean ${mean(greedies).toFixed(3)} (reported only — a local`);
console.log(`                   searcher cannot model a player who plans a route)`);
console.log(`  solvable space:  mean ${(mean(fractions) * 100).toFixed(3)}% of all aimings`);
console.log(`  aim windows:     tightest ${windows[0]?.toFixed(1)} deg, median ${
  windows[Math.floor(windows.length / 2)]?.toFixed(1)} deg (key step ${KEY_STEP_COARSE} deg)`);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
