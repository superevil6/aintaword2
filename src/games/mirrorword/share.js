// "Share your result" text generation for Mirrorword.
//
// Spoiler-free: it never contains the words or letters — everyone plays the
// same daily square, and a word game's words ARE the answer, so a leaked grid
// hands the solution to whoever hasn't played. The emoji card is identical for
// any solve (green rows, a mirror-blue diagonal), so it reveals nothing; the
// star tier and the score-against-par give someone a number to chase without
// saying how.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/** 3 stars at par, 2 within 85%, else 1 — closeness to the day's optimum. */
export function starsFor(score, par) {
  if (par <= 0 || score >= par) return 3;
  if (score >= Math.ceil(par * 0.85)) return 2;
  return 1;
}

/**
 * @param {object} o
 * @param {number}  o.score            best square you banked
 * @param {number}  o.par              the day's true optimum
 * @param {number}  o.size             board size n
 * @param {string} [o.difficultyLabel] e.g. "Medium"
 * @param {string} [o.daily]           e.g. "2026-07-22"
 * @param {string} [o.url]             defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ score, par, size, difficultyLabel, daily, url } = {}) {
  const title = ["Mirrorword", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const stars = starsFor(score, par);
  const starLine = "★".repeat(stars) + "☆".repeat(3 - stars);

  // A solved board is always green rows with a mirror-blue diagonal — no letters
  // leak because the shape is identical for every solve.
  const grid = [];
  for (let r = 0; r < size; r++) {
    let line = "";
    for (let c = 0; c < size; c++) line += (r === c ? "🟦" : "🟩");
    grid.push(line);
  }

  let scoreLine = `${score} / ${par}`;
  if (score >= par) scoreLine += "  ·  optimal 🏆";

  const lines = [title, starLine, ...grid, scoreLine];

  const link = url === undefined ? gameUrl("mirrorword") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
