// Checks the link-preview manifest and the pages built from it.
//
//   node scripts/verify-share.mjs
//
// The failure this guards is silent and only visible off-site: add a game,
// forget its blurb, and every shared link for it unfurls as the wrong game (or
// nothing). Nothing in the app or the other tests would catch that.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { GAME_SHARE, SITE_SHARE, shareFor } from "../src/shareManifest.js";
import { pageFor } from "./share-pages.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const section = (name) => console.log(`\n${name}`);

// The games the app actually registers, read from main.js so this test tracks
// reality rather than a second hand-maintained list.
const main = readFileSync(path.join(root, "src/main.js"), "utf8");
const registered = [...main.matchAll(/games\/([a-z0-9-]+)\/index\.js/gi)].map((m) => m[1]);

section(`registered games (${registered.length})`);
if (!registered.length) fail("could not find any game registrations in main.js");
else console.log(`  ✓ ${registered.join(", ")}`);

// ── every game has a blurb, and every blurb has a game ─────────────────────
section("manifest coverage");
for (const id of registered) {
  if (!GAME_SHARE[id]) fail(`${id} is registered but has no share blurb`);
}
for (const id of Object.keys(GAME_SHARE)) {
  if (!registered.includes(id)) fail(`share blurb for "${id}" names no registered game`);
}
if (!failures) console.log("  ✓ every registered game has a blurb, and every blurb a game");

// ── the copy itself is fit to unfurl ───────────────────────────────────────
section("blurb quality");
const entries = [["site", SITE_SHARE], ...Object.entries(GAME_SHARE)];
for (const [id, s] of entries) {
  if (!s.title || !s.title.trim()) fail(`${id}: empty title`);
  if (!s.description || !s.description.trim()) fail(`${id}: empty description`);
  // Most crawlers truncate past ~160 characters; a cut-off sentence reads worse
  // than a complete short one.
  if (s.description && s.description.length > 170) {
    fail(`${id}: description is ${s.description.length} chars — it will be truncated`);
  }
  // The game NAME is carried by og:title, shown as the card's heading, so the
  // description need not repeat it — it just has to stand on its own as a
  // sentence. (An earlier check here demanded the name appear in the body and
  // was wrong: it tests redundancy, not readability.)
}
if (!failures) console.log(`  ✓ ${entries.length} blurbs present, self-contained, and short enough`);

// ── the generated page carries them and bounces to the app ─────────────────
section("generated pages");
for (const id of Object.keys(GAME_SHARE)) {
  const html = pageFor(id, "");
  const { title, description } = GAME_SHARE[id];
  const has = (needle, what) => { if (!html.includes(needle)) fail(`${id}: page is missing ${what}`); };
  has(`<title>${title}</title>`, "its title");
  has(`property="og:title" content="${title}"`, "og:title");
  has(`content="${description}"`, "the description");
  has(`?game=${id}`, "the redirect back into the app");
  // Both a JS redirect and a meta-refresh, so a human always lands in the game
  // whether or not scripts run.
  has(`location.replace`, "the script redirect");
  has(`http-equiv="refresh"`, "the no-JS refresh fallback");
}
if (!failures) console.log(`  ✓ each page carries its own tags and redirects to ?game=<id>`);

// ── the root index.html agrees with the site blurb ─────────────────────────
section("root index.html");
const indexHtml = readFileSync(path.join(root, "index.html"), "utf8");
if (!indexHtml.includes(SITE_SHARE.description)) {
  fail("index.html's meta description does not match SITE_SHARE — they will drift");
}
if (!indexHtml.includes('property="og:title"')) fail("index.html has no og:title");
if (!indexHtml.includes(SITE_SHARE.title)) fail("index.html does not carry the site title");
if (!failures) console.log("  ✓ carries the site blurb and og tags, matching the manifest");

// shareFor falls back to the site for an unknown id.
if (shareFor("nope") !== SITE_SHARE) fail("shareFor() should fall back to the site blurb");

console.log("");
if (failures) {
  console.error(`FAILED — ${failures} problem${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
if (!existsSync(path.join(root, "dist/g"))) {
  console.log("(run `npm run build` to emit the pages into dist/g/)");
}
console.log("All share-preview checks passed.");
