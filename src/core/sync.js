// Cross-device history sync — a supporter perk.
//
// Ties the per-(game, date) history store (history.js) to /api/sync, keyed by
// the player's Lemon Squeezy license key. On start it pulls the server's copy
// and merges it in; after any local play it pushes (debounced). Push and pull
// are the same request — POST the rows, get the full set back, merge the reply —
// so every sync is also a pull, and the store stays a conflict-free union.
//
// Fails soft: if sync is disabled server-side (403), the key is rejected (401),
// or the network is down, it silently no-ops. So this is safe to run even where
// the endpoint isn't enabled yet (e.g. production until SYNC_ENABLED is set).
//
// Identity is the stored license key; without it (or without a supporter
// entitlement) sync never starts, so free/dev-backdoor players don't touch it.

import { allGames } from "./registry.js";
import { dayResults, playedDates, mergeDay, onHistoryChange } from "./history.js";
import { isSupporter } from "./entitlements.js";

const PUSH_DEBOUNCE_MS = 1500;

let started = false;
let unsub = null;
let timer = null;

function licenseKey() {
  try {
    return localStorage.getItem("aintaword2:license") || "";
  } catch {
    return "";
  }
}

/** Begin syncing if the player is a supporter with a stored key. Idempotent. */
export function startSync() {
  if (started) return;
  const key = licenseKey();
  if (!isSupporter() || !key) return;
  started = true;
  syncNow(key); // initial pull (+ push of whatever we already hold)
  unsub = onHistoryChange(() => schedulePush(key));
}

/** Stop syncing (e.g. supporter status removed). */
export function stopSync() {
  if (unsub) unsub();
  unsub = null;
  clearTimeout(timer);
  timer = null;
  started = false;
}

function schedulePush(key) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(key), PUSH_DEBOUNCE_MS);
}

/** One full-state round-trip: push all local rows, merge the server's reply. */
async function syncNow(key) {
  let data;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, results: collectRows() }),
    });
    if (!res.ok) return; // disabled / unauthorised / offline — try again next change
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
