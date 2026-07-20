// Site-wide configuration.

/**
 * Display name of the site, shown in the top banner on every screen.
 *
 * ── PLACEHOLDER ── change this once you've settled on a name. It is the only
 * place the name appears, so renaming is a one-line change.
 */
export const SITE_NAME = "Word Games";

/**
 * Canonical public URL of the site, used in "share your score" text.
 *
 * ── SET THIS when you have your domain, e.g. "https://aintaword.com" ──
 *
 * Leave it as an empty string and the share text falls back to whatever URL
 * the player is currently on, which is correct on any host (including local
 * dev and preview deploys). Set it explicitly once you have a canonical
 * domain, so a share from a preview URL still points people at the real site.
 *
 * No trailing slash.
 */
export const SITE_URL = "";

/** The URL to advertise in shared text. */
export function shareUrl() {
  if (SITE_URL) return SITE_URL;
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return (location.origin + location.pathname).replace(/\/index\.html$/, "").replace(/\/$/, "");
  }
  return "";
}
