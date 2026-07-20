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

// Visual fill for each color index (indices 0-7)
export const COLOR_HEX = [
  "#e8e8e8", // White
  "#d93030", // Red
  "#e8b800", // Yellow
  "#e07818", // Orange
  "#2858c8", // Blue
  "#8828b8", // Purple
  "#1a7838", // Green
  "#6b4423", // Brown
];

// The three playable primary buttons
export const PRIMARIES = [
  { bit: 1, name: "Red",    hex: "#d93030" },
  { bit: 2, name: "Yellow", hex: "#e8b800" },
  { bit: 4, name: "Blue",   hex: "#2858c8" },
];

// Flip a primary bit: adds if absent, removes if present.
export function applyPrimary(color, primaryBit) {
  return (color ^ primaryBit) & 0b111;
}

// True if pressing this primary on `color` would ADD it (vs remove).
export function primaryAdds(color, primaryBit) {
  return (color & primaryBit) === 0;
}
