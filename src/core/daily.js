// The canonical "today" for every daily puzzle in the collection.
//
// UTC (not local time) so that everyone in the world is on the same puzzle at
// the same moment — two friends comparing results across a timezone border
// would otherwise be playing different boards on the same calendar date. The
// tradeoff is that the day rolls over mid-evening for some players.
//
// This is the ONE place that decision lives; switch to local dates here if
// you'd rather match the player's calendar. Note core/rng.js also exports a
// `dailySeed()` that formats a LOCAL date — that one predates this module and
// is not used for daily puzzles.

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}
