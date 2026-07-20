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

// ── Moving to a custom domain (planned: own domain, hosted on Cloudflare) ──
//
// Everything URL-shaped in the app derives from SITE_URL / shareUrl() below,
// so the move is mostly a one-line change here. The checklist, in order:
//
//  1. Set SITE_URL to the canonical origin, e.g. "https://example.com".
//     No trailing slash. Once set, share links stop depending on whichever
//     host the player happens to be on — which matters because a share from a
//     preview deploy currently advertises the preview URL.
//
//  2. Leave vite.config.js `base: "./"` alone. It is relative on purpose and
//     already works from a domain root as well as a /repo-name/ subpath, so
//     no rebuild-per-host is needed.
//
//  3. Verify deep links survive the host's redirect rules. Games are selected
//     by the ?game= query parameter (GAME_PARAM), so any rule that rewrites
//     or canonicalises paths must preserve the query string. Cloudflare's
//     "Always Use HTTPS" and bulk redirects both preserve it by default; a
//     hand-written Page Rule with a fixed destination URL does NOT.
//
//  4. If staying on GitHub Pages alongside a custom domain, remember the
//     CNAME file — it must live in public/ so the build copies it into dist/,
//     otherwise every deploy silently drops the domain setting.
//
//  5. Re-check the three URL surfaces afterwards: the address bar while
//     navigating, the "Share result" text from each game, and a cold load of
//     a shared link in a private window.


/**
 * Query parameter that selects a game. A query param rather than a path
 * segment because the site is served statically from GitHub Pages, where
 * `/colorpath` would 404 without an SPA fallback page.
 */
export const GAME_PARAM = "game";

/** Direct link to one game, for share text and for copying out of the bar. */
export function gameUrl(gameId) {
  const base = shareUrl();
  if (!base || !gameId) return base;
  try {
    // The URL API normalises as it goes — "https://example.com" becomes
    // "https://example.com/?game=…" rather than the redirect-prone
    // "https://example.com?game=…".
    const u = new URL(base);
    u.searchParams.set(GAME_PARAM, gameId);
    return u.href;
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}${GAME_PARAM}=${encodeURIComponent(gameId)}`;
  }
}

/** The URL to advertise in shared text. */
export function shareUrl() {
  if (SITE_URL) return SITE_URL;
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    // Drop index.html but KEEP a directory's trailing slash. Stripping it
    // turned "/aintaword2/" into "/aintaword2", which a static host answers
    // with a 301 to the slashed form — an extra hop on every shared link, and
    // one that has to be trusted to carry the ?game= query across.
    const path = location.pathname.replace(/\/index\.html$/, "/");
    return location.origin + (path.endsWith("/") ? path : path + "/");
  }
  return "";
}
