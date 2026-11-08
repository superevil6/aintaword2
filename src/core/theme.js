// Theme system — swaps the shell's palette. Every theme is free.
//
// A theme is nothing more than a set of CSS custom-property overrides applied
// via a `data-theme` attribute on :root (the palettes live in styles/global.css).

const KEY = "aintaword2:theme";

/**
 * Selectable themes. `swatch` is the dot shown in the picker; `free` is a
 * leftover flag (all themes are selectable now). Order is display order. Adding one is a THEMES entry plus a
 * `:root[data-theme="<id>"]` block in global.css — nothing else.
 */
export const THEMES = [
  { id: "default",  name: "Nebula",        swatch: "#7c5cff", free: true },
  { id: "ember",    name: "Ember",         swatch: "#ff7a4d", free: false },
  { id: "forest",   name: "Forest",        swatch: "#34c98d", free: false },
  { id: "slate",    name: "Slate",         swatch: "#8aa0b8", free: false },
  { id: "ocean",    name: "Ocean",         swatch: "#22c1dc", free: false },
  { id: "candy",    name: "Candy",         swatch: "#ff5fa2", free: false },
  { id: "crimson",  name: "Crimson",       swatch: "#e5484d", free: false },
  { id: "sapphire", name: "Sapphire",      swatch: "#3b6ef5", free: false },
  // High-contrast is an accessibility mode, kept free on purpose (see global.css).
  { id: "contrast", name: "High Contrast", swatch: "#f4f4f5", free: true },
];

const DEFAULT = THEMES[0];

export function getThemeId() {
  try {
    return localStorage.getItem(KEY) || DEFAULT.id;
  } catch {
    return DEFAULT.id;
  }
}

/**
 * Whether a theme can be selected. Every theme is now free — the site dropped
 * paid perks for a plain tip jar — so this is always true. Kept as a function
 * (rather than deleted) because the theme picker still calls it per swatch, and
 * keeping the seam means re-introducing a gate later is a one-line change here.
 */
export function isUnlocked(/* theme */) {
  return true;
}

function themeById(id) {
  return THEMES.find((t) => t.id === id) || DEFAULT;
}

/**
 * Apply and persist a theme by id. A theme the player can't use falls back to
 * the default, so a lost entitlement can never strand them on a locked palette.
 * @returns {string} the id actually applied
 */
export function applyTheme(id) {
  let theme = themeById(id);
  if (!isUnlocked(theme)) theme = DEFAULT;
  const root = document.documentElement;
  if (theme.id === DEFAULT.id) root.removeAttribute("data-theme");
  else root.dataset.theme = theme.id;
  try {
    localStorage.setItem(KEY, theme.id);
  } catch {
    /* private mode / quota — the choice just won't persist */
  }
  return theme.id;
}

/**
 * On boot, re-assert the saved theme through the entitlement check. An inline
 * script in index.html has already applied it flash-free; this corrects the rare
 * case where the saved theme is no longer unlocked.
 */
export function initTheme() {
  applyTheme(getThemeId());
}
