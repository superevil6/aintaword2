// "Share your result" text generation for Vanity Plate.
//
// Spoiler-free: the text never names a plate or a word, only the golf tiles and
// the score. Everyone plays the same daily course, so a share that leaked a
// plate — or worse, a birdie word — would rob whoever reads it. The scorecard
// grid (🟩 par, 🟧/🟥 over, 🐦 birdie, 🦅 eagle) gives a shape to chase without
// giving away how it was driven.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * @param {object} o
 * @param {string}  o.grid            per-hole tiles, already joined, in order
 * @param {number}  o.strokes         total strokes
 * @param {number}  o.par             course par
 * @param {number} [o.birdies]        birdie count, for a small flourish
 * @param {string} [o.courseName]     e.g. "Cross Country"
 * @param {string} [o.difficultyLabel] e.g. "Medium"
 * @param {string} [o.daily]          e.g. "2026-07-22"
 * @param {string} [o.url]            defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({
  grid = "",
  strokes,
  par,
  birdies = 0,
  courseName,
  difficultyLabel,
  daily,
  url,
} = {}) {
  const title = ["Vanity Plate", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const diff = strokes - par;
  const rel = diff === 0 ? "even par" : diff > 0 ? `+${diff}` : `${diff}`;

  const lines = [title, grid];
  let scoreLine = `${rel}  ·  ${strokes} strokes, par ${par}`;
  if (birdies > 0) scoreLine += `  ·  ${birdies}🐦`;
  lines.push(scoreLine);

  const link = url === undefined ? gameUrl("vanityplate") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
