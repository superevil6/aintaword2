// Mirrorword — screen and interaction.
//
// Three screens off one container: a difficulty picker, the play board (a grid
// you fill through a mirror), and a result. The persistent top banner and
// back-to-hub live in main.js, so this only provides a "Change difficulty" step
// of its own.
//
// A day at each tier is a single puzzle — a size and a given seed word — the
// same for every player (see difficulty.seedFor). It is once per day: a tier
// already played shows its stored result rather than replaying.
//
// Input is a Wordle-style on-screen keyboard so the game is fully touch-
// playable (neither sibling enters letters, so there was nothing to reuse). You
// edit any non-given cell; each letter reflects across the diagonal to its pair.
//
// NB: styles are imported by index.js, not here, so a future
// scripts/e2e-mirrorword.mjs can drive this under jsdom with no CSS.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  getDifficulty,
  seedFor,
} from "./difficulty.js";
import { makePuzzle, valueOf, scoreGrid, isSolved, hintCells } from "./engine.js";
import { mountTutorial } from "./tutorial.js";
import { buildShareText, copyToClipboard, starsFor } from "./share.js";
import { todayKey, getResult, saveResult, bestResult, recordBest } from "./results.js";

const KB_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

export class MirrorwordGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {string[]} opts.pool       the word pool (injected by index.js)
   * @param {string}  [opts.difficulty] skip the picker, open straight into a tier
   * @param {string}  [opts.day]        override today's date (tests)
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.pool = opts.pool || [];
    this.day = opts.day || todayKey();

    this.profile = null;
    this.puzzle = null;    // { size, seed, wordSet, trie, par, best }
    this.grid = [];        // 2D array of chars ('' = empty)
    this.given = new Set(); // "r,c" cells that are fixed (top row + left column)
    this.selR = 0;
    this.selC = 0;
    this.bestScore = 0;
    this.solvedOnce = false;
    this._shareTimer = null;
    this._tutorialCleanup = null;

    this._onKey = (e) => this._handleKey(e);
    this._onResize = () => this._sizeBoard();

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    clearTimeout(this._shareTimer);
    this._teardownTutorial();
    this._detachGlobal();
    this.root.classList.remove("mw", "mw--select", "mw--play", "mw--result");
    this.root.innerHTML = "";
  }

  // The picker's looping demo runs on a timer, so it MUST be torn down whenever
  // we leave the picker or the animation keeps firing on a detached element.
  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  _setShell({ select = false, play = false, result = false } = {}) {
    this.root.classList.add("mw");
    this.root.classList.toggle("mw--select", select);
    this.root.classList.toggle("mw--play", play);
    this.root.classList.toggle("mw--result", result);
  }

  _detachGlobal() {
    document.removeEventListener("keydown", this._onKey);
    window.removeEventListener("resize", this._onResize);
  }

  // ── Picker ─────────────────────────────────────────────────────────────

  _showSelect() {
    this._teardownTutorial();
    this._detachGlobal();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "mw-card";
    card.innerHTML = `
      <h1 class="mw-card-title">Mirrorword</h1>
      <p class="mw-card-lede">Fill the grid so <strong>every row is a real word</strong>. A mirror
        runs down the diagonal — each letter you place is reflected across it, so every row and its
        matching column are the same word.</p>
      <div class="mw-demo-slot" data-el="demoSlot"></div>
      <ul class="mw-rules">
        <li>Tap any cell and type — its reflection across the diagonal fills in automatically.</li>
        <li>Many squares are valid — <strong>rarer letters score more</strong>, and off the diagonal
          they count <strong>double</strong> (they're mirrored).</li>
        <li>Every daily puzzle has a true best score, its <strong>par</strong>. Chase it.</li>
        <li>On Medium, the faint <strong>amber letters</strong> down the middle of the diagonal are a
          starting hint — keep them, or erase them and go your own way.</li>
      </ul>
    `;

    const list = document.createElement("div");
    list.className = "mw-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `mw-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="mw-pick-main">
          <span class="mw-pick-label">${escapeHtml(prof.label)}</span>
          <span class="mw-pick-blurb">${
            done ? "Played today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="mw-pick-spec">
          <span class="mw-pick-big">${done ? `${done.score}/${done.par}` : `${prof.size}×${prof.size}`}</span>
          <span class="mw-pick-sub">${done ? "score" : "grid"}</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: played today, scored ${done.score} of ${done.par}. View result.`
          : `${prof.label}: ${prof.blurb}.`,
      );
      btn.addEventListener("click", () => this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    this.root.appendChild(card);
    this._tutorialCleanup = mountTutorial(card.querySelector('[data-el="demoSlot"]'));
    firstBtn?.focus();
  }

  // ── Start a tier ───────────────────────────────────────────────────────

  start(id) {
    this.profile = getDifficulty(id);
    const done = getResult(this.profile.id);
    if (done) {
      this._showResult(done, { replay: true });
      return;
    }
    this._beginPlay();
  }

  _beginPlay() {
    const prof = this.profile;
    const seed = seedFor(prof, this.day);
    this.puzzle = makePuzzle({ size: prof.size, seed }, this.pool);

    const n = prof.size;
    this.grid = Array.from({ length: n }, () => Array(n).fill(""));
    this.given = new Set();
    // Give the top row, and by symmetry the left column.
    for (let j = 0; j < n; j++) {
      this.grid[0][j] = seed[j];
      this.grid[j][0] = seed[j];
      this.given.add("0," + j);
      this.given.add(j + ",0");
    }
    // Erasable center-diagonal hint, drawn from the day's optimal square so it
    // never blocks par. Unlike the given cells it can be overwritten or cleared.
    this.hint = new Map();
    for (const [r, c] of hintCells(n, prof.hint || 0)) {
      const ch = this.puzzle.best[r][c];
      if (!ch) continue;
      this.grid[r][c] = ch; this.grid[c][r] = ch;
      this.hint.set(r + "," + c, ch);
    }
    const f = this._firstEmptyFillable() || this._firstFillable();
    this.selR = f[0]; this.selC = f[1];
    this.bestScore = 0;
    this.solvedOnce = false;

    this._showPlay();
  }

  // ── Editable-cell navigation (any non-given cell) ────────────────────────

  // Any non-given cell is editable. Editing either half of a mirrored pair sets
  // both, so there's no reason to lock the lower triangle — only the seed cells
  // (top row + left column) stay fixed.
  _isFillable(r, c) { return !this.given.has(r + "," + c); }
  _firstFillable() {
    const n = this.puzzle.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this._isFillable(r, c)) return [r, c];
    return [0, 0];
  }
  // Empty-cell variants: typing skips cells that already hold a letter (a hint,
  // or one you've placed), so you fill AROUND the hint rather than onto it.
  _firstEmptyFillable() {
    const n = this.puzzle.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this._isFillable(r, c) && !this.grid[r][c]) return [r, c];
    return null;
  }
  _nextEmptyFillable(r, c) {
    const n = this.puzzle.size;
    let R = r, C = c;
    while (true) { C++; if (C >= n) { C = 0; R++; } if (R >= n) return null; if (this._isFillable(R, C) && !this.grid[R][C]) return [R, C]; }
  }
  _nextFillable(r, c) {
    const n = this.puzzle.size;
    let R = r, C = c;
    while (true) { C++; if (C >= n) { C = 0; R++; } if (R >= n) return null; if (this._isFillable(R, C)) return [R, C]; }
  }
  _prevFillable(r, c) {
    const n = this.puzzle.size;
    let R = r, C = c;
    while (true) { C--; if (C < 0) { C = n - 1; R--; } if (R < 0) return null; if (this._isFillable(R, C)) return [R, C]; }
  }

  // ── Play screen ──────────────────────────────────────────────────────────

  _showPlay() {
    this._teardownTutorial();
    this._detachGlobal();
    this.root.innerHTML = "";
    this._setShell({ play: true });

    const hud = document.createElement("div");
    hud.className = "mw-hud";
    hud.innerHTML = `
      <div class="mw-hud-stat">
        <span class="mw-hud-label">Score</span>
        <span class="mw-score">0</span>
      </div>
      <div class="mw-hud-stat">
        <span class="mw-hud-label">Par</span>
        <span class="mw-par">${this.puzzle.par}</span>
      </div>
    `;
    this._scoreEl = hud.querySelector(".mw-score");

    const boardWrap = document.createElement("div");
    boardWrap.className = "mw-boardwrap";
    const board = document.createElement("div");
    board.className = "mw-board";
    board.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-r]");
      if (!cell) return;
      const r = +cell.getAttribute("data-r"), c = +cell.getAttribute("data-c");
      if (this._isFillable(r, c)) { this.selR = r; this.selC = c; this._render(); }
    });
    boardWrap.appendChild(board);
    this._boardEl = board;
    this._boardWrap = boardWrap;

    const status = document.createElement("div");
    status.className = "mw-status";
    this._statusEl = status;

    const msg = document.createElement("div");
    msg.className = "mw-msg";
    this._msgEl = msg;

    const keyboard = document.createElement("div");
    keyboard.className = "mw-keyboard";
    keyboard.addEventListener("pointerdown", (e) => {
      const key = e.target.closest("[data-key]");
      if (!key) return;
      e.preventDefault();
      const k = key.getAttribute("data-key");
      if (k === "back") this._backspace(); else this._press(k);
    });
    this._keyboardEl = keyboard;
    this._buildKeyboard();

    const foot = document.createElement("div");
    foot.className = "mw-foot";
    const clear = document.createElement("button");
    clear.type = "button"; clear.className = "mw-btn"; clear.textContent = "Clear";
    clear.addEventListener("click", () => this._clear());

    const change = document.createElement("button");
    change.type = "button"; change.className = "mw-btn mw-btn-ghost"; change.textContent = "Change difficulty";
    change.addEventListener("click", () => this._showSelect());

    const finish = document.createElement("button");
    finish.type = "button"; finish.className = "mw-btn mw-btn-primary"; finish.textContent = "Finish →";
    finish.addEventListener("click", () => this._finish());
    this._finishBtn = finish;

    foot.append(clear, change, finish);

    this.root.append(hud, boardWrap, msg, status, keyboard, foot);

    document.addEventListener("keydown", this._onKey);
    window.addEventListener("resize", this._onResize);
    this._render();
  }

  _buildKeyboard() {
    const k = this._keyboardEl;
    k.innerHTML = "";
    KB_ROWS.forEach((row, ri) => {
      const rd = document.createElement("div");
      rd.className = "mw-krow";
      if (ri === 1) rd.appendChild(spacer());
      for (const ch of row) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "mw-key"; b.textContent = ch; b.setAttribute("data-key", ch);
        rd.appendChild(b);
      }
      if (ri === 1) rd.appendChild(spacer());
      if (ri === 2) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "mw-key mw-key-wide"; b.textContent = "⌫"; b.setAttribute("data-key", "back");
        rd.appendChild(b);
      }
      k.appendChild(rd);
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  _applyCell(r, c, ch) {
    if (this.given.has(r + "," + c)) return false;
    if (this.grid[r][c] === ch) return false;
    this.grid[r][c] = ch;
    this.grid[c][r] = ch; // mirror across the diagonal
    return true;
  }
  _press(ch) {
    if (!this._isFillable(this.selR, this.selC)) {
      const f = this._firstFillable(); this.selR = f[0]; this.selC = f[1];
    }
    this._applyCell(this.selR, this.selC, ch);
    const nx = this._nextEmptyFillable(this.selR, this.selC) || this._nextFillable(this.selR, this.selC);
    if (nx) { this.selR = nx[0]; this.selC = nx[1]; }
    this._render();
  }
  _backspace() {
    if (this._isFillable(this.selR, this.selC) && this.grid[this.selR][this.selC]) {
      this._applyCell(this.selR, this.selC, ""); this._render(); return;
    }
    const pv = this._prevFillable(this.selR, this.selC);
    if (pv) { this.selR = pv[0]; this.selC = pv[1]; this._applyCell(this.selR, this.selC, ""); this._render(); }
  }
  _clear() {
    const n = this.puzzle.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!this.given.has(r + "," + c)) this.grid[r][c] = "";
    // Restore the erasable hint — Clear resets your work, not the scaffold.
    for (const [key, ch] of this.hint) {
      const [r, c] = key.split(",").map(Number);
      this.grid[r][c] = ch; this.grid[c][r] = ch;
    }
    const f = this._firstEmptyFillable() || this._firstFillable();
    this.selR = f[0]; this.selC = f[1];
    this._render();
  }
  _handleKey(e) {
    if (/^[a-zA-Z]$/.test(e.key)) this._press(e.key.toLowerCase());
    else if (e.key === "Backspace") { e.preventDefault(); this._backspace(); }
    else if (e.key === "ArrowRight" || e.key === "Tab") { const n = this._nextFillable(this.selR, this.selC); if (n) { this.selR = n[0]; this.selC = n[1]; this._render(); } }
    else if (e.key === "ArrowLeft") { const p = this._prevFillable(this.selR, this.selC); if (p) { this.selR = p[0]; this.selC = p[1]; this._render(); } }
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  _rowState(i) {
    const cells = this.grid[i], n = this.puzzle.size;
    if (cells.every((x) => !x)) return "empty";
    if (cells.every((x) => x)) return this.puzzle.wordSet.has(cells.join("")) ? "good" : "dead";
    // partial: is there any length-n word matching this pattern?
    const re = new RegExp("^" + cells.map((x) => x || "[a-z]").join("") + "$");
    for (const w of this.puzzle.words) if (re.test(w)) return "maybe";
    return "dead";
  }

  _sizeBoard() {
    const n = this.puzzle.size;
    const wrapW = this._boardWrap?.clientWidth || window.innerWidth;
    const avail = Math.min(wrapW, 460);
    const sz = Math.max(38, Math.min(n <= 4 ? 66 : 58, Math.floor((avail - (n - 1) * 6 - 24) / n)));
    this._boardEl.style.setProperty("--mw-sz", sz + "px");
  }

  _render() {
    const n = this.puzzle.size;
    const board = this._boardEl;
    board.style.gridTemplateColumns = `repeat(${n}, var(--mw-sz))`;
    board.innerHTML = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const d = document.createElement("div");
        d.className = "mw-cell";
        if (r === c) d.classList.add("is-diag");
        if (this.given.has(r + "," + c)) d.classList.add("is-given");
        else if (r > c) d.classList.add("is-mirror");
        // A hint cell still holding its hint letter reads as an erasable suggestion.
        if (this.hint?.get(r + "," + c) === this.grid[r][c] && this.grid[r][c]) d.classList.add("is-hint");
        if (r === this.selR && c === this.selC) d.classList.add("is-sel");
        d.setAttribute("data-r", r);
        d.setAttribute("data-c", c);
        const ch = this.grid[r][c];
        if (ch) {
          d.appendChild(document.createTextNode(ch));
          const v = document.createElement("span");
          v.className = "mw-tv";
          v.textContent = valueOf(ch) * (r === c ? 1 : 2); // doubled off-diagonal
          d.appendChild(v);
        }
        board.appendChild(d);
      }
    }
    this._sizeBoard();

    // row status pills
    this._statusEl.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const st = this._rowState(i);
      const p = document.createElement("span");
      p.className = "mw-pill" + (st === "good" ? " is-good" : st === "maybe" ? " is-maybe" : st === "dead" ? " is-dead" : "");
      p.textContent = "row " + (i + 1) + (st === "good" ? " ✓" : st === "dead" ? " ✕" : st === "maybe" ? " …" : "");
      this._statusEl.appendChild(p);
    }

    this._refreshScore();
  }

  _refreshScore() {
    const cur = scoreGrid(this.grid);
    this._scoreEl.textContent = cur;
    if (isSolved(this.grid, this.puzzle.wordSet)) {
      if (cur > this.bestScore) this.bestScore = cur;
      this.solvedOnce = true;
      this._finishBtn.disabled = false;
      const atPar = this.bestScore >= this.puzzle.par;
      this._msgEl.className = "mw-msg is-win";
      this._msgEl.textContent = atPar
        ? "✦ Optimal — the best square there is. Finish, or keep it."
        : `✦ Valid square · ${this.bestScore}/${this.puzzle.par} — keep going for a rarer one`;
    } else {
      this._finishBtn.disabled = !this.solvedOnce;
      this._msgEl.className = "mw-msg";
      this._msgEl.textContent = this.solvedOnce
        ? `Best so far ${this.bestScore}/${this.puzzle.par}`
        : "";
    }
  }

  // ── Result ─────────────────────────────────────────────────────────────

  _finish() {
    if (!this.solvedOnce) return;
    const result = { score: this.bestScore, par: this.puzzle.par };
    saveResult(this.profile.id, result);
    recordBest(this.profile.id, { score: this.bestScore });
    this._showResult(result, { replay: false });
  }

  _grade(score, par) {
    if (score >= par) return { title: "Perfect reflection! 🪞", grade: "Optimal", sub: "The highest-scoring square there is today. Nobody beats this." };
    const pct = par > 0 ? score / par : 1;
    if (pct >= 0.85) return { title: "Your square", grade: "Sharp", sub: `${par - score} from par — a rarer letter or two short of optimal.` };
    if (pct >= 0.65) return { title: "Your square", grade: "Solid", sub: "Room to score — hunt for words that thread rare letters off the diagonal." };
    return { title: "Your square", grade: "Reflected", sub: "You beat the mirror. Now chase the rare letters that double when reflected." };
  }

  _showResult(result, { replay }) {
    this._teardownTutorial();
    this._detachGlobal();
    this.root.innerHTML = "";
    this._setShell({ result: true });
    const { score, par } = result;
    const g = this._grade(score, par);
    const stars = starsFor(score, par);
    const best = bestResult(this.profile.id);

    const card = document.createElement("div");
    card.className = "mw-result-card";
    card.innerHTML = `
      <h2 class="mw-result-title">${g.title}</h2>
      <div class="mw-result-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
      <div class="mw-result-score">${score}<span class="mw-result-of"> / ${par}</span></div>
      <div class="mw-result-grade">${escapeHtml(g.grade)}</div>
      <p class="mw-result-sub">${escapeHtml(g.sub)}</p>
      ${best ? `<div class="mw-result-meta">best ${best.score} at this tier</div>` : ""}
      <div class="mw-result-actions">
        <button type="button" class="mw-btn mw-btn-primary" data-act="share">Share result</button>
        <button type="button" class="mw-btn" data-act="again">Play another tier</button>
      </div>
    `;

    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "again") this._showSelect();
      if (b.dataset.act === "share") this._share(b, result);
    });

    this.root.appendChild(card);
  }

  async _share(btn, result) {
    const text = buildShareText({
      score: result.score,
      par: result.par,
      size: this.profile.size,
      difficultyLabel: this.profile.label,
      daily: this.day,
    });
    const ok = await copyToClipboard(text);
    const label = btn.textContent;
    btn.textContent = ok ? "Copied!" : "Copy failed";
    clearTimeout(this._shareTimer);
    this._shareTimer = setTimeout(() => { btn.textContent = label; }, 1600);
  }
}

function spacer() {
  const s = document.createElement("div");
  s.className = "mw-key mw-key-spacer";
  return s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
