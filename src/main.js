// App bootstrap and router.
//
// Builds a persistent shell once — a top banner that never unmounts, plus a
// view swapped between the hub and whichever game is playing. The banner is
// the single escape hatch back to the game list, so no game has to provide its
// own, and it is reachable from any screen a game might show.
//
// Routing is a query parameter (`?game=colorpath`), not a path segment: the
// site is served statically from GitHub Pages, where `/colorpath` would 404
// unless we shipped an SPA fallback page. The parameter survives deep links,
// the back button, and refresh.

import "./styles/global.css";
import { SITE_NAME, GAME_PARAM } from "./config.js";
import { mountHub } from "./hub.js";
import { getGame } from "./core/registry.js";
import "./games/aintaword/index.js";  // side effect: registers the game
import "./games/colorpath/index.js"; // side effect: registers the game
import "./games/wordiamond/index.js"; // side effect: registers the game
import "./games/numburst/index.js";  // side effect: registers the game
import "./games/photonfinish/index.js"; // side effect: registers the game

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

// ── URL ───────────────────────────────────────────────────────────────────

/**
 * The raw game id in the URL, unvalidated. Deliberately not filtered here:
 * goTo() needs to tell "no game requested" from "a game that doesn't exist",
 * because only the latter should rewrite the address bar.
 */
function routedGameId() {
  return new URLSearchParams(location.search).get(GAME_PARAM);
}

function writeUrl(gameId, { replace = false } = {}) {
  const url = new URL(location.href);
  if (gameId) url.searchParams.set(GAME_PARAM, gameId);
  else url.searchParams.delete(GAME_PARAM);
  if (url.href === location.href) return;
  history[replace ? "replaceState" : "pushState"]({ game: gameId ?? null }, "", url);
}

// ── Shell ─────────────────────────────────────────────────────────────────

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

// ── Screens ───────────────────────────────────────────────────────────────

async function showHub() {
  teardown();
  setChrome(null);
  const chosen = await mountHub(view);
  // Resolves only when a card in THIS hub render is clicked; a hub replaced by
  // navigation simply never resolves, so there is no stale-selection race.
  await goTo(chosen.id);
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

/**
 * Navigate to a game (or the hub when `id` is null).
 * @param {string|null} id
 * @param {{push?: boolean, replace?: boolean}} opts push=false when reacting
 *        to the URL rather than driving it (deep link, back button).
 */
async function goTo(id, { push = true, replace = false } = {}) {
  const game = id ? getGame(id) : null;

  if (id && !game) {
    // Unknown game in the URL — strip it rather than leave a dead link in the
    // address bar, and show the hub.
    writeUrl(null, { replace: true });
    return showHub();
  }

  if (push) writeUrl(game ? game.id : null, { replace });
  if (game) await mountGame(game);
  else await showHub();
}

/** Render whatever the current URL says. Used on boot and on back/forward. */
function renderFromUrl() {
  return goTo(routedGameId(), { push: false });
}

brandBtn.addEventListener("click", () => {
  // On the hub the brand is a wordmark, not a control — you are already home.
  if (!bar.classList.contains("is-in-game")) return;
  goTo(null);
});

window.addEventListener("popstate", () => { renderFromUrl(); });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

renderFromUrl();
