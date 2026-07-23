// "Share your result" text generation for Storey.
//
// Spoiler-free: the text never names a floor word or a hand tile, only the SHAPE
// of the tower — one brick-row per storey, its length standing in for the floor's
// width — plus the score against par. Everyone builds the same hand, so leaking a
// word would rob the reader; a skyline gives them a silhouette to beat instead.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/** A row of bricks whose length tracks the floor's width (spoiler-free). */
function skyline(widths) {
  // Widest floor at the bottom, like the tower itself. Scale so the widest row
  // is a comfortable length in a chat window.
  return widths
    .slice()
    .sort((a, b) => b - a)
    .map((w) => "🟧".repeat(Math.max(1, Math.round(w / 2))))
    .join("\n");
}

/**
 * @param {object} o
 * @param {number[]} o.widths        each floor's width, for the skyline
 * @param {number}  o.score          net tower score
 * @param {number}  o.par            the day's par
 * @param {number}  o.stories        storeys built
 * @param {string} [o.siteLabel]     e.g. "Townhouse"
 * @param {string} [o.difficultyLabel]
 * @param {string} [o.daily]         e.g. "2026-07-22"
 * @param {string} [o.url]           defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({
  widths = [],
  score,
  par,
  stories,
  siteLabel,
  difficultyLabel,
  daily,
  url,
} = {}) {
  const title = ["Storey", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const diff = score - par;
  const rel = diff === 0 ? "on par ⭐" : diff > 0 ? `+${diff} above par 🏙️` : `${diff} below par`;

  const lines = [title, skyline(widths)];
  lines.push(`${rel}  ·  ${score}/${par}  ·  ${stories} storeys`);

  const link = url === undefined ? gameUrl("storey") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
