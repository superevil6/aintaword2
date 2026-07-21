// NB: styles are imported by index.js, not here — keeping game.js free of
// CSS imports is what lets scripts/e2e.mjs drive it under jsdom.
import { Grid } from "./grid.js";
import { generateGrid } from "./generator.js";
import {
  COLOR_NAMES, PRIMARIES, PALETTE_EVENT,
  colorHex, paintSwatch, paletteId, pipsMarkup, primaryAdds, primaryHex, setPalette,
} from "./colors.js";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  getDifficulty,
} from "./difficulty.js";
import {
  todayKey,
  dailySeedFor,
  getResult,
  saveResult,
  bestResult,
  recordBest,
} from "./results.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { mountTutorial } from "./tutorial.js";
import { Rng } from "../../core/rng.js";

export class ColorPathGame {
  /**
   * @param {HTMLElement} container
   * @param {object}      opts
   * @param {string}      opts.difficulty - Skip the picker and open straight
   *                                        into this tier
   * @param {string}      opts.seed       - Seed prefix, for tests and a future
   *                                        practice mode
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.profile = null;     // active difficulty profile, null on the picker
    this.size = 0;
    this.targetCount = 0;
    this.seed = null;

    this.grid = null;
    this._cells    = [];   // DOM elements indexed by cell index
    this._svgEl    = null;
    this._pending  = [];   // cell indices highlighted awaiting player tap
    this._preview  = [];   // cell indices previewed under a hovered primary
    this._startTime = null;  // Timestamp when game started
    this._pausedAt = null;   // Timestamp the clock was frozen, if paused
    this._closeModal = null; // Closer for the open dialog, if any
    this._tutorialCleanup = null; // Stops the picker demo loop
    this._timerInterval = null;  // Timer update interval ID
    this._timerEl = null;  // Timer display element
    this._gameActive = false;  // Whether the game is currently in progress
    this._shareTimer = null;   // Resets the share button label
    this._shareBox = null;     // Manual-copy textarea, when the clipboard fails

    // Arrow endpoints are measured from live layout, so they go stale whenever
    // the grid resizes — a window drag, or a phone rotating.
    this._onResize = () => this._renderArrows();
    window.addEventListener("resize", this._onResize);

    // The palette toggle can be flipped from the picker or from the board, so
    // repainting is driven by the event rather than by whoever owns the
    // checkbox. Mid-game this repaints in place: no remount, no lost focus,
    // and the run keeps going.
    this._onPalette = () => this._repaintPalette();
    window.addEventListener(PALETTE_EVENT, this._onPalette);

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    this._closeModal?.(false); // detaches its keydown listener
    this._teardownTutorial();  // stops the picker demo's looping timer
    this._stopTimer();
    clearTimeout(this._shareTimer);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener(PALETTE_EVENT, this._onPalette);
    this.root.classList.remove("cp", "cp--select");
    this.root.innerHTML = "";
    document.documentElement.style.removeProperty("--cp-player-color");
  }

  /**
   * Begin a puzzle at the given difficulty.
   *
   * The seed is derived from (day + difficulty), so every player gets the same
   * board for today's Easy/Medium/Hard. opts.seed overrides the day part for
   * tests; newGame() overrides the whole thing for a throwaway puzzle.
   */
  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY) {
    this._applyProfile(difficultyId);
    this.seed = this.opts.seed != null
      ? `${this.opts.seed}:${this.profile.id}`
      : dailySeedFor(this.profile.id);
    this._build();
  }

  /**
   * Take ownership of our own classes on the host container without wiping
   * whatever the shell put there. Assigning `className` outright used to strip
   * main.js's `.app-view`, silently dropping the layout rules it provides —
   * invisible only because `.cp` happens to redeclare similar ones.
   */
  _setShell({ select }) {
    this.root.classList.add("cp");
    this.root.classList.toggle("cp--select", select);
  }

  /**
   * The colourblind-palette checkbox. Mounted on both the picker and the
   * board: the board is where you find out you cannot read the circles, so
   * making you leave the run to fix it would be the wrong trade.
   *
   * Deliberately worded as a colour swap rather than an accessibility mode —
   * the pips are on for everyone either way, so this switch only decides which
   * eight fills you get.
   */
  _paletteToggle() {
    const label = document.createElement("label");
    label.className = "cp-toggle";
    label.innerHTML = `
      <input type="checkbox" class="cp-toggle-box">
      <span class="cp-toggle-text">Colorblind-friendly colors</span>
    `;
    const box = label.querySelector(".cp-toggle-box");
    box.checked = paletteId() === "cvd";
    box.addEventListener("change", () => setPalette(box.checked ? "cvd" : "classic"));
    return label;
  }

  /**
   * Redraw everything that reads a hex out of the palette. Cheap enough to do
   * wholesale — it is a board of circles and three buttons — and doing it
   * wholesale is what keeps a half-swapped board from being possible.
   */
  _repaintPalette() {
    for (const box of this.root.querySelectorAll(".cp-toggle-box")) {
      box.checked = paletteId() === "cvd";
    }
    if (this.grid && this._cells.length) this._renderState();
  }

  /** Stop the picker demo's loop; safe to call when it isn't mounted. */
  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  _applyProfile(difficultyId) {
    this.profile     = getDifficulty(difficultyId);
    this.size        = this.profile.size;
    this.targetCount = this.profile.targetCount;
  }

  // ── Difficulty picker ────────────────────────────────────────────────────

  _showSelect() {
    this._closeModal?.(false);
    this._teardownTutorial();
    this._stopTimer();
    this._pending = [];
    this._preview = [];
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "cp-card";
    card.innerHTML = `
      <h1 class="cp-card-title">Color Path</h1>
      <p class="cp-card-lede">Every circle is red, yellow and blue mixed together. White is none of them. The three dots on a circle spell out which primaries it holds &mdash; red, yellow, blue, left to right.</p>
    `;

    // The demo covers add/remove/step and the trail recolouring, so the written
    // rules only need to carry what it cannot show.
    this._tutorialCleanup = mountTutorial(card);

    const rules = document.createElement("ul");
    rules.className = "cp-rules";
    rules.innerHTML = `
      <li>Hover or focus a primary to see where it would take you.</li>
      <li>Circles burn out behind you. Tap one you have already visited to backtrack &mdash; your move count stays.</li>
      <li>Collect <strong>every glowing circle</strong> to finish.</li>
    `;
    card.appendChild(rules);

    const list = document.createElement("div");
    list.className = "cp-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cp-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="cp-pick-main">
          <span class="cp-pick-label">${escapeHtml(prof.label)}</span>
          <span class="cp-pick-blurb">${
            done ? "Solved today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="cp-pick-spec">
          <span class="cp-pick-size">${
            done ? `${done.moves}` : `${prof.size}&times;${prof.size}`
          }</span>
          <span class="cp-pick-nodes">${
            done
              ? `move${done.moves === 1 ? "" : "s"} · ${formatTime(done.timeMs)}`
              : `${prof.targetCount} circles`
          }</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: solved today in ${done.moves} moves, ` +
            `${formatTime(done.timeMs)}. View result.`
          : `${prof.label}: ${prof.blurb}. ` +
            `${prof.size} by ${prof.size} grid, ${prof.targetCount} circles to collect.`,
      );
      btn.addEventListener("click", () =>
        done ? this._showStoredResult(id, done) : this.start(id),
      );
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    card.appendChild(this._paletteToggle());
    this.root.appendChild(card);
    firstBtn?.focus();
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  _build() {
    const rng    = new Rng(this.seed);
    const { colors, targets, obstacles } = generateGrid(this.size, this.targetCount, rng);
    this.grid    = new Grid(this.size, colors, targets, obstacles);

    // A rebuild is a fresh puzzle: drop any running clock and its start stamp,
    // or "New puzzle" inherits the previous run's elapsed time.
    this._closeModal?.(false);
    this._teardownTutorial();
    this._stopTimer();
    this._startTime = null;
    this._pending = [];
    this._preview = [];

    this.root.innerHTML = "";
    this._setShell({ select: false });

    // HUD
    const hud = document.createElement("div");
    hud.className = "cp-hud";
    hud.innerHTML = `
      <div class="cp-hud-stat">
        <span class="cp-hud-label">Moves</span>
        <span class="cp-moves">0</span>
      </div>
      <div class="cp-hud-stat">
        <span class="cp-hud-label">Found</span>
        <span class="cp-collected">0 / ${this.grid.targets.size}</span>
      </div>
      <div class="cp-hud-stat">
        <span class="cp-hud-label">Time</span>
        <span class="cp-timer">0:00</span>
      </div>
    `;
    this._movesEl = hud.querySelector(".cp-moves");
    this._collectedEl = hud.querySelector(".cp-collected");
    this._timerEl = hud.querySelector(".cp-timer");
    this.root.appendChild(hud);

    // Grid wrapper (holds circles + SVG overlay)
    const wrapper = document.createElement("div");
    wrapper.className = "cp-grid-wrapper";

    // SVG arrow layer (sits on top of circles via CSS)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("cp-arrows");
    svg.setAttribute("aria-hidden", "true");
    this._svgEl = svg;
    wrapper.appendChild(svg);

    // Grid of circles
    const gridEl = document.createElement("div");
    gridEl.className = "cp-grid";
    gridEl.style.setProperty("--cp-size", this.size);

    this._cells = [];
    for (let idx = 0; idx < this.size * this.size; idx++) {
      const cell = document.createElement("button");
      cell.className = "cp-cell";
      cell.dataset.idx = idx;
      
      if (this.grid.isObstacle(idx)) {
        cell.setAttribute("aria-label", "Obstacle");
        cell.style.setProperty("--cell-color", "#1a1a1a");
      } else {
        cell.setAttribute("aria-label", COLOR_NAMES[colors[idx]]);
        // The pips live in the cell and are repainted in place, so build them
        // once here rather than re-writing innerHTML every render.
        cell.innerHTML = pipsMarkup(colors[idx]);
        cell.dataset.baseColor = colors[idx];
        paintSwatch(cell, colors[idx]);
      }

      if (idx === 0) cell.classList.add("cp-cell--current");
      if (this.grid.isTarget(idx)) cell.classList.add("cp-cell--target");

      cell.addEventListener("click", () => this._onCellClick(idx));
      this._cells.push(cell);
      gridEl.appendChild(cell);
    }
    wrapper.appendChild(gridEl);
    this.root.appendChild(wrapper);

    // Primary buttons
    const controls = document.createElement("div");
    controls.className = "cp-controls";
    this._primaryBtns = PRIMARIES.map(({ bit, name }, i) => {
      const btn = document.createElement("button");
      btn.className = "cp-primary";
      btn.dataset.bit = bit;
      btn.dataset.primary = i;
      btn.setAttribute("aria-label", name);
      // Sign plus the pip slot this button owns: which of the three dots on the
      // circles it flips, in the same left-to-right order. A player who cannot
      // read the button's colour can still read which column it drives.
      btn.innerHTML = `
        <span class="cp-primary-sign">+</span>
        ${pipsMarkup(bit)}
        <span class="cp-primary-name">${name}</span>
      `;
      btn.addEventListener("click", () => this._onPrimaryClick(bit));

      // Preview where this primary would land you. Teaching the colour rule by
      // showing its consequence beats any amount of explanatory text.
      btn.addEventListener("pointerenter", () => this._showPreview(bit));
      btn.addEventListener("pointerleave", () => this._clearPreview());
      btn.addEventListener("focus", () => this._showPreview(bit));
      btn.addEventListener("blur", () => this._clearPreview());

      controls.appendChild(btn);
      return btn;
    });
    this.root.appendChild(controls);
    this.root.appendChild(this._paletteToggle());

    // No footer controls: the board is one puzzle per tier per day, the banner
    // handles leaving, and the win screen offers the way back to the picker.
    this._renderState();
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  _onPrimaryClick(bit) {
    const targets = this.grid.targetsFor(bit);
    if (targets.length === 0) return; // safety guard

    // Clear any existing pending selection
    this._clearPending();

    if (targets.length === 1) {
      this._resolveMove(targets[0]);
    } else {
      // Multiple matches — highlight them and wait for the player to tap one
      this._pending = targets;
      this._renderState();
    }
  }

  _onCellClick(idx) {
    // Obstacles can't be interacted with
    if (this.grid.isObstacle(idx)) return;
    
    // Resolve a pending multi-target selection
    if (this._pending.includes(idx)) {
      this._clearPending();
      this._resolveMove(idx);
      return;
    }
    // Clicking elsewhere while pending cancels the selection
    if (this._pending.length > 0) {
      this._clearPending();
      this._renderState();
      return;
    }
    // Tap on a visited circle → backtrack
    if (idx === this.grid.currentIndex) return;
    if (!this.grid.isVisited(idx)) return;
    this._showBacktrackModal(idx);
  }

  _resolveMove(idx) {
    this._clearPreview();
    if (this.grid.isVisited(idx)) {
      this._showBacktrackModal(idx);
    } else {
      if (this._startTime === null) this._startTimer();
      this.grid.moveForward(idx);
      this._renderState();
      if (this.grid.isComplete) this._showWin();
    }
  }

  _clearPending() {
    for (const idx of this._pending) {
      this._cells[idx]?.classList.remove("cp-cell--pending");
    }
    this._pending = [];
  }

  // ── Move preview ─────────────────────────────────────────────────────────

  _showPreview(bit) {
    this._clearPreview();
    // While a multi-target choice is open, the pending highlight is what the
    // player needs to act on; a second highlight competing with it just muddles.
    if (this._pending.length > 0) return;
    this._preview = this.grid.targetsFor(bit);
    for (const idx of this._preview) {
      this._cells[idx]?.classList.add("cp-cell--preview");
    }
  }

  _clearPreview() {
    for (const idx of this._preview) {
      this._cells[idx]?.classList.remove("cp-cell--preview");
    }
    this._preview = [];
  }

  // ── Backtrack modal ──────────────────────────────────────────────────────

  _showBacktrackModal(idx) {
    if (this._closeModal) return; // never stack dialogs

    const colorName = COLOR_NAMES[this.grid.colorAt(idx)];
    const moves     = this.grid.moves;

    // The clock stops and the board goes behind a blur for the same reason:
    // an open dialog would otherwise be a free, untimed look at the grid.
    this._pauseTimer();
    this._clearPreview();

    const overlay = document.createElement("div");
    overlay.className = "cp-modal-overlay";
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-modal-text">
        <p class="cp-modal-text" id="cp-modal-text">
          Return to <strong>${escapeHtml(colorName)}</strong>?
          <span class="cp-modal-sub">Move count stays at ${moves}. Timer paused.</span>
        </p>
        <div class="cp-modal-actions">
          <button type="button" class="cp-action-btn cp-modal-cancel">Cancel</button>
          <button type="button" class="cp-action-btn cp-modal-confirm">Backtrack</button>
        </div>
      </div>
    `;

    let closed = false;
    const close = (confirmed) => {
      // Every dismissal path funnels through here — button, backdrop tap,
      // Escape, teardown — and touch devices can deliver more than one of
      // them for a single gesture. Collapse to a single close.
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey);
      overlay.remove();
      this._closeModal = null;
      this._resumeTimer();
      if (confirmed) {
        this.grid.backtrackTo(idx);
        this._renderState();
      }
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };

    overlay.querySelector(".cp-modal-cancel")
      .addEventListener("click", () => close(false));
    overlay.querySelector(".cp-modal-confirm")
      .addEventListener("click", () => close(true));
    // Clicking the dim cancels; clicking the dialog itself must not.
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    window.addEventListener("keydown", onKey);

    this._closeModal = close;
    this.root.appendChild(overlay);
    overlay.querySelector(".cp-modal-confirm").focus();
  }

  // ── Win screen ───────────────────────────────────────────────────────────

  _showWin() {
    this._stopTimer();

    const moves  = this.grid.moves;
    const timeMs = this._startTime ? Date.now() - this._startTime : 0;

    saveResult(this.profile.id, { moves, timeMs });
    const isRecord = recordBest(this.profile.id, { moves, timeMs });

    const screen = document.createElement("div");
    screen.className = "cp-win";
    screen.innerHTML = `
      <div class="cp-win-inner">
        <p class="cp-win-label">Solved!</p>
        ${this._resultStats({ moves, timeMs, isRecord, tier: this.profile.label })}
        ${this._resultActionsHtml()}
      </div>
    `;

    this.root.appendChild(screen);
    this._wireResultActions(screen, { moves, timeMs });
  }

  /** The result for a tier already solved today, reached from the picker. */
  _showStoredResult(id, result) {
    this._applyProfile(id);
    this._teardownTutorial();
    this._stopTimer();
    this._pending = [];
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "cp-card";
    card.innerHTML = `
      <h1 class="cp-card-title">${escapeHtml(this.profile.label)}</h1>
      <p class="cp-card-lede">You solved today's board. Come back tomorrow for a new one.</p>
      <div class="cp-win-inner cp-result">
        ${this._resultStats({ moves: result.moves, timeMs: result.timeMs, isRecord: false })}
      </div>
      ${this._resultActionsHtml()}
    `;

    this.root.appendChild(card);
    this._wireResultActions(card, { moves: result.moves, timeMs: result.timeMs });
  }

  _resultActionsHtml() {
    return `
      <div class="cp-win-actions">
        <button type="button" class="cp-action-btn cp-share">Share result</button>
        <button type="button" class="cp-action-btn cp-win-menu">Back to menu</button>
      </div>
    `;
  }

  _wireResultActions(scope, result) {
    const share = scope.querySelector(".cp-share");
    share.addEventListener("click", () => this._share(share, result));
    scope.querySelector(".cp-win-menu")
      .addEventListener("click", () => this._showSelect());
    share.focus();
  }

  // ── Sharing ──────────────────────────────────────────────────────────────

  shareText({ moves, timeMs }) {
    return buildShareText({
      moves,
      timeMs,
      difficultyLabel: this.profile.label,
      daily: todayKey(),
      best: bestResult(this.profile.id),
    });
  }

  async _share(btn, result) {
    const text   = this.shareText(result);
    const label  = btn.textContent;
    const copied = await copyToClipboard(text);

    btn.textContent = copied ? "Copied!" : "Copy it below";
    btn.classList.toggle("is-done", copied);

    // Clipboard access can be blocked (plain http, in-app browsers). Never
    // claim a success we didn't get — surface the text to copy by hand.
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
    box.className = "cp-share-box";
    box.value = text;
    box.readOnly = true;
    box.rows = Math.min(8, text.split("\n").length);
    box.setAttribute("aria-label", "Your result, ready to copy");
    btn.closest(".cp-win-actions").after(box);
    this._shareBox = box;
    box.focus();
    box.select();
  }

  /**
   * Shared stat block for both the win overlay and a stored result.
   * `tier` is only passed by the win overlay — the stored-result card already
   * carries the difficulty as its heading.
   */
  _resultStats({ moves, timeMs, isRecord, tier = null }) {
    const best = bestResult(this.profile.id);
    const footer = isRecord
      ? `<p class="cp-win-record">★ New best!</p>`
      : best
        ? `<p class="cp-win-best">Best ${best.moves} move${
            best.moves === 1 ? "" : "s"
          } · ${formatTime(best.timeMs)}</p>`
        : "";

    return `
      <p class="cp-win-time">${formatTime(timeMs)}</p>
      <p class="cp-win-moves">${moves}</p>
      <p class="cp-win-moves-label">move${moves === 1 ? "" : "s"}${
        tier ? ` on ${escapeHtml(tier)}` : ""
      }</p>
      ${footer}
    `;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _startTimer() {
    if (this._startTime !== null) return; // Already started
    this._stopTimer();
    this._startTime = Date.now();
    this._gameActive = true;
    this._timerInterval = setInterval(() => this._updateTimer(), 100);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this._pausedAt = null;
    this._gameActive = false;
  }

  /** Freeze the clock while a dialog is open. */
  _pauseTimer() {
    if (this._startTime === null || this._pausedAt !== null) return;
    this._pausedAt = Date.now();
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  /**
   * Resume, shifting the start stamp forward by however long we were paused.
   * Elapsed time is derived from `_startTime`, so moving it is what actually
   * excludes the paused span — simply restarting the interval would let the
   * dialog count against the player.
   */
  _resumeTimer() {
    if (this._pausedAt === null) return;
    this._startTime += Date.now() - this._pausedAt;
    this._pausedAt = null;
    if (this._gameActive && this._timerInterval === null) {
      this._timerInterval = setInterval(() => this._updateTimer(), 100);
    }
  }

  _updateTimer() {
    if (!this._gameActive || !this._startTime) return;
    this._timerEl.textContent = formatTime(Date.now() - this._startTime);
  }

  _renderState() {
    const { grid } = this;

    // Move counter
    this._movesEl.textContent = grid.moves;
    
    // Collected counter
    this._collectedEl.textContent = `${grid.collected.size} / ${grid.targets.size}`;

    // Cell states
    for (let idx = 0; idx < this.size * this.size; idx++) {
      const cell = this._cells[idx];
      cell.classList.toggle("cp-cell--current",  idx === grid.currentIndex);
      cell.classList.toggle("cp-cell--collected", grid.isCollected(idx));
      cell.classList.toggle("cp-cell--obstacle",  grid.isObstacle(idx));
      // Only show burned (dimmed) if it's visited, not current, and not a target
      cell.classList.toggle("cp-cell--visited",
        grid.isVisited(idx) && idx !== grid.currentIndex && !grid.isTarget(idx));
      cell.classList.toggle("cp-cell--pending", this._pending.includes(idx));
      cell.classList.toggle("cp-cell--preview", this._preview.includes(idx));
      
      // Visited cells show the current player color — pips included, so the
      // trail spells out what you are carrying as well as showing it.
      if (grid.isObstacle(idx)) continue;
      const shown = grid.isVisited(idx) && idx !== grid.currentIndex
        ? grid.currentColor
        : Number(cell.dataset.baseColor);
      paintSwatch(cell, shown);
    }

    // Primary buttons stay put and grey out when unusable. Hiding them shifted
    // the layout every move, and silently filtered the illegal options — which
    // is the colour reasoning the game is actually about.
    for (const btn of this._primaryBtns) {
      const bit     = Number(btn.dataset.bit);
      const targets = grid.targetsFor(bit);

      btn.hidden   = false;
      btn.disabled = targets.length === 0;
      // Re-applied every render rather than once at build, so a palette swap
      // mid-game carries the controls along with the board.
      btn.style.setProperty("--primary-color", primaryHex(Number(btn.dataset.primary)));
      const adds   = primaryAdds(grid.currentColor, bit);
      btn.querySelector(".cp-primary-sign").textContent = adds ? "+" : "−";
      btn.classList.toggle("cp-primary--removes", !adds);
      btn.classList.toggle("cp-primary--backtracks",
        targets.some(t => grid.isVisited(t)));
    }

    // Background tint tracks current color
    document.documentElement.style.setProperty(
      "--cp-player-color",
      colorHex(grid.currentColor),
    );

    // Arrows
    this._renderArrows();
  }

  _renderArrows() {
    // The picker and result screens replace the board wholesale, so a resize
    // can fire while the SVG layer is detached.
    if (!this._svgEl?.isConnected || !this.grid) return;
    this._svgEl.innerHTML = "";
    const { trail } = this.grid;
    if (trail.length < 2) return;

    // We need cell center positions.  The SVG is sized to match the grid
    // wrapper via CSS; we read cell rects relative to the wrapper.
    const wrapperRect = this._svgEl.getBoundingClientRect();

    for (let i = 0; i < trail.length - 1; i++) {
      const fromRect = this._cells[trail[i]].getBoundingClientRect();
      const toRect   = this._cells[trail[i + 1]].getBoundingClientRect();

      const x1 = fromRect.left + fromRect.width  / 2 - wrapperRect.left;
      const y1 = fromRect.top  + fromRect.height / 2 - wrapperRect.top;
      const x2 = toRect.left   + toRect.width    / 2 - wrapperRect.left;
      const y2 = toRect.top    + toRect.height   / 2 - wrapperRect.top;

      const segmentColor = colorHex(this.grid.colorAt(trail[i]));

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", segmentColor);
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", "0.85");
      this._svgEl.appendChild(line);

      // Arrowhead
      const angle  = Math.atan2(y2 - y1, x2 - x1);
      const aLen   = 10;
      const aAngle = Math.PI / 6;
      const ax1 = x2 - aLen * Math.cos(angle - aAngle);
      const ay1 = y2 - aLen * Math.sin(angle - aAngle);
      const ax2 = x2 - aLen * Math.cos(angle + aAngle);
      const ay2 = y2 - aLen * Math.sin(angle + aAngle);

      const head = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      head.setAttribute("points", `${ax1},${ay1} ${x2},${y2} ${ax2},${ay2}`);
      head.setAttribute("stroke", segmentColor);
      head.setAttribute("stroke-width", "2.5");
      head.setAttribute("stroke-linecap", "round");
      head.setAttribute("stroke-linejoin", "round");
      head.setAttribute("fill", "none");
      head.setAttribute("opacity", "0.85");
      this._svgEl.appendChild(head);
    }
  }
}

/** Elapsed milliseconds as M:SS. */
function formatTime(ms) {
  const total   = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
