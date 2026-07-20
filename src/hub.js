// Game hub — the entry point screen.
//
// Renders a card for every registered game and resolves with the descriptor
// of whichever the player selects.  main.js then mounts that game and wires
// up the back-navigation to return here.

import "./styles/hub.css";
import { allGames } from "./core/registry.js";

/**
 * Mount the hub screen into `container`.
 * Returns a Promise that resolves with the selected game descriptor.
 * Also returns a cleanup function via the `onCleanup` callback so the caller
 * can tear down the hub before mounting the game.
 *
 * @param {HTMLElement} container
 * @returns {Promise<object>} resolves with the chosen game descriptor
 */
export function mountHub(container) {
  return new Promise((resolve) => {
    const games = allGames();

    const hub = document.createElement("div");
    hub.className = "hub";

    hub.innerHTML = `
      <header class="hub-header">
        <!-- The site name lives in the persistent banner (see main.js), so this
             heading names the task rather than repeating the brand. -->
        <h1 class="hub-title">Choose a game</h1>
        <p class="hub-subtitle">Today's challenge, one puzzle per difficulty.</p>
      </header>
      <ul class="hub-grid" role="list">
        ${games
          .map(
            (g) => `
          <li>
            <button
              class="hub-card"
              data-id="${escapeAttr(g.id)}"
              style="--card-accent: ${escapeAttr(g.accent || "var(--accent)")}"
            >
              <span class="hub-card-title">${escapeHtml(g.title)}</span>
              <span class="hub-card-tagline">${escapeHtml(g.tagline || "")}</span>
              <span class="hub-card-play" aria-hidden="true">Play →</span>
            </button>
          </li>
        `,
          )
          .join("")}
      </ul>
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
