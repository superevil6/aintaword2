// Rendering + palette layer for colordrop.
//
// The color *model* (bits, names, mixing) lives in board.js so it stays
// DOM-free and Node-runnable. This module adds the parts that only make sense
// in a browser: the fills, the pip glyphs, and the classic/CVD palette toggle.
//
// The two palettes and their measured CVD tuning are lifted verbatim from
// colorpath/colors.js — same 8-color RYB layout, same job. Copied rather than
// imported so colordrop owns its files and can be pulled without touching
// colorpath; the values are the tuned ones, don't drift them independently.

import { PRIMARIES, COLOR_NAMES } from "./board.js";

export { COLOR_NAMES };

// Palette data — see colorpath/colors.js for the derivation of the CVD ladder.
const PALETTES = {
  classic: {
    hex: ["#e8e8e8", "#d93030", "#e8b800", "#e07818", "#2858c8", "#8828b8", "#1a7838", "#6b4423"],
    ink: ["#14161f", "#f2f2f2", "#14161f", "#14161f", "#f2f2f2", "#f2f2f2", "#f2f2f2", "#f2f2f2"],
  },
  cvd: {
    hex: ["#ececec", "#b32424", "#f7dc55", "#e58e1c", "#2b57c8", "#b884ea", "#3f9c72", "#7d6642"],
    ink: ["#14161f", "#f2f2f2", "#14161f", "#14161f", "#f2f2f2", "#14161f", "#14161f", "#f2f2f2"],
  },
};

const PALETTE_KEY = "colordrop:palette";
export const PALETTE_EVENT = "colordrop:palette";

function loadPalette() {
  try {
    const saved = localStorage.getItem(PALETTE_KEY);
    return saved in PALETTES ? saved : "classic";
  } catch {
    return "classic";
  }
}

let active = loadPalette();

/** @returns {"classic"|"cvd"} */
export function paletteId() {
  return active;
}

/** Switch palettes and tell every mounted view to repaint (see colorpath). */
export function setPalette(id) {
  if (!(id in PALETTES) || id === active) return;
  active = id;
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch { /* preference just won't survive the session */ }
  window.dispatchEvent(new window.CustomEvent(PALETTE_EVENT, { detail: id }));
}

/** Fill for a color index, in whichever palette is active. */
export function colorHex(color) {
  return PALETTES[active].hex[color & 7];
}

/** Ink for anything drawn on top of a color index. */
export function colorInk(color) {
  return PALETTES[active].ink[color & 7];
}

/**
 * The three-pip glyph spelling out a color's primaries in R-Y-B order — the
 * non-color encoding a CVD player reads. White is three empty rings, Brown
 * three filled. Decorative in the markup; the name is carried in aria-label.
 */
export function pipsMarkup(color) {
  const pips = PRIMARIES.map(
    (bit) => `<span class="cd-pip${(color & bit) ? " is-on" : ""}"></span>`,
  ).join("");
  return `<span class="cd-pips" aria-hidden="true">${pips}</span>`;
}

/**
 * Paint a color onto an element built with pipsMarkup: fill, ink, and pips
 * together so a swatch and its pips can never disagree.
 */
export function paintSwatch(el, color) {
  el.style.setProperty("--cell-color", colorHex(color));
  el.style.setProperty("--cell-ink", colorInk(color));
  const pips = el.querySelectorAll(".cd-pip");
  PRIMARIES.forEach((bit, i) => {
    pips[i]?.classList.toggle("is-on", (color & bit) !== 0);
  });
}
