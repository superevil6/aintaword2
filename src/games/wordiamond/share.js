// "Share your result" text for Wordiamond.
//
// Deliberately spoiler-free: the text NEVER contains the words. Everyone plays
// the same daily board, so pasting the ring into a group chat hands the answer
// to whoever has not played yet — and unlike a route or a color layout, four
// words ARE the whole solution.
//
// Anyone who wants to compare rings can still post them themselves, behind
// spoiler tags, which is the right way round: sharing the answer should be a
// deliberate act, not the default the button performs for you.
//
// Moves are included. A number you volunteer about your own run is different
// from one the game hands you unprompted — which is why the move count lives
// here and in the stat rail, but never in the win screen's result.

import { gameUrl } from "../../config.js";
import { copyToClipboard } from "../../core/clipboard.js";

export { copyToClipboard };

/**
 * @param {object} o
 * @param {string} o.modeLabel  e.g. "Easy"
 * @param {string} o.day        e.g. "2026-07-21"
 * @param {number} o.moves
 * @param {string} [o.url]      defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ modeLabel, day, moves, url } = {}) {
  const lines = [`Wordiamond ${modeLabel} ${day} Moves: ${moves}`];

  // Deep-links straight to Wordiamond rather than the hub, so a shared result
  // opens the game it is talking about.
  const link = url === undefined ? gameUrl("wordiamond") : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}
