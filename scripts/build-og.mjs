// Generates the site's favicon set and link-preview (OG) images.
//
// Run manually — like the other build-* scripts — and commit the output under
// public/. Deploy/CI never runs this, so the hosting pipeline needs no image
// toolchain; it just serves the committed PNGs. Re-run whenever a game's motif,
// accent, or share copy changes:
//
//   npm run og
//
// Rendering is done by rsvg-convert (librsvg), which must be on PATH locally.
// We compose an SVG per asset, hand it to rsvg-convert, and write a PNG.
//
// Sources of truth, all Node-safe (no CSS/DOM imports):
//   - src/hubArt.js        the per-game motifs (same art the hub tiles use)
//   - src/shareManifest.js the per-game + site share title/description
//   - ACCENTS below        the per-game accent colours (mirrors each index.js)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { hubArt } from "../src/hubArt.js";
import { GAME_SHARE } from "../src/shareManifest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");
const OG_DIR = join(OUT, "og");
const TMP = join(ROOT, "scripts", ".og-tmp");

const BG = "#0f1220";
const BG_2 = "#171a2e";
const FG = "#eef0ff";
const FG_DIM = "#a6abcf";
const BRAND = "#7c5cff";

// Per-game accent, mirroring the `accent:` in each src/games/<id>/index.js.
// Kept here (not imported) because the descriptors live in modules that import
// CSS, which Node can't load. If an accent changes there, change it here too.
const ACCENTS = {
  aintaword: "#7c5cff",
  colorpath: "#e07818",
  wordiamond: "#5b8ff5",
  numburst: "#ff8a3d",
  photonfinish: "#4ad9e4",
  vanityplate: "#f4c430",
  rootword: "#4fc978",
  mirrorword: "#49c6e0",
  storey: "#d0553f",
  colordrop: "#d84a94",
  lettershooter: "#7c5cff",
  sigilsweep: "#b98cff",
};

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * A short, self-contained blurb for a visual card: the opening sentence, capped
 * at a word boundary with an ellipsis and no dangling function word, so it never
 * trails off mid-thought like a truncated paragraph.
 */
function blurb(text, maxChars = 90) {
  const first = text.split(/(?<=[.!?])\s+/)[0];
  if (first.length <= maxChars) return first;
  let cut = first.slice(0, maxChars);
  cut = cut.slice(0, cut.lastIndexOf(" "));
  cut = cut
    .replace(/[\s—–-]+$/, "")
    .replace(/\s+(a|an|the|and|on|in|to|of|its|it|as|at|by|for|with|each|that)$/i, "");
  return `${cut}…`;
}

/** Greedy word-wrap into lines of about `perLine` chars, capped at `maxLines`. */
function wrap(text, perLine, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > perLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Genuine overflow (rare — blurb() already bounds length): keep the first
  // lines and mark the cut on the last kept one rather than dropping silently.
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:—–\- ]*$/, "") + "…";
  return kept;
}

/**
 * Place a motif into a box at (x,y,size), tinted `color` at `opacity`.
 * Injects positioning onto the motif's own <svg> (a nested SVG), which keeps
 * the fill/stroke presentation attributes the paths inherit from that element —
 * stripping the wrapper drops them and the line-art fills solid black.
 */
function motif(id, x, y, size, color, opacity) {
  return hubArt(id).replace(
    "<svg ",
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" color="${color}" opacity="${opacity}" `,
  );
}

function render(svg, outFile, { width, height }) {
  mkdirSync(TMP, { recursive: true });
  const tmp = join(TMP, "asset.svg");
  writeFileSync(tmp, svg);
  execFileSync("rsvg-convert", [
    tmp,
    "-w", String(width),
    "-h", String(height),
    "-o", outFile,
  ]);
}

// ── OG card (1200×630) ──────────────────────────────────────────────────────

function gameCard(id) {
  const accent = ACCENTS[id] || BRAND;
  const { title, description } = GAME_SHARE[id];
  const descLines = wrap(blurb(description), 40, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="76%" cy="34%" r="60%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="20" y="20" width="1160" height="590" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- brand eyebrow (text only; the motif is the card's icon) -->
  <text x="82" y="98" fill="${FG_DIM}" font-family="sans-serif" font-size="24" font-weight="700" letter-spacing="1.5">WORDEMS · DAILY PUZZLE</text>

  <!-- title -->
  <text x="80" y="300" fill="${accent}" font-family="sans-serif" font-size="88" font-weight="800" letter-spacing="-1">${esc(
    title,
  )}</text>

  <!-- description -->
  <text x="82" y="372" fill="${FG}" font-family="sans-serif" font-size="30" font-weight="400">
    ${descLines
      .map((l, i) => `<tspan x="82" dy="${i === 0 ? 0 : 44}">${esc(l)}</tspan>`)
      .join("\n    ")}
  </text>

  <!-- motif -->
  ${motif(id, 812, 150, 330, accent, 0.9)}
</svg>`;
}

/** A hub-style mini tile: accent border + the game's motif, no text. */
function miniTile(id, x, y, w, h) {
  const accent = ACCENTS[id] || BRAND;
  const size = Math.min(w, h) * 0.66;
  const mx = x + (w - size) / 2;
  const my = y + (h - size) / 2;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${BG_2}" fill-opacity="0.5" stroke="${accent}" stroke-opacity="0.4" stroke-width="1.5"/>
    ${motif(id, mx, my, size, accent, 0.9)}
  </g>`;
}

function siteCard() {
  // The card IS the collection: a grid of the actual game tiles, so the preview
  // shows what Wordems is rather than a logo. Two rows, 5 + 4, centred.
  const ids = Object.keys(GAME_SHARE);
  const top = ids.slice(0, 5);
  const bottom = ids.slice(5);
  const tw = 200, th = 168, gap = 22;

  const rowSvg = (row, y) => {
    const rowW = row.length * tw + (row.length - 1) * gap;
    const x0 = (1200 - rowW) / 2;
    return row.map((id, i) => miniTile(id, x0 + i * (tw + gap), y, tw, th)).join("\n  ");
  };

  // A short, self-contained line — the full SITE_SHARE blurb is too long to sit
  // on one row under the title without clipping.
  const tagline = "Daily word & logic puzzles — a fresh board every day.";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="18%" r="72%">
      <stop offset="0%" stop-color="${BRAND}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="${BRAND}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="20" y="20" width="1160" height="590" rx="28" fill="none" stroke="${BRAND}" stroke-opacity="0.35" stroke-width="2"/>

  <text x="600" y="96" fill="${FG}" font-family="sans-serif" font-size="66" font-weight="800" letter-spacing="-1" text-anchor="middle">Wordems</text>
  <text x="600" y="140" fill="${FG_DIM}" font-family="sans-serif" font-size="26" font-weight="400" text-anchor="middle">${esc(
    tagline,
  )}</text>

  ${rowSvg(top, 178)}
  ${rowSvg(bottom, 178 + th + gap)}
</svg>`;
}

// ── Favicon ─────────────────────────────────────────────────────────────────

// A single cut gem on a dark tile — the wordiamond motif, filled and bolded so
// it holds up at 16px. Deliberately NOT a 2×2 grid of coloured squares: that
// silhouette reads as the Microsoft logo once the details drop out at favicon
// size. One clear shape sidesteps the resemblance and stays legible tiny.
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="${BG_2}" stroke="${BRAND}" stroke-opacity="0.5"/>
  <path d="M16 6 L26 15 L16 27 L6 15 Z" fill="${BRAND}"/>
  <path d="M6 15 H26 M16 6 L11.5 15 M16 6 L20.5 15" fill="none" stroke="${BG}" stroke-width="1.4" stroke-opacity="0.6"/>
</svg>`;
}

// PWA "maskable" icon: the same gem, but full-bleed (no rounded tile) with the
// gem kept inside the central ~60% safe zone, so a launcher can crop it to any
// shape — circle, squircle, rounded square — without clipping the mark.
function maskableIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${BG_2}"/>
  <path d="M50 27 L72 43 L50 79 L28 43 Z" fill="${BRAND}"/>
  <path d="M28 43 H72 M50 27 L41 43 L50 79 M50 27 L59 43 L50 79" fill="none" stroke="${BG}" stroke-width="1.6" stroke-opacity="0.6"/>
</svg>`;
}

// ── Run ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OG_DIR, { recursive: true });

  // Favicon: SVG source + raster fallbacks.
  const favSvg = faviconSvg();
  writeFileSync(join(OUT, "favicon.svg"), favSvg);
  render(favSvg, join(OUT, "favicon-32.png"), { width: 32, height: 32 });
  render(favSvg, join(OUT, "favicon-16.png"), { width: 16, height: 16 });
  render(favSvg, join(OUT, "apple-touch-icon.png"), { width: 180, height: 180 });
  console.log("favicon: svg + 32 + 16 + apple-touch-icon");

  // PWA install icons (referenced by public/manifest.webmanifest).
  render(favSvg, join(OUT, "icon-192.png"), { width: 192, height: 192 });
  render(favSvg, join(OUT, "icon-512.png"), { width: 512, height: 512 });
  render(maskableIconSvg(), join(OUT, "icon-maskable-512.png"), { width: 512, height: 512 });
  console.log("pwa icons: 192 + 512 + maskable-512");

  // Site OG card.
  render(siteCard(), join(OG_DIR, "site.png"), { width: 1200, height: 630 });
  console.log("og: site.png");

  // Per-game OG cards.
  for (const id of Object.keys(GAME_SHARE)) {
    render(gameCard(id), join(OG_DIR, `${id}.png`), { width: 1200, height: 630 });
    console.log(`og: ${id}.png`);
  }

  rmSync(TMP, { recursive: true, force: true });
  console.log("done");
}

main();
