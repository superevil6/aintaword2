// Round-completion signal — the seam the shell uses to offer "play one more".
//
// Every game hand-rolls its own end-of-round screen, so there is no shared
// results component the shell could hook. Instead a game announces, from its
// own root element, that a round has just finished; the shell (main.js) listens
// once on the view it owns and renders a cross-sell strip pointing at a related
// game. Games stay ignorant of the hub, of routing, and of each other — they
// only say "a round ended here", and the shell decides what to do with that.

/** Event a game fires when it shows a result screen. Bubbles to the shell view. */
export const ROUND_COMPLETE = "wg:round-complete";

/**
 * Announce that a round just finished. Call from a game's result-render path,
 * passing an element inside the shell view (typically `this.root`).
 * @param {HTMLElement} rootEl
 */
export function announceRoundComplete(rootEl) {
  if (!rootEl) return;
  rootEl.dispatchEvent(new CustomEvent(ROUND_COMPLETE, { bubbles: true }));
}
