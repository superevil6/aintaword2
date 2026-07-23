// Rootword — screen and interaction.
//
// Three screens off one container: a difficulty picker, the play board (a trie
// you grow by tapping letters), and a result. The persistent top banner and
// back-to-hub live in main.js, so this only ever provides a "Change difficulty"
// step of its own.
//
// A day at each tier is a single puzzle — a letter set, a branch budget, and a
// free seed word — the same for every player (see difficulty.rackFor). It is
// once per day: a tier already played shows its stored result rather than
// replaying, the way colorpath does.
//
// NB: styles are imported by index.js, not here, so a future
// scripts/e2e-rootword.mjs can drive this under jsdom with no CSS.

import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  getDifficulty,
  rackFor,
} from "./difficulty.js";
import { makePuzzle, scoreOf } from "./engine.js";
import { mountTutorial } from "./tutorial.js";
import { rackFromDay } from "./dailySet.js";
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

const XGAP = 46;
const YGAP = 62;
const PAD = 34;

export class RootwordGame {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {string[]} opts.pool       the word pool (injected by index.js)
   * @param {string}  [opts.difficulty] skip the picker, open straight into a tier
   * @param {string}  [opts.day]        override today's date (tests)
   */
  constructor(container, opts = {}) {
    this.root = container;
    this.opts = opts;
    this.pool = opts.pool || [];
    this.day = opts.day || todayKey();

    this.profile = null;
    this.puzzle = null;     // { letters, seed, budget, root, index, seedPaths, par }
    this.proot = null;      // player's planted tree root
    this.pindex = null;     // Map path -> planted node
    this.budgetLeft = 0;
    this.activePath = "";
    this._shareTimer = null;
    this._tutorialCleanup = null; // stops the picker demo's loop
    this.daily = opts.daily || null; // frozen day's puzzles, if loaded

    if (opts.difficulty) this.start(opts.difficulty);
    else this._showSelect();
  }

  destroy() {
    clearTimeout(this._shareTimer);
    this._teardownTutorial();
    this.root.classList.remove("rw", "rw--select", "rw--result");
    this.root.innerHTML = "";
  }

  /** Stop the picker demo's loop; safe to call when it isn't mounted. */
  _teardownTutorial() {
    this._tutorialCleanup?.();
    this._tutorialCleanup = null;
  }

  _setShell({ select = false, result = false } = {}) {
    this.root.classList.add("rw");
    this.root.classList.toggle("rw--select", select);
    this.root.classList.toggle("rw--result", result);
  }

  // ── Picker ─────────────────────────────────────────────────────────────

  _showSelect() {
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ select: true });

    const card = document.createElement("div");
    card.className = "rw-card";
    card.innerHTML = `
      <h1 class="rw-card-title">Rootword</h1>
      <p class="rw-card-lede">Grow a word tree from a single seed. Each branch adds a
        letter; every path that spells a word bears <strong>fruit</strong>. Words that
        start the same share a branch — so the trick is finding one fertile trunk and
        packing it.</p>
      <ul class="rw-rules">
        <li>Tap a node to select it, then tap a letter to grow a branch.</li>
        <li>Longer words are worth more (a 3-letter word scores 1, a 7-letter word 5).</li>
        <li>You have a fixed number of <strong>branches</strong> — spend them where they
          make the most fruit. Tap the ✕ on a branch to cut it and get them back.</li>
      </ul>
    `;

    // The looping demo teaches the shared-trunk idea better than the prose — it
    // sits right under the lede so it is the first thing that moves.
    const lede = card.querySelector(".rw-card-lede");
    const demoHost = document.createElement("div");
    lede.after(demoHost);
    this._tutorialCleanup = mountTutorial(demoHost);

    const list = document.createElement("div");
    list.className = "rw-picker";

    let firstBtn = null;
    for (const id of DIFFICULTY_ORDER) {
      const prof = DIFFICULTIES[id];
      const done = getResult(id, this.day);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rw-pick${done ? " is-done" : ""}`;
      btn.innerHTML = `
        <span class="rw-pick-main">
          <span class="rw-pick-label">${escapeHtml(prof.label)}</span>
          <span class="rw-pick-blurb">${
            done ? "Played today — view result" : escapeHtml(prof.blurb)
          }</span>
        </span>
        <span class="rw-pick-spec">
          <span class="rw-pick-big">${done ? done.score : prof.budget}</span>
          <span class="rw-pick-sub">${done ? "your score" : "branches"}</span>
        </span>
      `;
      btn.setAttribute(
        "aria-label",
        done
          ? `${prof.label}: played today, scored ${done.score} of ${done.par}. View result.`
          : `${prof.label}: ${prof.blurb}.`,
      );
      btn.addEventListener("click", () => this.start(id));
      list.appendChild(btn);
      firstBtn ||= btn;
    }

    card.appendChild(list);
    this.root.appendChild(card);
    firstBtn?.focus();
  }

  // ── Start a tier ───────────────────────────────────────────────────────

  /**
   * The day's `{ letters, seed }` for a tier: the frozen daily if one loaded,
   * else the curated rack baked into difficulty.js (picked deterministically by
   * date). Both give every player the same puzzle for a given day + tier.
   */
  _rackForToday(prof) {
    return (
      rackFromDay(this.daily, prof.id) ||
      rackFor(prof, dailySeedFor(prof.id, this.day))
    );
  }

  start(id) {
    this.profile = getDifficulty(id);
    const done = getResult(this.profile.id, this.day);
    if (done) {
      // Already played today — show the stored result, don't replay. Rebuild
      // the day's puzzle (cheap, deterministic) so the result can still show
      // the optimal word list beside what the player planted.
      const rack = this._rackForToday(this.profile);
      this.puzzle = makePuzzle({ ...rack, budget: this.profile.budget }, this.pool);
      this._showResult(done, { replay: true });
      return;
    }
    this._beginPlay();
  }

  _beginPlay() {
    const prof = this.profile;
    const rack = this._rackForToday(prof);
    this.puzzle = makePuzzle({ ...rack, budget: prof.budget }, this.pool);

    // Plant the seed as a free trunk from the root.
    this.proot = { path: "", ch: "", children: [], word: false, seed: true };
    this.pindex = new Map([["", this.proot]]);
    const seed = this.puzzle.seed;
    for (let i = 1; i <= seed.length; i++) {
      const path = seed.slice(0, i);
      const parent = this.pindex.get(seed.slice(0, i - 1));
      const node = {
        path,
        ch: seed[i - 1],
        children: [],
        word: this.puzzle.index.get(path)?.word || false,
        seed: true,
      };
      parent.children.push(node);
      this.pindex.set(path, node);
    }
    this.budgetLeft = prof.budget;
    this.activePath = seed;

    this._showPlay();
  }

  // ── Play ───────────────────────────────────────────────────────────────

  _showPlay() {
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ select: false });

    const hud = document.createElement("div");
    hud.className = "rw-hud";
    hud.innerHTML = `
      <div class="rw-hud-stat">
        <span class="rw-hud-label">Branches</span>
        <span class="rw-branches"></span>
      </div>
      <div class="rw-hud-stat">
        <span class="rw-hud-label">Fruit</span>
        <span class="rw-score"></span>
      </div>
    `;
    // Par is deliberately NOT shown while playing: knowing the exact target
    // makes a tree feel not-good-enough to turn in. It is revealed only on the
    // result screen, once the run is committed.
    this._branchesEl = hud.querySelector(".rw-branches");
    this._scoreEl = hud.querySelector(".rw-score");

    const boardWrap = document.createElement("div");
    boardWrap.className = "rw-board";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "rw-tree");
    svg.addEventListener("click", (e) => {
      // A cut handle (the ✕ on a branch) prunes that branch and everything
      // below it, handing the budget back. Checked before node-selection so a
      // handle sitting over the tree cuts rather than selects.
      const cut = e.target.closest("[data-cut]");
      if (cut) { this._cut(cut.getAttribute("data-cut")); return; }
      const g = e.target.closest("[data-path]");
      if (!g) return;
      this.activePath = g.getAttribute("data-path");
      this._render();
    });
    boardWrap.appendChild(svg);
    this._svg = svg;
    this._boardWrap = boardWrap;

    const side = document.createElement("div");
    side.className = "rw-side";
    side.innerHTML = `<h2 class="rw-side-title">Fruit planted</h2>
      <div class="rw-wordlist"></div>`;
    this._wordlistEl = side.querySelector(".rw-wordlist");

    const rack = document.createElement("div");
    rack.className = "rw-rack";
    rack.addEventListener("click", (e) => {
      const t = e.target.closest("[data-letter]");
      if (!t || t.classList.contains("is-dead")) return;
      this._extend(t.getAttribute("data-letter"));
    });
    this._rackEl = rack;

    const foot = document.createElement("div");
    foot.className = "rw-foot";

    const change = document.createElement("button");
    change.type = "button";
    change.className = "rw-btn rw-btn-ghost";
    change.textContent = "Change difficulty";
    change.addEventListener("click", () => this._showSelect());

    const finish = document.createElement("button");
    finish.type = "button";
    finish.className = "rw-btn rw-btn-primary";
    finish.textContent = "Finish →";
    finish.addEventListener("click", () => this._finish());

    foot.append(change, finish);

    this.root.append(hud, boardWrap, side, rack, foot);
    this._render();
  }

  /** Letters that can extend the active node (live prefixes not already grown). */
  _liveLetters() {
    const t = this.puzzle.index.get(this.activePath);
    const planted = this.pindex.get(this.activePath);
    const m = new Map(); // char -> isWord
    if (!t || !planted) return m;
    const grown = new Set(planted.children.map((c) => c.ch));
    for (const [ch, child] of t.children) {
      if (grown.has(ch)) continue;
      m.set(ch, child.word);
    }
    return m;
  }

  _extend(ch) {
    if (this.budgetLeft <= 0) return;
    const t = this.puzzle.index.get(this.activePath);
    const child = t && t.children.get(ch);
    if (!child) return;
    const planted = this.pindex.get(this.activePath);
    if (planted.children.some((c) => c.ch === ch)) return;
    const node = { path: child.path, ch, children: [], word: child.word, seed: false };
    planted.children.push(node);
    this.pindex.set(node.path, node);
    this.budgetLeft--;
    this.activePath = node.path; // chain downward — tap, tap, tap grows a limb
    this._render();
  }

  /**
   * Cut a branch: prune this node and its entire subtree, handing every branch
   * it used back to the budget so the player can spend them exploring
   * elsewhere. The given seed trunk is never cuttable.
   */
  _cut(path) {
    const node = this.pindex.get(path);
    if (!node || node.seed) return;
    let removed = 0;
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      for (const c of n.children) stack.push(c);
      this.pindex.delete(n.path);
      removed++; // every node under a non-seed node is itself non-seed, so all refund
    }
    const parent = this.pindex.get(path.slice(0, -1));
    if (parent) parent.children = parent.children.filter((c) => c !== node);
    this.budgetLeft += removed;
    // If the cut took the selected node with it, fall back to the parent.
    if (!this.pindex.has(this.activePath)) {
      this.activePath = parent ? parent.path : this.puzzle.seed;
    }
    this._render();
  }

  _currentScore() {
    let s = 0;
    for (const n of this.pindex.values()) if (n.word) s += scoreOf(n.path.length);
    return s;
  }

  _plantedWords() {
    const out = [];
    for (const n of this.pindex.values()) if (n.word) out.push(n.path);
    return out.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  _render() {
    this._branchesEl.textContent = this.budgetLeft;
    this._scoreEl.textContent = this._currentScore();
    this._renderRack();
    this._renderWordlist();
    this._renderTree();
  }

  _renderRack() {
    const live = this._liveLetters();
    const out = this.puzzle.letters
      .map((L) => {
        const isLive = live.has(L) && this.budgetLeft > 0;
        return `<button type="button" class="rw-tile ${isLive ? "is-live" : "is-dead"}"
          data-letter="${L}" ${isLive ? "" : "tabindex=-1 aria-disabled=true"}>${L}</button>`;
      })
      .join("");
    this._rackEl.innerHTML = out;
  }

  _renderWordlist() {
    const words = this._plantedWords();
    this._wordlistEl.innerHTML = words
      .map(
        (w) =>
          `<span class="rw-wchip">${w}<span class="rw-wchip-pt">+${scoreOf(w.length)}</span></span>`,
      )
      .join("");
  }

  _layout() {
    const pos = new Map();
    let leaf = 0;
    const assign = (node, depth) => {
      if (node.children.length === 0) {
        pos.set(node.path, { x: leaf * XGAP, y: depth * YGAP });
        leaf++;
        return;
      }
      let sx = 0;
      for (const c of node.children) {
        assign(c, depth + 1);
        sx += pos.get(c.path).x;
      }
      pos.set(node.path, { x: sx / node.children.length, y: depth * YGAP });
    };
    assign(this.proot, 0);
    let maxX = 0, maxY = 0;
    for (const p of pos.values()) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { pos, w: maxX + PAD * 2 + 40, h: maxY + PAD * 2 + 40 };
  }

  _renderTree() {
    const { pos, w, h } = this._layout();
    const svg = this._svg;
    svg.setAttribute("width", Math.max(w, 300));
    svg.setAttribute("height", Math.max(h, 220));
    const X = (p) => p.x + PAD + 20;
    const Y = (p) => p.y + PAD;

    let s = "";
    let cuts = ""; // ✕ handles, drawn last so they sit on top of the tree
    const edges = (node) => {
      const pp = pos.get(node.path);
      for (const c of node.children) {
        const cp = pos.get(c.path);
        const my = (Y(pp) + Y(cp)) / 2;
        s += `<path class="rw-edge${c.seed ? " is-seed" : ""}" d="M${X(pp)},${Y(pp)} C ${X(pp)},${my} ${X(cp)},${my} ${X(cp)},${Y(cp)}"/>`;
        if (!c.seed) {
          const cx = (X(pp) + X(cp)) / 2, cy = my;
          cuts += `<g class="rw-cut" data-cut="${c.path}" role="button" tabindex="0" aria-label="cut ${c.path}"><circle cx="${cx}" cy="${cy}" r="8"/><text x="${cx}" y="${cy}">✕</text></g>`;
        }
        edges(c);
      }
    };
    edges(this.proot);

    const nodes = (node) => {
      const p = pos.get(node.path);
      if (node.path === "") {
        s += `<circle class="rw-rootdot" cx="${X(p)}" cy="${Y(p)}" r="7"/>`;
      } else {
        const cls = ["rw-node"];
        if (node.word) cls.push(node.seed ? "is-seedword" : "is-word");
        if (node.path === this.activePath) cls.push("is-active");
        s += `<g class="${cls.join(" ")}" data-path="${node.path}">`;
        if (node.word) s += `<circle class="rw-fruit" cx="${X(p) + 13}" cy="${Y(p) - 13}" r="4"/>`;
        s += `<circle class="rw-disc" cx="${X(p)}" cy="${Y(p)}" r="16"/>`;
        s += `<text class="rw-letter" x="${X(p)}" y="${Y(p)}">${node.ch}</text>`;
        if (node.word) s += `<text class="rw-wordlabel" x="${X(p)}" y="${Y(p) + 29}">${node.path}</text>`;
        s += `</g>`;
      }
      for (const c of node.children) nodes(c);
    };
    nodes(this.proot);
    svg.innerHTML = s + cuts;
  }

  // ── Result ─────────────────────────────────────────────────────────────

  _finish() {
    const score = this._currentScore();
    const par = this.puzzle.par;
    const words = this._plantedWords(); // the actual words, so the result can list them
    const branches = this.puzzle.budget - this.budgetLeft;
    const result = { score, par, words, branches };
    saveResult(this.profile.id, result, this.day);
    recordBest(this.profile.id, { score, branches }, this.day);
    this._showResult(result, { replay: false });
  }

  _grade(score, par) {
    const pct = par > 0 ? score / par : 1;
    if (score >= par) return { title: "Perfect tree! 🌳", grade: "Optimal", sub: "You found the best tree possible today. Nobody beats this." };
    if (pct >= 0.85) return { title: "Your tree", grade: "Great pruning", sub: `${par - score} from par — a branch or two short of optimal.` };
    if (pct >= 0.65) return { title: "Your tree", grade: "Solid", sub: "Room to grow — look for a bushier trunk that shares more branches." };
    return { title: "Your tree", grade: "Sapling", sub: "Commit to one fertile start and pack words onto it — that's the whole game." };
  }

  _showResult(result, { replay }) {
    this._teardownTutorial();
    this.root.innerHTML = "";
    this._setShell({ result: true });
    const score = result.score;
    // Prefer the freshly-computed par over whatever was stored: an old result
    // saved before a par-scope fix would otherwise keep showing a stale target.
    const par = this.puzzle?.par ?? result.par;
    const budget = this.puzzle?.budget ?? this.profile?.budget;
    // `words` is the array of words the player planted (older stored results
    // may have kept only a count — tolerate that).
    const yours = Array.isArray(result.words) ? result.words : [];
    const yourCount = Array.isArray(result.words) ? result.words.length : (result.words || 0);
    const g = this._grade(score, par);
    const best = bestResult(this.profile.id);

    // The words in an optimal tree that the player didn't plant. This is a
    // DIFFERENT tree than theirs — the same branches spent another way — NOT a
    // pile of points to add on top, so it carries no running total and no
    // per-word scores. Showing "+56" here read as "you could have had 41+56".
    const yourSet = new Set(yours);
    const optimal = this.puzzle?.optimalWords || [];
    const missed = optimal.filter((w) => !yourSet.has(w));
    const byLenDesc = (a, b) => b.length - a.length || a.localeCompare(b);
    const yourChip = (w) => `<span class="rw-wchip">${escapeHtml(w)}<span class="rw-wchip-pt">+${scoreOf(w.length)}</span></span>`;
    const plainChip = (w) => `<span class="rw-wchip">${escapeHtml(w)}</span>`;

    const yoursHtml = yours.length
      ? `<div class="rw-result-list">
           <h3 class="rw-result-listhead">Your orchard <span>${yourCount} word${yourCount === 1 ? "" : "s"}</span></h3>
           <div class="rw-wordlist">${[...yours].sort(byLenDesc).map(yourChip).join("")}</div>
         </div>`
      : "";
    const missedHtml = missed.length
      ? `<div class="rw-result-list rw-result-missed">
           <h3 class="rw-result-listhead">A best tree grew these instead</h3>
           <div class="rw-wordlist">${missed.sort(byLenDesc).map(plainChip).join("")}</div>
         </div>`
      : "";
    // Only when short of par: explain that par IS reachable, just via a
    // different arrangement — so the target never reads as "all the words".
    const noteHtml = score < par
      ? `<p class="rw-result-note">Par ${par} is the most ${budget ? `those ${budget} branches` : "your branches"} can score — a best tree spends them on a different mix, not on top of yours.</p>`
      : "";

    const card = document.createElement("div");
    card.className = "rw-result-card";
    card.innerHTML = `
      <h2 class="rw-result-title">${g.title}</h2>
      <div class="rw-result-score">${score}<span class="rw-result-of"> / ${par}</span></div>
      <div class="rw-result-grade">${escapeHtml(g.grade)}</div>
      <p class="rw-result-sub">${escapeHtml(g.sub)}</p>
      <div class="rw-result-meta">${yourCount} word${yourCount === 1 ? "" : "s"} planted${
        best ? ` · best ${best.score}` : ""
      }</div>
      ${yoursHtml}
      ${missedHtml}
      ${noteHtml}
      <div class="rw-result-actions">
        <button type="button" class="rw-btn rw-btn-primary" data-act="share">Share result</button>
        <button type="button" class="rw-btn" data-act="again">Play another tier</button>
      </div>
    `;

    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "again") this._showSelect();
      if (b.dataset.act === "share") this._share(b, result);
    });

    this.root.appendChild(card);
    announceRoundComplete(this.root);
  }

  async _share(btn, result) {
    const text = buildShareText({
      score: result.score,
      par: result.par,
      words: Array.isArray(result.words) ? result.words.length : (result.words || 0),
      difficultyLabel: this.profile.label,
      daily: this.day,
    });
    const ok = await copyToClipboard(text);
    const label = btn.textContent;
    btn.textContent = ok ? "Copied!" : "Copy failed";
    clearTimeout(this._shareTimer);
    this._shareTimer = setTimeout(() => {
      btn.textContent = label;
    }, 1600);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
