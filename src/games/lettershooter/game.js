// Letter Shooter — screen and interaction.
//
// A LEVEL picker (difficulty) leads into a RUN of five rounds. Each round you
// hold one ammo letter; rows of letters scroll past a firing beam and you grab
// one letter per row (Space / tap the stage) to build a word. Grab a letter that
// keeps a real word alive and it's added; grab a dead end and the word busts.
// Cash a real word (Enter) before a row kills it. Score is what you bank across
// the run, measured against the day's perfect-timing par.
//
// The board is regenerated from the day's seed (engine.rowAt/ammoAt), so it is
// identical for every player; only your timing and nerve differ. This is a
// timing game, so there is no enumerated "optimal you must find" — par is the
// ceiling a perfect-timing player could reach.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets the e2e harness drive it under jsdom. The animation loop
// is guarded so it no-ops where requestAnimationFrame is absent; the e2e test
// drives play through _grab(), which bypasses the pixel-timing entirely.

import { DIFFICULTIES, DIFFICULTY_ORDER, getDifficulty } from "./difficulty.js";
import { setFor } from "./dailySet.js";
import { mountTutorial } from "./tutorial.js";
import { ammoAt, rowAt, scoreWord, MIN_WORD } from "./engine.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { announceRoundComplete } from "../../core/lifecycle.js";
import {
  todayKey,
  dailySeedFor,
  getResult,
  saveResult,
  bestResult,
  recordBest,
} from "./results.js";

const CELL = 56; // px per scrolling letter tile — mirrored in lettershooter.css

export class LetterShooterGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {object} opts.dict        lexicon with isWord + isPrefix
   * @param {object|null} opts.daily  loaded day data, or null if none today
   * @param {string} [opts.difficulty] skip the picker, open straight into a tier
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.dict = opts.dict;
    this.data = opts.daily ?? null;
    this.day = opts.day ?? todayKey();
    this._shareTimer = null;
    this._bustTimer = null;
    this._tutorialCleanup = null;
    this._raf = null;
    this._last = 0;
    this._onKey = (e) => this._handleKey(e);
    this._keysBound = false;

    this.root.classList.add("ls");
    if (opts.difficulty && DIFFICULTIES[opts.difficulty]) this.play(opts.difficulty);
    else this.showPicker();
  }

  destroy() {
    this._stopLoop();
    if (this._shareTimer) clearTimeout(this._shareTimer);
    if (this._bustTimer) clearTimeout(this._bustTimer);
    this._shareTimer = this._bustTimer = null;
    this._unbindKeys();
    this._teardownTutorial();
    this.root.classList.remove("ls");
    this.root.innerHTML = "";
  }

  // ── input plumbing ─────────────────────────────────────────────────────────

  _bindKeys() {
    if (this._keysBound) return;
    document.addEventListener("keydown", this._onKey);
    this._keysBound = true;
  }
  _unbindKeys() {
    if (!this._keysBound) return;
    document.removeEventListener("keydown", this._onKey);
    this._keysBound = false;
  }
  _handleKey(e) {
    if (!this.root.querySelector("#ls-stage")) return; // play screen only
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Space") { e.preventDefault(); this.fire(); }
    else if (e.key === "Enter") { e.preventDefault(); this.cash(); }
  }

  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  // ── level picker ───────────────────────────────────────────────────────────

  showPicker() {
    this._stopLoop();
    this._unbindKeys();
    this._teardownTutorial();

    const cards = DIFFICULTY_ORDER.map((id) => {
      const d = DIFFICULTIES[id];
      const set = setFor(this.data, id);
      const res = getResult(id, this.day);
      let status = set ? `par ${set.par}` : "—";
      if (res) {
        const diff = res.score - res.par;
        const rel = diff === 0 ? "on par" : diff > 0 ? `+${diff}` : `${diff}`;
        status = `${rel} · ${res.score}/${res.par} · ${res.rounds}/5`;
      }
      const disabled = set ? "" : "disabled";
      return `
        <button class="ls-card" data-id="${id}" ${disabled}>
          <span class="ls-card-main">
            <b>${d.name}</b>
            <small>${d.label} · ${d.blurb}</small>
          </span>
          <span class="ls-card-stat ${res ? "played" : ""}">${status}</span>
        </button>`;
    }).join("");

    const note = this.data
      ? ""
      : `<p class="ls-note">No build for today yet — check back when the daily is published.</p>`;

    this.root.innerHTML = `
      <div class="ls-wrap">
        <h1 class="ls-title">Letter Shooter</h1>
        <p class="ls-sub">Walls of letters scroll past. Time your shots to grab one from each row and
          build a word — then <b>cash</b> it before a row kills it. Five rounds. Read ahead and push your luck.</p>
        <div class="ls-demo-slot"></div>
        <div class="ls-levels">${cards}</div>
        ${note}
        <p class="ls-foot">Par is what a perfect-timing run could bank. Your hands decide the rest. 🎯</p>
      </div>`;

    this.root.querySelectorAll(".ls-card[data-id]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => this.play(btn.dataset.id));
    });

    const slot = this.root.querySelector(".ls-demo-slot");
    if (slot) this._tutorialCleanup = mountTutorial(slot);
  }

  // ── a run ──────────────────────────────────────────────────────────────────

  play(id) {
    this._teardownTutorial();
    const set = setFor(this.data, id);
    if (!set) return this.showPicker();
    this.profile = getDifficulty(id);
    this.set = set;
    this.seed = dailySeedFor(id, this.day);
    this.round = 0;
    this.score = 0;
    this.roundLengths = []; // banked word length per round (0 = busted/none)
    this.busy = false;
    this.over = false;

    this._startRound();
    this.renderPlay();
    this._bindKeys();
    this._startLoop();
  }

  _startRound() {
    this.word = ammoAt(this.seed, this.round); // lowercase
    this.letterIdx = 0;
    this.consumed = 0;
    this.rows = [];
    for (let i = 0; i < this.profile.visibleRows; i++) this.rows.push(this._makeRow(i));
  }

  _makeRow(n) {
    const r = rowAt(this.seed, this.round, n, this.profile);
    return {
      n,
      letters: r.letters,
      dir: r.dir,
      baseSpeed: r.speed,
      scrollX: r.phase * r.letters.length * CELL,
    };
  }

  // ── firing & cashing ───────────────────────────────────────────────────────

  fire() {
    if (this.over || this.busy || !this.rows.length) return;
    this._applyGrab(this._cellUnder(this.rows[0]).ch);
  }

  /** Test seam: grab a specific letter, bypassing pixel-timing. */
  _grab(ch) {
    this._applyGrab(ch);
  }

  /** Test seam: resolve a pending bust now instead of after the toast delay. */
  _flushBust() {
    if (!this._bustTimer) return;
    clearTimeout(this._bustTimer);
    this._bustTimer = null;
    this.busy = false;
    this._roundEnd(0);
  }

  _applyGrab(ch) {
    if (this.over || this.busy || !this.rows.length) return;
    const cand = this.word + ch;
    if (this.dict.isPrefix(cand)) {
      this.word = cand;
      this.letterIdx++;
      this.consumed++;
      this.rows.shift();
      this.rows.push(this._makeRow(this.consumed + this.rows.length));
      this._flash("good");
      // A word can't grow forever; the par search stops at maxRows, so we do too.
      if (this.word.length >= this.profile.maxRows + 1) {
        if (this.dict.isWord(this.word) && this.word.length >= MIN_WORD) this._bankAndEnd(this.word.length);
        else this._roundEnd(0);
        return;
      }
      this._syncPlay();
    } else {
      this.busy = true;
      this._flash("bust");
      this._toast(`BUST · ${cand.toUpperCase()}… is dead`, "bust");
      this._bustTimer = setTimeout(() => {
        this._bustTimer = null;
        this.busy = false;
        this._roundEnd(0);
      }, 720);
    }
  }

  cash() {
    if (this.over || this.busy) return;
    if (this.dict.isWord(this.word) && this.word.length >= MIN_WORD) {
      this._bankAndEnd(this.word.length);
    } else {
      this._toast(`“${this.word.toUpperCase()}” isn't a word yet`, "dim");
    }
  }

  _bankAndEnd(len) {
    const pts = scoreWord(len);
    this.score += pts;
    this._toast(`+${pts}  ${this.word.toUpperCase()}`, "good");
    this._roundEnd(len);
  }

  _roundEnd(bankedLen) {
    this.roundLengths[this.round] = bankedLen;
    this.round++;
    if (this.round >= this.profile.rounds) return this.finish();
    this._startRound();
    this.renderPlay();
  }

  // ── play screen ────────────────────────────────────────────────────────────

  renderPlay() {
    this.root.innerHTML = `
      <div class="ls-wrap ls-play">
        <div class="ls-hud">
          <button class="ls-back" type="button">← levels</button>
          <span class="ls-hud-stat">round <b id="ls-round">${this.round + 1}</b>/${this.profile.rounds}</span>
          <span class="ls-hud-stat">banked <b id="ls-score">${this.score}</b></span>
          <span class="ls-hud-stat">par <b>${this.set.par}</b></span>
        </div>
        <div class="ls-stage" id="ls-stage">
          <div class="ls-rows" id="ls-rows"></div>
          <div class="ls-col" id="ls-col" aria-hidden="true"></div>
          <div class="ls-aim" id="ls-aim" aria-hidden="true"></div>
          <div class="ls-toast" id="ls-toast"></div>
          <div class="ls-flash" id="ls-flash"></div>
        </div>
        <div class="ls-current">
          <div class="ls-ammo" id="ls-ammo"></div>
          <div class="ls-word" id="ls-word"></div>
        </div>
        <div class="ls-reach" id="ls-reach"></div>
        <div class="ls-controls">
          <button class="ls-fire" id="ls-fire" type="button">Fire</button>
          <button class="ls-cash" id="ls-cash" type="button">Cash out</button>
        </div>
        <p class="ls-hint">Tap the board (or press <b>Space</b>) to grab the letter in the beam.
          <b>Cash</b> a real word — or press Enter — before a row kills it.</p>
      </div>`;

    const $ = (s) => this.root.querySelector(s);
    $(".ls-back").addEventListener("click", () => this.showPicker());
    $("#ls-fire").addEventListener("click", () => this.fire());
    $("#ls-cash").addEventListener("click", () => this.cash());
    $("#ls-stage").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.fire();
    });

    this._renderRows();
    this._syncPlay();
    this._bindKeys();
  }

  _renderRows() {
    const rowsEl = this.root.querySelector("#ls-rows");
    if (!rowsEl) return;
    const stageW = this.root.querySelector("#ls-stage")?.clientWidth || 360;
    // Top row (furthest look-ahead) first, active row (rows[0]) at the bottom.
    let html = "";
    for (let vi = this.rows.length - 1; vi >= 0; vi--) {
      const row = this.rows[vi];
      const period = row.letters.length * CELL;
      const reps = Math.ceil(stageW / period) + 2;
      let cells = "";
      for (let r = 0; r < reps; r++) {
        for (const ch of row.letters) cells += `<span class="ls-cell">${ch.toUpperCase()}</span>`;
      }
      html += `<div class="ls-strip ${vi === 0 ? "active" : ""}" data-vi="${vi}">
        <div class="ls-track">${cells}</div>
      </div>`;
    }
    rowsEl.innerHTML = html;
    this._positionAim();
  }

  _positionAim() {
    const rowsEl = this.root.querySelector("#ls-rows");
    const aim = this.root.querySelector("#ls-aim");
    const col = this.root.querySelector("#ls-col");
    if (!rowsEl || !aim) return;
    if (col) col.style.height = rowsEl.offsetHeight + "px";
    const active = rowsEl.querySelector('.ls-strip[data-vi="0"]');
    if (active) {
      aim.style.display = "block";
      aim.style.top = rowsEl.offsetTop + active.offsetTop + "px";
      aim.style.height = active.offsetHeight + "px";
    } else {
      aim.style.display = "none";
    }
  }

  _syncPlay() {
    const $ = (s) => this.root.querySelector(s);
    const isWord = this.dict.isWord(this.word) && this.word.length >= MIN_WORD;
    const w = $("#ls-word");
    if (w) w.innerHTML = `<span class="${isWord ? "is-word" : ""}">${this.word.toUpperCase()}</span>`;
    const a = $("#ls-ammo");
    if (a) a.textContent = (this.word[this.word.length - 1] || "?").toUpperCase();
    const sc = $("#ls-score");
    if (sc) sc.textContent = this.score;
    const rd = $("#ls-round");
    if (rd) rd.textContent = this.round + 1;
    const cash = $("#ls-cash");
    if (cash) cash.classList.toggle("ready", isWord);
    const reach = $("#ls-reach");
    if (reach) {
      reach.textContent = isWord
        ? `${this.word.toUpperCase()} — worth +${scoreWord(this.word.length)}. Cash it, or read the rows and push.`
        : "Grab letters that keep a word alive.";
    }
    // The row set changed (a grab shifts + refills), so rebuild the strips.
    this._renderRows();
  }

  // ── timing geometry ────────────────────────────────────────────────────────

  _speed(row) {
    return row.baseSpeed * (1 + (this.profile.ramp / 100) * this.letterIdx);
  }
  _offset(row) {
    const period = row.letters.length * CELL;
    return -((((row.scrollX * row.dir) % period) + period) % period);
  }
  /** Which cell of `row` sits under the central firing beam right now. */
  _cellUnder(row) {
    const stageW = this.root.querySelector("#ls-stage")?.clientWidth || 360;
    const colX = stageW / 2;
    const period = row.letters.length * CELL;
    const off = this._offset(row);
    let best = row.letters[0], bd = Infinity, bx = 0;
    for (let rep = -1; rep <= Math.ceil(stageW / period) + 1; rep++) {
      for (let i = 0; i < row.letters.length; i++) {
        const cx = rep * period + i * CELL + CELL / 2 + off;
        const d = Math.abs(cx - colX);
        if (d < bd) { bd = d; best = row.letters[i]; bx = cx; }
      }
    }
    return { ch: best, x: bx };
  }

  // ── animation loop (guarded so it no-ops without rAF) ────────────────────────

  _startLoop() {
    if (this._raf != null) return;
    if (typeof requestAnimationFrame !== "function") return;
    this._last = 0;
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      this._step(ts);
    };
    this._raf = requestAnimationFrame(tick);
  }
  _stopLoop() {
    if (this._raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._raf);
    this._raf = null;
  }
  _step(ts) {
    if (this.over || this.busy || !this.rows?.length) { this._last = ts; return; }
    const rowsEl = this.root.querySelector("#ls-rows");
    if (!rowsEl) { this._last = ts; return; }
    const dt = this._last ? Math.min(0.05, (ts - this._last) / 1000) : 0;
    rowsEl.querySelectorAll(".ls-strip").forEach((strip) => {
      const row = this.rows[+strip.dataset.vi];
      if (!row) return;
      row.scrollX += this._speed(row) * dt;
      const track = strip.querySelector(".ls-track");
      if (track) track.style.transform = `translateX(${this._offset(row)}px)`;
    });
    const active = this.rows[0];
    const aim = this.root.querySelector("#ls-aim");
    if (active && aim) aim.style.left = this._cellUnder(active).x + "px";
    this._last = ts;
  }

  // ── feedback ─────────────────────────────────────────────────────────────────

  _flash(kind) {
    const f = this.root.querySelector("#ls-flash");
    if (!f) return;
    f.style.transition = "none";
    f.style.background = kind === "bust" ? "rgba(255,93,108,.28)" : "rgba(51,214,159,.14)";
    f.style.opacity = "1";
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        f.style.transition = "opacity .4s";
        f.style.opacity = "0";
      });
    }
  }
  _toast(msg, kind) {
    const t = this.root.querySelector("#ls-toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.style.opacity = "1";
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (this.root.querySelector("#ls-toast") === t) t.style.opacity = "0";
    }, 950);
  }

  // ── end of run ───────────────────────────────────────────────────────────────

  finish() {
    this.over = true;
    this._stopLoop();
    this._unbindKeys();

    const par = this.set.par;
    const score = this.score;
    const lengths = Array.from({ length: this.profile.rounds }, (_, i) => this.roundLengths[i] || 0);
    const rounds = lengths.filter((n) => n > 0).length;
    const diff = score - par;
    const rel = diff === 0 ? "on par" : diff > 0 ? `+${diff} above par` : `${-diff} below par`;
    const tone = diff > 0 ? "good" : diff === 0 ? "par" : "under";

    saveResult(this.profile.id, { score, par, rounds }, this.day);
    const record = recordBest(this.profile.id, { score, par, rounds });

    const receipt = lengths
      .map((n, i) => {
        const bar = n > 0 ? `<span class="ls-rc-bar" style="--n:${Math.min(10, n)}"></span>` : `<span class="ls-rc-miss">bust</span>`;
        const val = n > 0 ? `+${scoreWord(n)}` : "0";
        return `<div class="ls-rc-row"><span class="ls-rc-n">R${i + 1}</span>${bar}<span class="ls-rc-v">${val}</span></div>`;
      })
      .join("");

    const best = (this.set.best || [])
      .map((b, i) => `<div class="ls-opt-row"><span class="ls-opt-n">R${i + 1}</span><span class="ls-opt-word">${b.word || "—"}</span><span class="ls-opt-v">+${b.score}</span></div>`)
      .join("");

    this.root.innerHTML = `
      <div class="ls-wrap">
        <button class="ls-back" type="button">← levels</button>
        <h1 class="ls-title">${this.profile.name}</h1>
        <div class="ls-result">
          <div class="ls-receipt">${receipt}</div>
          <div class="ls-total">
            <span class="ls-total-lbl">${score} / par ${par} · ${rounds}/5 banked${record ? " · best!" : ""}</span>
            <span class="ls-total-big ls-${tone}">${rel}</span>
          </div>
        </div>
        <details class="ls-reveal">
          <summary>Show a perfect-timing run (spoiler)</summary>
          <div class="ls-opt">${best}</div>
          <p class="ls-opt-note">The highest-scoring word each round's rows allowed — par ${par}.</p>
        </details>
        <button class="ls-share" id="ls-share">Copy result</button>
        <button class="ls-again" id="ls-again">← back to levels</button>
      </div>`;

    this.root.querySelector(".ls-back").addEventListener("click", () => this.showPicker());
    this.root.querySelector("#ls-again").addEventListener("click", () => this.showPicker());
    this.root.querySelector("#ls-share").addEventListener("click", () => {
      const text = buildShareText({
        lengths,
        score,
        par,
        rounds,
        difficultyLabel: this.profile.label,
        daily: this.data ? this.day : undefined,
      });
      copyToClipboard(text);
      const btn = this.root.querySelector("#ls-share");
      btn.textContent = "Copied ✓";
      if (this._shareTimer) clearTimeout(this._shareTimer);
      this._shareTimer = setTimeout(() => {
        if (this.root.querySelector("#ls-share") === btn) btn.textContent = "Copy result";
      }, 2000);
    });

    announceRoundComplete(this.root);
  }
}
