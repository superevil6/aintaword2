// Vite plugin: per-game link-preview pages.
//
// Emits one real HTML file per game — g/<id>/index.html — carrying that game's
// title and description (from src/shareManifest.js) so a crawler unfurling a
// shared link shows the right game. The page then bounces a human straight into
// the app at ?game=<id>. See src/shareManifest.js for why this is necessary.
//
// The pages reference no bundled assets — they are pure meta + a redirect — so
// they need neither a rollup entry nor the base path, and the same generator
// serves them in dev (configureServer) and writes them at build (generateBundle).

import { GAME_SHARE, SITE_SHARE } from "../src/shareManifest.js";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * The share page for one game.
 * @param {string} id
 * @param {string} siteUrl  canonical origin, or "" when not yet configured
 */
export function pageFor(id, siteUrl = "") {
  const { title, description } = GAME_SHARE[id];
  // The app lives at the site root; this page sits two levels down at g/<id>/.
  const appRelative = `../../?game=${encodeURIComponent(id)}`;
  const canonical = siteUrl ? `${siteUrl}/?game=${encodeURIComponent(id)}` : "";

  const og = [
    ["og:type", "website"],
    ["og:site_name", SITE_SHARE.title],
    ["og:title", title],
    ["og:description", description],
    canonical ? ["og:url", canonical] : null,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f1220" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
${og.map(([p, c]) => `    <meta property="${p}" content="${esc(c)}" />`).join("\n")}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    ${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ""}
    <!-- A crawler reads the tags above and stops here. A human's browser runs
         this and lands in the game; a browser with JS off gets the link below. -->
    <script>location.replace(${JSON.stringify(appRelative)});</script>
    <meta http-equiv="refresh" content="0; url=${esc(appRelative)}" />
  </head>
  <body>
    <p>Opening <a href="${esc(appRelative)}">${esc(title)}</a>…</p>
  </body>
</html>
`;
}

export function sharePages({ siteUrl = "" } = {}) {
  const ids = Object.keys(GAME_SHARE);
  return {
    name: "wordgames-share-pages",

    // Build: write g/<id>/index.html into the output.
    generateBundle() {
      for (const id of ids) {
        this.emitFile({
          type: "asset",
          fileName: `g/${id}/index.html`,
          source: pageFor(id, siteUrl),
        });
      }
    },

    // Dev: serve the same pages so a copied link resolves against the dev server
    // instead of 404ing, keeping dev and prod honest.
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
