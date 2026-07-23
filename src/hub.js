// Game hub — the entry point screen.
//
// Renders the collection as titled sections of tiles and resolves with the
// descriptor of whichever the player selects. main.js then mounts that game and
// wires up the back-navigation to return here.

import "./styles/hub.css";
import { allGames } from "./core/registry.js";
import { hubArt } from "./hubArt.js";

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

    const hub = document.createElement("div");
    hub.className = "hub";

    hub.innerHTML = `
      <header class="hub-header">
        <!-- The site name lives in the persistent banner (see main.js), so this
             heading names the task rather than repeating the brand. -->
        <h1 class="hub-title">Choose a game</h1>
        <p class="hub-subtitle">${progressText(doneCount, games.length)}</p>
      </header>
      ${groupGames(games).map((s) => sectionHtml(s, done)).join("")}
    `;

    hub.addEventListener("click", (e) => {
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

function progressText(doneCount, total) {
  if (doneCount === 0) return "Today's challenge, one puzzle per difficulty.";
  if (doneCount === total) return "All done for today — nice. Back tomorrow for more.";
  return `${doneCount} of ${total} done today.`;
}

function sectionHtml(section, done) {
  return `
    <section class="hub-section">
      <h2 class="hub-section-title">
        ${escapeHtml(section.title)}
        <span class="hub-section-count">${section.games.length}</span>
      </h2>
      <ul class="hub-grid" role="list">
        ${section.games.map((g) => cardHtml(g, done.get(g.id))).join("")}
      </ul>
    </section>
  `;
}

function cardHtml(g, isPlayed) {
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
  return `
    <li>
      <button
        class="hub-card${isPlayed ? " is-done" : ""}"
        data-id="${escapeAttr(g.id)}"
        style="--card-accent: ${escapeAttr(g.accent || "var(--accent)")}"
      >
        ${decoration}
        ${tick}
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
