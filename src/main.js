// App bootstrap.
//
// For now this mounts the single game directly. When a hub page arrives, this
// is the file that would read the URL / registry and decide what to mount —
// the games themselves don't change.

import "./styles/global.css";
import { getGame } from "./core/registry.js";
import "./games/aintaword/index.js"; // side effect: registers the game

const app = document.getElementById("app");

async function boot() {
  app.innerHTML = '<div class="boot">Loading…</div>';
  const game = getGame("aintaword");
  try {
    await game.mount(app, {});
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="boot boot-error">Couldn't start the game.<br><small>${escapeHtml(
      err.message,
    )}</small></div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

boot();
