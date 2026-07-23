// Photon Finish — screen and interaction.
//
// Enough to play the idea and judge it. The picker carries a looping demo
// (tutorial.js) and a solved daily board offers a spoiler-free share
// (share.js). What it still does NOT have: animation of a beam sweeping as you
// turn it, and any polish this file's SCAFFOLDING note once promised.
//
// Rendered as one SVG in the board's own 0..100 coordinate space, so nothing
// here converts to pixels. The board scales with the viewport for free and a
// beam endpoint is written exactly as the optics module computed it.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets scripts/e2e-photonfinish.mjs drive it under jsdom.

import {
  DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, getDifficulty,
} from "./difficulty.js";
import { getPuzzle, getPracticePuzzle } from "./board.js";
import { SIZE, TAU, DEG, normalizeAngle, evaluate } from "./optics.js";
import {
  NEUTRAL, MAX_LEVEL, LEVEL_NAMES, levelHex, beamHex, levelWidth, levelGlow,
} from "./levels.js";
import { getResult, saveResult, bestResult, recordBest, todayKey } from "./results.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { mountTutorial } from "./tutorial.js";
import { announceRoundComplete } from "../../core/lifecycle.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Radius of the orb on the end of a laser, in board units. */
const ORB_R = 3.1;
/** Radius of an emitter. Larger — it is the thing you grab. */
const EMITTER_R = 4.2;
/** How far inside the board edge a wall is drawn. */
const WALL_INSET = 1.2;

/**
 * Keyboard aiming steps, in degrees.
 *
 * COARSE is deliberately 1 degree, and that number is load-bearing rather than
 * a matter of taste: every difficulty profile guarantees a solving window of at
 * least `minWindow` degrees, and the narrowest is 1.8. Any interval wider than
 * the step size must contain one of the steps, so stepping at 1 degree can
 * always land inside a solving arc no matter where the beam starts. A 2-degree
 * step would break that guarantee and make some boards unsolvable by keyboard
 * alone while remaining solvable with a mouse.
 *
 * scripts/verify-photonfinish.mjs asserts minWindow > COARSE for every tier, so
 * the guarantee cannot be lost by tuning difficulty later.
 */
export const KEY_STEP_COARSE = 1;
export const KEY_STEP_FINE = 10;

export class PhotonFinishGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {string} opts.difficulty - skip the picker, open straight into a tier
   * @param {string} opts.seed       - seed prefix, for tests
   * @param {string} opts.day        - archive day "YYYY-MM-DD"; omitted means today
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    // Any non-today day is an ephemeral archive replay (a supporter perk): its
    // board is loaded normally but its result never persists — see results.js.
    this.day = opts.day || todayKey();
    this.profile = null;
    this.puzzle = null;
    this.angles = [];
    this.selected = 0;
    this.moves = 0;
    this.done = false;
    this._raf = null;
    this._shareTimer = null;   // resets the share button label
    this._shareBox = null;     // manual-copy textarea, when the clipboard fails
    this._tutorialCleanup = null; // stops the picker demo loop

    this._onKey = this._onKey.bind(this);

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
    clearTimeout(this._shareTimer);
    this._shareBox = null;
    this._teardownTutorial();
    this.root.removeEventListener("keydown", this._onKey);
    this.root.classList.remove("pf", "pf--select", "is-solved");
    this.root.innerHTML = "";
  }

  start(difficultyId = this.profile?.id ?? DEFAULT_DIFFICULTY, { practice = false } = {}) {
    this.profile = getDifficulty(difficultyId);

    try {
      this.puzzle = practice
        ? getPracticePuzzle(this.profile.id, this.puzzle?.day)
        : getPuzzle(this.profile.id, this.day);
    } catch (err) {
      this._showError(err);
      return;
    }

    this.angles = this.puzzle.start.slice();
    this.selected = 0;
    this.moves = 0;
    this.done = false;
    this.root.classList.remove("is-solved");
    this._build();
  }

  /** Take ownership of our own classes without wiping main.js's `.app-view`. */
  _setShell({ select }) {
    this.root.classList.add("pf");
    this.root.classList.toggle("pf--select", select);
  }

  // ── Difficulty picker ────────────────────────────────────────────────────

  _showSelect() {
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "pf-card";
    card.innerHTML = `
      <h1 class="pf-card-title">Photon Finish</h1>
      <p class="pf-card-lede">Every beam starts at brightness <strong>2</strong>. Aim them through the gates so each finish line is crossed at exactly the brightness it asks for.</p>
      <div class="pf-demo-mount"></div>
      <ul class="pf-rules">
        <li>A <strong>light gate</strong> raises brightness by one. A <strong>dark gate</strong> lowers it by one.</li>
        <li>Brightness runs 0 to 4 and <strong>sticks at the ends</strong> — brighten a 4 and nothing happens, so the order you cross gates in matters.</li>
        <li>Beams bounce off the walls and off the mirror in the middle.</li>
        <li><strong>Where two beams cross, each pushes the other</strong> toward its own brightness. A bright beam lifts the other; a dark one drags it down.</li>
        <li>So the beams cannot be aimed one at a time. On the harder boards they form a chain: settle one, and it pins the next.</li>
      </ul>
    `;

    const list = document.createElement("div");
    list.className = "pf-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id, this.day);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pf-pick${done?.solved ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="pf-pick-main">
          <span class="pf-pick-label">${escapeHtml(prof.label)}</span>
          <span class="pf-pick-blurb">${
            done?.solved ? "Solved today — play again" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="pf-pick-spec">
          <span class="pf-pick-big">${done?.solved ? done.moves : prof.emitters}</span>
          <span class="pf-pick-sub">${done?.solved ? "moves" : "beams"}</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done?.solved
          ? `${prof.label}: solved today in ${done.moves} moves. Play again.`
          : `${prof.label}: ${prof.blurb}. ${prof.emitters} beams.`,
      );
      btn.addEventListener("click", () => this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    this.root.appendChild(card);

    // The looping demo. Mounted after the card is in the DOM so its cleanup can
    // stop the timer the moment the picker is left — see _teardownTutorial.
    const mount = card.querySelector(".pf-demo-mount");
    if (mount) this._tutorialCleanup = mountTutorial(mount);

    firstBtn?.focus();
  }

  /** Stop and remove the picker demo, so its loop never outlives the screen. */
  _teardownTutorial() {
    if (this._tutorialCleanup) { this._tutorialCleanup(); this._tutorialCleanup = null; }
  }

  _showError(err) {
    console.error(err);
    this.root.innerHTML = "";
    this._setShell({ select: true });
    const card = document.createElement("div");
    card.className = "pf-card";
    card.innerHTML = `
      <h1 class="pf-card-title">Photon Finish</h1>
      <p class="pf-card-lede">Couldn't build today's board.</p>
      <p class="pf-done-note">${escapeHtml(err.message)}</p>
    `;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "pf-btn";
    back.textContent = "Back";
    back.addEventListener("click", () => this._showSelect());
    card.appendChild(back);
    this.root.appendChild(card);
  }

  // ── Board ────────────────────────────────────────────────────────────────

  _build() {
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ select: false });

    const hud = document.createElement("div");
    hud.className = "pf-hud";
    hud.innerHTML = `<div class="pf-targets"></div>
      <div class="pf-hud-stat"><span class="pf-hud-label">Aim</span><span class="pf-aim">—</span></div>
      <div class="pf-hud-stat"><span class="pf-hud-label">Moves</span><span class="pf-moves">0</span></div>`;
    this._targetsEl = hud.querySelector(".pf-targets");
    this._movesEl = hud.querySelector(".pf-moves");
    this._aimEl = hud.querySelector(".pf-aim");

    const stage = document.createElement("div");
    stage.className = "pf-stage";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("class", "pf-board");
    svg.setAttribute("role", "application");
    svg.setAttribute("aria-label",
      "Laser board. Select a beam, then use the left and right arrow keys to aim it.");
    this._svg = svg;

    // Layer order is the whole visual hierarchy: terrain at the back, then the
    // finish lines, then the beams over both (they are the live thing), then
    // the emitters on top because they are what you grab.
    this._layers = {};
    for (const name of ["gates", "goals", "beams", "emitters"]) {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", `pf-layer pf-layer-${name}`);
      svg.appendChild(g);
      this._layers[name] = g;
    }

    // Aiming is handled on the BOARD, not on the emitter. Requiring a press
    // that starts on a 4-unit dot was the single least discoverable thing
    // here: there was no way to find out that the game had an aiming control
    // at all without happening to grab exactly the right pixel.
    svg.addEventListener("pointerdown", (ev) => this._onPointerDown(ev));

    stage.appendChild(svg);

    // Four turn buttons, not two.
    //
    // They used to step KEY_STEP_COARSE, which is one degree — invisible. You
    // pressed the button, the beam did not appear to move, and the honest
    // conclusion was that the control was broken. But the fine step cannot
    // simply be made bigger: a player working the buttons alone has to be able
    // to land inside a solving window, and the narrowest any tier allows is
    // 1.8 degrees. So both are offered, and the pairing is itself the
    // explanation — big to get there, small to land.
    const foot = document.createElement("div");
    foot.className = "pf-foot";
    const turns = document.createElement("div");
    turns.className = "pf-turns";
    turns.append(
      this._footBtn("↺ 10°", `Turn the selected beam ${KEY_STEP_FINE} degrees anticlockwise`,
        () => this._turn(-KEY_STEP_FINE)),
      this._footBtn("↺ 1°", `Turn the selected beam ${KEY_STEP_COARSE} degree anticlockwise`,
        () => this._turn(-KEY_STEP_COARSE)),
      this._footBtn("1° ↻", `Turn the selected beam ${KEY_STEP_COARSE} degree clockwise`,
        () => this._turn(KEY_STEP_COARSE)),
      this._footBtn("10° ↻", `Turn the selected beam ${KEY_STEP_FINE} degrees clockwise`,
        () => this._turn(KEY_STEP_FINE)),
    );

    const next = this._footBtn("Next beam", "Select the next beam", () => {
      this._select((this.selected + 1) % this.puzzle.emitters.length);
    });
    const back = this._footBtn("Change difficulty", "Change difficulty", () => this._showSelect());
    back.classList.add("pf-btn--quiet");
    foot.append(turns, next, back);

    const hint = document.createElement("p");
    hint.className = "pf-hint";
    hint.innerHTML =
      "<strong>Click anywhere on the board</strong> to point the selected beam there, " +
      "or drag an emitter to sweep it. Arrow keys turn 1°, hold shift for 10°. " +
      "Number keys pick a beam.";

    const live = document.createElement("p");
    live.className = "pf-live";
    live.setAttribute("aria-live", "polite");
    this._liveEl = live;

    this.root.append(hud, stage, foot, hint, live);

    this.root.tabIndex = -1;
    this.root.addEventListener("keydown", this._onKey);

    this._drawStatic();
    this._render();
  }

  _footBtn(label, aria, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pf-btn";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  }

  /** The parts that never change: the gates and the mirror. */
  _drawStatic() {
    const g = this._layers.gates;
    g.innerHTML = "";

    // The mirror first, so a gate lying near it still reads on top.
    const m = this.puzzle.mirror;
    if (m) {
      g.appendChild(el("line", {
        x1: m.a.x, y1: m.a.y, x2: m.b.x, y2: m.b.y, class: "pf-mirror-body",
      }));
      const line = el("line", {
        x1: m.a.x, y1: m.a.y, x2: m.b.x, y2: m.b.y, class: "pf-mirror",
      });
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = "Mirror — reflects, changes nothing";
      line.appendChild(title);
      g.appendChild(line);
    }

    for (const gate of this.puzzle.gates) {
      g.appendChild(this._gate(gate));
    }
  }

  /**
   * A gate: a short bar with a + or - at its middle.
   *
   * The sign is the whole readout and it is a glyph, not a color — a light
   * gate is drawn bright and a dark gate dim, but that difference is decoration
   * over the symbol rather than the thing carrying the meaning. It has to work
   * that way round: the board is nearly black, so "dark" cannot be expressed by
   * making something darker without it disappearing into the background.
   */
  _gate(gate) {
    const node = el("g", { class: `pf-gate${gate.dark ? " is-dark" : " is-light"}` });
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = gate.dark ? "Dark gate: brightness -1" : "Light gate: brightness +1";
    node.appendChild(title);

    node.appendChild(el("line", {
      x1: gate.a.x, y1: gate.a.y, x2: gate.b.x, y2: gate.b.y, class: "pf-gate-bar",
    }));

    const mx = (gate.a.x + gate.b.x) / 2;
    const my = (gate.a.y + gate.b.y) / 2;
    node.appendChild(el("circle", { cx: mx, cy: my, r: 2.6, class: "pf-gate-disc" }));
    const sign = el("text", { x: mx, y: my, class: "pf-gate-sign" });
    sign.textContent = gate.dark ? "\u2212" : "+";
    node.appendChild(sign);
    return node;
  }

  /**
   * The brightness badge: a numeral in a disc.
   *
   * Brightness is carried on lightness AND thickness on the beams themselves,
   * but neither is exact — nobody can tell a 3 from a 4 by eye alone under
   * pressure. The finish lines therefore state the number outright, which is
   * also what makes the game plannable: "I need 3, I am at 1" is arithmetic.
   */
  _badge(at, level, { r = 3.1, label = "", tint = null } = {}) {
    const node = el("g", { class: "pf-badge" });
    if (label) {
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = label;
      node.appendChild(title);
    }
    node.appendChild(el("circle", {
      cx: at.x, cy: at.y, r, class: "pf-badge-disc",
      fill: levelHex(level),
      ...(tint ? { stroke: tint, "stroke-width": 0.7 } : {}),
    }));
    const text = el("text", {
      x: at.x, y: at.y, class: "pf-badge-num",
      fill: level >= 3 ? "#10131d" : "#f2f5ff",
      "font-size": r * 1.15,
    });
    text.textContent = String(level);
    node.appendChild(text);
    return node;
  }

  // ── Live render ──────────────────────────────────────────────────────────

  _render() {
    if (this._raf != null) { cancelAnimationFrame(this._raf); this._raf = null; }
    const state = evaluate(this.puzzle, this.angles);
    this._state = state;

    this._drawGoals(state);
    this._drawBeams(state);
    this._drawEmitters();
    this._drawTargets(state);
    this._movesEl.textContent = String(this.moves);
    // With continuous aim there is no notch number to fall back on, so the
    // angle is shown outright — it is the only way to tell a small adjustment
    // from no adjustment.
    this._aimEl.textContent =
      `${Math.round(normalizeAngle(this.angles[this.selected]) * DEG)}° · beam ${this.selected + 1}`;

    if (state.solved && !this.done) this._finish();
  }

  _drawGoals(state) {
    const g = this._layers.goals;
    g.innerHTML = "";

    this.puzzle.goals.forEach((goal, i) => {
      const met = state.goals[i].met;
      const wrap = el("g", { class: `pf-goalgate${met ? " is-met" : ""}` });
      const dx = goal.b.x - goal.a.x;
      const dy = goal.b.y - goal.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const span = { x1: goal.a.x, y1: goal.a.y, x2: goal.b.x, y2: goal.b.y };

      wrap.appendChild(el("line", { ...span, class: "pf-goal-band" }));
      wrap.appendChild(el("line", { ...span, class: "pf-goal" }));
      wrap.appendChild(el("line", { ...span, class: "pf-goal-hatch" }));

      const POST = 2.4;
      for (const end of [goal.a, goal.b]) {
        wrap.appendChild(el("line", {
          x1: end.x - nx * POST, y1: end.y - ny * POST,
          x2: end.x + nx * POST, y2: end.y + ny * POST,
          class: "pf-goal-post",
        }));
      }

      // The number it wants, on the line itself. Offset to the side so the
      // beam crossing the gate never sits on top of the one thing that says
      // what the gate is for.
      const mid = { x: (goal.a.x + goal.b.x) / 2, y: (goal.a.y + goal.b.y) / 2 };
      wrap.appendChild(this._badge(
        { x: mid.x + nx * (len / 2 + 3.6), y: mid.y + ny * (len / 2 + 3.6) },
        goal.level,
        { label: `Finish line ${i + 1}: wants brightness ${goal.level}${met ? " — crossed" : ""}` },
      ));

      if (met) {
        wrap.appendChild(el("circle", { cx: mid.x, cy: mid.y, r: 2.9, class: "pf-goal-tickdisc" }));
        const tick = el("text", { x: mid.x, y: mid.y, class: "pf-goal-tick" });
        tick.textContent = "\u2713";
        wrap.appendChild(tick);
      }

      g.appendChild(wrap);
    });
  }

  _drawBeams(state) {
    const g = this._layers.beams;
    g.innerHTML = "";

    state.traces.forEach((trace, i) => {
      const selected = this.selected === i;

      for (const seg of trace.segments) {
        if (Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) < 1e-6) continue;
        const attrs = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
        const width = levelWidth(seg.level) * (selected ? 1.35 : 1);

        // Brightness is drawn twice over: as lightness and as THICKNESS. The
        // board is nearly black, so a level-0 beam cannot be shown by making it
        // darker — it would vanish into the surface it has to be read against.
        // Thickness has no such floor, and it also survives being looked at by
        // someone who cannot separate the lightness steps.
        const glow = levelGlow(seg.level);
        if (glow > 0) {
          g.appendChild(el("line", {
            ...attrs, class: "pf-beam-glow",
            stroke: beamHex(seg.level, i),
            "stroke-width": width * 3,
            opacity: glow * (selected ? 1.3 : 1),
          }));
        }
        g.appendChild(el("line", {
          ...attrs,
          class: `pf-beam${selected ? " is-selected" : ""}`,
          stroke: beamHex(seg.level, i),
          "stroke-width": width,
        }));
      }

      for (const b of trace.path.bounces) {
        g.appendChild(el("circle", {
          cx: b.x, cy: b.y, r: 1.15,
          class: `pf-bounce${selected ? " is-selected" : ""}`,
        }));
      }

      // Where the beams cross. This is the mechanic the whole board turns on,
      // so it is marked outright and labelled with what each beam became.
      for (const ev of trace.events) {
        if (ev.kind !== "beam") continue;
        g.appendChild(el("circle", {
          cx: ev.at.x, cy: ev.at.y, r: 2.2,
          class: `pf-couple${ev.levelAfter !== ev.levelBefore ? " is-live" : ""}`,
        }));
      }
    });
  }

  _drawEmitters() {
    const g = this._layers.emitters;
    g.innerHTML = "";

    this.puzzle.emitters.forEach((e, i) => {
      const angle = this.angles[i];
      const selected = this.selected === i;
      const deg = Math.round(normalizeAngle(angle) * DEG);

      const node = el("g", {
        class: `pf-emitter${selected ? " is-selected" : ""}`,
        tabindex: "0",
        role: "button",
        "data-emitter": String(i),
        "aria-label":
          `Beam ${i + 1}, pointing ${compass(angle)}, ${deg} degrees. ` +
          "Arrow keys to aim, hold shift for bigger steps.",
      });

      // A ring with a heading marker. There are no notches to draw any more —
      // aim is continuous — so the ring's only jobs are to say "this is the
      // thing that turns" and to give the drag a visible track.
      //
      // Drawn on EVERY emitter, not just the selected one. Previously an
      // unselected emitter was a bare white dot with no affordance at all, so
      // a board opened with nothing on it that looked adjustable.
      node.appendChild(el("circle", {
        cx: e.x, cy: e.y, r: EMITTER_R * 2.1,
        class: `pf-dial${selected ? " is-selected" : ""}`,
      }));
      node.appendChild(el("circle", {
        cx: e.x + Math.cos(angle) * EMITTER_R * 2.1,
        cy: e.y + Math.sin(angle) * EMITTER_R * 2.1,
        r: selected ? 1.35 : 0.9,
        class: `pf-dial-handle${selected ? " is-selected" : ""}`,
        fill: beamHex(MAX_LEVEL, i),
      }));

      node.appendChild(el("line", {
        x1: e.x, y1: e.y,
        x2: e.x + Math.cos(angle) * EMITTER_R * 1.6,
        y2: e.y + Math.sin(angle) * EMITTER_R * 1.6,
        class: "pf-barrel",
      }));
      node.appendChild(this._badge(e, NEUTRAL, {
        r: EMITTER_R, tint: beamHex(MAX_LEVEL, i),
        label: `Beam ${i + 1} emitter, starts at brightness ${NEUTRAL}`,
      }));
      node.appendChild(el("text", {
        x: e.x, y: e.y + EMITTER_R * 2.9, class: "pf-emitter-num",
      })).textContent = String(i + 1);

      node.addEventListener("focus", () => this._select(i, { silent: true }));
      g.appendChild(node);
    });
  }

  /** The "what am I aiming for" strip above the board. */
  _drawTargets(state) {
    this._targetsEl.innerHTML = "";
    this.puzzle.goals.forEach((goal, i) => {
      const met = state.goals[i].met;
      const chip = document.createElement("span");
      chip.className = `pf-target${met ? " is-met" : ""}`;
      chip.innerHTML = `
        <span class="pf-target-swatch" style="background:${levelHex(goal.level)};color:${
          goal.level >= 3 ? "#10131d" : "#f2f5ff"}">${goal.level}</span>
        <span class="pf-target-name">${LEVEL_NAMES[goal.level]}</span>
        <span class="pf-target-tick" aria-hidden="true">${met ? "\u2713" : ""}</span>
      `;
      chip.setAttribute(
        "aria-label",
        `Finish line ${i + 1} wants brightness ${goal.level}. ${met ? "Crossed." : "Not yet."}`,
      );
      this._targetsEl.appendChild(chip);
    });
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  _select(i, { silent = false } = {}) {
    if (this.selected === i) return;
    this.selected = i;
    this._render();
    if (!silent) this._announce(`Beam ${i + 1} selected.`);
  }

  /**
   * Turn the selected emitter by `degrees`. One button press, one move.
   */
  _turn(degrees) {
    if (this.done) return;
    const i = this.selected;
    if (this._setAngle(i, this.angles[i] + degrees / DEG)) this._announceBeam(i);
  }

  _setAngle(i, angle, { count = true, schedule = false } = {}) {
    const next = normalizeAngle(angle);
    if (next === this.angles[i]) return false;
    this.angles[i] = next;
    if (count) this.moves++;
    if (schedule) this._scheduleRender();
    else this._render();
    return true;
  }

  /**
   * Redraw at most once per frame.
   *
   * A drag emits pointermove faster than the screen refreshes, and every one
   * of them used to trigger a full redraw — which rebuilds up to 188 SVG nodes
   * on a hard board. The model itself is trivial (evaluating the whole board
   * costs a few microseconds); it was only ever the DOM churn that cost
   * anything, and beyond one redraw per frame none of it can be seen.
   */
  _scheduleRender() {
    if (this._raf != null) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._render();
    });
  }

  /** Point beam `i` at a board coordinate. */
  _aimAt(i, point, opts) {
    const e = this.puzzle.emitters[i];
    // Right on top of the emitter there is no meaningful direction to take, and
    // atan2 would snap wildly to whichever side of the center the pointer
    // wobbled onto.
    if (Math.hypot(point.x - e.x, point.y - e.y) < 1) return false;
    return this._setAngle(i, Math.atan2(point.y - e.y, point.x - e.x), opts);
  }

  /**
   * Press anywhere on the board to aim; drag to sweep.
   *
   * Pressing an emitter selects it and starts a sweep. Pressing anywhere else
   * points the SELECTED beam straight at that spot — which is the affordance
   * the board was missing entirely, and the one that makes free aim
   * self-explanatory: you show the beam where to go rather than hunting for a
   * dial.
   *
   * The whole press-drag-release is ONE move however far the beam travelled,
   * so aiming by eye is never more expensive than nudging with the buttons.
   */
  _onPointerDown(ev) {
    if (this.done) return;
    const node = ev.target.closest?.(".pf-emitter");
    const i = node ? Number(node.dataset.emitter) : this.selected;
    if (node) this._select(i, { silent: true });

    ev.preventDefault();
    const before = this.angles[i];
    const svg = this._svg;

    // Pressing the emitter itself starts a sweep without jumping the beam;
    // pressing open board aims there immediately.
    if (!node) {
      const p = this._toBoard(ev);
      if (p) this._aimAt(i, p, { count: false });
    }

    const move = (e) => {
      const p = this._toBoard(e);
      if (p) this._aimAt(i, p, { count: false, schedule: true });
    };
    const up = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      if (this.angles[i] !== before) {
        this.moves++;
        this._render();
        this._announceBeam(i);
      }
    };

    try { svg.setPointerCapture(ev.pointerId); } catch { /* jsdom / no capture */ }
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  }

  /** Pointer coordinates → board coordinates. */
  _toBoard(ev) {
    const rect = this._svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((ev.clientX - rect.left) / rect.width) * SIZE,
      y: ((ev.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  _onKey(ev) {
    if (this.done) return;
    const n = this.puzzle?.emitters.length ?? 0;
    if (!n) return;

    // Shift is the BIG step, not the small one. Aim is continuous, so the
    // useful default is the fine adjustment and the modifier is for crossing
    // the dial quickly — the opposite of the usual convention, and the right
    // way round here because most of the work is fine.
    const step = ev.shiftKey ? KEY_STEP_FINE : KEY_STEP_COARSE;
    // Holding a key repeats it, and charging a move per repeat would make
    // keyboard aiming cost dozens of moves where a drag of the same sweep
    // costs one. One continuous action is one move, whatever the input.
    const count = !ev.repeat;

    switch (ev.key) {
      case "ArrowLeft":
      case "ArrowDown":
        this._setAngle(this.selected, this.angles[this.selected] - step / DEG, { count });
        this._announceBeam(this.selected);
        break;
      case "ArrowRight":
      case "ArrowUp":
        this._setAngle(this.selected, this.angles[this.selected] + step / DEG, { count });
        this._announceBeam(this.selected);
        break;
      case "[":
        this._select((this.selected - 1 + n) % n);
        break;
      case "]":
        this._select((this.selected + 1) % n);
        break;
      default:
        // Number keys jump straight to a beam — the fastest way to work a
        // three-emitter board without hunting for the tab order.
        if (/^[1-9]$/.test(ev.key) && Number(ev.key) <= n) {
          this._select(Number(ev.key) - 1);
          break;
        }
        return;
    }
    ev.preventDefault();
  }

  _announce(text) {
    if (this._liveEl) this._liveEl.textContent = text;
  }

  /** Say what the beam is doing now — the screen-reader equivalent of looking. */
  _announceBeam(i) {
    // The move that wins the board also renders it, and rendering it is what
    // announces the win — so this call, which happens straight afterwards on
    // every input path, would overwrite "Solved" with a routine beam report
    // and a screen-reader player would never be told they had finished.
    if (this.done) return;
    const trace = this._state?.traces[i];
    if (!trace) return;

    const goalBits = this.puzzle.goals
      .map((goal, gi) => {
        const cross = this._state.goals[gi].crossings.find((c) => c.beam === i);
        if (!cross) return null;
        return `crosses finish line ${gi + 1} at brightness ${cross.level}` +
          (cross.level === goal.level ? ", correct" : `, needs ${goal.level}`);
      })
      .filter(Boolean);

    const deg = Math.round(normalizeAngle(this.angles[i]) * DEG);
    this._announce(
      `Beam ${i + 1} at ${deg} degrees, ${compass(this.angles[i])}, ` +
      `ending at brightness ${trace.endLevel}.` +
      (goalBits.length ? ` It ${goalBits.join("; ")}.` : ""),
    );
  }

  // ── Finish ───────────────────────────────────────────────────────────────

  _finish() {
    this.done = true;
    saveResult(this.profile.id, { solved: true, moves: this.moves }, this.day);
    const record = recordBest(this.profile.id, { solved: true, moves: this.moves }, this.day);
    const best = bestResult(this.profile.id);

    this.root.classList.add("is-solved");
    this._announce(`Solved in ${this.moves} moves.`);

    const panel = document.createElement("div");
    panel.className = "pf-done";
    panel.innerHTML = `
      <p class="pf-done-score">Solved <small>in ${this.moves} move${this.moves === 1 ? "" : "s"}</small></p>
      <p class="pf-done-note">${
        record ? "New best." : best ? `Best: ${best.moves} moves.` : ""
      }</p>
    `;

    const actions = document.createElement("div");
    actions.className = "pf-done-actions";

    // Only the daily board is worth sharing — a practice board is a different
    // puzzle for every player, so "solved in 12" says nothing anyone can beat.
    // `this.puzzle.day` is today's key on a daily and some other day on a
    // practice board, which is exactly the test.
    const isDaily = this.puzzle.day === todayKey();
    if (isDaily) {
      const share = document.createElement("button");
      share.type = "button";
      share.className = "pf-btn pf-share";
      share.textContent = "Share result";
      share.addEventListener("click", () => this._share(share, { moves: this.moves, isRecord: record }));
      actions.appendChild(share);
    }

    const again = document.createElement("button");
    again.type = "button";
    again.className = "pf-btn";
    again.textContent = "Another board";
    again.addEventListener("click", () => this.start(this.profile.id, { practice: true }));

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pf-btn pf-btn--quiet";
    pick.textContent = "Change difficulty";
    pick.addEventListener("click", () => this._showSelect());

    actions.append(again, pick);
    panel.appendChild(actions);
    this.root.appendChild(panel);
    announceRoundComplete(this.root);
  }

  shareText({ moves, isRecord }) {
    return buildShareText({
      moves,
      isRecord,
      difficultyLabel: this.profile.label,
      daily: this.puzzle.day,
    });
  }

  async _share(btn, result) {
    const text = this.shareText(result);
    const label = btn.textContent;
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
    box.className = "pf-share-box";
    box.value = text;
    box.readOnly = true;
    box.rows = Math.min(6, text.split("\n").length);
    box.setAttribute("aria-label", "Your result, ready to copy");
    btn.closest(".pf-done").appendChild(box);
    this._shareBox = box;
    box.focus();
    box.select();
  }
}

/** Create an SVG element with attributes. */
function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * An angle as a compass bearing, for the screen-reader announcements.
 *
 * y grows DOWNWARD on this board, so an angle of +90 degrees points at the
 * bottom of the screen — "south", not "north". Getting this backwards would
 * make every spoken direction the opposite of what is drawn.
 */
const COMPASS = ["east", "east south-east", "south-east", "south south-east",
  "south", "south south-west", "south-west", "west south-west",
  "west", "west north-west", "north-west", "north north-west",
  "north", "north north-east", "north-east", "east north-east"];

export function compass(angle) {
  return COMPASS[Math.round((normalizeAngle(angle) / TAU) * 16) % 16];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
