// "Share your result" text generation for Photon Finish.
//
// Spoiler-free, the same rule the other games hold to: the text NEVER
// describes the board — not the gates, not the beam angles, and above all not
// the goal brightnesses. Everyone plays the same daily board, so leaking the
// targets would hand the answer to whoever reads the share. Moves alone give
// someone a number to beat without giving away how.
//
// Photon Finish scores on moves only (there is no clock), so this is the
// move-only cousin of colorpath/share.js.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * Build the shareable text for a solved board.
 *
 * @param {object} o
 * @param {number} o.moves
 * @param {string} [o.difficultyLabel]  e.g. "Hard"
 * @param {string} [o.daily]            e.g. "2026-07-21"
 * @param {boolean} [o.isRecord]        true when this run set a personal best
 * @param {string} [o.url]              defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ moves, difficultyLabel, daily, isRecord, url } = {}) {
  const title = ["Photon Finish", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    title,
    `⚡ Solved in ${moves} ${moves === 1 ? "move" : "moves"}`,
  ];

  // Only when this run actually was the best — otherwise it reads like a brag
  // about a different run than the one being shared.
  if (isRecord) lines.push("★ New best");

  // Deep-links straight to Photon Finish rather than the hub, so a shared
  // result opens the game it is bragging about.
  const link = url === undefined ? gameUrl("photonfinish") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
