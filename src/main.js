// App bootstrap.
//
// Builds a persistent shell once — a top banner that never unmounts, plus a
// view that gets swapped between the hub and whichever game is playing. The
// banner is the single escape hatch back to the game list, so no game has to
// provide its own, and it is reachable from any screen a game might show
// (mid-puzzle, results, its own difficulty picker).

import "./styles/global.css";
import { SITE_NAME } from "./config.js";
import { mountHub } from "./hub.js";
import "./games/aintaword/index.js";  // side effect: registers the game
import "./games/colorpath/index.js"; // side effect: registers the game

const app = document.getElementById("app");

const bar = document.createElement("header");
bar.className = "app-bar";
bar.innerHTML = `
  <button class="app-brand" type="button">
    <span class="app-brand-arrow" aria-hidden="true">←</span>
    <span class="app-brand-name"></span>
  </button>
  <span class="app-current"></span>
`;

const view = document.createElement("div");
view.className = "app-view";

app.append(bar, view);

const brandBtn  = bar.querySelector(".app-brand");
const currentEl = bar.querySelector(".app-current");
bar.querySelector(".app-brand-name").textContent = SITE_NAME;

let cleanup = null;

brandBtn.addEventListener("click", () => {
  // On the hub the brand is a wordmark, not a control — you are already home.
  if (!bar.classList.contains("is-in-game")) return;
  showHub();
});

/** Point the banner at whichever screen is showing. */
function setChrome(gameTitle) {
  const inGame = Boolean(gameTitle);
  bar.classList.toggle("is-in-game", inGame);
  brandBtn.setAttribute(
    "aria-label",
    inGame ? `${SITE_NAME} — back to the game list` : SITE_NAME,
  );
  if (inGame) brandBtn.removeAttribute("aria-current");
  else brandBtn.setAttribute("aria-current", "page");
  currentEl.textContent = gameTitle ?? "";
}

function teardown() {
  if (typeof cleanup === "function") cleanup();
  cleanup = null;
}

async function showHub() {
  teardown();
  setChrome(null);
  const game = await mountHub(view);
  await mountGame(game);
}

async function mountGame(game) {
  teardown();
  setChrome(game.title);
  view.innerHTML = "";
  try {
    cleanup = await game.mount(view, {});
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="boot boot-error">Couldn't start the game.<br><small>${escapeHtml(
      err.message,
    )}</small></div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

showHub();
