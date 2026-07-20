// App bootstrap.
//
// Shows the hub (game select) screen first. Selecting a game mounts it with a
// back button that returns to the hub. Games themselves don't change — the hub
// just calls mount() on whichever descriptor the player picks.

import "./styles/global.css";
import { mountHub } from "./hub.js";
import "./games/aintaword/index.js";  // side effect: registers the game
import "./games/colorpath/index.js"; // side effect: registers the game

const app = document.getElementById("app");

async function showHub() {
  const game = await mountHub(app);
  await mountGame(game);
}

async function mountGame(game) {
  // Inject a back button above the game container
  app.innerHTML = "";

  const backBar = document.createElement("div");
  backBar.className = "back-bar";
  backBar.innerHTML = `<button class="back-btn" aria-label="Back to game list">← All Games</button>`;
  app.appendChild(backBar);

  const gameContainer = document.createElement("div");
  gameContainer.className = "game-container";
  app.appendChild(gameContainer);

  let cleanup;
  try {
    cleanup = await game.mount(gameContainer, {});
  } catch (err) {
    console.error(err);
    gameContainer.innerHTML = `<div class="boot boot-error">Couldn't start the game.<br><small>${escapeHtml(
      err.message,
    )}</small></div>`;
  }

  backBar.querySelector(".back-btn").addEventListener("click", () => {
    if (typeof cleanup === "function") cleanup();
    showHub();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

showHub();
