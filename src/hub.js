// Game hub — the entry point screen.
//
// Renders the collection as titled sections of tiles and resolves with the
// descriptor of whichever the player selects. main.js then mounts that game and
// wires up the back-navigation to return here.

import "./styles/hub.css";
import { allGames } from "./core/registry.js";
import { hubArt } from "./hubArt.js";
import { livePlayedDates } from "./core/history.js";
import { computeStreak } from "./core/streak.js";
import { todayKey } from "./core/daily.js";
import { THEMES, applyTheme, isUnlocked, getThemeId } from "./core/theme.js";

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
 * @returns {Promise<object>} resolves with the chosen game descriptor
 */
export function mountHub(container) {
  return new Promise((resolve) => {
    const games = allGames();

    // A game reports its own "done today" via playedToday(); absent means the
    // game has no notion of completion, so treat it as always fresh. Snapshot
    // it once here so the render and the header count agree.
    const done = new Map(games.map((g) => [g.id, isDone(g)]));
    const doneCount = [...done.values()].filter(Boolean).length;

    // Per-game current streak, computed generically from the shared history
    // store (keyed by the same id) — no per-game hook needed, same as the
    // archive dots. Snapshot once so every card agrees.
    const today = todayKey();
    const streaks = new Map(games.map((g) => [g.id, currentStreak(g, today)]));

    const hub = document.createElement("div");
    hub.className = "hub";

    hub.innerHTML = `
      <header class="hub-header">
        <!-- The site name lives in the persistent banner (see main.js), so this
             heading names the task rather than repeating the brand. -->
        <h1 class="hub-title">Choose a game</h1>
        <p class="hub-subtitle">${progressText(doneCount, games.length)}</p>
        ${themePickerHtml()}
      </header>
      ${groupGames(games).map((s) => sectionHtml(s, done, streaks)).join("")}
    `;

    hub.addEventListener("click", (e) => {
      // Theme swatches live in the same subtree; handle them before card picks.
      const swatch = e.target.closest("[data-theme-id]");
      if (swatch) {
        selectTheme(hub, swatch.dataset.themeId);
        return;
      }
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      const game = games.find((g) => g.id === btn.dataset.id);
      if (!game) return;
      container.innerHTML = "";
      resolve(game);
    });

    container.innerHTML = "";
    container.appendChild(hub);
  });
}

/** True when today's puzzle for this game is done. Missing hook ⇒ never done. */
function isDone(game) {
  try {
    return typeof game.playedToday === "function" && game.playedToday() === true;
  } catch {
    // A game's storage read must never take the whole hub down with it.
    return false;
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

// ── Theme picker (a supporter perk) ─────────────────────────────────────────

function themePickerHtml() {
  const current = getThemeId();
  return `
    <div class="hub-themes" role="group" aria-label="Colour theme">
      ${THEMES.map((t) => themeSwatch(t, current)).join("")}
    </div>
  `;
}

function themeSwatch(t, currentId) {
  const unlocked = isUnlocked(t);
  const selected = t.id === currentId;
  const lock = unlocked ? "" : `<span class="hub-theme-lock" aria-hidden="true">🔒</span>`;
  return `
    <button
      type="button"
      class="hub-theme${selected ? " is-selected" : ""}${unlocked ? "" : " is-locked"}"
      data-theme-id="${escapeAttr(t.id)}"
      style="--swatch: ${escapeAttr(t.swatch)}"
      aria-pressed="${selected}"
      aria-label="${escapeHtml(t.name)} theme${unlocked ? "" : " (supporter)"}"
      title="${escapeHtml(t.name)}${unlocked ? "" : " — supporter theme"}"
    >${lock}</button>
  `;
}

/**
 * Apply an unlocked theme and reflect the choice in the picker. Locked swatches
 * are inert — the lock icon signals they need a supporter entitlement; there is
 * no purchase flow yet, so tonight they simply don't respond for free players.
 */
function selectTheme(hub, id) {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme || !isUnlocked(theme)) return;
  applyTheme(theme.id);
  hub.querySelectorAll(".hub-theme").forEach((b) => {
    const sel = b.dataset.themeId === theme.id;
    b.classList.toggle("is-selected", sel);
    b.setAttribute("aria-pressed", String(sel));
  });
}

function progressText(doneCount, total) {
  if (doneCount === 0) return "Today's challenge, one puzzle per difficulty.";
  if (doneCount === total) return "All done for today — nice. Back tomorrow for more.";
  return `${doneCount} of ${total} done today.`;
}

function sectionHtml(section, done, streaks) {
  return `
    <section class="hub-section">
      <h2 class="hub-section-title">
        ${escapeHtml(section.title)}
        <span class="hub-section-count">${section.games.length}</span>
      </h2>
      <ul class="hub-grid" role="list">
        ${section.games.map((g) => cardHtml(g, done.get(g.id), streaks.get(g.id))).join("")}
      </ul>
    </section>
  `;
}

function cardHtml(g, isPlayed, streak = 0) {
  // A game motif, faded into the tile as a watermark. Games with no motif fall
  // back to their initial letter, so the hub never renders a blank tile.
  const art = hubArt(g.id);
  const decoration = art
    ? `<span class="hub-card-art" aria-hidden="true">${art}</span>`
    : `<span class="hub-card-glyph" aria-hidden="true">${escapeHtml((g.title.trim()[0] || "?").toUpperCase())}</span>`;
  // A finished game keeps its place but reads as spent: desaturated, with a
  // tick. It stays fully clickable — replaying today's board is allowed.
  const tick = isPlayed
    ? `<span class="hub-card-tick" aria-hidden="true">✓</span>`
    : "";
  const doneNote = isPlayed
    ? `<span class="visually-hidden"> — played today</span>`
    : "";
  // A multi-day run gets a flame. Below 2 there's nothing to celebrate (a lone
  // day is just today's ✓), so the badge stays hidden to keep the tile calm.
  const streakBadge = streak >= 2
    ? `<span class="hub-card-streak" aria-label="${streak}-day streak">🔥 ${streak}</span>`
    : "";
  return `
    <li>
      <button
        class="hub-card${isPlayed ? " is-done" : ""}"
        data-id="${escapeAttr(g.id)}"
        style="--card-accent: ${escapeAttr(g.accent || "var(--accent)")}"
      >
        ${decoration}
        ${tick}
        ${streakBadge}
        <span class="hub-card-title">${escapeHtml(g.title)}${doneNote}</span>
        <span class="hub-card-tagline">${escapeHtml(g.tagline || "")}</span>
      </button>
    </li>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
