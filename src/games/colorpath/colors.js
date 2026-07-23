// RYB color system.
//
// Each color is a 3-bit bitmask of primaries:
//   bit 0 = Red  (0b001 = 1)
//   bit 1 = Yellow (0b010 = 2)
//   bit 2 = Blue (0b100 = 4)
//
// This gives 8 colors that form a 3-dimensional hypercube — every color has
// exactly 3 neighbors (differ by one primary).  No add/remove is ever
// "invalid"; pressing a primary button always toggles that bit.

export const WHITE  = 0; // 000
export const RED    = 1; // 001
export const YELLOW = 2; // 010
export const ORANGE = 3; // 011  R + Y
export const BLUE   = 4; // 100
export const PURPLE = 5; // 101  R + B
export const GREEN  = 6; // 110  Y + B
export const BROWN  = 7; // 111  R + Y + B

// Brown (0b111 = 7) is now included in gameplay to increase difficulty.
// COLOR_COUNT = 8 includes all 8 colors.
export const COLOR_COUNT = 8;

export const COLOR_NAMES = [
  "White", "Red", "Yellow", "Orange", "Blue", "Purple", "Green", "Brown",
];

// The three playable primary buttons, in pip order. The fill each one gets is
// palette-dependent, so it lives in the palette rather than here.
export const PRIMARIES = [
  { bit: 1, name: "Red" },
  { bit: 2, name: "Yellow" },
  { bit: 4, name: "Blue" },
];

// ── Palettes ───────────────────────────────────────────────────────────────
//
// Two, and the default is the one that looks like paint.
//
// `classic` is the honest RYB mix: red and yellow visibly make that orange,
// yellow and blue make that green, all three make that brown. Getting the
// mixing to read correctly is most of what makes the rule learnable, so this
// is what everybody sees unless they ask otherwise.
//
// `cvd` trades some of that fidelity for separation. Eight colors on a
// three-primary wheel cannot be told apart by hue alone — to a red-green
// dichromat, Red/Orange/Yellow/Green/Brown all sit on the axis they have lost
// — so this palette is tuned on the one channel that survives, lightness,
// giving that group a clean ladder (Yellow > Orange > Green > Brown > Red) and
// pulling Purple to a light lavender well clear of Blue. Measured against a
// Viénot dichromat simulation, the closest pair goes from 6.0 to 18.0 ΔE under
// deuteranopia and 7.2 to 13.5 under protanopia. The cost is that the mixes
// stop looking like mixes, which is exactly why it is opt-in.
//
// Neither palette is asked to carry the board alone: the RYB pips are on in
// both, always. Color is the fast read; the pips are the one that is always
// right. See `pipsMarkup`.
//
//   hex     — the circle fills, indexed by color
//   ink     — what gets drawn ON a circle (pips, the collected tick), picked
//             per fill for contrast: dark on the light half, light on the dark
//   primary — the three control buttons, in PRIMARIES order
const PALETTES = {
  classic: {
    hex: [
      "#e8e8e8", // White
      "#d93030", // Red
      "#e8b800", // Yellow
      "#e07818", // Orange
      "#2858c8", // Blue
      "#8828b8", // Purple
      "#1a7838", // Green
      "#6b4423", // Brown
    ],
    ink: [
      "#14161f", // White
      "#f2f2f2", // Red
      "#14161f", // Yellow
      "#14161f", // Orange
      "#f2f2f2", // Blue
      "#f2f2f2", // Purple
      "#f2f2f2", // Green
      "#f2f2f2", // Brown
    ],
    primary: ["#d93030", "#e8b800", "#2858c8"],
  },
  cvd: {
    hex: [
      "#ececec", // White
      "#b32424", // Red
      "#f7dc55", // Yellow
      "#e58e1c", // Orange
      "#2b57c8", // Blue
      "#b884ea", // Purple
      "#3f9c72", // Green
      "#7d6642", // Brown
    ],
    ink: [
      "#14161f", // White
      "#f2f2f2", // Red
      "#14161f", // Yellow
      "#14161f", // Orange
      "#f2f2f2", // Blue
      "#14161f", // Purple
      "#14161f", // Green
      "#f2f2f2", // Brown
    ],
    // Lightened off the fills so the buttons hold up against the dark chrome.
    primary: ["#d24343", "#f7dc55", "#4b7ae8"],
  },
};

const PALETTE_KEY = "colorpath:palette";
export const PALETTE_EVENT = "colorpath:palette";

/** Palette changes are a preference, not a result — they outlive the day. */
function loadPalette() {
  try {
    const saved = localStorage.getItem(PALETTE_KEY);
    return saved in PALETTES ? saved : "classic";
  } catch {
    return "classic"; // private mode, blocked storage
  }
}

let active = loadPalette();

/** @returns {"classic"|"cvd"} */
export function paletteId() {
  return active;
}

/**
 * Switch palettes and tell every mounted view to repaint.
 *
 * The event is what lets the board, the tutorial demo and the control buttons
 * all follow a toggle that only one of them owns — without the toggle needing
 * a reference to any of them, and without a remount that would throw away the
 * player's focus mid-game.
 */
export function setPalette(id) {
  if (!(id in PALETTES) || id === active) return;
  active = id;
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch { /* nothing to do — the setting just won't survive the session */ }
  // window.CustomEvent, not the bare global: under jsdom the two are different
  // constructors and the window rejects an event built from the wrong one.
  window.dispatchEvent(new window.CustomEvent(PALETTE_EVENT, { detail: id }));
}

/** Fill for a color index, in whichever palette is active. */
export function colorHex(color) {
  return PALETTES[active].hex[color];
}

/** Ink for anything drawn on top of a color index. */
export function colorInk(color) {
  return PALETTES[active].ink[color];
}

/** Button fill for a primary, by its index in PRIMARIES. */
export function primaryHex(i) {
  return PALETTES[active].primary[i];
}

/**
 * The three-pip glyph that spells out a color's primaries: one slot per
 * primary in R-Y-B order, filled when that primary is present. This is the
 * redundant, non-color encoding — White reads as three empty rings, Brown as
 * three filled ones, and every mix in between is countable rather than guessed.
 *
 * Decorative in the markup: the cell already carries the color name in its
 * aria-label, and a screen reader has no use for the dots.
 */
export function pipsMarkup(color) {
  const pips = PRIMARIES.map(
    ({ bit }) => `<span class="cp-pip${(color & bit) ? " is-on" : ""}"></span>`,
  ).join("");
  return `<span class="cp-pips" aria-hidden="true">${pips}</span>`;
}

/**
 * Put a color on an element built with `pipsMarkup`: the fill, the ink that
 * anything drawn on top of it uses, and the pip states. One function so the
 * fill and the pips can never drift apart — a circle showing green while its
 * pips say red would be worse than no pips at all.
 */
export function paintSwatch(el, color) {
  el.style.setProperty("--cell-color", colorHex(color));
  el.style.setProperty("--cell-ink",   colorInk(color));
  const pips = el.querySelectorAll(".cp-pip");
  PRIMARIES.forEach(({ bit }, i) => {
    pips[i]?.classList.toggle("is-on", (color & bit) !== 0);
  });
}

// Flip a primary bit: adds if absent, removes if present.
export function applyPrimary(color, primaryBit) {
  return (color ^ primaryBit) & 0b111;
}

// True if pressing this primary on `color` would ADD it (vs remove).
export function primaryAdds(color, primaryBit) {
  return (color & primaryBit) === 0;
}
