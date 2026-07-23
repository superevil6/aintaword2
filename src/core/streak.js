// Streak math — pure functions over a set of "live-played" day keys.
//
// A streak is a run of consecutive calendar days (UTC, YYYY-MM-DD) the player
// completed. Input is the LIVE-played dates (see history.livePlayedDates): days
// played on their own day, so archive backfill can't manufacture a streak.
//
// Kept dependency-free and side-effect-free so it's trivially testable and so the
// same logic can run server-side later if streaks ever move into synced stats.

/** Shift a YYYY-MM-DD key by whole days in UTC. */
function shift(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * @param {Iterable<string>} liveDates  dates completed live (any order)
 * @param {string} today                the day treated as "today" (YYYY-MM-DD)
 * @returns {{current:number, longest:number}}
 *   current — the run ending today, OR ending yesterday when today isn't played
 *     yet (the streak is still alive, just not extended). 0 once a day is missed.
 *   longest — the longest consecutive run ever recorded.
 */
export function computeStreak(liveDates, today) {
  const set = liveDates instanceof Set ? liveDates : new Set(liveDates);

  // Current: anchor on today if played, else yesterday (still-alive grace), else
  // there is no live run ending at/near now.
  let anchor = null;
  if (set.has(today)) anchor = today;
  else if (set.has(shift(today, -1))) anchor = shift(today, -1);

  let current = 0;
  for (let d = anchor; d && set.has(d); d = shift(d, -1)) current++;

  // Longest: count each maximal run once, starting where the prior day is absent.
  let longest = 0;
  for (const day of set) {
    if (set.has(shift(day, -1))) continue; // not the start of a run
    let len = 0;
    for (let d = day; set.has(d); d = shift(d, 1)) len++;
    if (len > longest) longest = len;
  }

  return { current, longest };
}
