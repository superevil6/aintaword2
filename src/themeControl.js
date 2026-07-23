// Top-bar theme control — a collapsed swatch that expands into the palette.
//
// Collapsed, it is a single circle in the current theme's colour, sitting in the
// app bar beside the archive button and supporter badge. Clicking it reveals the
// other themes as a row of circles that grows out horizontally; picking one
// applies it and collapses back, the circle now wearing the chosen colour.
//
// The theme model (list, apply, entitlement gate) lives in core/theme.js; this
// file is only its chrome. Supporter-only themes render locked and inert until
// an entitlement is held — call refresh() when entitlements change so they light
// up live.

import { THEMES, applyTheme, isUnlocked, getThemeId } from "./core/theme.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function swatchHtml(t, currentId) {
  const unlocked = isUnlocked(t);
  const selected = t.id === currentId;
  const lock = unlocked ? "" : `<span class="theme-lock" aria-hidden="true">🔒</span>`;
  return `<button
    type="button"
    role="menuitemradio"
    aria-checked="${selected}"
    class="theme-swatch${selected ? " is-selected" : ""}${unlocked ? "" : " is-locked"}"
    data-theme-id="${esc(t.id)}"
    style="--swatch: ${esc(t.swatch)}"
    aria-label="${esc(t.name)} theme${unlocked ? "" : " (supporter)"}"
    title="${esc(t.name)}${unlocked ? "" : " — supporter theme"}"
  >${lock}</button>`;
}

/**
 * Build the control and insert it into `bar` before `anchor`.
 * @param {HTMLElement} bar     the app bar
 * @param {Node|null}   anchor  insert before this node (null → append)
 * @returns {{ el: HTMLElement, refresh: () => void }}
 */
export function mountThemeControl(bar, anchor = null) {
  const el = document.createElement("div");
  el.className = "theme-picker";
  el.innerHTML = `
    <button type="button" class="theme-current" aria-haspopup="true" aria-expanded="false"></button>
    <div class="theme-options" role="menu" aria-label="Colour theme"></div>
  `;
  const currentBtn = el.querySelector(".theme-current");
  const options = el.querySelector(".theme-options");

  function refresh() {
    const currentId = getThemeId();
    const current = THEMES.find((t) => t.id === currentId) || THEMES[0];
    currentBtn.style.setProperty("--swatch", current.swatch);
    currentBtn.setAttribute("aria-label", `Colour theme: ${current.name}`);
    currentBtn.title = `Theme: ${current.name}`;
    // The row shows the OTHER themes — the current one is the collapsed circle.
    options.innerHTML = THEMES.filter((t) => t.id !== currentId)
      .map((t) => swatchHtml(t, currentId))
      .join("");
  }

  const isOpen = () => el.classList.contains("is-open");
  const open = () => { el.classList.add("is-open"); currentBtn.setAttribute("aria-expanded", "true"); };
  const close = () => { el.classList.remove("is-open"); currentBtn.setAttribute("aria-expanded", "false"); };

  currentBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  options.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-id]");
    if (!b) return;
    const theme = THEMES.find((t) => t.id === b.dataset.themeId);
    // Locked themes are inert — the lock signals they need a supporter entitlement.
    if (!theme || !isUnlocked(theme)) return;
    applyTheme(theme.id);
    refresh();
    close();
  });

  // Dismiss on an outside click or Escape. The bar is persistent, so these live
  // for the app's lifetime by design — there is nothing to tear down.
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  refresh();
  bar.insertBefore(el, anchor);
  return { el, refresh };
}
