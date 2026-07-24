// "Share your result" text for sigilsweep.
//
// Spoiler-free: the text never shows a mark or names an answer — everyone plays
// the same daily sigils, so leaking one would ruin the day. Score and clean
// count give something to beat without giving away how.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * @param {object} o
 * @param {number} o.score
 * @param {number} o.hits            marks read on the first pick
 * @param {number} o.rounds          sigils in the round
 * @param {string} [o.difficultyLabel]
 * @param {string} [o.daily]         e.g. "2026-07-23"
 * @param {object} [o.best]          {score} personal best, if any
 * @param {string} [o.url]
 * @returns {string}
 */
export function buildShareText({ score, hits, rounds, difficultyLabel, daily, best, url } = {}) {
  const title = ["Sigil Sweep", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    title,
    `${score} pts · ${hits}/${rounds} first-glance`,
  ];

  if (best && score === best.score) {
    lines.push("★ New best");
  }

  const link = url === undefined ? gameUrl("sigilsweep") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
