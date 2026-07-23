// Per-day, per-difficulty result storage for Storey.
//
// Storey ACCUMULATES: your score is the net worth of the tower you built, and
// higher is better (unlike Vanity Plate's golf). A result records that score
// against the day's par, plus how many storeys you managed. Ties on score break
// to the taller tower.

import { todayKey } from "../../core/daily.js";

const KEY = "aintaword2:storey:daily";
const BEST_KEY = "aintaword2:storey:best";

export { todayKey };

/** Deterministic seed for a given day + difficulty — identical for all players. */
export function dailySeedFor(difficulty, day = todayKey()) {
  return `storey:${day}:${difficulty}`;
}

function readToday() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.date !== todayKey()) return null;
    return data;
  } catch {
    return null;
  }
}

// Every reader/writer takes an optional `day`. Only today's puzzle is persisted;
// an archive replay (a past day, a supporter perk) is EPHEMERAL — it reads as
// unplayed and never writes, so replaying an old build can't overwrite today's
// result or pollute the all-time best. Persisting past days is the later
// "completion history" step; until then archive plays are just-for-fun.
function isToday(day) {
  return day === todayKey();
}

export function todaysResults(day = todayKey()) {
  if (!isToday(day)) return {};
  return readToday()?.results || {};
}

/** @returns {{score:number, par:number, stories:number, playedAt:string}|null} */
export function getResult(difficulty, day = todayKey()) {
  return todaysResults(day)[difficulty] || null;
}

export function saveResult(difficulty, { score, par, stories }, day = todayKey()) {
  if (!isToday(day)) return; // ephemeral archive replay — don't persist
  try {
    const data = readToday() || { date: todayKey(), results: {} };
    data.date = todayKey();
    data.results[difficulty] = {
      score,
      par,
      stories,
      playedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

export function bestResult(difficulty) {
  try {
    const raw = localStorage.getItem(`${BEST_KEY}:${difficulty}`);
    if (!raw) return null;
    const best = JSON.parse(raw);
    return typeof best?.score === "number" ? best : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} was it a personal record (higher score, or taller on a tie) */
export function recordBest(difficulty, { score, par, stories }, day = todayKey()) {
  if (!isToday(day)) return false; // archive replays don't set all-time records
  const prev = bestResult(difficulty);
  const better =
    !prev ||
    score > prev.score ||
    (score === prev.score && stories > (prev.stories || 0));
  if (!better) return false;
  try {
    localStorage.setItem(
      `${BEST_KEY}:${difficulty}`,
      JSON.stringify({ score, par, stories }),
    );
  } catch {
    /* ignore */
  }
  return true;
}
