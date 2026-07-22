// "Share your result" text generation for Rootword.
//
// Spoiler-free: it never lists the words you planted or the letters you had —
// everyone plays the same daily puzzle, so a leaked tree would ruin it. The
// score against par gives someone a number to chase without saying how.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * @param {object} o
 * @param {number}  o.score            fruit score you reached
 * @param {number}  o.par              the day's true optimum
 * @param {number}  o.words            how many words you planted
 * @param {string} [o.difficultyLabel] e.g. "Medium"
 * @param {string} [o.daily]           e.g. "2026-07-21"
 * @param {string} [o.url]             defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ score, par, words, difficultyLabel, daily, url } = {}) {
  const title = ["Rootword", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  // A little tree that fills toward par, so the share carries a glanceable
  // sense of how close it got without naming a single word.
  const pct = par > 0 ? Math.max(0, Math.min(1, score / par)) : 0;
  const filled = Math.round(pct * 10);
  const bar = "🌳".repeat(filled) + "·".repeat(10 - filled);

  const lines = [title, bar];

  let scoreLine = `${score} / ${par}`;
  if (score >= par) scoreLine += "  ·  optimal 🏆";
  scoreLine += `  ·  ${words} word${words === 1 ? "" : "s"}`;
  lines.push(scoreLine);

  const link = url === undefined ? gameUrl("rootword") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
