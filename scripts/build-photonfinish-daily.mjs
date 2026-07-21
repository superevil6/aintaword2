// Build the Photon Finish daily puzzle file.
//
//   node scripts/build-photonfinish-daily.mjs [days] [--from YYYY-MM-DD]
//
// Writes src/data/photonfinishPuzzles.js.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Beams push each other where they cross, so a board cannot be verified one
// beam at a time — it needs a joint sweep of every angle at once, which is
// STEPS^beams (46 million for a three-beam board). That fraction is sampled,
// the route and window checks run per beam, and the whole thing is about a
// second per board: impossible in a page load, unremarkable here.
//
// Moving generation offline is what buys the quality bar. The browser now just
// reads data, so the tier picker is instant, and the generator is free to
// throw away nine boards out of ten on grounds it could never have afforded to
// check at runtime.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Rng } from "../src/core/rng.js";
import { generatePuzzle } from "../src/games/photonfinish/generator.js";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../src/games/photonfinish/difficulty.js";
import { evaluate } from "../src/games/photonfinish/optics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/data/photonfinishPuzzles.js");

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) || 30);
const fromArg = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;

/** Seeds must match what the game asks for — see games/photonfinish/results.js. */
const seedFor = (difficulty, day) => `photonfinish:${day}:${difficulty}`;

/** Retry across derived seeds, exactly as a runtime builder would have. */
const SEED_RETRIES = 14;

function build(difficulty, day) {
  const profile = DIFFICULTIES[difficulty];
  const base = seedFor(difficulty, day);
  for (let attempt = 0; attempt < SEED_RETRIES; attempt++) {
    const seed = attempt === 0 ? base : `${base}#${attempt}`;
    const puzzle = generatePuzzle(profile, new Rng(seed));
    if (puzzle) return { puzzle, seed, attempt };
  }
  return null;
}

/** Trim float noise. The board is 100 units across; 4dp is far finer than a pixel. */
const r = (v) => Math.round(v * 1e4) / 1e4;
const pt = (p) => ({ x: r(p.x), y: r(p.y) });

function serialise(p) {
  return {
    gates: p.gates.map((g) => ({ a: pt(g.a), b: pt(g.b), dark: !!g.dark })),
    mirror: p.mirror ? { a: pt(p.mirror.a), b: pt(p.mirror.b) } : null,
    emitters: p.emitters.map((e) => ({ x: r(e.x), y: r(e.y) })),
    goals: p.goals.map((g) => ({ a: pt(g.a), b: pt(g.b), level: g.level })),
    maxBounces: p.maxBounces,
    solution: p.solution.map((a) => r(a)),
    start: p.start.map((a) => r(a)),
    stats: {
      routes: p.stats.routes,
      order: p.stats.order,
      solvedFraction: r(p.stats.solvedFraction),
      reachable: r(p.stats.reachable),
      windows: p.stats.windows.map((w) => r(w.width)),
      goalLevels: p.stats.goalLevels,
      crossings: p.stats.crossings,
    },
  };
}

function dayKeys(n, from) {
  const start = from ? new Date(`${from}T00:00:00Z`) : new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

const keys = dayKeys(days, fromArg);
console.log(`Photon Finish — building ${days} days x ${DIFFICULTY_ORDER.length} tiers`);
console.log(`  ${keys[0]} .. ${keys[keys.length - 1]}\n`);

const puzzles = {};
let failures = 0;
let totalMs = 0;
const greedies = [];

for (const day of keys) {
  const row = {};
  const marks = [];
  for (const tier of DIFFICULTY_ORDER) {
    const t0 = performance.now();
    const built = build(tier, day);
    const ms = performance.now() - t0;
    totalMs += ms;

    if (!built) {
      failures++;
      marks.push(`${tier}:FAILED`);
      continue;
    }

    // Never ship a board without re-checking the two things that make it a
    // puzzle at all, from the serialised form the browser will actually load.
    const data = serialise(built.puzzle);
    const board = { ...data, goals: data.goals, emitters: data.emitters };
    if (!evaluate(board, data.solution).solved) {
      failures++;
      marks.push(`${tier}:UNSOLVABLE`);
      continue;
    }
    if (evaluate(board, data.start).solved) {
      failures++;
      marks.push(`${tier}:OPENS-SOLVED`);
      continue;
    }

    row[tier] = data;
    greedies.push(built.puzzle.stats.reachable);
    marks.push(`${tier} ${Math.round(ms)}ms routes=${built.puzzle.stats.routes.join("/")}`);
  }
  puzzles[day] = row;
  console.log(`  ${day}  ${marks.join("  ")}`);
}

const header = `// Photon Finish — prebuilt daily puzzles. GENERATED FILE, do not edit.
//
//   npm run photonfinish:daily
//
// Boards are generated and verified offline because verifying one means
// sweeping both beams jointly (360x360 aimings) and simulating a scrubbing
// player from two dozen starts — about a second each, which a page load cannot
// afford. See scripts/build-photonfinish-daily.mjs.
//
// Built ${keys[0]} .. ${keys[keys.length - 1]}, ${DIFFICULTY_ORDER.length} tiers per day.
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}\nexport const PUZZLES = ${JSON.stringify(puzzles, null, 1)};\n`);

const avgGreedy = greedies.reduce((a, b) => a + b, 0) / (greedies.length || 1);
console.log(`\n  ${failures === 0 ? "✅" : "❌"} ${keys.length * DIFFICULTY_ORDER.length - failures} boards, ${failures} failed`);
console.log(`  avg ${Math.round(totalMs / (keys.length * DIFFICULTY_ORDER.length))}ms per board`);
console.log(`  mean descent-reachability ${avgGreedy.toFixed(3)} (reported, not a gate — see generator.js)`);
console.log(`  wrote ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
