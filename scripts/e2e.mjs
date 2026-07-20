// Headless end-to-end test of the actual game controller (game.js) driven
// through jsdom — no browser required. Exercises the real DOM the game builds,
// real click handlers, real scoring, the real countdown, and game-over.
//
//   node scripts/e2e.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

// --- install a browser-like environment as globals ------------------------
const dom = new JSDOM(`<!DOCTYPE html><body><div id="app"></div></body>`, {
  pretendToBeVisual: true, // provides requestAnimationFrame / cancelAnimationFrame
  url: "http://localhost/",
});
const { window } = dom;
// NB: do NOT copy jsdom's `performance` — it internally calls the global
// `performance.now()`, so shadowing the global with it causes infinite
// recursion. Node's native global `performance` works fine for timer.js.
for (const k of [
  "window",
  "document",
  "localStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "HTMLElement",
]) {
  globalThis[k] = window[k];
}

// Import AFTER globals exist (game.js touches window at import time via bind only,
// but be safe).
const { AintAWordGame } = await import("../src/games/aintaword/game.js");
const { wordsForTiers } = await import("../src/data/commonWords.js");
const { DIFFICULTIES, DIFFICULTY_ORDER } = await import("../src/games/aintaword/difficulty.js");
const COMMON_WORDS = wordsForTiers();

// --- dictionary shim (load real word list from disk) ----------------------
const dir = path.dirname(fileURLToPath(import.meta.url));
const text = readFileSync(path.join(dir, "../public/data/dictionary.txt"), "utf8");
const valid = new Set(text.split("\n").map((w) => w.trim()).filter(Boolean));
const sources = [...new Set(COMMON_WORDS.map((w) => w.toLowerCase()))];
for (const w of sources) valid.add(w);
const dict = {
  isWord: (w) => valid.has(w.toLowerCase()),
  sourcePool: ({ minLen = 0, maxLen = Infinity, tiers = null } = {}) =>
    (tiers ? wordsForTiers(tiers) : sources).filter(
      (w) => w.length >= minLen && w.length <= maxLen,
    ),
};

// --- assertions -----------------------------------------------------------
let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};

const app = document.getElementById("app");
// Deterministic run via a fixed seed.
const game = new AintAWordGame(app, dict, { seed: "e2e-fixed-seed" });

console.log("difficulty select screen:");
ok(document.querySelector(".aaw-title")?.textContent === "Ain't a Word", "title renders");
ok(game.state === "select", "opens on the picker, not straight into a game");
const picks = [...document.querySelectorAll(".aaw-pick")];
ok(picks.length === 3, `three difficulties offered (${picks.length})`);
ok(
  picks.map((p) => p.querySelector(".aaw-pick-label").textContent).join(",") === "Easy,Medium,Hard",
  "in ascending order of difficulty",
);
ok(
  picks.every((p) => !p.classList.contains("is-done")),
  "none marked as played on a fresh day",
);

game.start();
console.log("\nafter start:");
ok(game.state === "playing", "state is playing");
ok(game.timer.running, "clock is running");
const words = () => [...document.querySelectorAll(".aaw-word")].map((n) => n.textContent);
ok(words().filter(Boolean).length === 2, "two words are shown");
ok(words().includes(game.pair.real) && words().includes(game.pair.fake), "shown words match the pair");

console.log("\ncorrect pick scores a point:");
const before = game.score;
game.choiceEls[game.correctSide].click();
ok(game.score === before + 1, `score ${before} -> ${game.score}`);
ok(document.querySelector(".aaw-score").textContent === `Score ${game.score}`, "score HUD updated");

console.log("\nwrong pick costs three seconds:");
const remainingBefore = game.timer.remainingMs;
const scoreBefore = game.score;
game.choiceEls[1 - game.correctSide].click(); // wrong button
const burned = remainingBefore - game.timer.remainingMs;
ok(game.score === scoreBefore, "score unchanged on wrong pick");
ok(burned >= 2990, `≈3s burned off the clock (${Math.round(burned)}ms)`);
ok(burned < 3200, "penalty is 3s, not a multiple of it (no double-charging)");

const penalty = document.querySelector(".aaw-penalty");
ok(penalty?.textContent === "-3", `floating indicator reads "${penalty?.textContent}"`);
ok(penalty?.classList.contains("is-shown"), "indicator animation triggered");
// It must live outside .aaw-clock-num, whose textContent is rewritten each
// frame — otherwise the clock tick would silently delete it.
ok(
  !document.querySelector(".aaw-clock-num .aaw-penalty"),
  "indicator is not inside the per-frame clock readout",
);
game._renderClock(30_000); // simulate a tick
ok(document.querySelector(".aaw-penalty"), "indicator survives a clock tick");

console.log("\nplay a burst of correct picks:");
for (let i = 0; i < 25; i++) game.choiceEls[game.correctSide].click();
ok(game.score >= 25, `score climbed to ${game.score}`);
// invariants still hold mid-game
ok(dict.isWord(game.pair.real) && !dict.isWord(game.pair.fake), "current pair still valid (real real, fake fake)");

console.log("\ngame over on timeout:");
game.timer.adjust(-999999); // force the clock to zero
ok(game.state === "over", "state is over");
ok(!!document.querySelector(".aaw-final"), "final score screen shown");
ok(document.querySelector(".aaw-final").textContent === String(game.score), "final score matches");
const best = parseInt(localStorage.getItem("aintaword2:aintaword:best:medium") || "0", 10);
ok(best === game.score, `per-difficulty best persisted (medium: ${best})`);

console.log("\nend-of-game word review:");
const rows = [...document.querySelectorAll(".aaw-round")];
// 26 correct + 1 wrong pick were answered; the round on screen at timeout isn't.
ok(game.history.length === 27, `history logged ${game.history.length} answered rounds`);
ok(rows.length === game.history.length, `${rows.length} rows rendered, one per round`);
ok(
  document.querySelectorAll(".aaw-round.is-miss").length === 1,
  "the single wrong pick is marked as a miss",
);
const firstRow = rows[0];
ok(
  firstRow.querySelector(".aaw-round-real").textContent === game.history[0].real &&
    firstRow.querySelector(".aaw-round-fake").textContent === game.history[0].fake,
  `first row shows the real/fake pair (${game.history[0].real} / ${game.history[0].fake})`,
);
ok(
  game.history.every((r) => dict.isWord(r.real) && !dict.isWord(r.fake)),
  "every logged round has a real real word and a fake fake word",
);
ok(
  /27 words · 1 missed/.test(document.querySelector(".aaw-review-head").textContent),
  `review header summarises: "${document.querySelector(".aaw-review-head").textContent}"`,
);

console.log("\n'Play again' returns to the picker (not a replay):");
const playAgain = [...document.querySelectorAll(".aaw-btn")].find((b) =>
  /Play again/.test(b.textContent),
);
playAgain.click();
ok(game.state === "select", "back on the difficulty picker");
ok(!document.querySelector(".aaw-round"), "result review cleared from the DOM");

console.log("\ndifficulties already played today:");
const after = [...document.querySelectorAll(".aaw-pick")];
const medPick = after[1];
ok(medPick.classList.contains("is-done"), "medium is marked as played");
ok(
  medPick.querySelector(".aaw-pick-score")?.textContent === String(best),
  `shows the score achieved (${best})`,
);
ok(
  !after[0].classList.contains("is-done") && !after[2].classList.contains("is-done"),
  "easy and hard remain unplayed",
);

// Re-selecting a played difficulty must show the stored result, NOT replay it.
medPick.click();
ok(game.state === "over", "re-selecting a played difficulty goes to its result");
ok(game.score === best, "restores the stored score");
ok(document.querySelectorAll(".aaw-round").length > 0, "restores the round-by-round review");
ok(!!document.querySelector(".aaw-note"), "explains it was already played today");
ok(game.timer.running === false, "no new run was started");

// An unplayed one still starts normally.
document.querySelectorAll(".aaw-btn").forEach((b) => /Play again/.test(b.textContent) && b.click());
[...document.querySelectorAll(".aaw-pick")][0].click();
ok(game.state === "playing", "an unplayed difficulty starts a run");
ok(game.profile.id === "easy", "at the chosen difficulty");
game.timer.adjust(-999999);

game.destroy();
ok(document.getElementById("app").innerHTML === "", "destroy() cleans up the DOM");

// --- difficulty profiles --------------------------------------------------

function runGame({ seed, difficulty, rounds, pickCorrect }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const g = new AintAWordGame(host, dict, { seed, difficulty });
  g.start();
  const seq = [];
  for (let i = 0; i < rounds && g.state === "playing"; i++) {
    seq.push({ real: g.pair.real, fake: g.pair.fake });
    g.choiceEls[pickCorrect ? g.correctSide : 1 - g.correctSide].click();
  }
  g.destroy();
  host.remove();
  return seq;
}

console.log("\ndifficulty profiles enforce their word bands:");
for (const id of DIFFICULTY_ORDER) {
  const prof = DIFFICULTIES[id];
  const seq = runGame({ seed: `band-${id}`, difficulty: id, rounds: 40, pickCorrect: true });
  const strays = seq.filter((r) => r.real.length < prof.minLen || r.real.length > prof.maxLen);
  ok(
    strays.length === 0,
    `${id}: all ${seq.length} rounds within ${prof.minLen}-${prof.maxLen} letters` +
      (strays.length ? ` — stray: ${strays[0].real}` : ""),
  );
}

console.log("\ndaily-set determinism:");
const runA = runGame({ seed: "daily-2026-07-19", difficulty: "medium", rounds: 20, pickCorrect: true });
const runB = runGame({ seed: "daily-2026-07-19", difficulty: "medium", rounds: 20, pickCorrect: true });
ok(JSON.stringify(runA) === JSON.stringify(runB), "same seed → identical word sequence");

// THE property a shared daily challenge depends on: two players on the same
// seed must see the same words even if one of them is playing badly. The old
// score-based difficulty ramp broke exactly this.
const good = runGame({ seed: "daily-2026-07-19", difficulty: "medium", rounds: 15, pickCorrect: true });
const bad = runGame({ seed: "daily-2026-07-19", difficulty: "medium", rounds: 15, pickCorrect: false });
ok(
  JSON.stringify(good) === JSON.stringify(bad),
  "sequence is independent of whether the player picks right or wrong",
);

const other = runGame({ seed: "daily-2026-07-20", difficulty: "medium", rounds: 20, pickCorrect: true });
ok(JSON.stringify(runA) !== JSON.stringify(other), "a different seed gives a different set");

// With NO explicit seed the game derives one from (UTC date + difficulty).
// This is the actual shared-daily property: two separate players, no shared
// state, same day → same words.
function playerRun(difficulty) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const g = new AintAWordGame(host, dict, {}); // no seed — real daily behaviour
  g.start(difficulty);
  const seq = [];
  for (let i = 0; i < 12; i++) {
    seq.push(`${g.pair.real}/${g.pair.fake}`);
    g.choiceEls[g.correctSide].click();
  }
  g.destroy();
  host.remove();
  return seq;
}
const playerOne = playerRun("hard");
const playerTwo = playerRun("hard");
ok(
  JSON.stringify(playerOne) === JSON.stringify(playerTwo),
  "two different players get identical words for today's Hard",
);
ok(
  JSON.stringify(playerRun("easy")) !== JSON.stringify(playerOne),
  "each difficulty has its own distinct daily set",
);

// --- share text -----------------------------------------------------------

const { buildShareText } = await import("../src/games/aintaword/share.js");

console.log("\nshare text:");
const hist = (pattern) => [...pattern].map((c) => ({ correct: c === "1" }));
const sample = buildShareText({
  score: 11,
  history: hist("111011111111"),
  difficultyLabel: "Medium",
  url: "https://example.com",
});
console.log(sample.split("\n").map((l) => `    ${l}`).join("\n"));

ok(sample.includes("Ain't a Word"), "includes the game name");
ok(sample.includes("Medium"), "includes the difficulty");
ok(sample.includes("11 words"), "includes the score");
ok(sample.includes("92% accurate"), "includes accuracy (11/12)");
ok(sample.includes("https://example.com"), "includes the link");
ok(sample.split("\n").pop() === "https://example.com", "link is the last line");
ok((sample.match(/🟥/g) || []).length === 1, "one red square for the single miss");
ok((sample.match(/🟩/g) || []).length === 11, "eleven green squares");

// Spoiler safety matters most once the daily ships: a share that leaked the
// words would ruin that day's puzzle for anyone who read it.
const spoiler = buildShareText({
  score: game.score,
  history: good.map((r) => ({ correct: true, ...r })),
  difficultyLabel: "Medium",
  url: "",
});
ok(
  good.every((r) => !spoiler.includes(r.real) && !spoiler.includes(r.fake)),
  "share text never leaks any of the words",
);

const dailyText = buildShareText({
  score: 5,
  history: hist("11111"),
  difficultyLabel: "Hard",
  daily: "2026-07-19",
  url: "https://example.com",
});
ok(dailyText.includes("Daily 2026-07-19"), "daily runs are labelled by date");

// A long run must not become an unreadable wall of emoji.
const huge = buildShareText({ score: 80, history: hist("1".repeat(80)), url: "" });
ok(huge.includes("+20 more"), "caps the grid at 60 squares and notes the rest");
ok(
  huge.split("\n").every((l) => (l.match(/🟩|🟥/g) || []).length <= 10),
  "squares wrap at 10 per line",
);

const noLink = buildShareText({ score: 3, history: hist("111"), url: "" });
ok(!noLink.includes("http"), "omits the link cleanly when no URL is configured");

console.log("\nshare button on the game-over card:");
const shareHost = document.createElement("div");
document.body.appendChild(shareHost);
const g2 = new AintAWordGame(shareHost, dict, { seed: "share-ui", difficulty: "easy" });
g2.start();
for (let i = 0; i < 5; i++) g2.choiceEls[g2.correctSide].click();
g2.timer.adjust(-999999);

const shareBtn = [...shareHost.querySelectorAll(".aaw-btn")].find((b) => /Share/.test(b.textContent));
ok(!!shareBtn, "share button rendered");
ok(g2.shareText().includes("5 words"), "shareText() reflects the finished run");
ok(g2.shareText().includes("Easy"), "shareText() reflects the difficulty played");

// jsdom implements neither navigator.clipboard nor execCommand, so this is a
// genuine exercise of the blocked-clipboard path (plain http, in-app browsers).
await g2._share(shareBtn);
const box = shareHost.querySelector(".aaw-share-box");
ok(!!box, "falls back to a manual-copy box when the clipboard is unavailable");
ok(box.value === g2.shareText(), "fallback box holds the exact share text");
ok(!/Copied!/.test(shareBtn.textContent), "does not falsely claim it copied");
g2.destroy();
shareHost.remove();

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
