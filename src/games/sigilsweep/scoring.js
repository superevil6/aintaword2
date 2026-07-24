// Scoring for sigilsweep — pure, so the verifier can assert on it.
//
// A pick is scored on how much of the sweep you were willing to watch. The
// clock is measured in DEGREES SWEPT rather than milliseconds, so changing the
// rotation speed (a feel knob) never silently changes what a sigil is worth.
//
// The decay is exponential with a floor: committing early pays a lot more, but
// a slow-and-right answer still earns. A wrong first pick doesn't cost points
// directly — it costs the multiplier on whatever you eventually find, and the
// clock keeps running while you think again.
//
// THE TRAP THIS IS TUNED AGAINST: if clicking blind is worth about as much as
// watching properly, the game is a coin-flip with extra steps. blindGuessEV()
// below exists so the verifier can hold that line as a shipping gate.

export const BASE = 1000;           // an instant correct pick
export const FLOOR = 150;           // a correct-but-slow pick
export const HALF_LIFE_DEG = 540;   // points halve every this many degrees swept
export const SECOND_GUESS = 0.3;    // multiplier once you have already missed once
export const MAX_GUESSES = 2;

/** What a correct pick is worth right now, before any wrong-guess multiplier. */
export function worthAt(degrees) {
  const decayed = BASE * Math.pow(0.5, Math.max(0, degrees) / HALF_LIFE_DEG);
  return Math.max(FLOOR, Math.round(decayed));
}

/**
 * @param {{correct:boolean, degrees:number, guessIndex:number}} o
 *   guessIndex is 0 for the first pick, 1 for the second.
 * @returns {number} points earned by this pick (never negative)
 */
export function scorePick({ correct, degrees, guessIndex = 0 }) {
  if (!correct) return 0;
  const mult = guessIndex === 0 ? 1 : SECOND_GUESS;
  return Math.round(worthAt(degrees) * mult);
}

/**
 * Expected points from clicking immediately and, if wrong, immediately again —
 * i.e. never watching the sweep at all. Each guess has a 1/options chance of
 * being the hit, so the chances simply add, weighted by their multipliers.
 */
export function blindGuessEV(options) {
  return (BASE / options) * (1 + SECOND_GUESS);
}

/**
 * Expected points from actually solving it, at a given sweep angle and hit rate.
 * Used by the verifier to assert patience pays; not used by the game itself.
 */
export function patientEV(degrees, accuracy = 0.92) {
  return worthAt(degrees) * accuracy;
}
