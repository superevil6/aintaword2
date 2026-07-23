// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets a jsdom harness drive it, the same arrangement the
// other games use.
import { MODES, getMode, boardFor, layout, cellCenter } from "./shapes.js";
import { announceRoundComplete } from "../../core/lifecycle.js";
import {
  cellsFromWords, readSide, litSides,
  freeSlotsFor, rotateSlots, solutionRemains, scramble,
} from "./ring.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { getResult, hasPlayed, saveResult } from "./results.js";
import { mountTutorial } from "./tutorial.js";
import { hashSeed, mulberry32 } from "../../core/rng.js";
import { todayKey } from "../../core/daily.js";

const LOCK_OPEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/>' +
  '<path d="M8 11V7a4 4 0 0 1 8 0"/></svg>';
const LOCK_SHUT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/>' +
  '<path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

/** Room reserved outside the board for the locks and nudge buttons. */
const OUTSET = 44;
const GAP = 6;
const LOCK_SIZE = 28;
const ARROW_SIZE = 26;

export class WordiamondGame {
  /**
   * @param {HTMLElement} container
   * @param {{POOLS: object, WORDS: object}} data generated puzzle pools
   * @param {object} opts
   * @param {string} opts.mode   skip the picker and open this difficulty
   * @param {string} opts.day    override today's date key (tests)
   * @param {number} opts.puzzle open a specific pool index (tests)
   */
  constructor(container, data, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.data = data;

    this.mode = null;
    this.board = null;
    this.words = null;
    this.pool = null;

    this.cells = [];
    this.tiles = [];
    this.lockBtns = [];
    this.arrowBtns = [];
    this.arrowSpecs = [];
    this.locked = new Set();
    this.history = [];
    this.given = 0;
    this.rings = 0;
    this.moves = 0;
    this.won = false;
    this.stranded = false;
    this.activeSide = 0;
    this.drag = null;
    this.puzzleIndex = 0;
    this._size = 300;

    this._onResize = () => this._fit();
    this._copyTimer = null;
    this._tutorialCleanup = null;
    window.addEventListener("resize", this._onResize);

    if (opts.mode) this.start(opts.mode);
    else this.showPicker();
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
    if (this._copyTimer) clearTimeout(this._copyTimer);
    this._teardownTutorial();
    this.root.innerHTML = "";
  }

  /** Stops the picker demo's looping timer. Safe to call when none is running. */
  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  get day() {
    return this.opts.day ?? todayKey();
  }

  // ── picker ───────────────────────────────────────────────────────────────

  /**
   * The game opens on a difficulty picker, as the others in the collection do.
   * The three modes are genuinely different boards rather than one board
   * scrambled harder — scramble depth turned out to be a weak dial, moving the
   * shortest solution by about one move for triple the shuffling. See MODES.
   */
  showPicker() {
    this._teardownTutorial();
    this.el = null;
    this.tiles = [];
    this.root.innerHTML = `
      <div class="wd wd-picker">
        <h2 class="wd-picker-title">Wordiamond</h2>
        <div data-el="demoSlot"></div>
        <ul class="wd-modes" role="list">
          ${MODES.map((m) => {
            // A mode already played today reads back what you did rather than
            // advertising itself — the board is spent, and re-dealing it would
            // make the "one board a day" promise meaningless.
            const done = getResult(m.id, this.day);
            return `
            <li>
              <button class="wd-mode${done ? " is-done" : ""}" type="button" data-mode="${m.id}">
                <span class="wd-mode-shape">${this._modeGlyph(boardFor(m))}</span>
                <span class="wd-mode-text">
                  <span class="wd-mode-label">${m.label}</span>
                  <span class="wd-mode-blurb">${
                    done
                      ? `Solved · ${done.moves} ${done.moves === 1 ? "move" : "moves"}`
                      : m.blurb
                  }</span>
                </span>
                ${done ? '<span class="wd-mode-tick" aria-hidden="true">✓</span>' : ""}
              </button>
            </li>`;
          }).join("")}
        </ul>
      </div>
    `;
    this.root.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => { this.start(btn.dataset.mode); });
    });

    // Above the difficulty list, not below it: the demo is the explanation, so
    // it has to arrive before the choice it is explaining. It also replaces the
    // subtitle that used to sit here — that sentence and the demo's first
    // caption said the same thing, and the demo says it better.
    this._tutorialCleanup = mountTutorial(this.root.querySelector('[data-el="demoSlot"]'));
  }

  /**
   * The result of a board already finished today. Reachable two ways — landing
   * here straight after a win, and re-entering the mode later — so it is one
   * screen rather than two that can drift apart.
   */
  showResult(result) {
    this._teardownTutorial();
    const ring = result.ring.join(" · ");
    this.root.innerHTML = `
      <div class="wd wd-done">
        <span class="wd-done-mode">${this.mode.label} · ${this.day}</span>
        <p class="wd-done-ring">${ring}</p>
        <p class="wd-done-note">${
          result.rings > 1 ? `one of ${result.rings} valid rings` : "the only valid ring"
        }</p>
        <dl class="wd-rail">
          <div class="wd-stat"><dt>Moves</dt><dd>${result.moves}</dd></div>
          <div class="wd-stat"><dt>Words</dt><dd>${result.ring.length}/${result.ring.length}</dd></div>
        </dl>
        <p class="wd-done-next">That's today's ${this.mode.label.toLowerCase()} board. A new one tomorrow.</p>
        <div class="wd-controls">
          <button class="wd-btn" data-el="share" type="button">Share result</button>
          <button class="wd-btn" data-el="modes" type="button">Other difficulties</button>
        </div>
      </div>
    `;
    this.el = {};
    this.root.querySelectorAll("[data-el]").forEach((n) => { this.el[n.dataset.el] = n; });
    // Adopt the stored count so the share button reads the same number from
    // this screen as it would straight after the win.
    this.moves = result.moves;
    this.el.share.addEventListener("click", () => this._share());
    this.el.modes.addEventListener("click", () => this.showPicker());
    announceRoundComplete(this.root);
  }

  /** An outline of the board that mode actually plays on. */
  _modeGlyph(board) {
    const pts = board.positions
      .slice(0, board.n)
      .map((p) => `${(50 + p.x * 40).toFixed(1)},${(50 + p.y * 40).toFixed(1)}`)
      .join(" ");
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${pts}"/></svg>`;
  }

  start(modeId) {
    this._teardownTutorial();
    this.mode = getMode(modeId);
    this.board = boardFor(this.mode);
    // Already finished today? Show what happened rather than dealing again.
    if (hasPlayed(this.mode.id, this.day) && !this.opts.replay) {
      this.showResult(getResult(this.mode.id, this.day));
      return;
    }
    const flat = this.data.WORDS[this.mode.sideLen];
    this.words = new Set();
    for (let i = 0; i < flat.length; i += this.mode.sideLen) {
      this.words.add(flat.slice(i, i + this.mode.sideLen));
    }
    this.pool = this.data.POOLS[this.mode.id];
    this._saved = false;
    this._buildShell();
    this._load(this.opts.puzzle ?? this._dailyIndex());
    this._fit();
  }

  /** Everyone worldwide gets the same board today, per difficulty. */
  _dailyIndex() {
    return hashSeed(`wordiamond:${this.mode.id}:${this.day}`) % this.pool.length;
  }

  // ── shell ────────────────────────────────────────────────────────────────

  _buildShell() {
    this.root.innerHTML = `
      <div class="wd">
        <dl class="wd-rail">
          <div class="wd-stat"><dt>Mode</dt><dd data-el="mode">—</dd></div>
          <div class="wd-stat"><dt>Moves</dt><dd data-el="moves">0</dd></div>
          <div class="wd-stat"><dt>Words</dt><dd data-el="words">0/0</dd></div>
        </dl>

        <div class="wd-stage">
          <div class="wd-board" data-el="board" tabindex="0" role="application"
               aria-label="Word ring. Drag a side to rotate it."></div>
          <p class="wd-verdict" data-el="verdict" role="status" hidden></p>
        </div>

        <div class="wd-chips" data-el="chips"></div>
        <p class="wd-message" data-el="message" role="status"></p>

        <div class="wd-controls">
          <button class="wd-btn" data-el="undo" type="button" disabled>Undo</button>
          <button class="wd-btn" data-el="restart" type="button">Restart</button>
          <button class="wd-btn" data-el="share" type="button" disabled>Share result</button>
          <button class="wd-btn" data-el="modes" type="button">Change difficulty</button>
        </div>

        <p class="wd-note">
          Drag a side to rotate it, tap a tile to nudge it one step, or use the
          arrows at each end. Corners are shared, so every move disturbs two
          neighbors. The blue word was given to you and never moves. Lock a
          side once it reads a real word — any real word counts, not just the
          intended one.
        </p>
      </div>
    `;

    this.el = {};
    this.root.querySelectorAll("[data-el]").forEach((n) => { this.el[n.dataset.el] = n; });

    const board = this.el.board;
    board.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    board.addEventListener("pointermove", (e) => this._onPointerMove(e));
    board.addEventListener("pointerup", (e) => this._endDrag(e));
    board.addEventListener("pointercancel", (e) => this._endDrag(e));
    board.addEventListener("keydown", (e) => this._onKeyDown(e));

    this.el.undo.addEventListener("click", () => this._undo());
    this.el.restart.addEventListener("click", () => {
      this._load(this.puzzleIndex);
      this._fit();
    });
    this.el.share.addEventListener("click", () => this._share());
    this.el.modes.addEventListener("click", () => this.showPicker());
  }

  _load(index) {
    this.puzzleIndex = ((index % this.pool.length) + this.pool.length) % this.pool.length;

    // Today's frozen file wins when it is there. It carries the exact starting
    // arrangement, so a later change to the generator cannot rewrite a day
    // somebody has already played. Falling back to the bundled pool reproduces
    // the identical board, because the file was built from the same seed.
    const frozen = this.data.day?.modes?.[this.mode.id];
    const [wordStr, given, rings] = frozen
      ? [frozen.words, frozen.given, frozen.rings]
      : this.pool[this.puzzleIndex];
    this.solution = wordStr.split(" ");
    this.given = given;
    this.rings = rings;

    this.locked = new Set([given]);
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.stranded = false;

    if (frozen?.cells) {
      this.cells = frozen.cells.split("");
    } else {
      const rng = mulberry32(hashSeed(`wordiamond:${this.mode.id}:${this.day}:scramble`));
      this.cells = scramble(
        this.board,
        cellsFromWords(this.board, this.solution),
        rng, this.mode.scramble, given, this.words,
      );
    }

    this._buildBoard();
    this._paint();
  }

  _buildBoard() {
    const board = this.el.board;
    board.innerHTML = "";
    board.classList.remove("is-won");
    this.tiles = [];
    this.lockBtns = [];
    this.arrowBtns = [];
    this.arrowSpecs = [];

    for (let s = 0; s < this.board.cellCount; s++) {
      const tile = document.createElement("div");
      tile.className = "wd-tile";
      tile.dataset.slot = String(s);
      tile.style.setProperty("--wd-i", String(s));
      board.appendChild(tile);
      this.tiles.push(tile);
    }

    this.board.sides.forEach((side, i) => {
      const btn = document.createElement("button");
      btn.className = "wd-lock";
      btn.type = "button";
      btn.addEventListener("click", () => this._toggleLock(i));
      board.appendChild(btn);
      this.lockBtns.push(btn);

      // Two nudge buttons per side, one at each end, pointing the way the
      // letters travel. Swiping stays the primary gesture; these are the
      // precise, reachable, keyboard-friendly way to do the same thing.
      [{ end: "start", dir: 1 }, { end: "end", dir: -1 }].forEach((spec) => {
        this.arrowSpecs.push({ side: i, ...spec });
        const arrow = document.createElement("button");
        arrow.className = "wd-arrow";
        arrow.type = "button";
        arrow.innerHTML = CHEVRON;
        arrow.addEventListener("click", () => {
          this.activeSide = i;
          this._rotate(i, spec.dir);
        });
        board.appendChild(arrow);
        this.arrowBtns.push(arrow);
      });
    });

    this._place();
  }

  // ── layout ───────────────────────────────────────────────────────────────

  /**
   * Tile size follows the board's tightest packing rather than a grid
   * assumption, so a three-letter square gets fat tiles and a pentagon's
   * closer spacing gets smaller ones — and no shape ever overlaps itself.
   */
  _metrics() {
    const size = this._size;
    const m = this.board.minSpacing;
    const cell = Math.max(22, ((m * size) / 2 - GAP) / (1 + m / 2));
    return { size, cell };
  }

  _fit() {
    const wrap = this.root.querySelector(".wd");
    if (!wrap || !this.el?.board) return;
    const byWidth = (wrap.clientWidth || 360) - 2 * OUTSET - 8;
    const byHeight = (window.innerHeight || 800) * 0.46;
    this._size = Math.max(170, Math.min(byWidth, byHeight, 400));
    const { size, cell } = this._metrics();
    this.el.board.style.width = `${size}px`;
    this.el.board.style.height = `${size}px`;
    this.el.board.style.setProperty("--wd-cell", `${cell}px`);
    this._place();
  }

  _place() {
    if (!this.tiles.length) return;
    const { size, cell } = this._metrics();
    const pts = layout(this.board, size, cell);
    this.tiles.forEach((tile, s) => {
      tile.style.transform = `translate(${pts[s].x}px, ${pts[s].y}px)`;
      tile.textContent = this.cells[s];
    });

    const r = (size - cell) / 2;
    this.lockBtns.forEach((btn, i) => {
      const side = this.board.sides[i];
      const mx = size / 2 + side.mid.x * r;
      const my = size / 2 + side.mid.y * r;
      const off = cell / 2 + 14;
      btn.style.left = `${mx + side.normal.x * off - LOCK_SIZE / 2}px`;
      btn.style.top = `${my + side.normal.y * off - LOCK_SIZE / 2}px`;
    });

    this.arrowSpecs.forEach((spec, i) => {
      const side = this.board.sides[spec.side];
      const slots = side.slots;
      const slot = spec.end === "start" ? slots[0] : slots[slots.length - 1];
      const c = cellCenter(this.board, size, cell, slot);
      const sign = spec.end === "start" ? -1 : 1;
      const off = cell / 2 + 6 + ARROW_SIZE / 2;
      const btn = this.arrowBtns[i];
      btn.style.left = `${c.x + side.dir.x * off * sign - ARROW_SIZE / 2}px`;
      btn.style.top = `${c.y + side.dir.y * off * sign - ARROW_SIZE / 2}px`;
      // The chevron is drawn pointing right and rotated to the reading
      // direction, so every side shares one path and they cannot disagree
      // about which way they mean.
      const deg = (Math.atan2(side.dir.y, side.dir.x) * 180) / Math.PI + (sign < 0 ? 0 : 180);
      const svg = btn.querySelector("svg");
      if (svg) svg.style.transform = `rotate(${deg}deg)`;
    });
  }

  /** Pixel distance between adjacent cells along a side. */
  _stepAlong(slots) {
    const { size, cell } = this._metrics();
    const a = cellCenter(this.board, size, cell, slots[0]);
    const b = cellCenter(this.board, size, cell, slots[1]);
    return Math.hypot(b.x - a.x, b.y - a.y) || 1;
  }

  // ── render ───────────────────────────────────────────────────────────────

  /**
   * The move counter is live information while you play — it belongs in the
   * rail. What it must not do is show up in the RESULT, where a number stops
   * being a readout and becomes a verdict: "solved in 69 moves" reads as
   * falling short of a five-move solution nobody asked you to find. The result
   * shows the ring you landed on instead, because that is the part worth
   * showing someone.
   *
   * The rail deliberately does NOT count locks. The board already says which
   * sides are locked — amber tiles, a closed padlock, an amber chip — so a
   * tally restated it in a form nobody could act on, sitting next to a real
   * progress readout and borrowing its authority.
   */
  _paint() {
    const lit = litSides(this.board, this.cells, this.words);
    const litCount = lit.filter(Boolean).length;
    this.won = litCount === this.board.n;

    const pinned = new Set();
    this.locked.forEach((i) => this.board.sides[i].slots.forEach((s) => pinned.add(s)));
    const wordSlots = new Set();
    lit.forEach((ok, i) => {
      if (ok) this.board.sides[i].slots.forEach((s) => wordSlots.add(s));
    });
    const givenSlots = new Set(this.board.sides[this.given].slots);

    // The sides whose locks have ruled out every solution. Amber alone said
    // "you froze this", which is the same thing it says for a perfectly good
    // lock — the player had to read the sentence underneath to tell a useful
    // lock from a dead end. Red says wrong.
    const deadSlots = new Set();
    if (this.stranded) {
      this.locked.forEach((i) => {
        if (i !== this.given) this.board.sides[i].slots.forEach((sl) => deadSlots.add(sl));
      });
    }

    this.tiles.forEach((tile, s) => {
      tile.classList.toggle("is-word", wordSlots.has(s));
      // Mutually exclusive: a tile is locked OR stranded, never both. Letting
      // them overlap made the rendering depend on CSS source order, which is
      // exactly the kind of thing that survives review and breaks later.
      tile.classList.toggle("is-locked", pinned.has(s) && !givenSlots.has(s) && !deadSlots.has(s));
      tile.classList.toggle("is-given", givenSlots.has(s));
      tile.classList.toggle("is-stranded", deadSlots.has(s));
    });
    this.el.board.classList.toggle("is-won", this.won);

    const free = freeSlotsFor(this.board, this.locked);

    this.lockBtns.forEach((btn, i) => {
      const state =
        i === this.given ? "given"
        : this.locked.has(i) ? (this.stranded ? "stranded" : "locked")
        : lit[i] ? "available" : "unavailable";
      // Only touch the DOM on a real change — restamping data-state every move
      // would restart the stranded-lock nudge animation forever.
      if (btn.dataset.state !== state) {
        btn.dataset.state = state;
        btn.innerHTML = state === "available" || state === "unavailable" ? LOCK_OPEN : LOCK_SHUT;
      }
      btn.disabled = state === "unavailable" || state === "given";
      btn.setAttribute("aria-pressed", String(this.locked.has(i)));
      const name = this.board.sides[i].label.toLowerCase();
      btn.setAttribute("aria-label",
        state === "given" ? `${this.board.sides[i].label} side was given to you and stays fixed`
        : state === "stranded" ? `Unlock ${name} side — no solution remains with it locked`
        : state === "locked" ? `Unlock ${name} side`
        : state === "available" ? `Lock ${name} side`
        : `${this.board.sides[i].label} side must read a word before it can be locked`);
    });

    this.arrowSpecs.forEach((spec, i) => {
      const btn = this.arrowBtns[i];
      btn.disabled = free[spec.side].length < 2 || this.won;
      btn.setAttribute("aria-label",
        `Rotate the ${this.board.sides[spec.side].label.toLowerCase()} side ` +
        `${spec.dir > 0 ? "forwards" : "backwards"}`);
    });

    this.el.mode.textContent = this.mode.label;
    this.el.moves.textContent = String(this.moves);
    // The board is spent once it is recorded — re-dealing would contradict the
    // one-board-a-day promise the picker now makes.
    this.el.restart.disabled = this.won;
    this.el.words.textContent = `${litCount}/${this.board.n}`;
    this.el.undo.disabled = this.history.length === 0;

    this._paintChips(lit, free);
    this._paintVerdict(free);
  }

  _paintChips(lit, free) {
    this.el.chips.innerHTML = "";
    this.board.sides.forEach((side, i) => {
      const chip = document.createElement("span");
      chip.className = "wd-chip" +
        (i === this.given ? " is-given"
          : this.stranded && this.locked.has(i) ? " is-stranded"
          : this.locked.has(i) ? " is-locked"
          : lit[i] ? " is-word" : "");
      chip.textContent = `${side.label} ${readSide(this.board, this.cells, i)}`;
      let tag = "";
      if (i === this.given) tag = "given";
      else if (!this.locked.has(i) && free[i].length < side.slots.length) {
        tag = free[i].length < 2 ? "jammed" : `${free[i].length} free`;
      }
      if (tag) {
        const small = document.createElement("small");
        small.textContent = `· ${tag}`;
        chip.appendChild(small);
      }
      this.el.chips.appendChild(chip);
    });
  }

  _paintVerdict(free) {
    this.el.verdict.hidden = !this.won;
    this.el.share.disabled = !this.won;

    if (this.won) {
      const ring = this.board.sides
        .map((_, i) => readSide(this.board, this.cells, i))
        .join(" · ");
      // The words, and a plain count of how many rings exist. Nothing that
      // remarks on how the player got here — an earlier version said "solved
      // in 69 moves" and "yours counts the same", and reassurance of that kind
      // implies there was something to reassure about. A friendlier sentence
      // would carry the same implication, so there is no sentence.
      this.el.verdict.innerHTML =
        `<span class="wd-ring-words">${ring}</span>` +
        `<span class="wd-ring-note">${
          this.rings > 1 ? `one of ${this.rings} valid rings` : "the only valid ring"
        }</span>`;
      this.el.message.textContent = "";
      // Record once. _paint runs on every move, and a second write would
      // overwrite the real move count with whatever it is now.
      if (!this._saved) {
        this._saved = true;
        saveResult(this.mode.id, {
          moves: this.moves,
          ring: this.board.sides.map((_, i) => readSide(this.board, this.cells, i)),
          rings: this.rings,
        }, this.day);
      }
      return;
    }

    this.el.message.classList.toggle("is-error", this.stranded);
    if (this.stranded) {
      const names = [...this.locked]
        .filter((i) => i !== this.given)
        .map((i) => this.board.sides[i].label.toLowerCase())
        .join(" and ");
      this.el.message.textContent =
        `No solution survives with the ${names} locked. The word is real — it just ` +
        `isn't in any finished ring from here. Unlock it to carry on.`;
    } else if (this.board.sides.some((_, i) => !this.locked.has(i) && free[i].length < 2)) {
      this.el.message.textContent = "Everything left is jammed — unlock a side to free it up.";
    } else {
      this.el.message.textContent = "";
    }
  }

  // ── moves ────────────────────────────────────────────────────────────────

  /**
   * @param {boolean} instant Skip the settling animation. True when the move
   *   came from a drag: the drag itself already showed the letters moving, so
   *   animating again on release replays a motion the player just watched.
   */
  _rotate(sideIndex, steps, instant = false) {
    const slots = freeSlotsFor(this.board, this.locked)[sideIndex];
    if (slots.length < 2 || !steps) return;
    this.cells = rotateSlots(this.cells, slots, steps);
    // Record the exact permutation rather than the side: locks change what
    // "rotate the left side" means, so replaying it later could undo something
    // quite different from what happened.
    this.history.push({ slots, steps });
    this.moves++;
    this._animate(instant);
    this._paint();
  }

  _undo() {
    const last = this.history.pop();
    if (!last) return;
    this.cells = rotateSlots(this.cells, last.slots, -last.steps);
    this.moves = Math.max(0, this.moves - 1);
    // An undo can reach back past a lock and break the word it was holding.
    // Rather than refuse the undo, drop the lock — a lock on a non-word means
    // nothing. The given side never drops; it cannot stop being a word.
    const lit = litSides(this.board, this.cells, this.words);
    [...this.locked].forEach((i) => {
      if (!lit[i] && i !== this.given) this.locked.delete(i);
    });
    this._recheckStranded();
    this._animate();
    this._paint();
  }

  _toggleLock(i) {
    if (i === this.given) return; // a given is not the player's to spend
    if (this.locked.has(i)) this.locked.delete(i);
    else if (this.words.has(readSide(this.board, this.cells, i))) this.locked.add(i);
    else return;
    this._recheckStranded();
    this._paint();
  }

  /**
   * Locking a genuinely valid word strands the player roughly half the time —
   * 46.9% measured on Medium, 56.3% on Easy, where rotations of a three-letter
   * word are so often words themselves. Saying so beats letting someone grind
   * at a board that cannot be finished.
   *
   * Only the locks change this answer: rotating within the free space cannot
   * reach anything the search has not already covered. And with two sides
   * pinned the free space is small on every mode — including Hard, where the
   * given word alone would leave around 40 million states.
   */
  _recheckStranded() {
    this.stranded =
      this.locked.size > 1 &&
      !solutionRemains(this.board, this.cells, this.locked, this.words);
  }

  _animate(instant = false) {
    const { size, cell } = this._metrics();
    const pts = layout(this.board, size, cell);

    if (instant) {
      // Drop the transition BEFORE moving, and force one style recalculation
      // so the removal is committed. Clearing the class and setting the
      // transform in the same batch would otherwise still animate.
      this.tiles.forEach((tile) => tile.classList.remove("is-anim"));
      void this.el.board.offsetHeight;
    }

    this.tiles.forEach((tile, s) => {
      tile.textContent = this.cells[s];
      if (!instant) tile.classList.add("is-anim");
      tile.style.transform = `translate(${pts[s].x}px, ${pts[s].y}px)`;
    });
  }

  // ── dragging ─────────────────────────────────────────────────────────────

  _onPointerDown(ev) {
    const tile = ev.target.closest?.(".wd-tile");
    if (!tile || this.won) return;
    this.el.board.focus({ preventScroll: true });
    this.drag = {
      slot: Number(tile.dataset.slot),
      x0: ev.clientX, y0: ev.clientY,
      side: -1, slots: null, ghosts: [], moved: false,
      pointerId: ev.pointerId,
    };
    this.el.board.setPointerCapture?.(ev.pointerId);
  }

  _onPointerMove(ev) {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.x0;
    const dy = ev.clientY - drag.y0;

    if (drag.side < 0) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      const free = freeSlotsFor(this.board, this.locked);
      const candidates = this.board.sideOf[drag.slot].filter((i) => free[i].length >= 2);
      if (!candidates.length) { this.drag = null; return; }
      // An interior tile belongs to one side; a corner belongs to two. Pick
      // whichever side the drag runs most nearly along, by projecting onto
      // each side's direction vector — which works at any angle, so the
      // pentagon's diagonals are served as readily as the square's axes.
      drag.side = candidates.reduce((best, i) => {
        const d = this.board.sides[i].dir;
        const bd = this.board.sides[best].dir;
        return Math.abs(dx * d.x + dy * d.y) > Math.abs(dx * bd.x + dy * bd.y) ? i : best;
      }, candidates[0]);
      drag.slots = free[drag.side];
      this._startDrag();
    }
    drag.moved = true;
    const d = this.board.sides[drag.side].dir;
    this._dragTo(dx * d.x + dy * d.y);
  }

  _startDrag() {
    this.drag.slots.forEach((s) => {
      this.tiles[s].classList.remove("is-anim");
      this.tiles[s].classList.add("is-moving");
      const ghost = this.tiles[s].cloneNode(true);
      ghost.classList.add("is-ghost");
      this.el.board.appendChild(ghost);
      this.drag.ghosts.push(ghost);
    });
  }

  _dragTo(delta) {
    const { size, cell } = this._metrics();
    const side = this.board.sides[this.drag.side];
    const slots = this.drag.slots;
    const first = cellCenter(this.board, size, cell, slots[0]);
    const step = this._stepAlong(slots);
    const span = step * slots.length;

    slots.forEach((slot, i) => {
      const raw = i * step + delta;
      const p = ((raw % span) + span) % span;
      // The ghost trails one whole span behind, so the tile sliding off one end
      // IS the tile arriving at the other — no teleport across the corner.
      const put = (el, along) => {
        el.style.transform =
          `translate(${first.x + side.dir.x * along - cell / 2}px, ` +
          `${first.y + side.dir.y * along - cell / 2}px)`;
      };
      put(this.tiles[slot], p);
      put(this.drag.ghosts[i], p - span);
    });
  }

  _endDrag(ev) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    try { this.el.board.releasePointerCapture?.(drag.pointerId); } catch { /* already gone */ }
    drag.ghosts.forEach((g) => g.remove());
    if (drag.slots) drag.slots.forEach((s) => this.tiles[s].classList.remove("is-moving"));

    if (drag.side < 0 || !drag.moved) {
      // A tap, not a drag: nothing was previewed, so this one does animate.
      const free = freeSlotsFor(this.board, this.locked);
      const side = this.board.sideOf[drag.slot].find((i) => free[i].length >= 2);
      if (side !== undefined) { this.activeSide = side; this._rotate(side, 1); }
      return;
    }

    const d = this.board.sides[drag.side].dir;
    const delta =
      ((ev?.clientX ?? drag.x0) - drag.x0) * d.x +
      ((ev?.clientY ?? drag.y0) - drag.y0) * d.y;
    const steps = Math.round(delta / this._stepAlong(drag.slots));
    this.activeSide = drag.side;
    // Both branches settle instantly. The tiles are already where the player
    // dragged them; the only thing left is to take up the slack to the nearest
    // cell, and animating that reads as the board undoing and redoing the move.
    if (steps % drag.slots.length === 0) this._animate(true); // snapped back; not a move
    else this._rotate(drag.side, steps, true);
  }

  _onKeyDown(ev) {
    // Sides are numbered rather than named: "T/R/B/L" cannot survive a
    // pentagon, and 1..N reads off the chips in order on every board.
    const num = Number(ev.key);
    if (Number.isInteger(num) && num >= 1 && num <= this.board.n) {
      this.activeSide = num - 1;
      ev.preventDefault();
      return;
    }
    if (ev.key === "z" || ev.key === "u") { this._undo(); ev.preventDefault(); return; }
    if (ev.key === " ") { this._toggleLock(this.activeSide); ev.preventDefault(); return; }
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      this._rotate(this.activeSide, 1);
      ev.preventDefault();
    }
    if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      this._rotate(this.activeSide, -1);
      ev.preventDefault();
    }
  }

  // ── sharing ──────────────────────────────────────────────────────────────

  /**
   * Spoiler-free by construction — see share.js. An earlier version copied the
   * four words, which handed the day's answer to everyone in the chat.
   */
  async _share() {
    const ok = await copyToClipboard(buildShareText({
      modeLabel: this.mode.label,
      day: this.day,
      moves: this.moves,
    }));
    this.el.share.textContent = ok ? "Copied" : "Copy failed";
    if (this._copyTimer) clearTimeout(this._copyTimer);
    this._copyTimer = setTimeout(() => { this.el.share.textContent = "Share result"; }, 1600);
  }
}
