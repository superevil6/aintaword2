// "Share your result" text generation for Color Path.
//
// Deliberately spoiler-free: the text NEVER describes the board — no colors,
// no target positions, no route. Everyone plays the same daily board, so a
// share that leaked the layout would ruin the day for whoever reads it. Moves
// and time give you something to beat without giving away how.

import { shareUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/** Elapsed milliseconds as M:SS. */
function formatTime(ms) {
  const total   = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Build the shareable text for a solved board.
 *
 * @param {object} o
 * @param {number} o.moves
 * @param {number} o.timeMs
 * @param {string} [o.difficultyLabel]  e.g. "Medium"
 * @param {string} [o.daily]            e.g. "2026-07-20"
 * @param {object} [o.best]             {moves, timeMs} personal best, if any
 * @param {string} [o.url]              defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ moves, timeMs, difficultyLabel, daily, best, url } = {}) {
  const title = ["Color Path", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    title,
    `${moves} ${moves === 1 ? "move" : "moves"} · ${formatTime(timeMs)}`,
  ];

  // Only worth mentioning when today actually beat it — otherwise the share
  // reads like a humblebrag about a run that isn't this one.
  if (best && moves === best.moves && timeMs === best.timeMs) {
    lines.push("★ New best");
  }

  const link = url === undefined ? shareUrl() : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
