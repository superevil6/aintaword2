// Cross-device history sync — free for everyone.
//
// Ties the per-(game, date) history store (history.js) to /api/sync, keyed by
// an anonymous device "sync code" (src/core/syncCode.js). On start it pulls the
// server's copy and merges it in; after any local play it pushes (debounced).
// Push and pull are the same request — POST the rows, get the full set back,
// merge the reply — so every sync is also a pull, and the store stays a
// conflict-free union.
//
// Fails soft: if sync is disabled server-side (403), the network is down, or the
// code is malformed, it silently no-ops.
//
// Identity is the stored sync code; without one, sync never starts, so a player
// who hasn't opted in never touches the network. Opting in (or linking another
// device's code) sets the code and calls startSync()/restartSync() from the
// sync UI.

import { allGames } from "./registry.js";
import { dayResults, playedDates, mergeDay, onHistoryChange } from "./history.js";
import { getSyncCode } from "./syncCode.js";

const PUSH_DEBOUNCE_MS = 1500;

let started = false;
let unsub = null;
let timer = null;

/** Begin syncing if this device has opted in (holds a sync code). Idempotent. */
export function startSync() {
  if (started) return;
  const code = getSyncCode();
  if (!code) return;
  started = true;
  syncNow(code); // initial pull (+ push of whatever we already hold)
  unsub = onHistoryChange(() => schedulePush(code));
}

/** Stop syncing (e.g. the player unlinked this device). */
export function stopSync() {
  if (unsub) unsub();
  unsub = null;
  clearTimeout(timer);
  timer = null;
  started = false;
}

/** Restart against the current code — call after linking to a new code. */
export function restartSync() {
  stopSync();
  startSync();
}

function schedulePush(code) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(code), PUSH_DEBOUNCE_MS);
}

/** One full-state round-trip: push all local rows, merge the server's reply. */
async function syncNow(code) {
  let data;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: code, results: collectRows() }),
    });
    if (!res.ok) return; // disabled / offline — try again next change
    data = await res.json();
  } catch {
    return;
  }
  if (Array.isArray(data?.results)) applyRows(data.results);
}

/** Every local (game, date) as a sync row; the day's difficulty map rides in
 *  `detail` as JSON, since the server keys one row per (game, date). */
function collectRows() {
  const rows = [];
  for (const g of allGames()) {
    for (const date of playedDates(g.id)) {
      const map = dayResults(g.id, date);
      if (!map || !Object.keys(map).length) continue;
      rows.push({
        game: g.id,
        puzzle_date: date,
        detail: JSON.stringify(map),
        completed_at: latestPlayedAt(map),
        score: null,
      });
    }
  }
  return rows;
}

function applyRows(rows) {
  for (const r of rows) {
    if (!r || typeof r.game !== "string" || typeof r.puzzle_date !== "string") continue;
    if (typeof r.detail !== "string") continue;
    let map;
    try {
      map = JSON.parse(r.detail);
    } catch {
      continue;
    }
    mergeDay(r.game, r.puzzle_date, map);
  }
}

function latestPlayedAt(map) {
  let t = 0;
  for (const v of Object.values(map)) {
    const ms = Date.parse(v?.playedAt || "") || 0;
    if (ms > t) t = ms;
  }
  return t || null;
}
