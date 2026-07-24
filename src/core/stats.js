// Anonymous, aggregate play analytics — the client half of functions/api/stat.js.
//
// Reports a per-game daily funnel so the site can see which games are played and
// finished, and tune accordingly:
//   • open        — a game was opened today
//   • finish      — a round was finished today
//   • finish_all  — every difficulty for the day was finished
//
// PRIVACY, by construction:
//   • The beacon carries ONLY { day, game, event } — no id, no cookie, no PII.
//   • De-duped ON THIS DEVICE: each (game, event, day) is sent at most once, so a
//     server counter is "distinct devices", never people. Clearing storage or
//     incognito re-counts — the honest cost of storing no identity.
//   • Off entirely when the browser signals Do Not Track / Global Privacy
//     Control, or when the player flips the in-app toggle.
//   • Today only: archive replays of past days never count.
//
// Fire-and-forget via sendBeacon (keepalive fetch fallback); every failure is
// swallowed, so analytics can never affect gameplay.

import { dayResults } from "./history.js";
import { todayKey } from "./daily.js";

const ENDPOINT = "/api/stat";
const OPTOUT_KEY = "aintaword2:stats-optout"; // presence = opted out
const SENT_KEY = "aintaword2:stats-sent";     // { [day]: { "game:event": 1 } }

// ── Consent ──────────────────────────────────────────────────────────────────

/** True when the browser asks not to be tracked (DNT or GPC). */
function browserSignalsNoTrack() {
  try {
    return (
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1" ||
      navigator.globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}

/** Is the browser forcing analytics off (DNT/GPC)? The toggle then reads locked. */
export function statsForcedOff() {
  return browserSignalsNoTrack();
}

/** Is tallying currently on? Off under DNT/GPC or an explicit opt-out. */
export function statsEnabled() {
  if (browserSignalsNoTrack()) return false;
  try {
    return localStorage.getItem(OPTOUT_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Turn the anonymous tally on or off (persisted locally). */
export function setStatsEnabled(on) {
  try {
    if (on) localStorage.removeItem(OPTOUT_KEY);
    else localStorage.setItem(OPTOUT_KEY, "1");
  } catch {
    /* private mode — the preference just won't persist */
  }
}

// ── Per-day de-dup ───────────────────────────────────────────────────────────

function loadSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function alreadySent(day, tag) {
  const all = loadSent();
  return Boolean(all[day] && all[day][tag]);
}

function markSent(day, tag) {
  try {
    const all = loadSent();
    // Keep ONLY the current day, so this record can never grow unbounded.
    const today = { ...(all[day] || {}), [tag]: 1 };
    localStorage.setItem(SENT_KEY, JSON.stringify({ [day]: today }));
  } catch {
    /* ignore */
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────

/** Fire one counter, de-duped per (game, event, day). Silent on every failure. */
function send(day, game, event) {
  if (!statsEnabled()) return;
  const tag = `${game}:${event}`;
  if (alreadySent(day, tag)) return;
  // Mark BEFORE sending: a beacon is fire-and-forget, and double-counting on a
  // retry is worse than losing one on a rare failure.
  markSent(day, tag);

  const body = JSON.stringify({ day, game, event });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch {
    /* fall through to fetch */
  }
  try {
    fetch(ENDPOINT, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Public events ────────────────────────────────────────────────────────────

/**
 * A game was opened. Counts toward "how many played this game today".
 * @param {string} gameId
 * @param {{day?: string|null}} [opts] the routed day; a past day is an archive
 *        replay and is not counted.
 */
export function recordOpen(gameId, { day = null } = {}) {
  const today = todayKey();
  if (day && day !== today) return;
  send(today, gameId, "open");
}

/**
 * A round finished. Emits 'finish', plus 'finish_all' once every difficulty for
 * the day is done — read from the shared store, so it needn't know which
 * difficulty just landed.
 * @param {string} gameId
 * @param {{day?: string|null, difficulties?: string[]}} [opts]
 */
export function recordFinish(gameId, { day = null, difficulties = [] } = {}) {
  const today = todayKey();
  if (day && day !== today) return;
  send(today, gameId, "finish");

  const total = Array.isArray(difficulties) ? difficulties.length : 0;
  if (total > 0) {
    const res = dayResults(gameId, today);
    const done = difficulties.filter((d) => res[d]).length;
    if (done >= total) send(today, gameId, "finish_all");
  }
}
