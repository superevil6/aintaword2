// "Share your result" text generation for Numburst.
//
// Spoiler-free: the text never describes the boards — no orb values, no
// positions, no ignition points. Everyone plays the same daily match, so a
// share that leaked the layout would ruin the day for whoever reads it. The
// round scores and total give someone a number to chase without giving away
// how it was reached.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * Build the shareable text for a finished match.
 *
 * @param {object} o
 * @param {number[]} o.rounds          each round's score, in order
 * @param {number}   o.total           the match total
 * @param {number}  [o.par]            the day's par, if this was a daily
 * @param {string}  [o.difficultyLabel] e.g. "Medium"
 * @param {string}  [o.daily]          e.g. "2026-07-21"
 * @param {string}  [o.url]            defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ rounds = [], total, par, difficultyLabel, daily, url } = {}) {
  const title = ["Numburst", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [title];

  rounds.forEach((score, i) => {
    lines.push(`Round ${i + 1}  ${score.toLocaleString()}`);
  });

  let totalLine = `Total  ${total.toLocaleString()}`;
  if (par != null) {
    totalLine += total >= par ? `  ·  beat par ✅` : `  ·  par ${par.toLocaleString()}`;
  }
  lines.push(totalLine);

  // Deep-links straight to Numburst rather than the hub, so a shared result
  // opens the game it is bragging about.
  const link = url === undefined ? gameUrl("numburst") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
