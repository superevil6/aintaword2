import "./colorpath.css";
import { Grid } from "./grid.js";
import { generateGrid, VALID_TARGETS } from "./generator.js";
import { COLOR_HEX, COLOR_NAMES, PRIMARIES, primaryAdds } from "./colors.js";
import { Rng } from "../../core/rng.js";

export class ColorPathGame {
  /**
   * @param {HTMLElement} container
   * @param {object}      opts
   * @param {number}      opts.size       - Grid side length
   * @param {string}      opts.seed       - Seed string for deterministic generation
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.size = opts.size ?? 7;
    this.seed = opts.seed ?? String(Date.now());

    this.grid = null;
    this._cells    = [];   // DOM elements indexed by cell index
    this._arrows   = [];   // SVG <line> elements for drawn path
    this._svgEl    = null;
    this._pending  = [];   // cell indices highlighted awaiting player tap
    this._startTime = null;  // Timestamp when game started
    this._timerInterval = null;  // Timer update interval ID
    this._timerEl = null;  // Timer display element
    this._gameActive = false;  // Whether the game is currently in progress

    this._build();
  }

  destroy() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
    }
    this.root.innerHTML = "";
    document.documentElement.style.removeProperty("--cp-player-color");
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  _build() {
    const rng    = new Rng(this.seed);
    const target = VALID_TARGETS[rng.int(0, VALID_TARGETS.length - 1)];
    const { colors, targets, obstacles } = generateGrid(this.size, target, rng);
    this.grid    = new Grid(this.size, colors, targets, obstacles);

    this.root.innerHTML = "";
    this.root.className = "cp";

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
        cell.dataset.originalColor = "#1a1a1a";
      } else {
        cell.setAttribute("aria-label", COLOR_NAMES[colors[idx]]);
        cell.style.setProperty("--cell-color", COLOR_HEX[colors[idx]]);
        cell.dataset.originalColor = COLOR_HEX[colors[idx]];
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
    this._primaryBtns = PRIMARIES.map(({ bit, name, hex }) => {
      const btn = document.createElement("button");
      btn.className = "cp-primary";
      btn.dataset.bit = bit;
      btn.setAttribute("aria-label", name);
      btn.style.setProperty("--primary-color", hex);
      btn.addEventListener("click", () => this._onPrimaryClick(bit));
      controls.appendChild(btn);
      return btn;
    });
    this.root.appendChild(controls);

    // Debug: New Game button
    const debugBtn = document.createElement("button");
    debugBtn.textContent = "New Game";
    debugBtn.className = "cp-debug-btn";
    debugBtn.style.marginTop = "0.5rem";
    debugBtn.style.padding = "0.4rem 0.8rem";
    debugBtn.style.fontSize = "0.75rem";
    debugBtn.style.borderRadius = "4px";
    debugBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    debugBtn.style.background = "rgba(255,255,255,0.05)";
    debugBtn.style.color = "rgba(255,255,255,0.6)";
    debugBtn.style.cursor = "pointer";
    debugBtn.style.transition = "all 0.15s";
    debugBtn.addEventListener("click", () => this.newGame());
    debugBtn.addEventListener("mouseover", (e) => {
      e.target.style.background = "rgba(255,255,255,0.1)";
      e.target.style.color = "rgba(255,255,255,0.9)";
    });
    debugBtn.addEventListener("mouseout", (e) => {
      e.target.style.background = "rgba(255,255,255,0.05)";
      e.target.style.color = "rgba(255,255,255,0.6)";
    });
    this.root.appendChild(debugBtn);

    this._renderState();
  }

  // ── Debug helpers ───────────────────────────────────────────────────────

  newGame() {
    // Generate a new random seed and rebuild
    this.seed = String(Date.now() + Math.random() * 1000000);
    this._build();
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

  // ── Backtrack modal ──────────────────────────────────────────────────────

  _showBacktrackModal(idx) {
    const colorName = COLOR_NAMES[this.grid.colorAt(idx)];
    const moves     = this.grid.moves;

    const overlay = document.createElement("div");
    overlay.className = "cp-modal-overlay";
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true">
        <p class="cp-modal-text">
          Return to <strong>${escapeHtml(colorName)}</strong>?<br>
          <span class="cp-modal-sub">Move count stays at ${moves}.</span>
        </p>
        <div class="cp-modal-actions">
          <button class="cp-modal-cancel">Cancel</button>
          <button class="cp-modal-confirm">Backtrack</button>
        </div>
      </div>
    `;

    overlay.querySelector(".cp-modal-cancel").addEventListener("click", () => {
      overlay.remove();
    });
    overlay.querySelector(".cp-modal-confirm").addEventListener("click", () => {
      overlay.remove();
      this.grid.backtrackTo(idx);
      this._renderState();
    });

    this.root.appendChild(overlay);
    overlay.querySelector(".cp-modal-confirm").focus();
  }

  // ── Win screen ───────────────────────────────────────────────────────────

  _showWin() {
    this._gameActive = false;
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
    }
    
    const moves = this.grid.moves;
    const timeText = this._timerEl?.textContent || "0:00";

    const screen = document.createElement("div");
    screen.className = "cp-win";
    screen.innerHTML = `
      <div class="cp-win-inner">
        <p class="cp-win-label">Solved!</p>
        <p class="cp-win-time" style="font-size: 2rem; color: #4fc3f7; margin: 0.5rem 0; font-weight: bold;">${timeText}</p>
        <p class="cp-win-moves">${moves}</p>
        <p class="cp-win-moves-label">move${moves === 1 ? "" : "s"}</p>
      </div>
    `;
    this.root.appendChild(screen);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _startTimer() {
    if (this._startTime !== null) return; // Already started
    this._startTime = Date.now();
    this._gameActive = true;
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => this._updateTimer(), 100);
  }

  _updateTimer() {
    if (!this._gameActive || !this._startTime) return;
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    this._timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  _renderState() {
    const { grid } = this;

    // Move counter
    this._movesEl.textContent = grid.moves;
    
    // Collected counter
    this._collectedEl.textContent = `${grid.collected.size} / ${grid.targets.size}`;

    // Cell states
    const currentColor = COLOR_HEX[grid.currentColor];
    for (let idx = 0; idx < this.size * this.size; idx++) {
      const cell = this._cells[idx];
      cell.classList.toggle("cp-cell--current",  idx === grid.currentIndex);
      cell.classList.toggle("cp-cell--collected", grid.isCollected(idx));
      cell.classList.toggle("cp-cell--obstacle",  grid.isObstacle(idx));
      // Only show burned (dimmed) if it's visited, not current, and not a target
      cell.classList.toggle("cp-cell--visited",
        grid.isVisited(idx) && idx !== grid.currentIndex && !grid.isTarget(idx));
      cell.classList.toggle("cp-cell--pending", this._pending.includes(idx));
      
      // Visited cells show the current player color
      if (grid.isVisited(idx) && idx !== grid.currentIndex && !grid.isObstacle(idx)) {
        cell.style.setProperty("--cell-color", currentColor);
      } else {
        cell.style.setProperty("--cell-color", cell.dataset.originalColor);
      }
    }

    // Primary buttons: show only primaries that have ≥1 valid target
    for (const btn of this._primaryBtns) {
      const bit     = Number(btn.dataset.bit);
      const targets = grid.targetsFor(bit);

      if (targets.length === 0) {
        btn.hidden = true;
        continue;
      }

      btn.hidden   = false;
      btn.disabled = false;
      const adds   = primaryAdds(grid.currentColor, bit);
      btn.textContent = adds ? "+" : "−";
      btn.classList.toggle("cp-primary--backtracks",
        targets.some(t => grid.isVisited(t)));
    }

    // Background tint tracks current color
    document.documentElement.style.setProperty(
      "--cp-player-color",
      COLOR_HEX[grid.currentColor],
    );

    // Arrows
    this._renderArrows();
  }

  _renderArrows() {
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

      const segmentColor = COLOR_HEX[this.grid.colorAt(trail[i])];

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
