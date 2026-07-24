// "Share your result" text for Letter Shooter.
//
// Spoiler-free: it never names a word you banked, only the SHAPE of your run —
// one bar per round whose length tracks the word's length (an empty mark for a
// round you busted or skipped) — plus the score against par. Everyone plays the
// same seeded board, so a length is a silhouette to beat, not a spoiler.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/** One bar per round; length tracks the banked word's length, empty if none. */
function receipt(lengths) {
  return lengths
    .map((n) => (n > 0 ? "🟨".repeat(Math.min(10, n)) : "⬛"))
    .join("\n");
}

/**
 * @param {object} o
 * @param {number[]} o.lengths        banked word length per round (0 = busted/none)
 * @param {number}  o.score           points banked over the run
 * @param {number}  o.par             the day's perfect-timing par
 * @param {number}  o.rounds          rounds banked (of 5)
 * @param {string} [o.difficultyLabel]
 * @param {string} [o.daily]          e.g. "2026-07-22"
 * @param {string} [o.url]            defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({
  lengths = [],
  score,
  par,
  rounds,
  difficultyLabel,
  daily,
  url,
} = {}) {
  const title = ["Letter Shooter", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const diff = score - par;
  const rel = diff === 0 ? "on par ⭐" : diff > 0 ? `+${diff} above par 🎯` : `${diff} below par`;

  const lines = [title, receipt(lengths)];
  lines.push(`${rel}  ·  ${score}/${par}  ·  ${rounds}/5 banked`);

  const link = url === undefined ? gameUrl("lettershooter") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
