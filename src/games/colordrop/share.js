// "Share your result" text for colordrop.
//
// Spoiler-free: the text never names a goal color, a chute, or a recipe —
// everyone plays the same daily boards, so leaking one would ruin the day.
// Score and hit count give something to beat without giving away how.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * @param {object} o
 * @param {number} o.score
 * @param {number} o.hits            correct drops
 * @param {number} o.boards          boards in the round
 * @param {string} [o.difficultyLabel]
 * @param {string} [o.daily]         e.g. "2026-07-23"
 * @param {object} [o.best]          {score} personal best, if any
 * @param {string} [o.url]
 * @returns {string}
 */
export function buildShareText({ score, hits, boards, difficultyLabel, daily, best, url } = {}) {
  const title = ["Colordrop", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    title,
    `${score} pts · ${hits}/${boards} clean`,
  ];

  if (best && score === best.score) {
    lines.push("★ New best");
  }

  const link = url === undefined ? gameUrl("colordrop") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
