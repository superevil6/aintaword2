// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets the e2e harness drive it under jsdom.
import { announceRoundComplete } from "../../core/lifecycle.js";
import {
  WHITE, laneCount, laneRecipe, colorName,
} from "./board.js";
import { generateDailySet } from "./generator.js";
import {
  COLOR_NAMES, PALETTE_EVENT, paintSwatch, pipsMarkup, paletteId, setPalette,
} from "./colors.js";
import { scoreDrop } from "./scoring.js";
import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, getDifficulty,
} from "./difficulty.js";
import {
  todayKey, dailySeedFor, getResult, saveResult, bestResult, recordBest,
} from "./results.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { mountTutorial } from "./tutorial.js";
import { setsFor } from "./dailySet.js";

const STEP_MS = 300;   // per-level fall time for the drop animation (cosmetic)
const DROP_END = 0.9;  // where the ball comes to rest (fraction of field height)

/**
 * The spatial layout of a board: each wall's position as a nested binary tree,
 * and each leaf's drop x. Wall at level k sits at the midpoint of its region;
 * its two children own the two halves. A ball dropped straight down at x lands
 * in exactly one leaf region, having passed one wall per level on the correct
 * side — which is precisely laneRecipe(board, leaf).
 */
function fieldLayout(board) {
  const D = board.depth;
  const walls = [];
  (function rec(node, level, lo, hi) {
    if (level >= D) return;
    const x = (lo + hi) / 2;
    walls.push({
      node, level, x,
      y: (level + 1) / (D + 1),
      left: board.nodes[node].left,
      right: board.nodes[node].right,
    });
    rec(2 * node + 1, level + 1, lo, x);
    rec(2 * node + 2, level + 1, x, hi);
  })(0, 0, 0, 1);

  const n = 1 << D;
  const leaves = Array.from({ length: n }, (_, L) => ({ lane: L, x: (L + 0.5) / n }));
  return { walls, leaves, depth: D, lanes: n };
}

export class ColorDropGame {
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.day = opts.day || todayKey();
    this.profile = null;

    this.boards = [];
    this.index = 0;
    this.score = 0;
    this.hits = 0;
    this.aimX = 0.5;      // where the ball will drop (0..1 across the field)
    this._shownAt = null;
    this._resolved = false;
    this._aiming = false;

    this._timerInterval = null;
    this._dropTimers = [];
    this._tutorialCleanup = null;
    this._shareTimer = null;
    this._shareBox = null;

    this._onPalette = () => this._repaintPalette();
    window.addEventListener(PALETTE_EVENT, this._onPalette);

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    this._teardownTutorial();
    this._stopTimer();
    this._clearDropTimers();
    clearTimeout(this._shareTimer);
    window.removeEventListener(PALETTE_EVENT, this._onPalette);
    this.root.classList.remove("cd", "cd--select");
    this.root.innerHTML = "";
    document.documentElement.style.removeProperty("--cd-goal-color");
  }

  // ── Shell / palette ────────────────────────────────────────────────────────

  _setShell({ select }) {
    this.root.classList.add("cd");
    this.root.classList.toggle("cd--select", select);
  }

  _paletteToggle() {
    const label = document.createElement("label");
    label.className = "cd-toggle";
    label.innerHTML = `
      <input type="checkbox" class="cd-toggle-box">
      <span class="cd-toggle-text">CVT-friendly colors</span>
    `;
    const box = label.querySelector(".cd-toggle-box");
    box.checked = paletteId() === "cvd";
    box.addEventListener("change", () => setPalette(box.checked ? "cvd" : "classic"));
    return label;
  }

  _repaintPalette() {
    for (const box of this.root.querySelectorAll(".cd-toggle-box")) {
      box.checked = paletteId() === "cvd";
    }
    for (const el of this.root.querySelectorAll(".cd-swatch[data-color]")) {
      paintSwatch(el, Number(el.dataset.color));
    }
    const goal = this.root.querySelector(".cd-goal-swatch");
    if (goal) {
      document.documentElement.style.setProperty(
        "--cd-goal-color", goal.style.getPropertyValue("--cell-color"));
    }
  }

  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  // ── Difficulty picker ──────────────────────────────────────────────────────

  _showSelect() {
    this._teardownTutorial();
    this._stopTimer();
    this._clearDropTimers();
    this.root.innerHTML = "";
    this._setShell({ select: true });
    document.documentElement.style.removeProperty("--cd-goal-color");

    const card = document.createElement("div");
    card.className = "cd-card";
    card.innerHTML = `
      <h1 class="cd-card-title">Colordrop</h1>
      <p class="cd-card-lede">A white ball, and a goal color. Below are walls: each side adds — or subtracts — a color. Aim the ball and drop it straight down, so the walls it falls past mix it to the goal. Faster is worth more; a wrong drop costs points.</p>
    `;

    this._tutorialCleanup = mountTutorial(card);

    const rules = document.createElement("ul");
    rules.className = "cd-rules";
    rules.innerHTML = `
      <li>The three dots on a swatch spell its primaries — red, yellow, blue, left to right.</li>
      <li>Fall past a wall's left or right side to take that color. + adds it, − takes it back out.</li>
      <li>Five boards a round. Aim precisely, drop once — no retries.</li>
    `;
    card.appendChild(rules);

    const list = document.createElement("div");
    list.className = "cd-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id, this.day);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cd-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="cd-pick-main">
          <span class="cd-pick-label">${escapeHtml(prof.label)}</span>
          <span class="cd-pick-blurb">${
            done ? "Played today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="cd-pick-spec">
          <span class="cd-pick-score">${done ? `${done.score}` : `${prof.boards}`}</span>
          <span class="cd-pick-sub">${done ? "pts" : "boards"}</span>
        </span>
      `;
      btn.setAttribute("aria-label",
        done
          ? `${prof.label}: played today, ${done.score} points. View result.`
          : `${prof.label}: ${prof.blurb} ${prof.boards} boards.`);
      btn.addEventListener("click", () =>
        done ? this._showStoredResult(id, done) : this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    card.appendChild(this._paletteToggle());
    this.root.appendChild(card);
    firstBtn?.focus();
  }

  // ── Round setup ────────────────────────────────────────────────────────────

  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY) {
    this.profile = getDifficulty(difficultyId);
    const count = this.profile.boards;

    const frozen = this.opts.seed == null ? setsFor(this.opts.daily, this.profile.id) : null;
    if (frozen && frozen.length >= count) {
      this.boards = frozen.slice(0, count);
    } else {
      const seed = this.opts.seed != null
        ? `${this.opts.seed}:${this.profile.id}`
        : dailySeedFor(this.profile.id, this.day);
      this.boards = generateDailySet(seed, this.profile.id, count);
    }

    this.index = 0;
    this.score = 0;
    this.hits = 0;
    this._renderBoard();
  }

  // ── Board render ───────────────────────────────────────────────────────────

  _renderBoard() {
    this._teardownTutorial();
    this._stopTimer();
    this._clearDropTimers();
    this._resolved = false;

    const board = this.boards[this.index];
    const layout = fieldLayout(board);
    this.aimX = 0.5;

    this.root.innerHTML = "";
    this._setShell({ select: false });

    // HUD
    const hud = document.createElement("div");
    hud.className = "cd-hud";
    hud.innerHTML = `
      <div class="cd-hud-stat"><span class="cd-hud-label">Board</span><span class="cd-hud-value">${this.index + 1} / ${this.boards.length}</span></div>
      <div class="cd-hud-stat"><span class="cd-hud-label">Goal</span><span class="cd-swatch cd-hud-goal cd-goal-swatch" data-color="${board.goal}" aria-label="${COLOR_NAMES[board.goal]}">${pipsMarkup(board.goal)}</span></div>
      <div class="cd-hud-stat"><span class="cd-hud-label">Score</span><span class="cd-score">${this.score}</span></div>
      <div class="cd-hud-stat"><span class="cd-hud-label">Time</span><span class="cd-timer">0.0</span></div>
    `;
    this._scoreEl = hud.querySelector(".cd-score");
    this._timerEl = hud.querySelector(".cd-timer");
    this.root.appendChild(hud);

    // Playfield
    const field = document.createElement("div");
    field.className = "cd-field";
    field.setAttribute("role", "group");
    field.setAttribute("aria-label",
      `Aim and drop. ${layout.lanes} lanes. Goal color ${colorName(board.goal)}.`);
    field.tabIndex = 0;

    // walls: a vertical line running from the wall down to the goal (so the
    // player can trace which colors a drop passes on the way down), with the
    // two labelled sides capping it at the top.
    for (const w of layout.walls) {
      const line = document.createElement("span");
      line.className = "cd-wall-line";
      line.setAttribute("aria-hidden", "true");
      line.style.left = `${w.x * 100}%`;
      line.style.top = `${w.y * 100}%`;
      line.style.height = `${(1 - w.y) * 100}%`;
      field.appendChild(line);

      const cap = document.createElement("div");
      cap.className = "cd-wall";
      cap.style.left = `${w.x * 100}%`;
      cap.style.top = `${w.y * 100}%`;
      cap.innerHTML = `${this._sideLabel(w.left, "left")}<span class="cd-wall-gap" aria-hidden="true"></span>${this._sideLabel(w.right, "right")}`;
      field.appendChild(cap);
    }

    // aim guide + ball
    const guide = document.createElement("div");
    guide.className = "cd-guide";
    guide.setAttribute("aria-hidden", "true");
    field.appendChild(guide);
    this._guide = guide;

    const ball = document.createElement("div");
    ball.className = "cd-ball cd-swatch";
    ball.dataset.color = WHITE;
    ball.innerHTML = pipsMarkup(WHITE);
    field.appendChild(ball);
    this._ball = ball;

    // goal bar
    const goal = document.createElement("div");
    goal.className = "cd-goalbar";
    goal.innerHTML = `<span class="cd-goalbar-label">GOAL</span><span class="cd-goalbar-name">${escapeHtml(colorName(board.goal))}</span>`;
    field.appendChild(goal);
    this._goalbar = goal;

    this.root.appendChild(field);
    this._field = field;

    const foot = document.createElement("div");
    foot.className = "cd-foot";
    foot.innerHTML = `<p class="cd-hint">Slide to aim, release to drop.</p>`;
    this.root.appendChild(foot);
    this._footEl = foot;

    this.root.appendChild(this._paletteToggle());

    for (const el of this.root.querySelectorAll(".cd-swatch[data-color]")) {
      paintSwatch(el, Number(el.dataset.color));
    }
    document.documentElement.style.setProperty(
      "--cd-goal-color", this.root.querySelector(".cd-goal-swatch").style.getPropertyValue("--cell-color"));

    this._wireAiming(field);
    this._positionAim();
    this._startTimer();
  }

  /** One side of a wall: color, pips and letter — all three encodings. */
  _sideLabel(op, side) {
    const letter = colorName(op.bit)[0];
    const minus = op.sign < 0;
    return `
      <span class="cd-side cd-side-${side}${minus ? " is-minus" : ""}">
        <span class="cd-side-sign" aria-hidden="true">${minus ? "−" : "+"}</span>
        <span class="cd-swatch cd-side-swatch" data-color="${op.bit}" aria-label="${minus ? "minus " : "plus "}${COLOR_NAMES[op.bit]}">${pipsMarkup(op.bit)}</span>
        <span class="cd-side-letter" aria-hidden="true">${letter}</span>
      </span>`;
  }

  // ── Aiming ─────────────────────────────────────────────────────────────────

  _wireAiming(field) {
    const fracFromEvent = (e) => {
      const r = field.getBoundingClientRect();
      return clamp01((e.clientX - r.left) / r.width);
    };

    const move = (e) => {
      if (this._resolved) return;
      this.aimX = fracFromEvent(e);
      this._positionAim();
    };
    const up = (e) => {
      if (!this._aiming || this._resolved) return;
      this._aiming = false;
      field.releasePointerCapture?.(e.pointerId);
      this.aimX = fracFromEvent(e);
      this._drop(this._laneFromX(this.aimX));
    };

    field.addEventListener("pointerdown", (e) => {
      if (this._resolved) return;
      this._aiming = true;
      field.setPointerCapture?.(e.pointerId);
      move(e);
    });
    field.addEventListener("pointermove", (e) => { if (this._aiming) move(e); });
    field.addEventListener("pointerup", up);
    field.addEventListener("pointercancel", () => { this._aiming = false; });

    // Keyboard: arrows step between lane centers, Enter/Space drops.
    field.addEventListener("keydown", (e) => {
      if (this._resolved) return;
      const lanes = 1 << this.boards[this.index].depth;
      let lane = this._laneFromX(this.aimX);
      if (e.key === "ArrowLeft") lane = Math.max(0, lane - 1);
      else if (e.key === "ArrowRight") lane = Math.min(lanes - 1, lane + 1);
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._drop(this._laneFromX(this.aimX)); return; }
      else return;
      e.preventDefault();
      this.aimX = (lane + 0.5) / lanes;
      this._positionAim();
    });
  }

  _laneFromX(x) {
    const lanes = 1 << this.boards[this.index].depth;
    return Math.min(lanes - 1, Math.max(0, Math.floor(clamp01(x) * lanes)));
  }

  _positionAim() {
    if (!this._ball) return;
    const pct = `${this.aimX * 100}%`;
    this._ball.style.left = pct;
    this._guide.style.left = pct;
  }

  // ── Drop ───────────────────────────────────────────────────────────────────

  _drop(lane) {
    if (this._resolved) return;
    this._resolved = true;
    this._aiming = false;
    this._stopTimer();
    this._field.classList.add("is-resolving");

    const board = this.boards[this.index];
    const recipe = laneRecipe(board, lane);
    const correct = recipe.color === board.goal;
    const elapsedMs = this._shownAt != null ? Date.now() - this._shownAt : 0;
    const points = scoreDrop({ correct, elapsedMs });

    this.score += points;
    if (correct) this.hits += 1;
    this._scoreEl.textContent = this.score;

    // Snap the ball to the lane's center for a clean straight drop.
    this.aimX = (lane + 0.5) / (1 << board.depth);
    this._positionAim();

    this._animateDrop(recipe, correct);
    this._showBoardOutcome({ correct, points, recipe });
  }

  /** The ball falls straight down, taking each wall's color as it passes. */
  _animateDrop(recipe, correct) {
    const ball = this._ball;
    const D = this.boards[this.index].depth;
    const settle = () => {
      paintSwatch(ball, recipe.color);
      ball.dataset.color = recipe.color;
      ball.setAttribute("aria-label", COLOR_NAMES[recipe.color]);
      this._goalbar.classList.add(correct ? "is-hit" : "is-miss");
    };

    if (prefersReducedMotion() || !this.root.isConnected) {
      ball.style.top = `${DROP_END * 100}%`;
      settle();
      return;
    }

    const dur = (D + 1) * STEP_MS;
    ball.style.transition = `top ${dur}ms cubic-bezier(0.45, 0.05, 0.55, 1)`;
    requestAnimationFrame(() => { ball.style.top = `${DROP_END * 100}%`; });

    // Morph the ball's color as it crosses each wall's y-level.
    recipe.colors.forEach((color, i) => {
      if (i === 0) return; // starts WHITE
      const t = setTimeout(() => {
        paintSwatch(ball, color);
        ball.dataset.color = color;
      }, (i / (D + 1)) * dur);
      this._dropTimers.push(t);
    });
    const end = setTimeout(settle, dur);
    this._dropTimers.push(end);
  }

  _showBoardOutcome({ correct, points, recipe }) {
    const last = this.index === this.boards.length - 1;
    const verdict = correct
      ? `<span class="cd-outcome-win">Clean drop &middot; +${points}</span>`
      : `<span class="cd-outcome-miss">Landed on ${escapeHtml(colorName(recipe.color))} &middot; ${points}</span>`;
    this._footEl.innerHTML = `
      <p class="cd-outcome">${verdict}</p>
      <button type="button" class="cd-action-btn cd-next">${last ? "See round" : "Next board"}</button>
    `;
    const next = this._footEl.querySelector(".cd-next");
    next.addEventListener("click", () => this._next());
    next.focus();
  }

  _next() {
    if (this.index < this.boards.length - 1) {
      this.index += 1;
      this._renderBoard();
    } else {
      this._showRoundComplete();
    }
  }

  // ── Round complete ─────────────────────────────────────────────────────────

  _showRoundComplete() {
    this._stopTimer();
    this._clearDropTimers();

    const result = { score: this.score, hits: this.hits, boards: this.boards.length };
    saveResult(this.profile.id, result, this.day);
    const isRecord = recordBest(this.profile.id, result);

    this.root.innerHTML = "";
    this._setShell({ select: true });
    document.documentElement.style.removeProperty("--cd-goal-color");

    const card = document.createElement("div");
    card.className = "cd-card cd-done";
    card.innerHTML = `
      <p class="cd-win-label">Round complete</p>
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
    this._stopTimer();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "cd-card cd-done";
    card.innerHTML = `
      <h1 class="cd-card-title">${escapeHtml(this.profile.label)}</h1>
      <p class="cd-card-lede">You played today's round. Come back tomorrow for new boards.</p>
      ${this._resultStats({ ...result, isRecord: false })}
      ${this._resultActionsHtml()}
    `;
    this.root.appendChild(card);
    this._wireResultActions(card, result);
    announceRoundComplete(this.root);
  }

  _resultStats({ score, hits, boards, isRecord, tier = null }) {
    const best = bestResult(this.profile.id);
    const footer = isRecord
      ? `<p class="cd-win-record">★ New best!</p>`
      : best ? `<p class="cd-win-best">Best ${best.score} pts</p>` : "";
    return `
      <p class="cd-win-score">${score}</p>
      <p class="cd-win-score-label">points${tier ? ` on ${escapeHtml(tier)}` : ""}</p>
      <p class="cd-win-hits">${hits} / ${boards} clean drops</p>
      ${footer}
    `;
  }

  _resultActionsHtml() {
    return `
      <div class="cd-win-actions">
        <button type="button" class="cd-action-btn cd-share">Share result</button>
        <button type="button" class="cd-action-btn cd-win-menu">Back to menu</button>
      </div>
    `;
  }

  _wireResultActions(scope, result) {
    const share = scope.querySelector(".cd-share");
    share.addEventListener("click", () => this._share(share, result));
    scope.querySelector(".cd-win-menu").addEventListener("click", () => this._showSelect());
    share.focus();
  }

  // ── Sharing ────────────────────────────────────────────────────────────────

  shareText({ score, hits, boards }) {
    return buildShareText({
      score, hits, boards,
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
    box.className = "cd-share-box";
    box.value = text;
    box.readOnly = true;
    box.rows = Math.min(8, text.split("\n").length);
    box.setAttribute("aria-label", "Your result, ready to copy");
    btn.closest(".cd-win-actions").after(box);
    this._shareBox = box;
    box.focus();
    box.select();
  }

  // ── Think-time clock ───────────────────────────────────────────────────────

  _startTimer() {
    this._stopTimer();
    this._shownAt = Date.now();
    this._timerInterval = setInterval(() => this._updateTimer(), 100);
  }

  _stopTimer() {
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
  }

  _updateTimer() {
    if (this._shownAt == null || !this._timerEl) return;
    this._timerEl.textContent = ((Date.now() - this._shownAt) / 1000).toFixed(1);
  }

  _clearDropTimers() {
    for (const t of this._dropTimers) clearTimeout(t);
    this._dropTimers = [];
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
