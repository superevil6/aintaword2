// Numburst — screen and interaction.
//
// SCAFFOLDING. This exists so the idea can be played with, not shipped. It
// renders a board, lets you arm a bomb and drop it, plays the chain out blow by
// blow, and tells you what you scored. What it does NOT have yet: undo, a
// tutorial, sharing, or any evidence that the boards are interesting.
//
// A shot plays in two beats: the cascade (arrows, damage numbers, orbs
// bursting wave by wave), then the collapse, where survivors fall into the hole
// it left. The collapse is simulated once up front and replayed from recorded
// frames, never stepped live.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets a future scripts/e2e-numburst.mjs drive it under jsdom.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  ROUNDS,
  getDifficulty,
  bombValues,
} from "./difficulty.js";
import {
  generateBoard,
  detonate,
  collapseFrames,
  bombsLeft,
  DEFAULT_SIZE,
} from "./board.js";
import { matchFor, boardFromRound } from "./dailySet.js";
import { mountTutorial } from "./tutorial.js";
import { buildShareText, copyToClipboard } from "./share.js";

import { todayKey, dailySeedFor, getResult, saveResult, bestResult, recordBest } from "./results.js";
import { Rng } from "../../core/rng.js";
import { announceRoundComplete } from "../../core/lifecycle.js";

/**
 * Animation timings, in ms.
 *
 * WAVE is the gap between successive rings of a chain going off. It is the one
 * number that decides whether a chain reads as a chain — too short and a
 * twelve-orb cascade is a single flash, too long and the player is waiting on
 * a cutscene between every shot.
 */
const WAVE_MS = 90;
const WAVE_MS_MIN = 34;
const CASCADE_BUDGET_MS = 1500;
const BURST_MS = 240;
const FALL_MS = 460;

/**
 * How long to hold between waves, given how many there are.
 *
 * A fixed gap was fine when chains ran three or four deep. Once the board lost
 * its 1s, cascades started percolating seventeen waves across the pile, and at
 * a flat 90ms that is nearly two seconds of watching before the shot resolves.
 * Long chains therefore accelerate: the whole cascade is fitted into a budget,
 * with a floor so it never becomes a single unreadable flash. Short chains are
 * unaffected and keep the pacing that made them legible.
 */
function waveDelayFor(count) {
  if (count <= 1) return WAVE_MS;
  return Math.max(WAVE_MS_MIN, Math.min(WAVE_MS, CASCADE_BUDGET_MS / count));
}

export class NumburstGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {string} opts.difficulty - skip the picker, open straight into a tier
   * @param {string} opts.seed       - seed prefix, for tests
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    // The day in play. Defaults to today; an archive replay (a past day, a
    // supporter perk) passes opts.day, which keys the board's seed and turns
    // every persistence call into a no-op so the replay can't touch today's
    // result or the all-time best.
    this.day = opts.day || todayKey();
    this.profile = null;
    this.board = null;
    this.seed = null;

    this.score = 0;        // running MATCH total, carried across all rounds
    this.round = 0;        // 0-based index of the board in play
    this._roundStart = 0;  // this.score at the top of the current round
    this._roundScores = []; // each round's own contribution, for the share
    this._roundClears = []; // whether each round burst the WHOLE board, for PERFECT
    this._shareTimer = null;
    this.armed = null;     // bomb value currently selected, or null
    this._orbEls = new Map();
    this._radii = new Map();
    this._busy = false;      // a shot is playing; the board is locked
    this._raf = null;
    this._timers = new Set();
    this._tutorialCleanup = null; // stops the picker demo's loop

    // Positions are written as pixel transforms, so they have to be rewritten
    // when the field changes size. Sizes stay in percentages and look after
    // themselves.
    this._onResize = () => { if (!this._busy) this._syncOrbs(); };
    window.addEventListener("resize", this._onResize);

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    this._stopAnimation();
    this._teardownTutorial();
    clearTimeout(this._shareTimer);
    window.removeEventListener("resize", this._onResize);
    this.root.classList.remove("nb", "nb--select", "is-busy");
    this.root.innerHTML = "";
    this._orbEls.clear();
    this._radii.clear();
  }

  /** Stop the picker demo's loop; safe to call when it isn't mounted. */
  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  /** Drop every pending frame and timer. Safe to call when nothing is running. */
  _stopAnimation() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._busy = false;
    this.root.classList.remove("is-busy");
  }

  /** A cancellable sleep, so teardown mid-animation cannot leave a timer live. */
  _wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this._timers.delete(t); resolve(); }, ms);
      this._timers.add(t);
    });
  }

  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY) {
    this.profile = getDifficulty(difficultyId);
    this.seed = this.opts.seed != null
      ? `${this.opts.seed}:${this.profile.id}`
      : dailySeedFor(this.profile.id, this.day);
    // The day's frozen match for this tier, when the archive has it: the ROUNDS
    // boards plus a par. A custom opts.seed (tests, practice) is never a daily,
    // so it always generates and has no par.
    this.match = this.opts.seed != null ? null : matchFor(this.opts.daily, this.profile.id);
    this.par = this.match?.par ?? null;

    // A fresh match: score and round count reset here, NOT in _build, which
    // runs once per round and must leave the accumulating total alone.
    this.score = 0;
    this.round = 0;
    this._roundScores = [];
    this._roundClears = [];
    this._build();
  }

  /**
   * Take ownership of our own classes without wiping what the shell put there
   * — assigning className outright would strip main.js's `.app-view`.
   */
  _setShell({ select }) {
    this.root.classList.add("nb");
    this.root.classList.toggle("nb--select", select);
  }

  // ── Difficulty picker ────────────────────────────────────────────────────

  _showSelect() {
    this._stopAnimation();
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._orbEls.clear();
    this._radii.clear();
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "nb-card";
    card.innerHTML = `
      <h1 class="nb-card-title">Numburst</h1>
      <p class="nb-card-lede">Every orb holds a number, and its size is that number &mdash; a 6 is three times a 2. Bombs subtract. An orb at zero bursts, hitting everything it touches for <strong>one less</strong> than it was worth.</p>
      <ul class="nb-rules">
        <li>Pick a bomb, then pick an orb. The bomb is spent either way.</li>
        <li>Damage carries over: two 1-bombs on a 5 leave a 3, still drawn full size.</li>
        <li>A burst only reaches orbs it is <strong>touching</strong> &mdash; follow the pile with your eye and you can trace the chain before you fire.</li>
        <li><strong>Chains multiply.</strong> Orbs killed by the blast score double, orbs killed by <em>those</em> score triple, and on outward. The long way round is worth far more than the direct hit.</li>
        <li><strong>${ROUNDS} rounds</strong> per game, your score carried across all of them. Spend out on each board — bombs do not roll over.</li>
      </ul>
    `;

    // The looping demo teaches the multiplier better than the prose can — it
    // sits right under the lede so it is the first thing that moves.
    const lede = card.querySelector(".nb-card-lede");
    const demoHost = document.createElement("div");
    lede.after(demoHost);
    this._tutorialCleanup = mountTutorial(demoHost);

    const list = document.createElement("div");
    list.className = "nb-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id, this.day);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `nb-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="nb-pick-main">
          <span class="nb-pick-label">${escapeHtml(prof.label)}</span>
          <span class="nb-pick-blurb">${
            done ? "Played today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="nb-pick-spec">
          <span class="nb-pick-big">${done ? done.score : prof.orbCount}</span>
          <span class="nb-pick-sub">${
            done ? "points" : `orbs · ${ROUNDS} rounds`
          }</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: played today, scored ${done.score}. View result.`
          : `${prof.label}: ${prof.blurb}. ${prof.orbCount} orbs, values up to ${prof.maxValue}, ${ROUNDS} rounds.`,
      );
      // SCAFFOLDING: a played tier just replays. Colorpath shows the stored
      // result instead, which is the behavior to copy once there is a result
      // screen worth showing.
      btn.addEventListener("click", () => this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    this.root.appendChild(card);
    firstBtn?.focus();
  }

  // ── Board ────────────────────────────────────────────────────────────────

  _build() {
    this._stopAnimation(); // a rebuild mid-shot must not leave frames in flight
    this._teardownTutorial(); // leaving the picker stops its demo loop
    // Prefer the day's frozen board: it was committed with a par, and using it
    // means a later tuning change cannot rewrite a day already played. When the
    // archive lacks this day the seed regenerates the identical board — same
    // seed, same generator — just without the par. Each round is a distinct
    // board off the day's seed, so a match is three fixed boards every player
    // shares, not three re-rolls.
    const frozen = this.match ? boardFromRound(this.match.rounds[this.round]) : null;
    this.board = frozen
      ?? generateBoard(this.profile, new Rng(`${this.seed}:r${this.round}`));
    this._roundStart = this.score;
    this.armed = bombValues(this.profile)[0] ?? null;
    this._orbEls.clear();

    this.root.innerHTML = "";
    this._setShell({ select: false });

    const hud = document.createElement("div");
    hud.className = "nb-hud";
    hud.innerHTML = `
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Round</span>
        <span class="nb-round">1 / ${ROUNDS}</span>
      </div>
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Score</span>
        <span class="nb-score">0</span>
      </div>
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Bombs</span>
        <span class="nb-bombs-left">0</span>
      </div>
    `;
    this._roundEl = hud.querySelector(".nb-round");
    this._scoreEl = hud.querySelector(".nb-score");
    this._bombsLeftEl = hud.querySelector(".nb-bombs-left");

    const field = document.createElement("div");
    field.className = "nb-field";
    field.addEventListener("click", (e) => {
      const el = e.target.closest("[data-orb]");
      if (!el) return;
      this._fireAt(Number(el.dataset.orb));
    });
    this._fieldEl = field;

    // Effects layer. Its viewBox is the board's own coordinate space, so
    // arrows can be drawn straight from orb centers with no pixel conversion
    // and no resize handling — the SVG scales with the field for free.
    const size = this.board.size ?? DEFAULT_SIZE;
    const fx = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    fx.setAttribute("class", "nb-fx");
    fx.setAttribute("viewBox", `0 0 ${size} ${size}`);
    fx.setAttribute("aria-hidden", "true");
    field.appendChild(fx);
    this._fxEl = fx;

    const tray = document.createElement("div");
    tray.className = "nb-tray";
    tray.addEventListener("click", (e) => {
      const el = e.target.closest("[data-bomb]");
      if (!el) return;
      this.armed = Number(el.dataset.bomb);
      this._renderTray();
    });
    this._trayEl = tray;

    const foot = document.createElement("div");
    foot.className = "nb-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "nb-btn";
    back.textContent = "Change difficulty";
    back.addEventListener("click", () => this._showSelect());
    foot.appendChild(back);

    this.root.append(hud, field, tray, foot);
    this._buildOrbs();
    this._renderTray();
    this._renderHud();
  }

  /** Board units → field pixels. Re-read rather than cached; the box resizes. */
  _scale() {
    return (this._fieldEl?.clientWidth || 0) / (this.board?.size || DEFAULT_SIZE);
  }

  /**
   * Position an orb.
   *
   * A pixel `transform` rather than percentage `left`/`top`, because during a
   * collapse this runs for a hundred-odd orbs every frame and `left`/`top`
   * costs a layout pass each time. Transforms skip straight to compositing.
   */
  _place(el, x, y, r, k) {
    el.style.transform =
      `translate(${((x - r) * k).toFixed(2)}px, ${((y - r) * k).toFixed(2)}px)`;
  }

  /**
   * Build the orb layer once per board.
   *
   * Elements are created here and then only ever updated in place. The earlier
   * version rebuilt the whole layer with innerHTML on every shot, which is the
   * one thing that cannot happen during an animation: it destroys the very
   * nodes mid-flight and forces a full re-layout of the field.
   */
  _buildOrbs() {
    // Clear orbs only — the effects layer is a sibling that must survive, and
    // wiping innerHTML would take it with them.
    for (const el of this._fieldEl.querySelectorAll(".nb-orb")) el.remove();
    this._orbEls.clear();
    this._radii.clear();

    // Every board sets its own box side, sized to the pile it holds, so the
    // heap fills the frame on Easy and on Hard alike.
    const size = this.board.size ?? DEFAULT_SIZE;

    for (const orb of this.board.orbs) {
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.orb = String(orb.id);
      // Sizes stay in percentages of the square field, so they ride out a
      // viewport change with no JavaScript at all.
      const d = (2 * orb.r * 100) / size;
      el.style.width = `${d}%`;
      el.style.height = `${d}%`;
      // Size is the primary readout; the number confirms it. Scaling the text
      // with the orb is what makes a wounded 5 (still drawn full size) read as
      // damaged rather than as a 3.
      //
      // In cqw — percent of the field's own width — because the box side is
      // per-board now. A vmin-based size would silently shrink every numeral
      // on Easy, whose smaller box maps the same orb to more screen pixels.
      el.style.fontSize = `max(0.55rem, ${(d * 0.36).toFixed(2)}cqw)`;
      this._fieldEl.appendChild(el);
      this._orbEls.set(orb.id, el);
      this._radii.set(orb.id, orb.r);
    }

    this._syncOrbs();
  }

  /** Push current board state into the existing orb elements. */
  _syncOrbs() {
    if (!this.board) return;
    const k = this._scale();

    for (const orb of this.board.orbs) {
      const el = this._orbEls.get(orb.id);
      if (!el) continue;

      el.className = `nb-orb${orb.alive ? "" : " is-dead"}${
        orb.alive && orb.value < orb.max ? " is-hurt" : ""
      }`;
      el.disabled = !orb.alive;
      // Hue tracks the CURRENT value while size stays pegged to the original,
      // so the two readouts agree on a fresh orb and visibly disagree on a
      // damaged one — a 9 chewed down to 3 is drawn 9-big in 3-blue. That
      // disagreement IS the damage indicator; nothing else has to say it.
      el.style.setProperty("--nb-hue", String(hueForValue(orb.value)));
      el.style.removeProperty("animation-delay");
      el.textContent = String(orb.value);
      el.setAttribute(
        "aria-label",
        orb.alive ? `Orb worth ${orb.value}, started at ${orb.max}` : "Destroyed orb",
      );
      this._place(el, orb.x, orb.y, orb.r, k);
    }
  }

  _renderTray() {
    this._trayEl.innerHTML = "";
    for (const value of bombValues(this.profile)) {
      const count = this.board.bombs[value] || 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `nb-bomb${this.armed === value ? " is-armed" : ""}`;
      btn.dataset.bomb = String(value);
      btn.disabled = count === 0;
      // Same ramp as the orbs: a 2-bomb is the blue of a 2-orb, so "what will
      // this kill outright" is a color match rather than arithmetic.
      btn.style.setProperty("--nb-hue", String(hueForValue(value)));
      btn.innerHTML = `
        <span class="nb-bomb-value">${value}</span>
        <span class="nb-bomb-count">&times;${count}</span>
      `;
      btn.setAttribute("aria-pressed", String(this.armed === value));
      btn.setAttribute("aria-label", `${value}-damage bomb, ${count} left`);
      this._trayEl.appendChild(btn);
    }
  }

  _renderHud() {
    this._roundEl.textContent = `${this.round + 1} / ${ROUNDS}`;
    this._scoreEl.textContent = String(this.score);
    this._bombsLeftEl.textContent = String(bombsLeft(this.board));
  }

  async _fireAt(orbId) {
    // The board is locked from the moment a shot starts until the pile has
    // finished falling. Without this you could keep firing into a heap that is
    // still in motion, scoring against positions that no longer exist by the
    // time the shot resolves.
    if (this._busy) return;
    if (this.armed == null) return;
    if ((this.board.bombs[this.armed] || 0) === 0) return;

    // Resolve the blast WITHOUT settling, so the cascade plays against the
    // arrangement the player was actually looking at when they fired.
    const result = detonate(this.board, orbId, this.armed, { settleAfter: false });
    if (!result.destroyed.length) {
      // A dud still costs the bomb, but there is nothing to animate.
      this.board = result.board;
      this._syncOrbs();
      this._afterShot();
      return;
    }

    this._busy = true;
    this.root.classList.add("is-busy");

    // Compute the collapse up front, while the first wave is on screen. The
    // wave animations are CSS on the compositor, so they keep playing smoothly
    // even though this blocks the main thread for a few hundred milliseconds on
    // a big board — the pause lands where there is already something to watch.
    //
    // It must read the pre-collapse geometry, which is why the blast above was
    // resolved with settleAfter: false.
    const { frames, ids } = collapseFrames(result.board.orbs, this.board.size);

    // The cascade plays out in full — every hit, every number, every burst —
    // before a single orb falls.
    await this._playWaves(result.waves);

    this.board = result.board;
    for (const dead of result.destroyed) {
      this._orbEls.get(dead.id)?.classList.add("is-dead");
    }

    await this._playFall(frames, ids);

    this._syncOrbs(); // the recorded frames are samples; this is the truth
    this._stopAnimation();
    this._afterShot();
  }

  /** Bookkeeping common to every shot, dud or not. */
  _afterShot() {
    // Fall back to whatever is still stocked, so you are never left armed with
    // an empty slot and a board that ignores your clicks.
    if ((this.board.bombs[this.armed] || 0) === 0) {
      this.armed = bombValues(this.profile).find((v) => (this.board.bombs[v] || 0) > 0) ?? null;
    }
    this._renderTray();
    this._renderHud();

    if (bombsLeft(this.board) === 0 || this.board.orbs.every((o) => !o.alive)) {
      this._endRound();
    }
  }

  /**
   * Narrate the cascade, one wave at a time.
   *
   * Damage lands BEFORE anything falls, and lands visibly: each blow draws an
   * arrow from the orb that burst to the orb it hit, floats the number it took
   * off, and rewrites that orb's value and color on the spot. Only once the
   * whole chain has played out does the pile collapse.
   *
   * The ordering is the point. Previously the arithmetic and the collapse
   * happened in the same instant, so the player saw orbs move but never saw
   * WHY — the -2 that killed a 2 was already history by the time anything was
   * on screen. Separating "what the explosion did" from "what fell afterwards"
   * is what makes a chain legible enough to plan the next one.
   */
  async _playWaves(waves) {
    const waveDelay = waveDelayFor(waves.length);
    // Read geometry from the OUTGOING board on purpose. Its orbs still sit
    // where they stood when the player fired, whereas the incoming board has
    // already been moved to its settled positions by the collapse recorder —
    // arrows drawn against those would point at where things are about to be.
    const orbById = new Map(this.board.orbs.map((o) => [o.id, o]));
    const instant = prefersReducedMotion();

    for (const wave of waves) {
      for (const hit of wave.hits) {
        const el = this._orbEls.get(hit.to);
        const to = orbById.get(hit.to);
        if (!el || !to) continue;

        if (!instant) {
          if (hit.from != null) this._drawArrow(orbById.get(hit.from), to);
          this._floatDamage(to, hit.amount);
        }

        // The struck orb takes its new value immediately: the number ticks
        // down and the hue drops to match, so a wounded orb is instantly too
        // big for its color.
        el.textContent = String(hit.after);
        el.style.setProperty("--nb-hue", String(hueForValue(hit.after)));
        if (!hit.died) el.classList.add("is-hurt");
      }

      // Then the orbs that died in this wave burst, which is what launches the
      // next one — so the arrows of wave N+1 leave the orbs popping right now.
      for (const dead of wave.destroyed) {
        this._orbEls.get(dead.id)?.classList.add("is-bursting");
      }

      // Score climbs wave by wave rather than jumping at the end, so a long
      // chain pays out as it travels — and pays MORE the further it gets.
      this.score += wave.score;
      this._renderHud();
      if (!instant && wave.multiplier > 1 && wave.destroyed.length) {
        this._floatCombo(wave, orbById);
      }

      if (!instant) await this._wait(waveDelay);
    }

    if (!instant) await this._wait(BURST_MS);
  }

  /**
   * Announce the multiplier over the middle of the wave that earned it.
   *
   * Placed at the centroid of what just died rather than somewhere fixed, so
   * the number appears where the player is already looking — out at the head of
   * the cascade, which is the part that is travelling.
   */
  _floatCombo(wave, orbById) {
    const live = wave.destroyed.map((d) => orbById.get(d.id)).filter(Boolean);
    if (!live.length) return;
    const size = this.board.size ?? DEFAULT_SIZE;
    const cx = live.reduce((s, o) => s + o.x, 0) / live.length;
    const cy = live.reduce((s, o) => s + o.y, 0) / live.length;

    const tag = document.createElement("div");
    tag.className = "nb-combo";
    tag.innerHTML = `<span class="nb-combo-x">&times;${wave.multiplier}</span><span class="nb-combo-pts">+${wave.score}</span>`;
    tag.style.left = `${((cx / size) * 100).toFixed(2)}%`;
    tag.style.top = `${((cy / size) * 100).toFixed(2)}%`;
    this._fieldEl.appendChild(tag);
    this._sweep(tag, 900);
  }

  /**
   * A dart from the orb that burst to the orb it hit.
   *
   * Drawn in board coordinates into the SVG overlay, and stopped short of the
   * target's edge so it reads as striking the orb rather than skewering it.
   */
  _drawArrow(from, to) {
    if (!from || !to || !this._fxEl) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "nb-arrow");
    // Normalize the length to 1 so a single dash animation draws any dart from
    // source to target at the same rate, regardless of how far it reaches.
    line.setAttribute("pathLength", "1");
    line.setAttribute("x1", (from.x + ux * from.r * 0.5).toFixed(2));
    line.setAttribute("y1", (from.y + uy * from.r * 0.5).toFixed(2));
    line.setAttribute("x2", (to.x - ux * to.r).toFixed(2));
    line.setAttribute("y2", (to.y - uy * to.r).toFixed(2));
    // Scale the stroke to the orbs involved, or a dart between two 1s is the
    // same weight as one between two 9s and the big hits stop reading as big.
    line.setAttribute("stroke-width", Math.max(0.5, Math.min(from.r, to.r) * 0.35).toFixed(2));

    this._fxEl.appendChild(line);
    this._sweep(line, 620);
  }

  /** A floating "-N" that drifts up off the orb it was taken from. */
  _floatDamage(orb, amount) {
    const size = this.board.size ?? DEFAULT_SIZE;
    const tag = document.createElement("div");
    tag.className = "nb-float";
    tag.textContent = `-${amount}`;
    tag.style.left = `${((orb.x / size) * 100).toFixed(2)}%`;
    tag.style.top = `${((orb.y / size) * 100).toFixed(2)}%`;
    // Big hits read bigger. Clamped so a -8 cannot swamp the board.
    tag.style.fontSize = `max(0.6rem, ${Math.min(3.4, 1 + amount * 0.32).toFixed(2)}cqw)`;
    this._fieldEl.appendChild(tag);
    this._sweep(tag, 760);
  }

  /** Bin a transient effect once its animation is done, cancellably. */
  _sweep(el, ms) {
    const t = setTimeout(() => { this._timers.delete(t); el.remove(); }, ms);
    this._timers.add(t);
  }

  /**
   * Play back a recorded collapse.
   *
   * Pure interpolation over frames the solver already produced — no physics
   * runs here, so the outcome is identical on every device regardless of frame
   * rate, and the fall can be stretched to whatever duration reads best.
   *
   * Only orbs that actually moved are touched.
   */
  _playFall(frames, ids) {
    if (prefersReducedMotion() || frames.length < 2) return Promise.resolve();

    const first = frames[0];
    const last = frames[frames.length - 1];
    const movers = [];
    for (let i = 0; i < ids.length; i++) {
      const dx = last[i * 2] - first[i * 2];
      const dy = last[i * 2 + 1] - first[i * 2 + 1];
      if (Math.hypot(dx, dy) < 0.15) continue; // stationary; leave it alone
      const el = this._orbEls.get(ids[i]);
      if (el) movers.push({ i, el, r: this._radii.get(ids[i]) ?? 0 });
    }
    if (!movers.length) return Promise.resolve();

    return new Promise((resolve) => {
      const k = this._scale();
      const started = performance.now();

      const step = (now) => {
        // Clamped at BOTH ends: requestAnimationFrame is not obliged to hand
        // back a timestamp on the same clock performance.now() reads, and a
        // negative elapsed would index off the front of the frame array.
        const t = Math.max(0, Math.min(1, (now - started) / FALL_MS));
        const frame = frames[Math.round(t * (frames.length - 1))];

        for (const m of movers) {
          this._place(m.el, frame[m.i * 2], frame[m.i * 2 + 1], m.r, k);
        }

        if (t < 1) {
          this._raf = requestAnimationFrame(step);
        } else {
          this._raf = null;
          resolve();
        }
      };

      this._raf = requestAnimationFrame(step);
    });
  }

  /**
   * A board just ended. Bank it and either advance to the next round or, on the
   * last one, finish the match.
   */
  _endRound() {
    const roundScore = this.score - this._roundStart;
    this._roundScores.push(roundScore);
    // A board is CLEARED when every orb burst — not merely when the bombs ran
    // out. That is the perfect line, tracked per round for the match-wide check.
    const cleared = this.board.orbs.every((o) => !o.alive);
    this._roundClears.push(cleared);

    if (this.round < ROUNDS - 1) {
      const panel = document.createElement("div");
      panel.className = `nb-done${cleared ? " is-perfect" : ""}`;
      panel.innerHTML = `
        <p class="nb-done-round">Round ${this.round + 1} of ${ROUNDS}</p>
        ${cleared ? `<p class="nb-perfect">Perfect &mdash; board cleared</p>` : ""}
        <p class="nb-done-score">+${roundScore}</p>
        <p class="nb-done-note">${this.score} so far.</p>
      `;
      const next = document.createElement("button");
      next.type = "button";
      next.className = "nb-btn";
      next.textContent = `Round ${this.round + 2} →`;
      next.addEventListener("click", () => {
        this.round += 1;
        this._build();
      });
      panel.appendChild(next);
      this.root.appendChild(panel);
      next.focus();
      return;
    }

    this._finish();
  }

  _finish() {
    // The match total is what a day is worth. unused bombs summed here would
    // only reflect the last board; a per-match tiebreak can come later with the
    // par score, so keep the shape simple for now.
    const unused = bombsLeft(this.board);
    saveResult(this.profile.id, { score: this.score, unused }, this.day);
    const record = recordBest(this.profile.id, { score: this.score, unused }, this.day);
    const best = bestResult(this.profile.id);

    // SCAFFOLDING: an inline panel, not the modal the other games use. It says
    // the number and gets out of the way.
    // Par is the reference, not a denominator: the score can run well past it,
    // which is the point. Framed as beaten / missed so the number means
    // something. Absent when the day was generated rather than loaded from the
    // archive (par cannot be recomputed cheaply on the client).
    const beat = this.par != null && this.score >= this.par;
    const parLine = this.par == null
      ? (record ? "New best." : best ? `Best: ${best.score}.` : "")
      : beat
        ? `Par ${this.par} — beaten by ${this.score - this.par}.`
        : `Par ${this.par} — ${this.par - this.score} short.`;

    // A perfect match is every board of the day burst to nothing — a scarcer,
    // louder thing than beating par, so it leads the panel when it happens.
    const perfect = this._roundClears.length === ROUNDS
      && this._roundClears.every(Boolean);

    const panel = document.createElement("div");
    panel.className = `nb-done${perfect ? " is-perfect" : beat ? " is-win" : ""}`;
    panel.innerHTML = `
      <p class="nb-done-round">${ROUNDS} rounds complete</p>
      ${perfect ? `<p class="nb-perfect">Perfect &mdash; every board cleared</p>` : ""}
      <p class="nb-done-score">${this.score}</p>
      <p class="nb-done-note">${parLine}</p>
    `;
    const actions = document.createElement("div");
    actions.className = "nb-done-actions";

    const share = document.createElement("button");
    share.type = "button";
    share.className = "nb-btn nb-btn-share";
    share.textContent = "Share";
    share.addEventListener("click", () => this._share(share, panel));

    const again = document.createElement("button");
    again.type = "button";
    again.className = "nb-btn";
    again.textContent = "Play again";
    // A throwaway seed, so replaying is a different match rather than the same
    // boards memorised. Not a daily any more — that is the point.
    again.addEventListener("click", () => {
      this.opts = { ...this.opts, seed: `practice:${this.score}:${Date.now()}` };
      this.start(this.profile.id);
    });

    actions.append(share, again);
    panel.appendChild(actions);
    this.root.appendChild(panel);
    share.focus();
    announceRoundComplete(this.root);
  }

  /** Assemble and copy the share text, with a manual-copy fallback. */
  _share(btn, panel) {
    const text = buildShareText({
      rounds: this._roundScores,
      total: this.score,
      par: this.par,
      difficultyLabel: this.profile.label,
      // Only a real daily carries a date; a practice match (custom seed) does
      // not, so it shares as an undated result rather than mislabelling a day.
      daily: this.match ? this.opts.daily?.date : null,
    });

    copyToClipboard(text).then((ok) => {
      btn.textContent = ok ? "Copied!" : "Copy failed";
      clearTimeout(this._shareTimer);
      this._shareTimer = setTimeout(() => { btn.textContent = "Share"; }, 2000);

      // When the clipboard is blocked (insecure context, in-app browser), drop
      // a textarea so the text can still be selected and copied by hand.
      if (!ok && !panel.querySelector(".nb-share-box")) {
        const box = document.createElement("textarea");
        box.className = "nb-share-box";
        box.readOnly = true;
        box.value = text;
        box.rows = this._roundScores.length + 4;
        panel.appendChild(box);
        box.focus();
        box.select();
      }
    });
  }
}

/**
 * The value → hue ramp, cool for small and hot for large.
 *
 * Deliberately ABSOLUTE rather than scaled to the tier's maxValue: a 4 is the
 * same green on Easy as it is on Hard, so the reflex you build on one tier
 * still reads on the next. The cost is that Easy (max 5) only ever uses the
 * cool half of the ramp.
 *
 * Expressed as an oklch hue and consumed with fixed lightness and chroma in
 * the stylesheet, so every orb is equally bright and only the hue moves. That
 * is what keeps white numerals legible across the whole range — an HSL ramp
 * would wash out at yellow and need per-hue text colors to compensate.
 *
 * Color here is decoration over size and numeral, never the sole carrier, so
 * this ramp does not need to survive color-vision deficiency on its own.
 */
const HUE_MIN_VALUE = 2;   // coolest orb — the generator's floor
const HUE_MAX_VALUE = 9;   // hottest orb, the highest any tier generates
const HUE_COOL = 210;      // oklch blue
const HUE_HOT = 25;        // oklch red

export function hueForValue(value) {
  const span = HUE_MAX_VALUE - HUE_MIN_VALUE;
  const t = Math.min(1, Math.max(0, (value - HUE_MIN_VALUE) / span));
  return Math.round(HUE_COOL + (HUE_HOT - HUE_COOL) * t);
}

/**
 * Honor the OS "reduce motion" setting by skipping straight to the outcome.
 *
 * Checked at call time rather than cached: the setting can be flipped mid-run,
 * and a player who turns it on because the falling made them queasy should not
 * have to reload to get relief.
 */
function prefersReducedMotion() {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
