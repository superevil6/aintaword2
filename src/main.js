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
import { SITE_NAME, GAME_PARAM, DAY_PARAM, ARCHIVE_START } from "./config.js";
import { mountHub } from "./hub.js";
import { getGame, relatedGames } from "./core/registry.js";
import { ROUND_COMPLETE } from "./core/lifecycle.js";
import { isSupporter, onChange, installDevBackdoor } from "./core/entitlements.js";
import { initTheme } from "./core/theme.js";
import { mountThemeControl } from "./themeControl.js";
import { openArchive, formatDay } from "./core/archive.js";
import { todayKey } from "./core/daily.js";
import { playedDates } from "./core/history.js";
import "./games/aintaword/index.js";  // side effect: registers the game
import "./games/colorpath/index.js"; // side effect: registers the game
import "./games/wordiamond/index.js"; // side effect: registers the game
import "./games/numburst/index.js";  // side effect: registers the game
import "./games/photonfinish/index.js"; // side effect: registers the game
import "./games/vanityplate/index.js"; // side effect: registers the game
import "./games/rootword/index.js";  // side effect: registers the game
import "./games/mirrorword/index.js"; // side effect: registers the game
import "./games/storey/index.js";    // side effect: registers the game

const app = document.getElementById("app");

const bar = document.createElement("header");
bar.className = "app-bar";
bar.innerHTML = `
  <button class="app-brand" type="button">
    <span class="app-brand-arrow" aria-hidden="true">←</span>
    <span class="app-brand-name"></span>
  </button>
  <span class="app-current"></span>
  <button class="app-archive" type="button" hidden>
    <span aria-hidden="true">📅</span>
    <span class="app-archive-label">Archive</span>
  </button>
  <span class="app-supporter" hidden>★ Supporter</span>
`;

const view = document.createElement("div");
view.className = "app-view";

app.append(bar, view);

const brandBtn  = bar.querySelector(".app-brand");
const currentEl = bar.querySelector(".app-current");
const supporterEl = bar.querySelector(".app-supporter");
const archiveBtn = bar.querySelector(".app-archive");
const archiveLabelEl = bar.querySelector(".app-archive-label");
bar.querySelector(".app-brand-name").textContent = SITE_NAME;

// Theme control lives at the head of the right-hand cluster (before archive and
// the supporter badge). Its expanded palette grows leftward into the gap the
// title's margin-right:auto opens up, so it never covers the other controls.
const themeControl = mountThemeControl(bar, archiveBtn);

// ── Supporter state ─────────────────────────────────────────────────────────
//
// The badge is the one visible signal that an entitlement is held. It reflects
// the entitlements module and updates live, so flipping the dev backdoor (or, at
// publish, activating a real license key) is observable without a reload.
// In dev the backdoor exposes ?supporter=1 and wg.setSupporter() for testing.
if (import.meta.env.DEV) installDevBackdoor();

// Re-assert the theme now that entitlements are known (the inline head script
// applied it flash-free but couldn't check the supporter gate).
initTheme();

// Re-evaluate the supporter badge, archive button, and theme whenever
// entitlements change, so the perks light up (or go dark) live.
onChange(() => {
  supporterEl.hidden = !isSupporter();
  syncArchiveButton();
  initTheme();
  // Supporter themes may have just unlocked (or locked) — re-render the swatches.
  themeControl.refresh();
});
supporterEl.hidden = !isSupporter();

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

/** The raw ?day= value in the URL, unvalidated (normalizeDay does that). */
function routedDay() {
  return new URLSearchParams(location.search).get(DAY_PARAM);
}

/**
 * A day the archive may replay, or null for "today's puzzle". Guards the format,
 * clamps to [ARCHIVE_START, today], and treats today itself as null so the URL
 * never carries a redundant ?day= for the live puzzle. Lexical compare is valid
 * for YYYY-MM-DD.
 */
function normalizeDay(raw) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const today = todayKey();
  if (raw < ARCHIVE_START || raw > today || raw === today) return null;
  return raw;
}

function writeUrl(gameId, { replace = false, day = null } = {}) {
  const url = new URL(location.href);
  if (gameId) url.searchParams.set(GAME_PARAM, gameId);
  else url.searchParams.delete(GAME_PARAM);
  if (gameId && day) url.searchParams.set(DAY_PARAM, day);
  else url.searchParams.delete(DAY_PARAM);
  if (url.href === location.href) return;
  history[replace ? "replaceState" : "pushState"](
    { game: gameId ?? null, day: day ?? null },
    "",
    url,
  );
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

/**
 * Reflect archive availability and state in the bar button. Shown only while in
 * a game and holding a supporter entitlement; when a past day is being viewed it
 * flips to an active chip naming that day. Reads the URL — the same source the
 * router trusts — so it's correct after any navigation.
 */
function syncArchiveButton() {
  const gameId = routedGameId();
  const inGame = Boolean(gameId && getGame(gameId));
  const show = inGame && isSupporter();
  archiveBtn.hidden = !show;
  if (!show) return;

  const day = normalizeDay(routedDay());
  archiveBtn.classList.toggle("is-active", Boolean(day));
  archiveLabelEl.textContent = day ? formatDay(day) : "Archive";
  archiveBtn.setAttribute(
    "aria-label",
    day ? `Viewing ${formatDay(day)} — open archive` : "Open puzzle archive",
  );
}

// Opening the calendar and, on a pick, re-routing the current game to that day.
// Picking today (or the current day) resolves to today's key → day cleared, so
// the same button doubles as the way back to the live puzzle.
archiveBtn.addEventListener("click", async () => {
  const gameId = routedGameId();
  if (!gameId || !getGame(gameId)) return;
  const picked = await openArchive({
    start: ARCHIVE_START,
    today: todayKey(),
    current: normalizeDay(routedDay()) || todayKey(),
    // Uniform history store is keyed by the same id the router uses, so the
    // shell can mark completed days without any per-game hook.
    played: playedDates(gameId),
  });
  if (picked == null) return; // dismissed
  goTo(gameId, { day: normalizeDay(picked) });
});

function teardown() {
  if (typeof cleanup === "function") cleanup();
  cleanup = null;
  clearCrossSell();
}

// ── Cross-sell ──────────────────────────────────────────────────────────────
//
// A game finishing a round is the one moment we know a player is enjoying the
// collection. Rather than bounce them to the flat hub grid, the shell floats a
// slim "play one more" pill pointing at a related game. It lives here, not in
// any game, because the shell is the only thing that knows about routing and
// the sibling games — a game just announces ROUND_COMPLETE from its own root.

let crossSellEl = null;

function clearCrossSell() {
  if (crossSellEl) crossSellEl.remove();
  crossSellEl = null;
}

function showCrossSell() {
  clearCrossSell();

  // Which game just finished is whatever the URL says — the same source the
  // router trusts. No game reports its own id, keeping the announce trivial.
  const currentId = routedGameId();
  const [next] = currentId ? relatedGames(currentId, 1) : [];
  if (!next) return;

  const strip = document.createElement("div");
  strip.className = "cross-sell";
  strip.style.setProperty("--card-accent", next.accent || "var(--accent)");
  strip.innerHTML = `
    <span class="cross-sell-lead">One more?</span>
    <button class="cross-sell-go" type="button">
      <span class="cross-sell-name"></span>
      <span class="cross-sell-tag"></span>
    </button>
    <button class="cross-sell-dismiss" type="button" aria-label="Dismiss">✕</button>
  `;
  strip.querySelector(".cross-sell-name").textContent = next.title;
  strip.querySelector(".cross-sell-tag").textContent = next.tagline || "";
  strip.querySelector(".cross-sell-go").addEventListener("click", () => goTo(next.id));
  strip.querySelector(".cross-sell-dismiss").addEventListener("click", clearCrossSell);

  app.appendChild(strip);
  crossSellEl = strip;
}

// A round-complete bubbles up from the playing game's root to the view. Games
// mount inside `view`, so one listener here catches every game's finish.
view.addEventListener(ROUND_COMPLETE, showCrossSell);

// ── Screens ───────────────────────────────────────────────────────────────

async function showHub() {
  teardown();
  setChrome(null);
  const chosen = await mountHub(view);
  // Resolves only when a card in THIS hub render is clicked; a hub replaced by
  // navigation simply never resolves, so there is no stale-selection race.
  await goTo(chosen.id);
}

async function mountGame(game, { day = null } = {}) {
  teardown();
  setChrome(game.title);
  view.innerHTML = "";
  try {
    // `day` is null for the live puzzle; a games passes it to its dailySeedFor /
    // day-scoped result store, which treats a non-today day as an ephemeral
    // archive replay (playable, but not recorded).
    cleanup = await game.mount(view, day ? { day } : {});
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
 * @param {{push?: boolean, replace?: boolean, day?: string|null}} opts
 *        push=false when reacting to the URL rather than driving it (deep link,
 *        back button). `day` is an archive replay day, or null for today.
 */
async function goTo(id, { push = true, replace = false, day = null } = {}) {
  const game = id ? getGame(id) : null;

  if (id && !game) {
    // Unknown game in the URL — strip it rather than leave a dead link in the
    // address bar, and show the hub.
    writeUrl(null, { replace: true });
    return showHub();
  }

  // A day only means anything inside a game, and only a valid past one routes.
  const routeDay = game ? normalizeDay(day) : null;

  if (push) writeUrl(game ? game.id : null, { replace, day: routeDay });
  if (game) await mountGame(game, { day: routeDay });
  else await showHub();
  syncArchiveButton();
}

/** Render whatever the current URL says. Used on boot and on back/forward. */
function renderFromUrl() {
  return goTo(routedGameId(), { push: false, day: routedDay() });
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
