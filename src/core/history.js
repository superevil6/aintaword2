// Per-(game, date) result history — the persistent record of every daily a
// player has completed. One uniform store for all games, replacing each game's
// old single-day, self-pruning blob.
//
// WHY this exists as shared core, not per-game:
//   • the archive calendar (core/archive.js) needs "which dates did this game
//     complete?" without knowing anything game-specific — playedDates(gameId)
//     answers it generically;
//   • it is the exact data model the future cross-device sync perk pushes to D1
//     (see the publish-backend plan) — one place to read/write all history.
//
// SCHEMA (localStorage), one key per game, reusing the old key for a seamless
// in-place upgrade:
//   aintaword2:<gameId>:daily  →  { v: 1, days: { [date]: <resultsMap> } }
// where <resultsMap> is the game's own { [difficultyId]: resultObject } — the
// SAME shape the old blob stored under `.results`, just now kept per day instead
// of only for today. The result payload is opaque here; each game owns its shape.
//
// MIGRATION is non-destructive and lazy: read() understands the old
// { date, results } blob and folds it into { days: { [date]: results } } on the
// fly; the first write persists the new shape. Nothing is lost, no upgrade step.
//
// GROWTH: entries are tiny (a few small objects per day) and never pruned — years
// of daily play stay well inside the localStorage budget, and this is the sync
// source of truth, so we keep it whole rather than trimming history.

import { todayKey } from "./daily.js";

const KEY = (gameId) => `aintaword2:${gameId}:daily`;

/** @returns {{days: Object<string, Object>}} always a usable object. */
function read(gameId) {
  try {
    const raw = localStorage.getItem(KEY(gameId));
    if (!raw) return { days: {} };
    const data = JSON.parse(raw);
    // New shape.
    if (data && data.days && typeof data.days === "object") return { days: data.days };
    // Old single-day blob { date, results } → fold into the per-day map.
    if (data && typeof data.date === "string" && data.results) {
      return { days: { [data.date]: data.results } };
    }
    return { days: {} };
  } catch {
    // Private mode / quota / corrupt blob — an empty history is the safe default.
    return { days: {} };
  }
}

function write(gameId, data) {
  try {
    localStorage.setItem(KEY(gameId), JSON.stringify({ v: 1, days: data.days }));
  } catch {
    /* private mode / quota — the run just won't persist */
  }
}

/**
 * The results map for one day — `{ [difficultyId]: resultObject }`, or `{}` if
 * that day has no completions. This is what a game's `todaysResults(day)` returns.
 */
export function dayResults(gameId, day = todayKey()) {
  return read(gameId).days[day] || {};
}

/** One difficulty's stored result for a day, or null. */
export function getResult(gameId, difficulty, day = todayKey()) {
  return dayResults(gameId, day)[difficulty] || null;
}

/**
 * Persist one difficulty's result for a day, merging into whatever else that day
 * already holds. Works for ANY day: today or an archive replay — a past day is
 * stored under its own date and can never overwrite today's entry.
 */
export function putResult(gameId, difficulty, result, day = todayKey()) {
  const data = read(gameId);
  const dayMap = data.days[day] || (data.days[day] = {});
  dayMap[difficulty] = result;
  write(gameId, data);
}

/**
 * Every date (YYYY-MM-DD) with at least one completed result for this game —
 * i.e. the dates the archive calendar should mark as played. Order is arbitrary.
 */
export function playedDates(gameId) {
  return Object.keys(read(gameId).days);
}
