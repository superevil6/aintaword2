// Vanity Plate — screen and interaction.
//
// A GARAGE (difficulty picker) leads into a COURSE of HOLES plates. Each hole is
// an iterative hunt, not a one-shot guess: you PARK a word, then keep replacing
// it with any shorter legal word until you are happy, then drive on. Reaching
// par is the skill, so the loop is built to keep you pushing toward it — the
// input refuses anything not shorter than your current best, the plate letters
// light up in order as you type, and a parked word shows its filler letters
// dimmed so you can see exactly how far over par you are. Beat par with a rarer,
// shorter word for a birdie.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets an e2e harness drive it under jsdom.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  HOLES,
  getDifficulty,
} from "./difficulty.js";
import { courseFor } from "./dailySet.js";
import { mountTutorial } from "./tutorial.js";
import { matchPositions, litCount, isLegal, scoreLabel } from "./engine.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { announceRoundComplete } from "../../core/lifecycle.js";
import {
  todayKey,
  getResult,
  saveResult,
  bestResult,
  recordBest,
} from "./results.js";

const MAX_HINTS = 2; // per hole; each reveals one more letter for +1 stroke

export class VanityPlateGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {object} opts.dict        Dictionary instance (needs isWord)
   * @param {object|null} opts.daily  loaded day data, or null if none today
   * @param {string} [opts.difficulty] skip the garage, open straight into a tier
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.dict = opts.dict;
    this.data = opts.daily ?? null;
    this.day = opts.day ?? todayKey();
    this._shareTimer = null;
    this._tutorialCleanup = null; // stops the garage demo's loop

    this.root.classList.add("vp");
    if (opts.difficulty && DIFFICULTIES[opts.difficulty]) this.play(opts.difficulty);
    else this.showGarage();
  }

  destroy() {
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
    this._teardownTutorial();
    this.root.classList.remove("vp");
    this.root.innerHTML = "";
  }

  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  isWord(w) {
    return this.dict.isWord(w);
  }

  // ── garage / picker ────────────────────────────────────────────────────────

  showGarage() {
    this._teardownTutorial();
    const cards = DIFFICULTY_ORDER.map((id) => {
      const d = DIFFICULTIES[id];
      const course = courseFor(this.data, id);
      const par = course?.par;
      const res = getResult(id, this.day);
      let status = par != null ? `par ${par}` : "—";
      if (res) {
        const diff = res.strokes - res.par;
        const rel = diff === 0 ? "even par" : diff > 0 ? `+${diff}` : `${diff}`;
        status = `${rel} · ${res.strokes}/${res.par}${res.birdies ? ` · ${res.birdies}🐦` : ""}`;
      }
      const disabled = !course ? "disabled" : "";
      return `
        <button class="vp-card" data-id="${id}" ${disabled}>
          <span class="vp-card-main">
            <b>${d.course}</b>
            <small>${d.label} · ${d.blurb}</small>
          </span>
          <span class="vp-card-stat ${res ? "played" : ""}">${status}</span>
        </button>`;
    }).join("");

    const note = this.data
      ? ""
      : `<p class="vp-note">No course for today yet — check back when the daily is published.</p>`;

    this.root.innerHTML = `
      <div class="vp-wrap">
        <h1 class="vp-title">Vanity Plate</h1>
        <p class="vp-sub">Every plate hides a word — its three letters must appear <b>in order</b>.
          Shortest word wins. It's word golf.</p>
        <div class="vp-demo-slot"></div>
        <div class="vp-courses">${cards}</div>
        ${note}
        <p class="vp-foot">Par is the shortest everyday word. Find a rarer, shorter one for a birdie 🐦.</p>
      </div>`;

    this.root.querySelectorAll(".vp-card[data-id]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => this.play(btn.dataset.id));
    });

    const slot = this.root.querySelector(".vp-demo-slot");
    if (slot) this._tutorialCleanup = mountTutorial(slot);
  }

  // ── a course ───────────────────────────────────────────────────────────────

  play(id) {
    this._teardownTutorial(); // leaving the garage stops its demo loop
    const course = courseFor(this.data, id);
    if (!course) return this.showGarage();
    this.profile = getDifficulty(id);
    this.course = course;
    this.holes = course.holes;
    this.results = new Array(this.holes.length).fill(null);
    this.holeIdx = 0;
    this.renderHole();
  }

  odometerHtml(active) {
    const pins = this.holes.map((h, i) => {
      let cls = "todo";
      let mark = i + 1;
      const r = this.results[i];
      if (r) {
        cls = r.diff < 0 ? "birdie" : r.diff === 0 ? "done" : "bogey";
        mark = r.diff < 0 ? "🐦" : r.diff === 0 ? "✓" : "!";
      }
      if (i === active) cls = "now";
      return `<span class="vp-pin ${cls}">${mark}</span>`;
    });
    return `<div class="vp-road">${pins.join('<span class="vp-seg"></span>')}</div>`;
  }

  renderHole() {
    const h = this.holes[this.holeIdx];
    const last = this.holeIdx === this.holes.length - 1;
    let parked = null;
    let hintUsed = 0;

    this.root.innerHTML = `
      <div class="vp-wrap">
        <button class="vp-back" type="button">← garage</button>
        ${this.odometerHtml(this.holeIdx)}
        <div class="vp-hole-top">
          <span>${this.course.name}</span>
          <span>Hole ${this.holeIdx + 1}/${this.holes.length} · <span class="vp-parval">par ${h.par}</span></span>
        </div>
        <div class="vp-plate">
          <div class="vp-screws"><span></span><span></span></div>
          <div class="vp-tag">VANITY · STATE</div>
          <div class="vp-chars" id="vp-chars"></div>
        </div>
        <p class="vp-hint" id="vp-hint">Contains <b>${h.plate.split("").join(" ")}</b> in order · aim for ${h.par} letters</p>
        <form id="vp-form" autocomplete="off">
          <input type="text" id="vp-in" placeholder="type a word" spellcheck="false"
                 autocapitalize="off" autocomplete="off" inputmode="latin" />
          <button class="vp-go" id="vp-go" type="submit" disabled>Park it</button>
        </form>
        <div class="vp-len" id="vp-len"></div>
        <div class="vp-parked" id="vp-parked"></div>
        <div class="vp-chase" id="vp-chase"></div>
        <div class="vp-actions">
          <button class="vp-hintbtn" id="vp-hintbtn" type="button">Stuck? Reveal a letter (+1)</button>
          <button class="vp-drive" id="vp-drive" type="button" hidden>${last ? "Finish round →" : "Drive on →"}</button>
        </div>
      </div>`;

    const $ = (sel) => this.root.querySelector(sel);
    const inp = $("#vp-in");
    const go = $("#vp-go");
    const chars = $("#vp-chars");
    const lenEl = $("#vp-len");
    const parkedEl = $("#vp-parked");
    const chaseEl = $("#vp-chase");
    const driveBtn = $("#vp-drive");
    const hintBtn = $("#vp-hintbtn");

    const drawPlate = (word) => {
      const n = word ? litCount(word, h.plate) : 0;
      chars.innerHTML = h.plate
        .split("")
        .map((ch, i) => `<span class="vp-ch ${i < n ? "lit" : ""}">${ch}</span>`)
        .join('<span class="vp-ch dash">·</span>');
    };
    drawPlate("");

    const renderParked = () => {
      if (!parked) {
        parkedEl.innerHTML = "";
        driveBtn.hidden = true;
        chaseEl.textContent = "";
        return;
      }
      const pos = new Set(matchPositions(parked.word, h.plate));
      const chs = parked.word
        .toUpperCase()
        .split("")
        .map((c, i) => `<span class="${pos.has(i) ? "p" : "x"}">${c}</span>`)
        .join("");
      parkedEl.innerHTML = `
        <div class="vp-parked-lead">parked</div>
        <div class="vp-parked-word">${chs}</div>
        <div class="vp-verdict ${parked.lab.key}">${parked.lab.grid} ${parked.lab.label} · ${parked.len} letters${
          parked.penalty ? ` (+${parked.penalty} hint)` : ""
        }</div>`;
      driveBtn.hidden = false;
      if (parked.diff === 0 && h.birdie)
        chaseEl.textContent = "⛳ Par — but a birdie hides here. Know a shorter, rarer word?";
      else if (parked.diff < 0) chaseEl.textContent = "🐦 Birdie! You beat the everyday word.";
      else if (parked.diff > 0)
        chaseEl.textContent = `Parked at ${parked.len}. Par is ${h.par} — keep hunting or drive on.`;
      else chaseEl.textContent = "";
    };

    inp.addEventListener("input", () => {
      const w = inp.value.trim().toLowerCase();
      drawPlate(w);
      go.disabled = !isLegal(w, h.plate, (x) => this.isWord(x));
      if (!w) {
        lenEl.textContent = "";
        return;
      }
      const diff = w.length - h.par;
      const cls = diff < 0 ? "under" : diff === 0 ? "par" : "over";
      const sign = diff > 0 ? `+${diff}` : diff;
      const better = parked && w.length < parked.len ? " · new best!" : "";
      lenEl.innerHTML = `${w.length} letters · <span class="${cls}">${
        diff === 0 ? "even par" : `${sign} vs par`
      }</span>${better}`;
    });

    $("#vp-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const w = inp.value.trim().toLowerCase();
      if (!isLegal(w, h.plate, (x) => this.isWord(x))) {
        lenEl.innerHTML = this.isWord(w)
          ? `<span class="over">${h.plate} must appear in order</span>`
          : `<span class="over">“${w.toUpperCase()}” isn't in the word list</span>`;
        return;
      }
      if (parked && w.length >= parked.len) {
        lenEl.innerHTML = `<span class="over">Not shorter than ${parked.word.toUpperCase()} (${parked.len})</span>`;
        return;
      }
      const diff = w.length - h.par;
      parked = { word: w, len: w.length, par: h.par, diff, lab: scoreLabel(diff), penalty: hintUsed };
      inp.value = "";
      drawPlate("");
      lenEl.textContent = "";
      go.disabled = true;
      renderParked();
      inp.focus();
    });

    hintBtn.addEventListener("click", () => {
      hintUsed++;
      const reveal = h.ex.slice(0, Math.min(hintUsed + 1, h.ex.length)).toUpperCase();
      $("#vp-hint").innerHTML = `A par word starts <b>${reveal}…</b> · +${hintUsed} stroke${
        hintUsed > 1 ? "s" : ""
      }`;
      if (hintUsed >= MAX_HINTS) hintBtn.disabled = true;
      inp.focus();
    });

    driveBtn.addEventListener("click", () => {
      // Fold any hint penalty into the recorded strokes for this hole.
      const strokes = parked.len + parked.penalty;
      const diff = strokes - h.par;
      this.results[this.holeIdx] = {
        plate: h.plate,
        word: parked.word,
        len: strokes,
        raw: parked.len,
        penalty: parked.penalty,
        par: h.par,
        diff,
        lab: scoreLabel(diff),
      };
      this.holeIdx++;
      if (this.holeIdx < this.holes.length) this.renderHole();
      else this.finish();
    });

    this.root.querySelector(".vp-back").addEventListener("click", () => this.showGarage());
    inp.focus();
  }

  finish() {
    const strokes = this.results.reduce((s, r) => s + r.len, 0);
    const par = this.results.reduce((s, r) => s + r.par, 0);
    const birdies = this.results.filter((r) => r.diff < 0).length;
    const diff = strokes - par;
    const rel = diff === 0 ? "even par" : diff > 0 ? `+${diff}` : `${diff}`;
    const grid = this.results.map((r) => r.lab.grid).join("");

    saveResult(this.profile.id, { strokes, par, birdies }, this.day);
    const record = recordBest(this.profile.id, { strokes, par, birdies }, this.day);

    const rows = this.results
      .map(
        (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="vp-cell-plate">${r.plate}</td>
        <td class="vp-cell-word">${r.word.toUpperCase()}${
          r.penalty ? `<span class="vp-pen">+${r.penalty}</span>` : ""
        }</td>
        <td>${r.par}</td>
        <td class="vp-${r.lab.key}">${r.diff > 0 ? "+" + r.diff : r.diff}</td>
        <td class="vp-${r.lab.key}">${r.lab.label}</td>
      </tr>`,
      )
      .join("");

    const totalColor = diff < 0 ? "birdie" : diff === 0 ? "par" : "over";

    this.root.innerHTML = `
      <div class="vp-wrap">
        <button class="vp-back" type="button">← garage</button>
        <h1 class="vp-title">${this.course.name}</h1>
        ${this.odometerHtml(-1)}
        <div class="vp-card-result">
          <table class="vp-scorecard">
            <tr><th>#</th><th>plate</th><th>word</th><th>par</th><th>±</th><th></th></tr>
            ${rows}
          </table>
          <div class="vp-total">
            <span class="vp-total-lbl">${strokes} strokes · par ${par}${
              birdies ? ` · ${birdies}🐦` : ""
            }${record ? " · best!" : ""}</span>
            <span class="vp-total-big vp-${totalColor}">${rel}</span>
          </div>
        </div>
        <pre class="vp-grid">${grid}</pre>
        <button class="vp-share" id="vp-share">Copy scorecard</button>
        <button class="vp-again" id="vp-again">← back to the garage</button>
      </div>`;

    this.root.querySelector(".vp-back").addEventListener("click", () => this.showGarage());
    this.root.querySelector("#vp-again").addEventListener("click", () => this.showGarage());
    this.root.querySelector("#vp-share").addEventListener("click", () => {
      const text = buildShareText({
        grid,
        strokes,
        par,
        birdies,
        courseName: this.course.name,
        difficultyLabel: this.profile.label,
        daily: this.data ? this.day : undefined,
      });
      copyToClipboard(text);
      const btn = this.root.querySelector("#vp-share");
      btn.textContent = "Copied ✓";
      if (this._shareTimer) clearTimeout(this._shareTimer);
      this._shareTimer = setTimeout(() => {
        if (this.root.querySelector("#vp-share") === btn) btn.textContent = "Copy scorecard";
      }, 2000);
    });
    announceRoundComplete(this.root);
  }
}
