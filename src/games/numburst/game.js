// Numburst — screen and interaction.
//
// SCAFFOLDING. This exists so the idea can be played with, not shipped. It
// renders a board, lets you arm a bomb and drop it, resolves the chain, and
// tells you what you scored. What it does NOT have yet: animation of any kind
// (a chain resolves instantly, which hides the very thing the game is about),
// undo, a tutorial, sharing, or any evidence that the boards are interesting.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets a future scripts/e2e-numburst.mjs drive it under jsdom.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  getDifficulty,
  bombValues,
} from "./difficulty.js";
import {
  generateBoard,
  detonate,
  totalValue,
  remainingValue,
  bombsLeft,
  DEFAULT_SIZE,
} from "./board.js";
import { dailySeedFor, getResult, saveResult, bestResult, recordBest } from "./results.js";
import { Rng } from "../../core/rng.js";

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
    this.profile = null;
    this.board = null;
    this.seed = null;

    this.score = 0;
    this.armed = null;     // bomb value currently selected, or null
    this._orbEls = new Map();

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    this.root.classList.remove("nb", "nb--select");
    this.root.innerHTML = "";
    this._orbEls.clear();
  }

  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY) {
    this.profile = getDifficulty(difficultyId);
    this.seed = this.opts.seed != null
      ? `${this.opts.seed}:${this.profile.id}`
      : dailySeedFor(this.profile.id);
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
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "nb-card";
    card.innerHTML = `
      <h1 class="nb-card-title">Numburst</h1>
      <p class="nb-card-lede">Every orb holds a number, and its size is that number &mdash; a 5 is five times a 1. Bombs subtract. An orb at zero bursts, and the bigger it was, the further the burst reaches.</p>
      <ul class="nb-rules">
        <li>Pick a bomb, then pick an orb. The bomb is spent either way.</li>
        <li>Damage carries over: two 1-bombs on a 5 leave a 3, still drawn full size.</li>
        <li>A burst damages everything in its radius, which can burst them too.</li>
        <li>Score is the total value you destroy. Run out of bombs and you are done.</li>
      </ul>
    `;

    const list = document.createElement("div");
    list.className = "nb-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id);

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
            done ? "points" : `orbs · up to ${prof.maxValue}`
          }</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: played today, scored ${done.score}. View result.`
          : `${prof.label}: ${prof.blurb}. ${prof.orbCount} orbs, values up to ${prof.maxValue}.`,
      );
      // SCAFFOLDING: a played tier just replays. Colorpath shows the stored
      // result instead, which is the behaviour to copy once there is a result
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
    this.board = generateBoard(this.profile, new Rng(this.seed));
    this.score = 0;
    this.armed = bombValues(this.profile)[0] ?? null;
    this._orbEls.clear();

    this.root.innerHTML = "";
    this._setShell({ select: false });

    const hud = document.createElement("div");
    hud.className = "nb-hud";
    hud.innerHTML = `
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Score</span>
        <span class="nb-score">0</span>
      </div>
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Left standing</span>
        <span class="nb-remaining">0</span>
      </div>
      <div class="nb-hud-stat">
        <span class="nb-hud-label">Bombs</span>
        <span class="nb-bombs-left">0</span>
      </div>
    `;
    this._scoreEl = hud.querySelector(".nb-score");
    this._remainingEl = hud.querySelector(".nb-remaining");
    this._bombsLeftEl = hud.querySelector(".nb-bombs-left");

    const field = document.createElement("div");
    field.className = "nb-field";
    field.addEventListener("click", (e) => {
      const el = e.target.closest("[data-orb]");
      if (!el) return;
      this._fireAt(Number(el.dataset.orb));
    });
    this._fieldEl = field;

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
    this._renderOrbs();
    this._renderTray();
    this._renderHud();
  }

  /**
   * Full re-render of the orb layer. Wholesale because the board is a few
   * dozen circles and doing it wholesale is what keeps a half-updated board
   * from being possible.
   */
  _renderOrbs() {
    this._fieldEl.innerHTML = "";
    this._orbEls.clear();

    // Every board sets its own box side, sized to the pile it holds, so the
    // heap fills the frame on Easy and on Hard alike.
    const size = this.board.size ?? DEFAULT_SIZE;

    for (const orb of this.board.orbs) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `nb-orb${orb.alive ? "" : " is-dead"}`;
      el.dataset.orb = String(orb.id);
      el.disabled = !orb.alive;
      // Percentages against the square field, so the board scales with the
      // viewport without recomputing anything on resize.
      const d = (2 * orb.r * 100) / size;
      el.style.width = `${d}%`;
      el.style.height = `${d}%`;
      el.style.left = `${((orb.x - orb.r) * 100) / size}%`;
      el.style.top = `${((orb.y - orb.r) * 100) / size}%`;
      // Size is the primary readout; the number confirms it. Scaling the text
      // with the orb is what makes a wounded 5 (still drawn full size) read as
      // damaged rather than as a 3.
      //
      // In cqw — percent of the field's own width — because the box side is
      // per-board now. A vmin-based size would silently shrink every numeral
      // on Easy, whose smaller box maps the same orb to more screen pixels.
      el.style.fontSize = `max(0.55rem, ${(d * 0.36).toFixed(2)}cqw)`;
      // Hue tracks the CURRENT value while size stays pegged to the original,
      // so the two readouts agree on a fresh orb and visibly disagree on a
      // damaged one — a 9 chewed down to 3 is drawn 9-big in 3-blue. That
      // disagreement IS the damage indicator; nothing else has to say it.
      el.style.setProperty("--nb-hue", String(hueForValue(orb.value)));
      el.textContent = String(orb.value);
      el.setAttribute(
        "aria-label",
        orb.alive ? `Orb worth ${orb.value}, started at ${orb.max}` : "Destroyed orb",
      );
      if (orb.value < orb.max) el.classList.add("is-hurt");
      this._fieldEl.appendChild(el);
      this._orbEls.set(orb.id, el);
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
      // this kill outright" is a colour match rather than arithmetic.
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
    this._scoreEl.textContent = String(this.score);
    this._remainingEl.textContent = String(remainingValue(this.board));
    this._bombsLeftEl.textContent = String(bombsLeft(this.board));
  }

  _fireAt(orbId) {
    if (this.armed == null) return;
    if ((this.board.bombs[this.armed] || 0) === 0) return;

    const { board, score } = detonate(this.board, orbId, this.armed);
    this.board = board;
    this.score += score;

    // Fall back to whatever is still stocked, so you are never left armed with
    // an empty slot and a board that ignores your clicks.
    if ((this.board.bombs[this.armed] || 0) === 0) {
      this.armed = bombValues(this.profile).find((v) => (this.board.bombs[v] || 0) > 0) ?? null;
    }

    this._renderOrbs();
    this._renderTray();
    this._renderHud();

    if (bombsLeft(this.board) === 0 || this.board.orbs.every((o) => !o.alive)) {
      this._finish();
    }
  }

  _finish() {
    const unused = bombsLeft(this.board);
    saveResult(this.profile.id, { score: this.score, unused });
    const record = recordBest(this.profile.id, { score: this.score, unused });
    const best = bestResult(this.profile.id);

    // SCAFFOLDING: an inline panel, not the modal the other games use. It says
    // the number and gets out of the way.
    const panel = document.createElement("div");
    panel.className = "nb-done";
    panel.innerHTML = `
      <p class="nb-done-score">${this.score} <small>of ${totalValue(this.board)}</small></p>
      <p class="nb-done-note">${
        record ? "New best." : best ? `Best: ${best.score}.` : ""
      } ${remainingValue(this.board)} left standing.</p>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "nb-btn";
    again.textContent = "Play again";
    // A throwaway seed, so replaying is a different board rather than the same
    // one memorised. Not a daily any more — that is the point.
    again.addEventListener("click", () => {
      this.opts = { ...this.opts, seed: `practice:${this.score}:${Date.now()}` };
      this.start(this.profile.id);
    });
    panel.appendChild(again);
    this.root.appendChild(panel);
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
 * would wash out at yellow and need per-hue text colours to compensate.
 *
 * Colour here is decoration over size and numeral, never the sole carrier, so
 * this ramp does not need to survive colour-vision deficiency on its own.
 */
const HUE_MIN_VALUE = 1;   // coolest orb
const HUE_MAX_VALUE = 9;   // hottest orb, the highest any tier generates
const HUE_COOL = 210;      // oklch blue
const HUE_HOT = 25;        // oklch red

export function hueForValue(value) {
  const span = HUE_MAX_VALUE - HUE_MIN_VALUE;
  const t = Math.min(1, Math.max(0, (value - HUE_MIN_VALUE) / span));
  return Math.round(HUE_COOL + (HUE_HOT - HUE_COOL) * t);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
