// Per-day, per-difficulty result storage.
//
// Each difficulty is a once-a-day run: playing it records the result, and
// re-selecting it shows that result rather than starting over. Everything is
// keyed to a single day and self-prunes — if the stored date isn't today, the
// whole blob is treated as empty, so localStorage never accumulates history.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:aintaword:daily";
const BEST_KEY = "aintaword2:aintaword:best";

// Re-exported so existing callers (game.js, index.js, scripts/e2e.mjs) keep
// importing it from here; the definition now lives in core/daily.js so both
// games share one notion of when the day rolls over.
export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `aintaword:${day}:${difficulty}`;
}

function readToday() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Stale day → treat as no results, and let the next write overwrite it.
    if (!data || data.date !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

// Every reader/writer takes an optional `day`. Only today's puzzle is persisted;
// an archive replay (a past day, a supporter perk) is EPHEMERAL — it reads as
// unplayed and never writes, so replaying an old run can't overwrite today's
// result or pollute the all-time best. Persisting past days is the later
// "completion history" step; until then archive plays are just-for-fun.
function isToday(day) {
  return day === todayKey();
}

/** All of today's results, keyed by difficulty id. */
export function todaysResults(day = todayKey()) {
  if (!isToday(day)) return {};
  return readToday()?.results || {};
}

/** @returns {{score:number, history:Array, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return todaysResults(day)[difficulty] || null;
}

export function hasPlayed(difficulty, day = todayKey()) {
  return getResult(difficulty, day) != null;
}

export function saveResult(difficulty, { score, history }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = {
      score,
      // Only what the review list and share text need.
      history: history.map((r) => ({ real: r.real, fake: r.fake, correct: r.correct })),
      playedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

// --- all-time best, per difficulty ---------------------------------------

export function bestScore(difficulty) {
  try {
    return parseInt(localStorage.getItem(`${BEST_KEY}:${difficulty}`) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

/** Records a new best if it beats the old one. @returns {boolean} was it a record */
export function recordBest(difficulty, score, day = todayKey()) {
  if (!isToday(day)) return false; // archive replays don't set all-time records
  const prev = bestScore(difficulty);
  if (score <= prev) return false;
  try {
    localStorage.setItem(`${BEST_KEY}:${difficulty}`, String(score));
  } catch {
    /* ignore */
  }
  return true;
}
