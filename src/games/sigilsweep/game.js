// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets the e2e harness drive it under jsdom.
import { announceRoundComplete } from "../../core/lifecycle.js";
import { generateDailySet } from "./generator.js";
import { drawStatic, drawSweep, fitCanvas } from "./render.js";
import { scorePick, worthAt, BASE, HALF_LIFE_DEG, MAX_GUESSES } from "./scoring.js";
import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, getDifficulty,
} from "./difficulty.js";
import {
  todayKey, dailySeedFor, getResult, saveResult, bestResult, recordBest,
} from "./results.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { setsFor } from "./dailySet.js";
import { mountTutorial } from "./tutorial.js";

const ROTATION_MS = 5000;   // one full 360° sweep; a feel knob, NOT a scoring one
const SWEEP_PX = 340;       // css size of the play canvas
const OPTION_PX = 108;      // css size of an option tile
const INK = "#ece7dc";
const GOOD = "#7fce97";

/** Degrees the sweep has advanced since a puzzle was shown. */
function degreesSince(ms) {
  return (ms / ROTATION_MS) * 360;
}

export class SigilSweepGame {
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.day = opts.day || todayKey();
    this.profile = null;

    this.puzzles = [];
    this.index = 0;
    this.score = 0;
    this.hits = 0;          // marks read on the FIRST pick

    this._shownAt = null;
    this._resolved = false;
    this._guesses = 0;
    this._raf = null;
    this._shareTimer = null;
    this._shareBox = null;
    this._tutorialCleanup = null;

    this._loop = this._loop.bind(this);

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    this._stopLoop();
    this._teardownTutorial();
    clearTimeout(this._shareTimer);
    this.root.classList.remove("sg", "sg--select");
    this.root.innerHTML = "";
  }

  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  _setShell({ select }) {
    this.root.classList.add("sg");
    this.root.classList.toggle("sg--select", select);
  }

  // ── Difficulty picker ────────────────────────────────────────────────────

  _showSelect() {
    this._stopLoop();
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "sg-card";
    card.innerHTML = `
      <h1 class="sg-card-title">Sigil Sweep</h1>
      <p class="sg-card-lede">A split line rotates through a hidden mark. One side shows the true slice; the other mirrors it back — so half of what you see is a lie. Nothing lingers. Name the mark from the options, and the sooner you commit, the more it scores.</p>
    `;

    this._tutorialCleanup = mountTutorial(card);

    const rules = document.createElement("ul");
    rules.className = "sg-rules";
    rules.innerHTML = `
      <li>Watch the sweep, then pick the matching mark from the row.</li>
      <li>Points bleed away the longer you watch — commit early.</li>
      <li>Five marks a round. A wrong pick still leaves one more try, clock running.</li>
    `;
    card.appendChild(rules);

    const list = document.createElement("div");
    list.className = "sg-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id, this.day);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sg-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="sg-pick-main">
          <span class="sg-pick-label">${escapeHtml(prof.label)}</span>
          <span class="sg-pick-blurb">${
            done ? "Played today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="sg-pick-spec">
          <span class="sg-pick-score">${done ? `${done.score}` : `${prof.rounds}`}</span>
          <span class="sg-pick-sub">${done ? "pts" : "marks"}</span>
        </span>
      `;
      btn.setAttribute("aria-label", done
        ? `${prof.label}: played today, ${done.score} points. View result.`
        : `${prof.label}: ${prof.blurb} ${prof.rounds} marks.`);
      btn.addEventListener("click", () =>
        done ? this._showStoredResult(id, done) : this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    this.root.appendChild(card);
    firstBtn?.focus();
  }

  // ── Round setup ──────────────────────────────────────────────────────────

  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY) {
    this.profile = getDifficulty(difficultyId);
    const count = this.profile.rounds;

    const frozen = this.opts.seed == null ? setsFor(this.opts.daily, this.profile.id) : null;
    if (frozen && frozen.length >= count) {
      this.puzzles = frozen.slice(0, count);
    } else {
      const seed = this.opts.seed != null
        ? `${this.opts.seed}:${this.profile.id}`
        : dailySeedFor(this.profile.id, this.day);
      this.puzzles = generateDailySet(seed, this.profile.id, count);
    }

    this.index = 0;
    this.score = 0;
    this.hits = 0;
    this._renderPuzzle();
  }

  // ── Puzzle render ─────────────────────────────────────────────────────────

  _renderPuzzle() {
    this._teardownTutorial();
    this._stopLoop();
    this._resolved = false;
    this._guesses = 0;

    const puzzle = this.puzzles[this.index];
    this.root.innerHTML = "";
    this._setShell({ select: false });

    const hud = document.createElement("div");
    hud.className = "sg-hud";
    hud.innerHTML = `
      <div class="sg-hud-stat"><span class="sg-hud-label">Mark</span><span class="sg-hud-value">${this.index + 1} / ${this.puzzles.length}</span></div>
      <div class="sg-hud-stat"><span class="sg-hud-label">Worth now</span><span class="sg-worth">${BASE}</span></div>
      <div class="sg-hud-stat"><span class="sg-hud-label">Score</span><span class="sg-score">${this.score}</span></div>
    `;
    this._worthEl = hud.querySelector(".sg-worth");
    this._scoreEl = hud.querySelector(".sg-score");
    this.root.appendChild(hud);

    const stage = document.createElement("div");
    stage.className = "sg-stage";
    const canvas = document.createElement("canvas");
    canvas.className = "sg-sweep";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label",
      `A rotating mark, revealed a slice at a time. Pick it from the ${puzzle.options.length} options below.`);
    fitCanvas(canvas, SWEEP_PX);
    stage.appendChild(canvas);
    this._canvas = canvas;

    const meter = document.createElement("div");
    meter.className = "sg-meter";
    meter.innerHTML = `<i class="sg-meter-fill" style="width:100%"></i>`;
    this._meterFill = meter.querySelector(".sg-meter-fill");
    stage.appendChild(meter);
    this.root.appendChild(stage);

    const opts = document.createElement("div");
    opts.className = "sg-options";
    opts.setAttribute("role", "group");
    opts.setAttribute("aria-label", "Candidate marks");
    puzzle.options.forEach((sigil, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sg-opt";
      btn.dataset.i = i;
      btn.setAttribute("aria-label", `Option ${i + 1}`);
      const c = document.createElement("canvas");
      fitCanvas(c, OPTION_PX);
      btn.appendChild(c);
      btn.addEventListener("click", () => this._pick(i, btn));
      opts.appendChild(btn);
      drawStatic(c, sigil, INK);
    });
    this.root.appendChild(opts);
    this._optionsEl = opts;

    const foot = document.createElement("div");
    foot.className = "sg-foot";
    foot.innerHTML = `<p class="sg-hint">Half of the mark is its own reflection. Commit when you're sure.</p>`;
    this.root.appendChild(foot);
    this._footEl = foot;

    this._startDeg = puzzle.startDeg || 0;
    this._wedgeRad = (puzzle.wedgeDeg * Math.PI) / 180;
    this._shownAt = Date.now();
    this._degrees = 0;
    this._startLoop();
  }

  // ── Sweep animation ───────────────────────────────────────────────────────

  _startLoop() {
    this._stopLoop();
    // Paint one frame immediately so a non-animating environment (reduced
    // motion, headless) still shows the opening slice.
    this._paint();
    this._raf = requestAnimationFrame(this._loop);
  }

  _stopLoop() {
    if (this._raf != null) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _loop() {
    if (this._resolved) { this._raf = null; return; }
    this._degrees = degreesSince(Date.now() - this._shownAt);
    this._paint();
    const w = worthAt(this._degrees);
    if (this._worthEl) this._worthEl.textContent = w;
    if (this._meterFill) this._meterFill.style.width = `${(w / BASE) * 100}%`;
    this._raf = requestAnimationFrame(this._loop);
  }

  _paint() {
    if (!this._canvas) return;
    const angle = ((this._startDeg + this._degrees) * Math.PI) / 180;
    drawSweep(this._canvas, this.puzzles[this.index].answer, {
      angleRad: angle,
      wedgeRad: this._wedgeRad,
      color: INK,
    });
  }

  // ── Picking ───────────────────────────────────────────────────────────────

  _pick(i, btn) {
    if (this._resolved) return;
    const puzzle = this.puzzles[this.index];
    const correct = i === puzzle.answerIndex;
    const degrees = this._degrees;

    if (correct) {
      const points = scorePick({ correct: true, degrees, guessIndex: this._guesses });
      this.score += points;
      if (this._guesses === 0) this.hits += 1;
      this._scoreEl.textContent = this.score;
      btn?.classList.add("is-right");
      this._resolve(`+${points}${this._guesses ? " (second try)" : ""} · ${Math.round(degrees)}° swept`);
      return;
    }

    // Wrong pick: cross it out, keep the clock running for one more try.
    this._guesses += 1;
    btn?.classList.add("is-wrong", "is-dead");
    btn?.setAttribute("disabled", "");
    if (this._guesses >= MAX_GUESSES) {
      this._scoreEl.textContent = this.score;
      this._resolve("Out of tries — no points for this mark", { reveal: true });
    } else {
      this._footEl.querySelector(".sg-hint").textContent =
        "Not that one — one try left, clock still running.";
    }
  }

  _resolve(message, { reveal = false } = {}) {
    this._resolved = true;
    this._stopLoop();
    const puzzle = this.puzzles[this.index];

    // Freeze the true mark, unobscured, so the player sees what they were chasing.
    drawStatic(this._canvas, puzzle.answer, GOOD);
    this._worthEl.textContent = "—";
    this._meterFill.style.width = "0%";

    for (const btn of this._optionsEl.querySelectorAll(".sg-opt")) {
      const i = Number(btn.dataset.i);
      btn.setAttribute("disabled", "");
      if (i === puzzle.answerIndex) btn.classList.add("is-answer");
    }

    const last = this.index === this.puzzles.length - 1;
    this._footEl.innerHTML = `
      <p class="sg-outcome">${escapeHtml(message)}</p>
      <button type="button" class="sg-action-btn sg-next">${last ? "See round" : "Next mark"}</button>
    `;
    const next = this._footEl.querySelector(".sg-next");
    next.addEventListener("click", () => this._next());
    next.focus();
  }

  _next() {
    if (this.index < this.puzzles.length - 1) {
      this.index += 1;
      this._renderPuzzle();
    } else {
      this._showRoundComplete();
    }
  }

  // ── Round complete ────────────────────────────────────────────────────────

  _showRoundComplete() {
    this._stopLoop();
    const result = { score: this.score, hits: this.hits, rounds: this.puzzles.length };
    saveResult(this.profile.id, result, this.day);
    const isRecord = recordBest(this.profile.id, result);

    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "sg-card sg-done";
    card.innerHTML = `
      <p class="sg-win-label">Round complete</p>
      ${this._resultStats({ ...result, isRecord, tier: this.profile.label })}
      ${this._resultActionsHtml()}
    `;
    this.root.appendChild(card);
    this._wireResultActions(card, result);
    announceRoundComplete(this.root);
  }

  _showStoredResult(id, result) {
    this.profile = getDifficulty(id);
    this._teardownTutorial();
    this._stopLoop();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "sg-card sg-done";
    card.innerHTML = `
      <h1 class="sg-card-title">${escapeHtml(this.profile.label)}</h1>
      <p class="sg-card-lede">You played today's round. Come back tomorrow for new marks.</p>
      ${this._resultStats({ ...result, isRecord: false })}
      ${this._resultActionsHtml()}
    `;
    this.root.appendChild(card);
    this._wireResultActions(card, result);
    announceRoundComplete(this.root);
  }

  _resultStats({ score, hits, rounds, isRecord, tier = null }) {
    const best = bestResult(this.profile.id);
    const footer = isRecord
      ? `<p class="sg-win-record">★ New best!</p>`
      : best ? `<p class="sg-win-best">Best ${best.score} pts</p>` : "";
    return `
      <p class="sg-win-score">${score}</p>
      <p class="sg-win-score-label">points${tier ? ` on ${escapeHtml(tier)}` : ""}</p>
      <p class="sg-win-hits">${hits} / ${rounds} read at first glance</p>
      ${footer}
    `;
  }

  _resultActionsHtml() {
    return `
      <div class="sg-win-actions">
        <button type="button" class="sg-action-btn sg-share">Share result</button>
        <button type="button" class="sg-action-btn sg-win-menu">Back to menu</button>
      </div>
    `;
  }

  _wireResultActions(scope, result) {
    const share = scope.querySelector(".sg-share");
    share.addEventListener("click", () => this._share(share, result));
    scope.querySelector(".sg-win-menu").addEventListener("click", () => this._showSelect());
    share.focus();
  }

  // ── Sharing ───────────────────────────────────────────────────────────────

  shareText({ score, hits, rounds }) {
    return buildShareText({
      score, hits, rounds,
      difficultyLabel: this.profile.label,
      daily: this.day,
      best: bestResult(this.profile.id),
    });
  }

  async _share(btn, result) {
    const text = this.shareText(result);
    const label = btn.textContent;
    const copied = await copyToClipboard(text);
    btn.textContent = copied ? "Copied!" : "Copy it below";
    btn.classList.toggle("is-done", copied);
    if (!copied) this._showShareFallback(btn, text);
    clearTimeout(this._shareTimer);
    this._shareTimer = setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove("is-done");
    }, 2200);
  }

  _showShareFallback(btn, text) {
    this._shareBox?.remove();
    const box = document.createElement("textarea");
    box.className = "sg-share-box";
    box.value = text;
    box.readOnly = true;
    box.rows = Math.min(8, text.split("\n").length);
    box.setAttribute("aria-label", "Your result, ready to copy");
    btn.closest(".sg-win-actions").after(box);
    this._shareBox = box;
    box.focus();
    box.select();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export { ROTATION_MS, HALF_LIFE_DEG };
