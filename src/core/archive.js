// Puzzle archive — a shared calendar overlay for replaying past dailies.
//
// A supporter perk: every game's puzzle is seed-derived from its day (see
// core/daily.js + each game's dailySeedFor), so any past day regenerates
// identically. This component owns only the DATE axis — it lets the player pick
// a day, then hands that day back to the shell, which re-mounts the current
// game for it. A game's own difficulty/tier picker is untouched; the calendar
// stays one level above it.
//
// One component for every game, like lifecycle.js: it knows nothing about which
// game is playing. The shell (main.js) opens it and routes the result.
//
// Dates are handled in UTC to match todayKey() (which slices toISOString), so a
// player near midnight never sees the grid disagree with which puzzle is "today".

import { todayKey } from "./daily.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ── Date helpers (UTC, string-keyed) ────────────────────────────────────────

/** Parse a "YYYY-MM-DD" key to {y, m, d} (m is 1-12). */
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Format a UTC Date to a "YYYY-MM-DD" key. */
function keyOf(date) {
  return date.toISOString().slice(0, 10);
}

/** A UTC Date at midnight for a day key, for arithmetic and comparison. */
function dateOf(key) {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Human label for a day key, e.g. "15 Jul 2026". */
export function formatDay(key) {
  const { y, m, d } = parseKey(key);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

// ── The overlay ─────────────────────────────────────────────────────────────

/**
 * Open the archive calendar.
 *
 * @param {object}   opts
 * @param {string}   opts.start    earliest selectable day key (inclusive)
 * @param {string}  [opts.today]   the day treated as "today" (defaults to now)
 * @param {string}  [opts.current] the day currently being viewed, highlighted
 * @param {string[]}[opts.played]  dates (YYYY-MM-DD) the player has completed,
 *          marked with a dot so past play is visible at a glance.
 * @returns {Promise<string|null>} the chosen day key, or null if dismissed.
 *          Choosing today's cell resolves with today's key — the caller decides
 *          that means "leave archive mode".
 */
export function openArchive({ start, today = todayKey(), current = today, played = [] } = {}) {
  return new Promise((resolve) => {
    const playedSet = new Set(played);
    // Clamp the initial view month to the selectable range.
    const startD = dateOf(start);
    const todayD = dateOf(today);
    let view = dateOf(current); // any day in the month we're showing
    if (view < startD) view = startD;
    if (view > todayD) view = todayD;
    let viewY = view.getUTCFullYear();
    let viewM = view.getUTCMonth(); // 0-11

    const overlay = document.createElement("div");
    overlay.className = "archive-overlay";
    overlay.innerHTML = `
      <div class="archive-modal" role="dialog" aria-modal="true" aria-label="Puzzle archive">
        <div class="archive-head">
          <button class="archive-nav" data-nav="prev" type="button" aria-label="Previous month">‹</button>
          <h2 class="archive-title"></h2>
          <button class="archive-nav" data-nav="next" type="button" aria-label="Next month">›</button>
        </div>
        <div class="archive-weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="archive-grid"></div>
        <button class="archive-close" type="button" aria-label="Close archive">Close</button>
      </div>
    `;

    const titleEl = overlay.querySelector(".archive-title");
    const gridEl = overlay.querySelector(".archive-grid");
    const prevBtn = overlay.querySelector('[data-nav="prev"]');
    const nextBtn = overlay.querySelector('[data-nav="next"]');

    function close(result) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === "Escape") close(null);
    }

    function atStartMonth() {
      return viewY === startD.getUTCFullYear() && viewM === startD.getUTCMonth();
    }
    function atTodayMonth() {
      return viewY === todayD.getUTCFullYear() && viewM === todayD.getUTCMonth();
    }

    function render() {
      titleEl.textContent = `${MONTHS[viewM]} ${viewY}`;
      prevBtn.disabled = atStartMonth();
      nextBtn.disabled = atTodayMonth();

      const firstDow = new Date(Date.UTC(viewY, viewM, 1)).getUTCDay();
      const daysInMonth = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();

      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push('<span class="archive-cell is-empty"></span>');
      for (let d = 1; d <= daysInMonth; d++) {
        const cellD = new Date(Date.UTC(viewY, viewM, d));
        const key = keyOf(cellD);
        const outOfRange = cellD < startD || cellD > todayD;
        const isToday = key === today;
        const isCurrent = key === current;
        const cls = [
          "archive-cell",
          outOfRange ? "is-disabled" : "is-day",
          isToday ? "is-today" : "",
          isCurrent ? "is-current" : "",
          playedSet.has(key) ? "is-played" : "",
        ].join(" ").trim();
        cells.push(
          outOfRange
            ? `<span class="${cls}">${d}</span>`
            : `<button class="${cls}" type="button" data-key="${key}"${
                isCurrent ? ' aria-current="date"' : ""
              }>${d}</button>`,
        );
      }
      gridEl.innerHTML = cells.join("");
    }

    prevBtn.addEventListener("click", () => {
      if (atStartMonth()) return;
      if (viewM === 0) { viewM = 11; viewY--; } else { viewM--; }
      render();
    });
    nextBtn.addEventListener("click", () => {
      if (atTodayMonth()) return;
      if (viewM === 11) { viewM = 0; viewY++; } else { viewM++; }
      render();
    });
    gridEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-key]");
      if (btn) close(btn.dataset.key);
    });
    overlay.querySelector(".archive-close").addEventListener("click", () => close(null));
    // A click on the backdrop (outside the modal) dismisses.
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKey);

    render();
    document.body.appendChild(overlay);
  });
}
