// Photon Finish — brightness levels.
//
// Replaces the old RYB color system. A beam carries one integer, its
// brightness, and everything on the board either raises it or lowers it.
//
//   0 ── 1 ── 2 ── 3 ── 4
//   dark      neutral    bright
//
// ── Why a number and not a color ──────────────────────────────────────────
//
// The color version had eight states and a three-bit algebra, and the honest
// result was that nobody planned with it: working out "what will my beam be
// after that gate" required simulating a bitmask in your head, so players
// swept the beam around and watched for the goal to light up instead. A single
// number is planned with arithmetic — "I need 3, I am at 1, so I need two more
// lights" — which is something you can do while looking at the board.
//
// The state is deliberately shallow. The difficulty is meant to live in the
// beams constraining each other (see `couple`), not in the algebra.
//
// ── Why it clamps ──────────────────────────────────────────────────────────
//
// +1 and -1 commute, so an unbounded counter would make route ORDER
// irrelevant: the level would just be lights-minus-darks. Clamping at both
// ends is what breaks that — a light gate crossed at 4 is wasted, so
// "brighten then darken" and "darken then brighten" genuinely differ. It is
// the only order-dependence in the algebra, and it is visible rather than
// hidden because the level is drawn on the beam.
//
// Kept free of DOM imports so the generator and build script can run in Node.

export const MIN_LEVEL = 0;
export const MAX_LEVEL = 4;

/** What an emitter fires, and the pivot that `couple` measures against. */
export const NEUTRAL = 2;

export const LEVEL_COUNT = MAX_LEVEL + 1;

export const LEVEL_NAMES = ["darkest", "dark", "neutral", "bright", "brightest"];

export function clampLevel(v) {
  return v < MIN_LEVEL ? MIN_LEVEL : v > MAX_LEVEL ? MAX_LEVEL : v;
}

/** Crossing a gate: light raises, dark lowers. */
export function applyGate(level, gate) {
  return clampLevel(level + (gate.dark ? -1 : 1));
}

/**
 * Where two player beams cross, each takes on the other's brightness — as a
 * push away from neutral, not as a sum.
 *
 * The plain reading of "each adds the other's level" does not survive contact
 * with the range: levels sit in 0..4 and beams are usually somewhere in the
 * middle, so A+B clears the cap most of the time and essentially every
 * crossing collapses to "both become 4". Measuring the other beam against
 * NEUTRAL instead keeps the whole range in play and gives the rule a shape
 * worth reasoning about — a neutral beam is inert, a bright one lifts you, a
 * dark one drags you down, and the effect is symmetric.
 */
export function couple(level, otherLevel) {
  return clampLevel(level + (otherLevel - NEUTRAL));
}

/** How far from neutral, which is what a crossing is actually worth. */
export function pushOf(level) {
  return level - NEUTRAL;
}

// ── Display ────────────────────────────────────────────────────────────────
//
// Brightness is carried on TWO channels at once, lightness and thickness, and
// that redundancy is not decoration.
//
// Lightness alone cannot work here: the board is nearly black so a beam can
// only be drawn dark, and the darkest beam would be invisible against the very
// surface it has to be read on. Thickness has no such floor — a level-0 beam
// is a thin hairline, still plainly there — and it also survives being
// photographed, printed, or looked at by someone who cannot separate the
// lightness steps. The numerals on the goals are the third, exact channel.

const LEVEL_HEX = [
  "#5d6786", // 0  darkest — still clear of the background, never invisible
  "#8792b2",
  "#b3bcd6",
  "#dde3f4",
  "#ffffff", // 4  brightest
];

/** Stroke width in board units, so thickness reads brightness too. */
const LEVEL_WIDTH = [0.42, 0.68, 0.95, 1.28, 1.7];

export function levelHex(level) {
  return LEVEL_HEX[clampLevel(level)];
}

/**
 * Beam color: brightness by lightness, and a faint tint saying WHICH beam.
 *
 * The tint carries no rules at all — brightness is still the whole mechanic,
 * and it is still read from lightness, thickness and the numerals. Hue here
 * means identity, and it earns its place because the game turns on the two
 * beams pushing each other around: where they cross, "which one is that" is
 * the first question, and two white lines cannot answer it.
 *
 * Kept weak on purpose. These have to read as tinted white light, not as the
 * colored lasers this game deliberately stopped being.
 */
const BEAM_TINTS = [
  ["#4f5f70", "#6b8496", "#8fb3c6", "#bcdcea", "#e8f8ff"], // beam 1, cool
  ["#6f6352", "#968571", "#c6b28f", "#eadcbc", "#fff6e8"], // beam 2, warm
  ["#4f6f57", "#6f9679", "#93c6a1", "#c2eacb", "#e8ffef"], // beam 3, green
];

export function beamHex(level, beam = 0) {
  return (BEAM_TINTS[beam] || BEAM_TINTS[0])[clampLevel(level)];
}

export function levelWidth(level) {
  return LEVEL_WIDTH[clampLevel(level)];
}

/** How strongly a beam of this level glows. Dark beams do not glow at all. */
export function levelGlow(level) {
  return [0, 0.06, 0.13, 0.2, 0.3][clampLevel(level)];
}
