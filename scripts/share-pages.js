// Vite plugin: per-game landing pages, home crawlable fallback, and sitemap.
//
// The app is a client-rendered SPA, which search engines index weakly. This
// plugin adds the server-rendered surfaces that actually rank:
//
//   • g/<id>/index.html — a REAL content page per game (heading, description,
//     link-preview image, structured data) with a "Play" button into the app.
//     It is each game's canonical URL. Earlier this was a thin page that instantly
//     redirected into the app; that unfurled links but gave search nothing to
//     index, so it's now genuine content a human (or crawler) can read first.
//   • index.html — a crawlable fallback (heading + intro + links to every game)
//     injected into #app, which the app replaces on mount (main.js
//     replaceChildren). Plus WebSite/ItemList structured data.
//   • sitemap.xml — home, every game page, and the legal pages, with freshness
//     hints. Generated here so it never drifts from the game list.
//
// One source of truth for copy: src/shareManifest.js.

import { GAME_SHARE, SITE_SHARE } from "../src/shareManifest.js";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Serialize JSON-LD, neutralizing any `</script>` the data could smuggle in. */
const ld = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

/** First sentence of a blurb, for a compact one-line game description. */
const firstSentence = (s) => String(s).split(/(?<=[.!?])\s+/)[0];

// Small dark stylesheet shared by every generated landing page (inlined so the
// page is fully self-contained — no bundle dependency, no base-path concerns).
const PAGE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1220; color: #eef0ff;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 1.75rem 1.25rem 4rem; }
  .brand { display: inline-block; margin-bottom: 1.5rem; color: #a6abcf;
    text-decoration: none; font-weight: 700; }
  .brand:hover { color: #eef0ff; }
  .hero { display: block; width: 100%; height: auto; border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08); margin-bottom: 1.5rem; }
  h1 { font-size: clamp(1.9rem, 6vw, 2.6rem); font-weight: 800; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
  .lede { font-size: 1.1rem; color: #dfe2f5; margin: 0 0 1rem; }
  .meta { color: #a6abcf; margin: 0 0 1.75rem; }
  .play { display: inline-block; padding: 0.8rem 1.6rem; border-radius: 12px;
    background: #7c5cff; color: #fff; font-weight: 700; text-decoration: none; }
  .play:hover { filter: brightness(1.08); }
  .more { margin-top: 2rem; }
  .more a { color: #a99bff; }
`;

/**
 * A game's landing page — real content, canonical to itself, with a Play link.
 * @param {string} id
 * @param {string} siteUrl  canonical origin, or "" when not yet configured
 */
export function pageFor(id, siteUrl = "") {
  const { title, description } = GAME_SHARE[id];
  // The app lives at the site root; this page sits two levels down at g/<id>/.
  const appRelative = `../../?game=${encodeURIComponent(id)}`;
  // This page is the canonical home for the game now (not the ?game= app URL).
  const canonical = siteUrl ? `${siteUrl}/g/${encodeURIComponent(id)}/` : "";
  const imageUrl = siteUrl ? `${siteUrl}/og/${id}.png` : `../../og/${id}.png`;

  const og = [
    ["og:type", "website"],
    ["og:site_name", SITE_SHARE.title],
    ["og:title", title],
    ["og:description", description],
    canonical ? ["og:url", canonical] : null,
    ["og:image", imageUrl],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    ["og:image:alt", `${title} — a daily puzzle on ${SITE_SHARE.title}`],
  ].filter(Boolean);

  // Structured data — only with an absolute origin (schema URLs must be absolute).
  let jsonLd = "";
  if (siteUrl) {
    const game = {
      "@context": "https://schema.org",
      "@type": "VideoGame",
      name: title,
      description,
      url: canonical,
      image: `${siteUrl}/og/${id}.png`,
      applicationCategory: "GameApplication",
      genre: "Puzzle",
      gamePlatform: "Web browser",
      operatingSystem: "Any",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: SITE_SHARE.title, url: `${siteUrl}/` },
    };
    const crumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_SHARE.title, item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: title, item: canonical },
      ],
    };
    jsonLd =
      `\n    <script type="application/ld+json">${ld(game)}</script>` +
      `\n    <script type="application/ld+json">${ld(crumbs)}</script>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f1220" />
    <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="../../favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="../../apple-touch-icon.png" />
    <title>${esc(title)} — free daily puzzle · ${esc(SITE_SHARE.title)}</title>
    <meta name="description" content="${esc(description)}" />
${og.map(([p, c]) => `    <meta property="${p}" content="${esc(c)}" />`).join("\n")}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    ${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ""}${jsonLd}
    <style>${PAGE_CSS}</style>
  </head>
  <body>
    <main class="wrap">
      <a class="brand" href="/">← ${esc(SITE_SHARE.title)}</a>
      <img class="hero" src="${esc(imageUrl)}" alt="${esc(title)} — daily puzzle" width="1200" height="630" />
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(description)}</p>
      <p class="meta">A free daily puzzle on ${esc(SITE_SHARE.title)} — a new board every day, no sign-up, playable right in your browser.</p>
      <a class="play" href="${esc(appRelative)}">Play ${esc(title)} →</a>
      <p class="more"><a href="/">Explore all ${esc(SITE_SHARE.title)} games →</a></p>
    </main>
  </body>
</html>
`;
}

/**
 * Crawlable fallback for the home page: a heading, intro, and a link to every
 * game. Injected into #app; the app replaces it on mount, so real users never
 * see it, but search engines and no-JS visitors get real content + internal
 * links instead of an empty <div>.
 */
export function homeFallbackHtml() {
  const items = Object.keys(GAME_SHARE)
    .map(
      (id) =>
        `<li><a href="/g/${id}/">${esc(GAME_SHARE[id].title)}</a> — ${esc(firstSentence(GAME_SHARE[id].description))}</li>`,
    )
    .join("\n        ");
  return `<main class="pre-render">
      <h1>${esc(SITE_SHARE.title)} — free daily word &amp; logic puzzle games</h1>
      <p>${esc(SITE_SHARE.description)}</p>
      <nav aria-label="Games"><ul>
        ${items}
      </ul></nav>
      <p>A new board every day. No account needed.</p>
    </main>`;
}

/** WebSite + ItemList structured data for the home page. */
export function homeJsonLd(siteUrl) {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_SHARE.title,
    url: `${siteUrl}/`,
    description: SITE_SHARE.description,
    inLanguage: "en",
  };
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE_SHARE.title} games`,
    itemListElement: Object.keys(GAME_SHARE).map((id, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}/g/${id}/`,
      name: GAME_SHARE[id].title,
    })),
  };
  return (
    `<script type="application/ld+json">${ld(website)}</script>\n` +
    `    <script type="application/ld+json">${ld(list)}</script>`
  );
}

/** A sitemap over the home page, each game's landing page, and the legal pages. */
export function sitemapXml(ids, siteUrl, lastmod) {
  const base = siteUrl.replace(/\/$/, "");
  const entry = (loc, { freq, priority } = {}) =>
    `  <url><loc>${esc(loc)}</loc>` +
    (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
    (freq ? `<changefreq>${freq}</changefreq>` : "") +
    (priority ? `<priority>${priority}</priority>` : "") +
    `</url>`;
  const urls = [
    entry(`${base}/`, { freq: "daily", priority: "1.0" }),
    // Puzzles change daily, so the game pages are "daily" too.
    ...ids.map((id) => entry(`${base}/g/${id}/`, { freq: "daily", priority: "0.8" })),
    entry(`${base}/privacy/`, { freq: "yearly", priority: "0.3" }),
    entry(`${base}/terms/`, { freq: "yearly", priority: "0.3" }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function sharePages({ siteUrl = "" } = {}) {
  const ids = Object.keys(GAME_SHARE);
  // Build-time date (UTC) for sitemap freshness. This is a normal Node plugin,
  // so Date is available here.
  const buildDate = new Date().toISOString().slice(0, 10);

  return {
    name: "wordgames-share-pages",

    // Inject the crawlable fallback + structured data into the home page.
    transformIndexHtml(html) {
      let out = html.replace(
        /<div id="app"([^>]*)><\/div>/,
        (_m, attrs) => `<div id="app"${attrs}>${homeFallbackHtml()}</div>`,
      );
      if (siteUrl) {
        out = out.replace("</head>", `  ${homeJsonLd(siteUrl)}\n  </head>`);
      }
      return out;
    },

    // Build: write g/<id>/index.html and the sitemap into the output.
    generateBundle() {
      for (const id of ids) {
        this.emitFile({ type: "asset", fileName: `g/${id}/index.html`, source: pageFor(id, siteUrl) });
      }
      if (siteUrl) {
        this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(ids, siteUrl, buildDate) });
      }
    },

    // Dev: serve the same landing pages so a copied link resolves against the dev
    // server instead of 404ing, keeping dev and prod honest.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url && req.url.match(/^\/g\/([a-z0-9-]+)\/?(?:\?.*)?$/i);
        if (m && ids.includes(m[1])) {
          res.setHeader("Content-Type", "text/html");
          res.end(pageFor(m[1], siteUrl));
          return;
        }
        next();
      });
    },
  };
}
