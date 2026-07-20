// Ain't a Word — game controller.
//
// Rules: a 60-second countdown that never stops. Each round shows two words,
// one real and one a convincing fake. Click the real one to score. Click the
// fake and the clock loses a second. When it hits zero, the run is over.

import { Rng } from "../../core/rng.js";
import { Countdown } from "../../core/timer.js";
import { makePair } from "./wordSmith.js";
import { getDifficulty, DIFFICULTY_ORDER, DIFFICULTIES } from "./difficulty.js";
import { buildShareText, copyToClipboard } from "./share.js";
import {
  todayKey,
  dailySeedFor,
  getResult,
  saveResult,
  bestScore,
  recordBest,
} from "./results.js";

const DURATION_MS = 60_000;
// A 1s penalty barely registered against a 60s clock; 3s makes a wrong pick a
// real decision rather than a free guess.
const PENALTY_MS = 3_000;

export class AintAWordGame {
  constructor(container, dict, opts = {}) {
    this.root = container;
    this.dict = dict;
    this.opts = opts;
    this.profile = null; // chosen on the select screen

    this.state = "select"; // select | playing | over
    this.score = 0;
    this.rng = null;
    this.pair = null; // { real, fake, type }
    this.sides = ["", ""]; // words currently on the two buttons
    this.correctSide = 0;
    this.locked = false;
    // Every answered round, in order, for the end-of-game review.
    // { real, fake, type, picked, correct }
    this.history = [];

    this.timer = new Countdown({
      durationMs: DURATION_MS,
      onTick: (ms) => this._renderClock(ms),
      onEnd: () => this._end(),
    });

    this._onKey = this._onKey.bind(this);
    this._build();
    this._showSelect();
  }

  // --- lifecycle ----------------------------------------------------------

  destroy() {
    this.timer.stop();
    clearTimeout(this._shareTimer);
    window.removeEventListener("keydown", this._onKey);
    this.root.innerHTML = "";
  }

  /**
   * Begin a run at the given difficulty.
   *
   * The seed is derived from (day + difficulty), so every player worldwide
   * gets the identical word sequence for today's Easy/Medium/Hard. opts.seed
   * overrides it for tests and for a future practice mode.
   */
  start(difficultyId = this.profile?.id ?? this.opts.difficulty) {
    this.profile = getDifficulty(difficultyId);
    const seed =
      this.opts.seed != null ? `${this.opts.seed}:${this.profile.id}` : dailySeedFor(this.profile.id);
    this.rng = new Rng(seed);
    this.score = 0;
    this.history = [];
    this.state = "playing";
    this.locked = false;
    this._hideOverlay();
    this._renderScore();
    this.timer = new Countdown({
      durationMs: DURATION_MS,
      onTick: (ms) => this._renderClock(ms),
      onEnd: () => this._end(),
    });
    this._renderClock(DURATION_MS);
    this._nextPair();
    this.timer.start();
  }

  // --- rounds -------------------------------------------------------------

  _nextPair() {
    const p = this.profile;
    // Fixed per run — deliberately NOT ramped by score. A score-dependent ramp
    // would give two players on the same daily seed different words.
    const band = { minLen: p.minLen, maxLen: p.maxLen, tiers: p.tiers };
    this.pair = makePair(this.dict, this.rng, { ...band, difficulty: p.subtlety });
    if (!this.pair) {
      // makePair gives up after a bounded number of random draws, so an
      // occasional miss is expected. Retry harder, relaxing only the COSMETIC
      // constraints (how similar the two words may look) — never the length
      // band or the tier set. Those are a contract: Hard must never serve a
      // 7-letter word, and the band is what players are told they're getting.
      this.pair = makePair(this.dict, this.rng, {
        ...band,
        difficulty: p.subtlety,
        maxLenDiff: 99,
        minDistance: 2,
        maxTries: 250,
      });
    }
    if (!this.pair) {
      // Even the fallback failed — the pool must be empty or misconfigured.
      // End the run cleanly rather than throwing deep in the render path.
      console.error(
        `aintaword: no word pair available (difficulty "${p.id}", pool ` +
          `${this.dict.sourcePool({ minLen: p.minLen, maxLen: p.maxLen, tiers: p.tiers }).length})`,
      );
      this._end();
      return;
    }
    this.correctSide = this.rng.chance(0.5) ? 0 : 1;
    this.sides[this.correctSide] = this.pair.real;
    this.sides[1 - this.correctSide] = this.pair.fake;
    this._renderChoices();
    this.locked = false;
  }

  _pick(side) {
    if (this.state !== "playing" || this.locked) return;
    const correct = side === this.correctSide;

    // Record before advancing — _nextPair() replaces this.pair. The round left
    // on screen when the clock runs out is never answered, so it isn't logged.
    this.history.push({
      real: this.pair.real,
      fake: this.pair.fake,
      type: this.pair.type,
      picked: this.sides[side],
      correct,
    });

    if (correct) {
      this.score += 1;
      this._renderScore();
      this._flash("good");
      this._nextPair();
    } else {
      this.locked = true; // ignore further clicks this frame
      this._flash("bad");
      this._showPenalty(PENALTY_MS);
      this.timer.adjust(-PENALTY_MS);
      if (this.state === "playing") this._nextPair();
    }
  }

  _end() {
    if (this.state === "over") return;
    this.state = "over";
    this.timer.stop();
    const id = this.profile.id;
    // Persist before computing the record, so the day's run is locked in even
    // if anything below throws.
    saveResult(id, { score: this.score, history: this.history });
    const isRecord = recordBest(id, this.score);
    this._showGameOver(this.score, bestScore(id), isRecord, { replay: false });
  }

  // --- input --------------------------------------------------------------

  _onKey(e) {
    // On the picker and result screens the focused <button> handles Enter and
    // Space natively — intercepting them here would fight the browser and
    // break keyboard navigation between difficulties.
    if (this.state !== "playing") return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "1") {
      e.preventDefault();
      this._pick(0);
    } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "2") {
      e.preventDefault();
      this._pick(1);
    }
  }

  // --- DOM: build once, update in place -----------------------------------

  _build() {
    this.root.innerHTML = "";
    // The game owns an inner wrapper rather than restyling its host element.
    // The host stays a neutral shell (padding, centering); .aaw controls its
    // own layout box, so it can stretch to full height and let its children
    // fill the width without fighting the shell's centering rules.
    this.el = el("div", "aaw");

    this.hud = el("div", "aaw-hud");
    this.scoreEl = el("div", "aaw-score");
    const clock = el("div", "aaw-clock");
    this.clockNum = el("div", "aaw-clock-num");
    this.bar = el("div", "aaw-bar");
    this.barFill = el("div", "aaw-bar-fill");
    this.bar.appendChild(this.barFill);
    // Floating penalty indicator. Absolutely positioned inside .aaw-clock so it
    // can never displace the readout — and kept OUT of .aaw-clock-num, whose
    // textContent is rewritten every frame and would delete it.
    this.penaltyEl = el("span", "aaw-penalty");
    this.penaltyEl.setAttribute("aria-hidden", "true");
    clock.append(this.clockNum, this.bar, this.penaltyEl);
    this.hud.append(this.scoreEl, clock);

    this.board = el("div", "aaw-board");
    const prompt = el("div", "aaw-prompt", "Which is a real word?");
    this.choicesEl = el("div", "aaw-choices");
    this.choiceEls = [0, 1].map((i) => {
      const b = el("button", "aaw-choice");
      b.type = "button";
      b.dataset.side = String(i);
      b.addEventListener("click", () => this._pick(i));
      const kbd = el("span", "aaw-key", i === 0 ? "← / A" : "→ / L");
      const word = el("span", "aaw-word");
      b.append(word, kbd);
      b._word = word;
      this.choicesEl.appendChild(b);
      return b;
    });
    this.board.append(prompt, this.choicesEl);

    this.overlay = el("div", "aaw-overlay");

    this.el.append(this.hud, this.board, this.overlay);
    this.root.appendChild(this.el);
    window.addEventListener("keydown", this._onKey);
  }

  _renderScore() {
    this.scoreEl.textContent = `Score ${this.score}`;
  }

  _renderClock(ms) {
    const secs = ms / 1000;
    this.clockNum.textContent = secs.toFixed(1);
    const pct = Math.max(0, Math.min(100, (ms / DURATION_MS) * 100));
    this.barFill.style.width = `${pct}%`;
    this.el.classList.toggle("is-low", secs <= 10);
  }

  _renderChoices() {
    for (let i = 0; i < 2; i++) {
      const word = this.sides[i];
      const node = this.choiceEls[i]._word;
      node.textContent = word;
      // Drives the auto-fit font size in CSS (see .aaw-word).
      node.style.setProperty("--len", String(word.length));
      this.choiceEls[i].disabled = false;
    }
  }

  // Pop a floating "-3" by the clock. Restarting the animation needs the class
  // removed, a forced reflow, then re-added — otherwise rapid repeat penalties
  // show nothing because the animation is already running.
  _showPenalty(ms) {
    this.penaltyEl.textContent = `-${Math.round(ms / 1000)}`;
    this.penaltyEl.classList.remove("is-shown");
    void this.penaltyEl.offsetWidth;
    this.penaltyEl.classList.add("is-shown");
  }

  _flash(kind) {
    const cls = kind === "good" ? "flash-good" : "flash-bad";
    this.board.classList.remove("flash-good", "flash-bad");
    // force reflow so the animation restarts even on rapid repeats
    void this.board.offsetWidth;
    this.board.classList.add(cls);
  }

  // --- end-of-game review -------------------------------------------------

  // The round-by-round list shown on the game-over card: what each pair was,
  // and whether the player got it. Doubles as the "so THAT was the real word"
  // payoff, which is most of the fun of a word game.
  _buildReview() {
    const wrap = el("div", "aaw-review");
    if (this.history.length === 0) return wrap;

    const missed = this.history.filter((r) => !r.correct).length;
    wrap.append(
      el(
        "div",
        "aaw-review-head",
        missed === 0
          ? `${this.history.length} words · no mistakes`
          : `${this.history.length} words · ${missed} missed`,
      ),
    );

    const list = el("ul", "aaw-review-list");
    for (const round of this.history) {
      const li = el("li", `aaw-round${round.correct ? "" : " is-miss"}`);
      li.append(
        el("span", "aaw-round-mark", round.correct ? "✓" : "✗"),
        el("span", "aaw-round-real", round.real),
        el("span", "aaw-round-fake", round.fake),
      );
      // Screen readers get the meaning, not just the glyph.
      li.setAttribute(
        "aria-label",
        `${round.correct ? "Correct" : "Missed"}: ${round.real} is a real word, ${round.fake} is not`,
      );
      list.appendChild(li);
    }
    wrap.append(list);
    return wrap;
  }

  // --- sharing ------------------------------------------------------------

  shareText() {
    return buildShareText({
      score: this.score,
      history: this.history,
      difficultyLabel: this.profile.label,
      daily: this.opts.daily, // set once daily mode ships
    });
  }

  async _share(btn) {
    const text = this.shareText();
    const label = btn.textContent;
    const copied = await copyToClipboard(text);

    btn.textContent = copied ? "Copied!" : "Copy it below";
    btn.classList.toggle("is-done", copied);

    // Clipboard access can be blocked (plain http, in-app browsers). Never
    // claim success we didn't get — surface the text so it can be copied by
    // hand instead.
    if (!copied) this._showShareFallback(text);

    clearTimeout(this._shareTimer);
    this._shareTimer = setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove("is-done");
    }, 2200);
  }

  _showShareFallback(text) {
    if (this._shareBox) this._shareBox.remove();
    const box = el("textarea", "aaw-share-box");
    box.value = text;
    box.readOnly = true;
    box.rows = Math.min(10, text.split("\n").length);
    box.setAttribute("aria-label", "Your score, ready to copy");
    this._shareBox = box;
    this.overlay.querySelector(".aaw-card")?.insertBefore(
      box,
      this.overlay.querySelector(".aaw-actions"),
    );
    box.focus();
    box.select();
  }

  // --- overlays -----------------------------------------------------------

  _hideOverlay() {
    clearTimeout(this._shareTimer);
    this._shareBox = null; // cleared along with the overlay's children
    this.overlay.className = "aaw-overlay";
    this.overlay.innerHTML = "";
    this.overlay.style.display = "none";
    this.hud.style.visibility = "visible";
    this.board.style.visibility = "visible";
  }

  // Difficulty picker — the entry point, and where "Play again" returns to.
  // Difficulties already played today are shown with their score and lead to
  // that stored result instead of starting a second run.
  _showSelect() {
    this.state = "select";
    this._renderClock(DURATION_MS);
    this.scoreEl.textContent = "Score 0";
    // A full timer bar above the picker reads as "a game is already running".
    // The HUD only means something once there's a live clock.
    this.hud.style.visibility = "hidden";
    this.board.style.visibility = "hidden";
    this.overlay.style.display = "flex";
    this.overlay.className = "aaw-overlay aaw-overlay-select";
    this.overlay.innerHTML = "";

    const card = el("div", "aaw-card");
    card.append(
      el("h1", "aaw-title", "Ain't a Word"),
      el("p", "aaw-lede", "One word is real. One is a clever fake. Pick the real one."),
      bullets([
        "60 seconds — the clock never stops.",
        `Correct: +1 point. Wrong: −${PENALTY_MS / 1000} seconds.`,
        "One run per difficulty, each day.",
      ]),
    );

    const list = el("div", "aaw-picker");
    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id);

      const btn = el("button", `aaw-pick${done ? " is-done" : ""}`);
      btn.type = "button";
      const main = el("span", "aaw-pick-main");
      main.append(
        el("span", "aaw-pick-label", prof.label),
        el("span", "aaw-pick-blurb", done ? "Played today — view result" : prof.blurb),
      );
      const right = done
        ? el("span", "aaw-pick-score", String(done.score))
        : el("span", "aaw-pick-len", `${prof.minLen}–${prof.maxLen}`);
      btn.append(main, right);
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: already played today, scored ${done.score}. View result.`
          : `${prof.label}: ${prof.blurb}, ${prof.minLen} to ${prof.maxLen} letters. Play.`,
      );
      btn.addEventListener("click", () => this._choose(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }
    card.append(list);
    this.overlay.appendChild(card);
    firstBtn?.focus();
  }

  // Selecting a difficulty: play it, or show the day's result if already done.
  _choose(id) {
    const done = getResult(id);
    if (done) {
      this._showStoredResult(id, done);
    } else {
      this.start(id);
    }
  }

  _showStoredResult(id, result) {
    this.profile = getDifficulty(id);
    this.score = result.score;
    this.history = result.history || [];
    this.state = "over";
    // No live clock behind a stored result, so the HUD would be meaningless.
    this.hud.style.visibility = "hidden";
    this._showGameOver(result.score, bestScore(id), false, { replay: true });
  }

  _showGameOver(score, best, isRecord, { replay = false } = {}) {
    this.board.style.visibility = "hidden";
    this.overlay.style.display = "flex";
    this.overlay.className = "aaw-overlay aaw-overlay-over";
    this.overlay.innerHTML = "";
    const card = el("div", "aaw-card");
    card.append(
      // `replay` = revisiting a result already played today, not a fresh finish.
      el("h1", "aaw-title", replay ? this.profile.label : "Time!"),
      el("div", "aaw-final", String(score)),
      el("p", "aaw-final-label", score === 1 ? "word" : "words"),
    );
    if (isRecord) {
      card.append(el("p", "aaw-record", "★ New best!"));
    } else {
      card.append(el("p", "aaw-hi", `${this.profile.label} · best ${best}`));
    }
    if (replay) {
      card.append(el("p", "aaw-note", "You've already played this one today."));
    }

    card.append(this._buildReview());

    const actions = el("div", "aaw-actions");
    const shareBtn = el("button", "aaw-btn aaw-btn-ghost", "Share score");
    shareBtn.type = "button";
    shareBtn.addEventListener("click", () => this._share(shareBtn));

    // Always returns to the picker rather than replaying — the other
    // difficulties are the thing left to do today.
    const btn = el("button", "aaw-btn", "Play again");
    btn.type = "button";
    btn.addEventListener("click", () => this._showSelect());

    actions.append(shareBtn, btn);
    card.append(actions);
    this.overlay.appendChild(card);
    btn.focus();
  }
}

// --- tiny DOM helpers -----------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function bullets(items) {
  const ul = el("ul", "aaw-rules");
  for (const item of items) ul.appendChild(el("li", null, item));
  return ul;
}
