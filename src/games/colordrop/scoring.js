// Scoring for colordrop — pure, so the verifier can assert on it.
//
// A drop is scored on THINK TIME: the clock runs from the moment the board is
// shown to the moment the player commits a chute. Fast + correct pays most;
// the reward decays to a floor so a slow-but-right answer still earns. A wrong
// drop costs a flat penalty — that speed/accuracy tension is the whole game.
//
// The fall animation itself is not part of think time (the drop is timestamped
// on commit, before the ball moves).

export const BASE = 1000;      // reward for an instant correct drop
export const FLOOR = 150;      // minimum for a correct-but-slow drop
export const DECAY_MS = 10;    // lose one point per this many ms of thinking
export const PENALTY = 100;    // flat cost of a wrong drop

/**
 * @param {{correct:boolean, elapsedMs:number}} o
 * @returns {number} points for this board (may be negative)
 */
export function scoreDrop({ correct, elapsedMs }) {
  if (!correct) return -PENALTY;
  const decayed = BASE - Math.floor(Math.max(0, elapsedMs) / DECAY_MS);
  return Math.max(FLOOR, decayed);
}
