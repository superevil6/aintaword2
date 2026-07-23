// Storey — screen and interaction.
//
// A SITE picker (difficulty) leads into a BUILD: you have a rack of consonant
// tiles and you raise a tower one floor at a time. Type a real word; if its
// first and last letters are consonants you still hold, it can be a floor, and
// laying it spends those two tiles. A floor's worth is its width; each storey up
// costs gravity, so the running score and the par target keep you pushing for a
// wide base and the right height. When you're done — or the rack can't bear
// another floor — you top out and score against the day's par.
//
// NB: styles are imported by index.js, not here — keeping game.js free of CSS
// imports is what lets the e2e harness drive it under jsdom.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  getDifficulty,
} from "./difficulty.js";
import { setFor } from "./dailySet.js";
import { mountTutorial } from "./tutorial.js";
import {
  checkFloor,
  pillarsOf,
  rackFromHand,
  rackAffords,
  tileCost,
  floorNet,
  scoreTower,
  isConsonant,
  MIN_FLOOR,
} from "./engine.js";
import { buildShareText, copyToClipboard } from "./share.js";
import { announceRoundComplete } from "../../core/lifecycle.js";
import {
  todayKey,
  getResult,
  saveResult,
  bestResult,
  recordBest,
} from "./results.js";

export class StoreyGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {object} opts.dict        Dictionary instance (needs isWord)
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
    this._tutorialCleanup = null;
    this.draft = ""; // the word being composed on the tap keyboard
    this._onKey = (e) => this._handleKey(e);
    this._keysBound = false;

    this.root.classList.add("st");
    if (opts.difficulty && DIFFICULTIES[opts.difficulty]) this.play(opts.difficulty);
    else this.showSites();
  }

  destroy() {
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
    this._unbindKeys();
    this._teardownTutorial();
    this.root.classList.remove("st");
    this.root.innerHTML = "";
  }

  // The build screen is the only one that reads the physical keyboard; bind it
  // when we enter a build and release it whenever we leave, so the picker and
  // result screens don't swallow keystrokes. Idempotent — renderBuild re-runs.
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

  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  isWord(w) {
    return this.dict.isWord(w);
  }

  // ── site picker ──────────────────────────────────────────────────────────

  showSites() {
    this._unbindKeys();
    this._teardownTutorial();
    const cards = DIFFICULTY_ORDER.map((id) => {
      const d = DIFFICULTIES[id];
      const set = setFor(this.data, id);
      const par = set?.par;
      const res = getResult(id, this.day);
      let status = par != null ? `par ${par}` : "—";
      if (res) {
        const diff = res.score - res.par;
        const rel = diff === 0 ? "on par" : diff > 0 ? `+${diff}` : `${diff}`;
        status = `${rel} · ${res.score}/${res.par} · ${res.stories}🏢`;
      }
      const disabled = !set ? "disabled" : "";
      return `
        <button class="st-card" data-id="${id}" ${disabled}>
          <span class="st-card-main">
            <b>${d.site}</b>
            <small>${d.label} · ${d.blurb}</small>
          </span>
          <span class="st-card-stat ${res ? "played" : ""}">${status}</span>
        </button>`;
    }).join("");

    const note = this.data
      ? ""
      : `<p class="st-note">No build for today yet — check back when the daily is published.</p>`;

    this.root.innerHTML = `
      <div class="st-wrap">
        <h1 class="st-title">Storey</h1>
        <p class="st-sub">Build the tallest, widest tower your hand of letters allows.
          Every floor is a real word on two consonant pillars — but each storey up fights <b>gravity</b>.</p>
        <div class="st-demo-slot"></div>
        <div class="st-sites">${cards}</div>
        ${note}
        <p class="st-foot">Par is the best tower from everyday words. Know rarer, longer ones? Climb above it. 🏙️</p>
      </div>`;

    this.root.querySelectorAll(".st-card[data-id]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => this.play(btn.dataset.id));
    });

    const slot = this.root.querySelector(".st-demo-slot");
    if (slot) this._tutorialCleanup = mountTutorial(slot);
  }

  // ── a build ────────────────────────────────────────────────────────────────

  play(id) {
    this._teardownTutorial();
    const set = setFor(this.data, id);
    if (!set) return this.showSites();
    this.profile = getDifficulty(id);
    this.set = set;
    this.gravity = set.gravity;
    this.rack = rackFromHand(set.hand);
    this.handSet = new Set(set.hand); // the letters in play — floors use only these
    this.floors = []; // { word, left, right, width, height, net }
    this.draft = "";
    this._hintsShown = 0;
    this.renderBuild();
  }

  /** Tiles still in hand, sorted, as an array (with repeats) for display. */
  remainingTiles() {
    const out = [];
    for (const t of Object.keys(this.rack).sort()) {
      for (let i = 0; i < this.rack[t]; i++) out.push(t);
    }
    return out;
  }

  /** Can any floor still be laid? Needs at least two consonant tiles in hand. */
  canBuildMore() {
    const total = this.remainingTiles().length;
    return total >= 2;
  }

  liveScore() {
    return scoreTower(this.floors, this.gravity);
  }

  renderBuild() {
    const set = this.set;
    const height = this.floors.length; // next floor's height
    const nextCost = this.gravity * height;
    const score = this.liveScore();
    const diff = score - set.par;
    const rel = diff === 0 ? "on par" : diff > 0 ? `+${diff}` : `${diff}`;

    this.root.innerHTML = `
      <div class="st-wrap st-build">
        <button class="st-back" type="button">← sites</button>
        <div class="st-build-top">
          <span>${set.site}</span>
          <span class="st-scoreline">
            <b class="st-score ${diff >= 0 ? "good" : "under"}">${score}</b> / par ${set.par}
            · <span class="st-rel ${diff >= 0 ? "good" : "under"}">${rel}</span>
          </span>
        </div>

        <div class="st-tower" id="st-tower"></div>

        <div class="st-gravity" id="st-gravity">
          Next storey — height ${height} · gravity <b>−${nextCost}</b>
        </div>

        <div class="st-draft" id="st-draft"></div>
        <div class="st-feed" id="st-feed"></div>

        <div class="st-rack" id="st-rack"></div>
        <div class="st-controls">
          <button class="st-del" id="st-del" type="button">⌫ Delete</button>
          <button class="st-lay" id="st-lay" type="button">Lay floor</button>
        </div>
        <div class="st-vowels">Tap your letters to spell a floor — a real word using only these (vowels are free). Its first and last letters are the pillars, and each letter can be a pillar once.</div>

        <div class="st-actions">
          <button class="st-hintbtn" id="st-hintbtn" type="button">Stuck? Suggest a floor</button>
          <button class="st-undo" id="st-undo" type="button" ${this.floors.length ? "" : "hidden"}>↩ Undo</button>
          <button class="st-finish" id="st-finish" type="button" ${this.floors.length ? "" : "hidden"}>Top out →</button>
        </div>
      </div>`;

    const $ = (s) => this.root.querySelector(s);

    this.drawTower();
    this.drawRack();
    this._refresh();

    // The collection of letters IS the input: tapping one appends it to the draft.
    // pointerdown (not click) so it feels instant on touch, like mirrorword.
    $("#st-rack").addEventListener("pointerdown", (e) => {
      const chip = e.target.closest("[data-tile],[data-vowel]");
      if (!chip) return;
      e.preventDefault();
      this._press(chip.dataset.tile ?? chip.dataset.vowel);
    });
    $("#st-del").addEventListener("click", () => this._backspace());
    $("#st-lay").addEventListener("click", () => this._enter());

    $("#st-undo").addEventListener("click", () => this.undo());
    $("#st-finish").addEventListener("click", () => this.finish());
    $("#st-hintbtn").addEventListener("click", () => this.suggest());
    $(".st-back").addEventListener("click", () => this.showSites());

    this._bindKeys();
  }

  // ── composing a floor ──────────────────────────────────────────────────────

  _press(ch) {
    if (this.draft.length >= 15) return; // no word is longer; keeps the draft sane
    const c = ch.toLowerCase();
    if (!"aeiou".includes(c) && !this.handSet.has(c)) return; // only your letters (vowels always ok)
    this.draft += c;
    this._refresh();
  }

  _backspace() {
    if (!this.draft) return;
    this.draft = this.draft.slice(0, -1);
    this._refresh();
  }

  _enter() {
    const w = this.draft.toLowerCase();
    const chk = checkFloor(w, this.rack, this.handSet, (x) => this.isWord(x));
    if (!chk.ok) {
      const feed = this.root.querySelector("#st-feed");
      if (feed) feed.innerHTML = `<span class="bad">${this.reasonText(chk, w)}</span>`;
      return;
    }
    this.draft = "";
    this.layFloor(w, chk); // re-renders the build (and resets the collection)
  }

  _handleKey(e) {
    if (!this.root.querySelector("#st-rack")) return; // build screen only
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) this._press(e.key.toLowerCase());
    else if (e.key === "Backspace") { e.preventDefault(); this._backspace(); }
    else if (e.key === "Enter") { e.preventDefault(); this._enter(); }
  }

  /** Redraw the draft word, the feedback line, and the spent-tile highlights. */
  _refresh() {
    const draftEl = this.root.querySelector("#st-draft");
    const feed = this.root.querySelector("#st-feed");
    const layKey = this.root.querySelector("#st-lay");
    const w = this.draft.toLowerCase();
    const height = this.floors.length;
    this.clearRackSpend();

    if (draftEl) {
      if (!w) {
        draftEl.innerHTML = `<span class="st-draft-hint">Tap letters to build a floor — a consonant at each end</span>`;
      } else {
        const p = pillarsOf(w);
        draftEl.innerHTML = w
          .split("")
          .map((c, i) => {
            const end = i === 0 || i === w.length - 1;
            let cls = "";
            if ("aeiou".includes(c)) cls = "v";
            else if (end && p && (this.rack[c] || 0) > 0) cls = "pil";
            return `<span class="st-draft-ch ${cls}">${c.toUpperCase()}</span>`;
          })
          .join("");
      }
    }

    if (layKey) layKey.classList.remove("ready");

    if (!w) {
      if (feed) {
        feed.innerHTML = this.canBuildMore()
          ? ""
          : `<span class="bad">The rack is spent — top out to score.</span>`;
      }
      return;
    }

    this.markVowelsUsed(w); // light the free vowels even before the word is legal
    const chk = checkFloor(w, this.rack, this.handSet, (x) => this.isWord(x));
    if (!chk.ok) {
      if (feed) feed.innerHTML = `<span class="bad">${this.reasonText(chk, w)}</span>`;
      return;
    }
    const net = floorNet(chk.width, height, this.gravity);
    this.markRackSpend(chk.left, chk.right);
    if (feed)
      feed.innerHTML =
        `spends <span class="pil">${chk.left.toUpperCase()}</span>` +
        `<span class="pil">${chk.right.toUpperCase()}</span> · ` +
        `width <b>${chk.width}</b> − gravity ${this.gravity * height} = ` +
        `<b class="${net >= 0 ? "good" : "under"}">${net >= 0 ? "+" : ""}${net}</b>`;
    if (layKey) layKey.classList.add("ready");
  }

  reasonText(chk, w) {
    const reason = chk.reason;
    if (reason === "not-a-word") return `“${w.toUpperCase()}” isn't in the word list`;
    if (reason === "bad-ends") return `A floor needs ${MIN_FLOOR}+ letters, a consonant at each end`;
    if (reason === "off-pool")
      return `Build only from your letters — “${(chk.offLetter || "").toUpperCase()}” isn't one of them`;
    if (reason === "no-tiles") {
      const p = pillarsOf(w);
      if (p) return `You've already used ${this.missingTiles(p.left, p.right)} as a pillar — try a different end`;
      return `Those pillars are already used`;
    }
    return "Not a legal floor";
  }

  missingTiles(left, right) {
    const need = tileCost(left, right);
    const miss = [];
    for (const t in need) if ((this.rack[t] || 0) < need[t]) miss.push(t.toUpperCase());
    return miss.join(" & ") || "those pillars";
  }

  layFloor(word, chk) {
    const height = this.floors.length;
    const net = floorNet(chk.width, height, this.gravity);
    this.rack[chk.left]--;
    this.rack[chk.right]--;
    this.floors.push({
      word,
      left: chk.left,
      right: chk.right,
      width: chk.width,
      height,
      net,
    });
    this.renderBuild();
  }

  undo() {
    const last = this.floors.pop();
    if (!last) return;
    this.rack[last.left]++;
    this.rack[last.right]++;
    this.renderBuild();
  }

  /** A no-penalty nudge: name one optimal floor whose pillars you can still afford. */
  suggest() {
    const feed = this.root.querySelector("#st-feed");
    const cand = (this.set.floors || []).find((f) => {
      const l = f.left.toLowerCase(), r = f.right.toLowerCase();
      return rackAffords(this.rack, l, r);
    });
    if (!cand) {
      feed.innerHTML = `<span class="bad">No optimal floor fits the tiles you have left.</span>`;
      return;
    }
    this._hintsShown++;
    feed.innerHTML = `💡 An optimal tower lays <b>${cand.word.toUpperCase()}</b> here (width ${cand.width}).`;
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  drawTower() {
    const el = this.root.querySelector("#st-tower");
    if (!el) return;
    if (!this.floors.length) {
      el.innerHTML = `<div class="st-empty">Empty lot. Lay your first floor — your widest, while gravity is cheapest.</div>`;
      return;
    }
    // Newest (highest) on top: render in reverse build order.
    const rows = this.floors
      .map((f) => {
        const mid = f.word.slice(1, -1).toUpperCase();
        return `
          <div class="st-floor" style="--w:${f.width}">
            <span class="st-pil">${f.left.toUpperCase()}</span>
            <span class="st-fill">${mid}</span>
            <span class="st-pil">${f.right.toUpperCase()}</span>
            <span class="st-floor-net ${f.net >= 0 ? "good" : "under"}">${f.net >= 0 ? "+" : ""}${f.net}</span>
            <span class="st-floor-h">h${f.height}</span>
          </div>`;
      })
      .reverse()
      .join("");
    el.innerHTML = rows + `<div class="st-ground"></div>`;
  }

  drawRack() {
    const el = this.root.querySelector("#st-rack");
    if (!el) return;
    // The clickable collection: every letter you hold (brick), then the free
    // vowels (green). A consonant whose pillar tile is spent dims to "used" — it
    // can still fill the middle of a word, just not be a pillar again.
    const cons = this.set.hand
      .map((t) => {
        const used = (this.rack[t] || 0) === 0;
        return `<button type="button" class="st-tile ${used ? "used" : ""}" data-tile="${t}">${t.toUpperCase()}</button>`;
      })
      .join("");
    const vowels = ["a", "e", "i", "o", "u"]
      .map((v) => `<button type="button" class="st-tile vowel" data-vowel="${v}">${v.toUpperCase()}</button>`)
      .join("");
    el.innerHTML = `${cons}<span class="st-rack-div" aria-hidden="true"></span>${vowels}`;
  }

  clearRackSpend() {
    this.root
      .querySelectorAll(".st-tile.spend, .st-tile.use")
      .forEach((t) => t.classList.remove("spend", "use"));
  }

  /** Light up the free vowels that appear in the word being typed. */
  markVowelsUsed(word) {
    const used = new Set(word.toLowerCase().split("").filter((c) => "aeiou".includes(c)));
    this.root.querySelectorAll(".st-tile.vowel").forEach((el) => {
      if (used.has(el.dataset.vowel)) el.classList.add("use");
    });
  }

  /** Highlight the (up to two) rack tiles a previewed floor would spend. */
  markRackSpend(left, right) {
    const need = tileCost(left, right);
    for (const t in need) {
      let marked = 0;
      this.root.querySelectorAll(`.st-tile[data-tile="${t}"]`).forEach((el) => {
        if (marked < need[t]) {
          el.classList.add("spend");
          marked++;
        }
      });
    }
  }

  // ── topping out ────────────────────────────────────────────────────────────

  finish() {
    this._unbindKeys();
    const set = this.set;
    const score = this.liveScore();
    const stories = this.floors.length;
    const diff = score - set.par;
    const rel = diff === 0 ? "on par" : diff > 0 ? `+${diff} above par` : `${-diff} below par`;
    const tone = diff > 0 ? "good" : diff === 0 ? "par" : "under";

    saveResult(this.profile.id, { score, par: set.par, stories }, this.day);
    const record = recordBest(this.profile.id, { score, par: set.par, stories }, this.day);

    const built = this.floors
      .slice()
      .reverse()
      .map(
        (f) => `
        <div class="st-floor result" style="--w:${f.width}">
          <span class="st-pil">${f.left.toUpperCase()}</span>
          <span class="st-fill">${f.word.slice(1, -1).toUpperCase()}</span>
          <span class="st-pil">${f.right.toUpperCase()}</span>
          <span class="st-floor-net ${f.net >= 0 ? "good" : "under"}">${f.net >= 0 ? "+" : ""}${f.net}</span>
        </div>`,
      )
      .join("");

    // The optimal tower for reference — labelled "one" because ties mean it is
    // not the only one (and repeated pillar pairs can repeat a word legally).
    const optimal = (set.floors || [])
      .map(
        (f, i) => `
        <div class="st-opt-row" style="--w:${f.width}">
          <span class="st-opt-word">${f.word.toUpperCase()}</span>
          <span class="st-opt-w">${f.width}</span>
        </div>`,
      )
      .join("");

    this.root.innerHTML = `
      <div class="st-wrap">
        <button class="st-back" type="button">← sites</button>
        <h1 class="st-title">${set.site}</h1>
        <div class="st-result">
          <div class="st-tower final">${built || '<div class="st-empty">No floors laid.</div>'}</div>
          <div class="st-total">
            <span class="st-total-lbl">${score} / par ${set.par} · ${stories} storeys${record ? " · best!" : ""}</span>
            <span class="st-total-big st-${tone}">${rel}</span>
          </div>
        </div>
        <details class="st-reveal">
          <summary>Show one optimal tower (spoiler)</summary>
          <div class="st-opt">${optimal}</div>
          <p class="st-opt-note">Par ${set.par} in ${set.stories} storeys — widest floors at the base.</p>
        </details>
        <button class="st-share" id="st-share">Copy skyline</button>
        <button class="st-again" id="st-again">← back to the sites</button>
      </div>`;

    this.root.querySelector(".st-back").addEventListener("click", () => this.showSites());
    this.root.querySelector("#st-again").addEventListener("click", () => this.showSites());
    this.root.querySelector("#st-share").addEventListener("click", () => {
      const text = buildShareText({
        widths: this.floors.map((f) => f.width),
        score,
        par: set.par,
        stories,
        siteLabel: set.site,
        difficultyLabel: this.profile.label,
        daily: this.data ? this.day : undefined,
      });
      copyToClipboard(text);
      const btn = this.root.querySelector("#st-share");
      btn.textContent = "Copied ✓";
      if (this._shareTimer) clearTimeout(this._shareTimer);
      this._shareTimer = setTimeout(() => {
        if (this.root.querySelector("#st-share") === btn) btn.textContent = "Copy skyline";
      }, 2000);
    });
    announceRoundComplete(this.root);
  }
}
