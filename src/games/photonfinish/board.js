// Photon Finish — getting a puzzle.
//
// Boards are generated offline (npm run photonfinish:daily) and shipped as a
// data file. That file is ~0.5 MB, so it is NOT imported statically here —
// that would fold it into the main bundle and every visitor would download
// every Photon Finish board just to load the hub. Instead index.js imports it
// on demand when the game mounts and hands it to `setPuzzleData`, exactly as
// Wordiamond loads its pools. Until that happens these lookups throw, which is
// the honest signal that mount() has not run.

import { todayKey } from "../../core/daily.js";

let PUZZLES = null;

/** Install the day → tier → board table. Called from mount() and from tests. */
export function setPuzzleData(data) {
  PUZZLES = data;
}

export function availableDays() {
  return PUZZLES ? Object.keys(PUZZLES).sort() : [];
}

function requireData() {
  if (!PUZZLES) throw new Error("photonfinish: puzzle data not loaded — call setPuzzleData first");
}

/**
 * The board for a day and tier.
 *
 * Falls back to the most recent day that HAS a board rather than failing, so
 * running past the end of the built range degrades to replaying the last day
 * instead of showing an error to everyone at once. The build script is what
 * keeps that from happening; this is the seatbelt.
 */
export function getPuzzle(difficulty, day = todayKey()) {
  requireData();
  const days = availableDays();
  if (!days.length) throw new Error("photonfinish: no puzzle data — run npm run photonfinish:daily");

  let key = PUZZLES[day]?.[difficulty] ? day : null;
  if (!key) {
    const past = days.filter((d) => d <= day);
    key = (past.length ? past : days)[past.length ? past.length - 1 : 0];
  }

  const puzzle = PUZZLES[key]?.[difficulty];
  if (!puzzle) throw new Error(`photonfinish: no ${difficulty} board for ${day}`);
  return { ...puzzle, day: key, difficulty };
}

/**
 * A board that is not today's, for the "another board" button.
 *
 * Drawn from the same verified file rather than generated on the spot: a
 * practice board built to a weaker standard than the daily would quietly
 * teach the wrong thing about how hard the game is.
 */
export function getPracticePuzzle(difficulty, exceptDay, pick = Math.random) {
  requireData();
  const days = availableDays().filter((d) => PUZZLES[d]?.[difficulty] && d !== exceptDay);
  if (!days.length) return getPuzzle(difficulty, exceptDay);
  const day = days[Math.floor(pick() * days.length) % days.length];
  return { ...PUZZLES[day][difficulty], day, difficulty };
}
