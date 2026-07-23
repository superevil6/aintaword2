// Site-wide configuration.

/**
 * Display name of the site, shown in the top banner on every screen.
 *
 * The link-preview brand title lives separately in shareManifest.js
 * (SITE_SHARE.title) so a crawler sees it without running JS — keep the two in
 * sync when renaming.
 */
export const SITE_NAME = "Wordems";

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
export const SITE_URL = "https://wordems.com";

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
//  4. Hosting is Cloudflare Pages: the custom domain is added in the Pages
//     project dashboard (Custom domains → add wordems.com), NOT via a CNAME
//     file. The public/ CNAME trick was GitHub-Pages-only; don't add one here.
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

/**
 * Lemon Squeezy checkout URL for the supporter tier. Paste the product/variant
 * checkout link here once the LS product exists (Store → Products → Share).
 * Empty string hides the buy button, leaving only the "enter your key" path.
 * The test-mode and live checkout URLs differ — use the test one while building.
 */
export const SUPPORTER_CHECKOUT_URL =
  "https://wordems.lemonsqueezy.com/checkout/buy/c9656b0c-ab4c-4835-a6bf-f4ef341d1217?discount=0";

/**
 * Query parameter that selects a past day to replay (the archive, a supporter
 * perk), as "YYYY-MM-DD". Same query-param rationale as GAME_PARAM: it survives
 * deep links, the back button, and refresh, and a shared archive link works on
 * any host. Absent means "today's puzzle".
 */
export const DAY_PARAM = "day";

/**
 * Earliest day the archive lets a supporter reach, "YYYY-MM-DD" (UTC).
 *
 * Puzzles are seed-derived, so ANY past date regenerates a valid board — this
 * floor is a product choice (how far back the archive goes), not a technical
 * limit. Games backed by a prebuilt daily-set file only carry a precomputed par
 * within their generated range; older days still play, they just fall back to
 * on-the-fly generation (see e.g. games/numburst/dailySet.js).
 *
 * ── SET THIS to the real launch date once the site is public, so the archive
 * doesn't advertise days from before the game existed. Per-game overrides can
 * come later if a game launches after this date.
 */
export const ARCHIVE_START = "2026-01-01";

/**
 * Direct link to one game, for the "share your result" text.
 *
 * Points at the game's link-preview page (g/<id>/), NOT at ?game=<id>. The two
 * reach the same place — the preview page bounces the browser to ?game=<id> —
 * but only the preview page carries that game's own title and blurb for a
 * crawler unfurling the link (see src/shareManifest.js and scripts/share-pages).
 * A shared score is exactly the link that gets unfurled, so it takes the path
 * that previews correctly.
 */
export function gameUrl(gameId) {
  const base = shareUrl();
  if (!base || !gameId) return base;
  const slug = `g/${encodeURIComponent(gameId)}/`;
  try {
    // Resolve the slug against the (slash-terminated) base so it lands at
    // <base>/g/<id>/ on any host or subpath.
    return new URL(slug, base.endsWith("/") ? base : base + "/").href;
  } catch {
    return `${base.endsWith("/") ? base : base + "/"}${slug}`;
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
