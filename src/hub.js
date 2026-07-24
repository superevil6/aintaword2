// Game hub — the entry point screen.
//
// Renders the collection as titled sections of tiles and resolves with the
// descriptor of whichever the player selects. main.js then mounts that game and
// wires up the back-navigation to return here.

import "./styles/hub.css";
import { allGames } from "./core/registry.js";
import { hubArt } from "./hubArt.js";
import { livePlayedDates, dayResults } from "./core/history.js";
import { computeStreak } from "./core/streak.js";
import { todayKey } from "./core/daily.js";
import { formatDay } from "./core/archive.js";
import { statsEnabled, setStatsEnabled, statsForcedOff } from "./core/stats.js";

// Display sections, in order. A game lands in the FIRST section whose `match`
// returns true, so the catch-all stays last. Grouping keeps the hub scannable
// as the collection grows past a screenful: a player scans two headings, not
// nine identical cards. The buckets key off the same `tags` that drive the
// post-game cross-sell, so there is one taxonomy, not two.
const SECTIONS = [
  {
    title: "Word games",
    match: (g) => (g.tags || []).includes("word"),
  },
  {
    title: "Logic & color",
    match: () => true,
  },
];

/** Bucket games into their sections, dropping any section that ends up empty. */
function groupGames(games) {
  const buckets = SECTIONS.map((s) => ({ ...s, games: [] }));
  for (const g of games) {
    const bucket = buckets.find((b) => b.match(g));
    if (bucket) bucket.games.push(g);
  }
  return buckets.filter((b) => b.games.length > 0);
}

/**
 * Mount the hub screen into `container`.
 * Returns a Promise that resolves with the selected game descriptor.
 *
 * @param {HTMLElement} container
 * @param {object}   [opts]
 * @param {string}  [opts.day]           an archive date (YYYY-MM-DD) to view, or
 *          null for today's live board. In archive mode the header becomes an
 *          "Archive for <date>" banner and the marks reflect THAT day.
 * @param {Function}[opts.onExitArchive]  called when the player leaves archive mode.
 * @param {Function}[opts.onOpenArchive]  called to (re)open the date calendar.
 * @returns {Promise<object>} resolves with the chosen game descriptor
 */
export function mountHub(container, { day = null, onExitArchive, onOpenArchive } = {}) {
  return new Promise((resolve) => {
    const games = allGames();
    const today = todayKey();
    const archive = Boolean(day);
    const viewDay = day || today;

    // Completion for the day in view, read generically from the shared history
    // store: 'all' = every difficulty done, 'some' = at least one, 'none' = not
    // touched. Same source for today and for any archived date.
    const marks = new Map(games.map((g) => [g.id, markFor(g, viewDay)]));
    const playedCount = [...marks.values()].filter((m) => m !== "none").length;

    // A streak is an "as of now" fact; pinned to a past archive date it would
    // mislead, so the flames only show on today's board.
    const streaks = archive
      ? null
      : new Map(games.map((g) => [g.id, currentStreak(g, today)]));

    const hub = document.createElement("div");
    hub.className = "hub";
    hub.innerHTML = `
      ${archive
        ? archiveHeaderHtml(day, playedCount, games.length)
        : liveHeaderHtml(playedCount, games.length)}
      ${groupGames(games).map((s) => sectionHtml(s, marks, streaks)).join("")}
      ${footerHtml()}
    `;

    hub.addEventListener("click", (e) => {
      // Archive controls share the subtree; handle them before game picks.
      if (e.target.closest("[data-archive-today]")) { onExitArchive?.(); return; }
      if (e.target.closest("[data-archive-open]")) { onOpenArchive?.(); return; }
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      const game = games.find((g) => g.id === btn.dataset.id);
      if (!game) return;
      container.innerHTML = "";
      resolve(game);
    });

    hub.addEventListener("change", (e) => {
      const toggle = e.target.closest("[data-stats-toggle]");
      if (toggle) setStatsEnabled(toggle.checked);
    });

    container.innerHTML = "";
    container.appendChild(hub);
  });
}

/**
 * How much of a game's day is done: "all" (every difficulty), "some" (≥1), or
 * "none". Reads the shared per-date store, so it works for today or any archive
 * day without a per-game hook. `difficulties` on the descriptor names the full
 * set; a game without one can only reach "some".
 */
function markFor(game, day) {
  try {
    const res = dayResults(game.id, day);
    const diffs = Array.isArray(game.difficulties) ? game.difficulties : [];
    const doneN = diffs.filter((d) => res[d]).length;
    if (diffs.length > 0 && doneN >= diffs.length) return "all";
    if (doneN > 0 || Object.keys(res).length > 0) return "some";
    return "none";
  } catch {
    // A storage read must never take the whole hub down with it.
    return "none";
  }
}

/** Current live-play streak for a game, from the shared store; 0 on any error. */
function currentStreak(game, today) {
  try {
    return computeStreak(livePlayedDates(game.id), today).current;
  } catch {
    return 0;
  }
}

function liveHeaderHtml(playedCount, total) {
  return `
    <header class="hub-header">
      <!-- The site name lives in the persistent banner (see main.js), so this
           heading names the task rather than repeating the brand. -->
      <h1 class="hub-title">Choose a game</h1>
      <p class="hub-subtitle">${progressText(playedCount, total)}</p>
    </header>
  `;
}

function archiveHeaderHtml(day, playedCount, total) {
  const played = playedCount === 0
    ? "Nothing played on this day yet."
    : `${playedCount} of ${total} played on this day.`;
  return `
    <header class="hub-header">
      <div class="hub-archive">
        <button class="hub-archive-chip" type="button" data-archive-open
                aria-label="Change archive date">
          <span class="hub-archive-cal" aria-hidden="true">📅</span>
          <span class="hub-archive-eyebrow">Archive for</span>
          <span class="hub-archive-date">${escapeHtml(formatDay(day))}</span>
        </button>
        <button class="hub-archive-today" type="button" data-archive-today>
          ← Back to today
        </button>
      </div>
      <p class="hub-subtitle">${played}</p>
    </header>
  `;
}

function progressText(playedCount, total) {
  if (playedCount === 0) return "Today's challenge, one puzzle per difficulty.";
  if (playedCount === total) return "All done for today — nice. Back tomorrow for more.";
  return `${playedCount} of ${total} done today.`;
}

function sectionHtml(section, marks, streaks) {
  return `
    <section class="hub-section">
      <h2 class="hub-section-title">
        ${escapeHtml(section.title)}
        <span class="hub-section-count">${section.games.length}</span>
      </h2>
      <ul class="hub-grid" role="list">
        ${section.games
          .map((g) => cardHtml(g, marks.get(g.id), streaks ? streaks.get(g.id) : 0))
          .join("")}
      </ul>
    </section>
  `;
}

function cardHtml(g, mark = "none", streak = 0) {
  // A game motif, faded into the tile as a watermark. Games with no motif fall
  // back to their initial letter, so the hub never renders a blank tile.
  const art = hubArt(g.id);
  const decoration = art
    ? `<span class="hub-card-art" aria-hidden="true">${art}</span>`
    : `<span class="hub-card-glyph" aria-hidden="true">${escapeHtml((g.title.trim()[0] || "?").toUpperCase())}</span>`;
  const played = mark !== "none";
  // A played game keeps its place but reads as spent: desaturated, with a mark.
  // A star means every difficulty was cleared; a tick means at least one was.
  // It stays fully clickable — replaying that day's board is allowed.
  const badge = mark === "all"
    ? `<span class="hub-card-tick is-all" aria-hidden="true">★</span>`
    : mark === "some"
    ? `<span class="hub-card-tick" aria-hidden="true">✓</span>`
    : "";
  const doneNote = mark === "all"
    ? `<span class="visually-hidden"> — all difficulties done</span>`
    : mark === "some"
    ? `<span class="visually-hidden"> — played</span>`
    : "";
  // A multi-day run gets a flame. Below 2 there's nothing to celebrate (a lone
  // day is just today's ✓), so the badge stays hidden to keep the tile calm.
  const streakBadge = streak >= 2
    ? `<span class="hub-card-streak" aria-label="${streak}-day streak">🔥 ${streak}</span>`
    : "";
  return `
    <li>
      <button
        class="hub-card${played ? " is-done" : ""}"
        data-id="${escapeAttr(g.id)}"
        style="--card-accent: ${escapeAttr(g.accent || "var(--accent)")}"
      >
        ${decoration}
        ${badge}
        ${streakBadge}
        <span class="hub-card-title">${escapeHtml(g.title)}${doneNote}</span>
        <span class="hub-card-tagline">${escapeHtml(g.tagline || "")}</span>
      </button>
    </li>
  `;
}

/**
 * Footer with the anonymous-stats opt-out. The tally sends only per-game daily
 * counts, no identity (see core/stats.js); this is the visible off switch. When
 * the browser signals Do Not Track the toggle reads locked-off.
 */
function footerHtml() {
  const forced = statsForcedOff();
  const on = statsEnabled();
  const note = forced
    ? "Off — your browser's Do Not Track is on."
    : "Anonymous per-game counts only — no accounts, no tracking, no personal data.";
  return `
    <footer class="hub-footer">
      <label class="hub-stat">
        <input type="checkbox" class="hub-stat-input" data-stats-toggle
               ${on ? "checked" : ""} ${forced ? "disabled" : ""} />
        <span class="hub-stat-track" aria-hidden="true"></span>
        <span class="hub-stat-label">Anonymous play stats</span>
      </label>
      <p class="hub-foot-note">${note}</p>
    </footer>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
