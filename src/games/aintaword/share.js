// "Share your score" text generation + clipboard handling.
//
// Deliberately spoiler-free: the text NEVER contains the words themselves,
// only a hit/miss pattern. Once the daily challenge ships, a share that leaked
// the words would ruin the day's puzzle for everyone who reads it — the same
// reason Wordle shares squares rather than letters.

import { shareUrl } from "../../config.js";

const HIT = "🟩";
const MISS = "🟥";
const ROW = 10; // squares per line
const MAX_SQUARES = 60; // keep a great run from becoming a wall of emoji

/**
 * Build the shareable text for a finished run.
 *
 * @param {object} o
 * @param {number} o.score
 * @param {Array<{correct:boolean}>} o.history  answered rounds, in order
 * @param {string} [o.difficultyLabel]          e.g. "Medium"
 * @param {string} [o.daily]                    e.g. "2026-07-19" (daily mode)
 * @param {string} [o.url]                      defaults to the configured site URL
 * @returns {string}
 */
export function buildShareText({ score, history = [], difficultyLabel, daily, url } = {}) {
  const total = history.length;
  const missed = history.filter((r) => !r.correct).length;

  const title = ["Ain't a Word", daily ? `Daily ${daily}` : null, difficultyLabel]
    .filter(Boolean)
    .join(" · ");

  const lines = [title, `${score} ${score === 1 ? "word" : "words"}`];

  if (total > 0) {
    const pct = Math.round(((total - missed) / total) * 100);
    lines[1] += ` · ${pct}% accurate`;

    const squares = history.slice(0, MAX_SQUARES).map((r) => (r.correct ? HIT : MISS));
    const rows = [];
    for (let i = 0; i < squares.length; i += ROW) {
      rows.push(squares.slice(i, i + ROW).join(""));
    }
    if (total > MAX_SQUARES) rows.push(`+${total - MAX_SQUARES} more`);
    lines.push("", ...rows);
  }

  const link = url === undefined ? shareUrl() : url;
  if (link) lines.push("", link);

  return lines.join("\n");
}

/**
 * Copy text to the clipboard.
 *
 * navigator.clipboard needs a secure context (https / localhost) AND a user
 * gesture; it rejects on plain http and in some in-app browsers. Falls back to
 * a hidden textarea + execCommand, and reports honestly if both fail so the UI
 * can offer manual selection instead of silently claiming success.
 *
 * @returns {Promise<boolean>} whether the copy actually succeeded
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Keep it off-screen but still selectable; display:none would break select().
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand?.("copy") ?? false;
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
