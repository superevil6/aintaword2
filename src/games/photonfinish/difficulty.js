// Difficulty profiles for Photon Finish.
//
// ── The measures, and which way each one cuts ──────────────────────────────
//
//   minRoutes/maxRoutes — how many visibly distinct ROUTES reach each finish
//     line, a route being the gates crossed on the way in. More than one so
//     there is a choice to make; few enough to enumerate by eye. This is the
//     measure that certifies a board can be REASONED about rather than only
//     stumbled into.
//
//   maxSolvedFraction — how much of the whole aiming space solves it. The
//     other way to win by accident. Sampled, since the space is STEPS^beams.
//
//   minWindow/maxWindow — how precisely you must aim once the other beams are
//     right. The fairness floor; minWindow must exceed the keyboard step or a
//     board becomes mouse-only, which verify asserts.
//
//   goalLevels — the brightnesses a finish line may ask for.
//   goalExtremes — require one goal to be the DARKEST (0) and one the LIGHTEST
//     (4), the rest free. A per-board shape ("drive one beam all the way down,
//     one all the way up") rather than a per-goal precision demand: 0 and 4 are
//     the clamped ends, so they forgive overshoot. The difficulty stays in the
//     coupling and the free third goal.
//
// ── Beam count and the chain rule ──────────────────────────────────────────
//
// Beams push each other where they cross, so the goals cannot be solved one at
// a time — that coupling is the whole puzzle. With two beams it is a single
// interaction. With THREE it could be a tangle where every beam depends on
// every other at once, which no one can reason through, so a three-beam board
// is required to form a CHAIN: one beam solvable on its own, each later beam
// depending only on earlier ones (see couplingStructure in generator.js). That
// keeps it solvable in sequence rather than simultaneously.
//
//   emitters       — beams, and one finish line each.
//   chain          — require the coupling graph to be a connected DAG.
//   chainPath      — (available, currently unused) require that DAG to be a
//     simple PATH rather than a star. Culls ~90% of candidate boards, which
//     was too steep a generation cost for a distinction the player barely
//     feels over an ordinary connected chain.
//   requireCoupled — must every beam's goal sit after a crossing that changed
//     it? Yes for two beams (forces the one interaction). No for a chain, which
//     needs a source beam reached on gates alone — see spotsOnTrace.
//
// Kept free of DOM imports so the build and verify scripts can read the real
// numbers.

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Two beams that lean on each other, four gates",
    emitters: 2,
    gates: 4,
    darkGates: 2,
    maxBounces: 1,
    mirror: false,
    chain: false,
    requireCoupled: true,
    minChanges: 2,
    goalLevels: [0, 1, 3, 4],
    minWindow: 3,
    maxWindow: 26,
    maxSolvedFraction: 0.04,
    minRoutes: 2,
    maxRoutes: 6,
  },
  medium: {
    id: "medium",
    label: "Medium",
    blurb: "Three beams in a chain — solve one to pin the next",
    emitters: 3,
    gates: 5,
    darkGates: 2,
    maxBounces: 1,
    mirror: false,
    chain: true,
    requireCoupled: false,
    goalExtremes: true,  // one goal darkest (0), one lightest (4), third free
    minChanges: 2,
    goalLevels: [0, 1, 3, 4],
    minWindow: 2.5,
    maxWindow: 22,
    maxSolvedFraction: 0.012,
    minRoutes: 2,
    maxRoutes: 8,
  },
  hard: {
    id: "hard",
    label: "Hard",
    blurb: "Three beams, a mirror, and a brightness you must land exactly",
    emitters: 3,
    gates: 6,
    darkGates: 3,
    maxBounces: 1,
    mirror: true,
    chain: true,
    requireCoupled: false,
    goalExtremes: true,
    minChanges: 2,
    goalLevels: [0, 1, 3, 4],
    minWindow: 2,
    maxWindow: 15,
    maxSolvedFraction: 0.005,
    minRoutes: 2,
    maxRoutes: 8,
  },
};

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
export const DEFAULT_DIFFICULTY = "easy";

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}
