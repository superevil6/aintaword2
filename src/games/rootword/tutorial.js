// Animated demo shown on the difficulty picker.
//
// A hand-scripted little tree, grown once and looped. It teaches the one idea
// the game lives on: a seed word is a trunk, and words that start the same
// SHARE that trunk — so branching off CAR into CARD / CARE / CART bears three
// fruit for three cheap branches. Same shape and scoring as the real board, so
// it never teaches a tree the game can't grow.
//
//            C
//            A
//            R          seed CAR  (+1)
//          / | \
//        D   E   T      CARD CARE CART  (+2 each)
//
// Rules-accurate: CAR scores 1 (3 letters), each 4-letter word scores 2, total 7.

// Node id → letter, position (in the demo's 0–200 × 0–210 viewBox), parent, and
// the word that completes at it (with its points). Revealed in array order.
const NODES = [
  { id: "c", ch: "C", x: 100, y: 26, seed: true },
  { id: "a", ch: "A", x: 100, y: 70, seed: true, parent: "c" },
  { id: "r", ch: "R", x: 100, y: 114, seed: true, parent: "a", word: "CAR", pts: 1 },
  { id: "d", ch: "D", x: 50, y: 172, parent: "r", word: "CARD", pts: 2 },
  { id: "e", ch: "E", x: 100, y: 172, parent: "r", word: "CARE", pts: 2 },
  { id: "t", ch: "T", x: 150, y: 172, parent: "r", word: "CART", pts: 2 },
];

const CAPTIONS = {
  r: "Your seed is a word: CAR.",
  d: "Branch off it — CARD bears fruit.",
  e: "Reuse the trunk — CARE.",
  t: "…and CART. One trunk, many fruit.",
};

const STEP_MS = 900;   // between reveals, so each is read
const HOLD_MS = 2400;  // pause on the finished tree before looping

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup — cancels the loop and removes the element
 */
export function mountTutorial(container) {
  const el = document.createElement("div");
  el.className = "rw-demo";
  el.setAttribute("aria-hidden", "true"); // decorative; the written rules carry the same idea

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const X = (n) => n.x, Y = (n) => n.y;

  let edges = "";
  let nodes = "";
  for (const n of NODES) {
    if (n.parent) {
      const p = byId[n.parent];
      const my = (Y(p) + Y(n)) / 2;
      edges += `<path class="rw-demo-edge${n.seed ? " is-seed" : ""}" data-edge="${n.id}"
        d="M${X(p)},${Y(p)} C ${X(p)},${my} ${X(n)},${my} ${X(n)},${Y(n)}"/>`;
    }
    const cls = ["rw-demo-node"];
    if (n.seed) cls.push("is-seed");
    if (n.word) cls.push("is-word");
    nodes += `<g class="${cls.join(" ")}" data-node="${n.id}">
      ${n.word ? `<circle class="rw-demo-fruit" cx="${X(n) + 12}" cy="${Y(n) - 12}" r="4"/>` : ""}
      <circle class="rw-demo-disc" cx="${X(n)}" cy="${Y(n)}" r="15"/>
      <text x="${X(n)}" y="${Y(n)}">${n.ch}</text>
    </g>`;
  }

  el.innerHTML = `
    <svg class="rw-demo-svg" viewBox="0 0 200 210" role="img" aria-hidden="true">${edges}${nodes}</svg>
    <p class="rw-demo-score">Fruit <span class="rw-demo-pts">0</span></p>
    <p class="rw-demo-caption"></p>
  `;
  container.appendChild(el);

  const nodeEl = (id) => el.querySelector(`[data-node="${id}"]`);
  const edgeEl = (id) => el.querySelector(`[data-edge="${id}"]`);
  const ptsEl = el.querySelector(".rw-demo-pts");
  const capEl = el.querySelector(".rw-demo-caption");

  const timers = new Set();
  let stopped = false;
  const after = (ms, fn) => {
    const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms);
    timers.add(t);
  };

  function reveal(n, running) {
    edgeEl(n.id)?.classList.add("is-shown");
    nodeEl(n.id).classList.add("is-shown");
    if (n.word) {
      running += n.pts;
      ptsEl.textContent = String(running);
      if (CAPTIONS[n.id]) capEl.textContent = CAPTIONS[n.id];
    }
    return running;
  }

  function reset() {
    for (const n of NODES) {
      nodeEl(n.id).classList.remove("is-shown");
      edgeEl(n.id)?.classList.remove("is-shown");
    }
    ptsEl.textContent = "0";
    capEl.textContent = "";
  }

  function play() {
    reset();
    let running = 0;
    NODES.forEach((n, i) => {
      after(STEP_MS * (i + 1), () => { running = reveal(n, running); });
    });
    after(STEP_MS * (NODES.length + 1) + HOLD_MS, play); // loop
  }

  if (prefersReducedMotion()) {
    let running = 0;
    for (const n of NODES) running = reveal(n, running);
  } else {
    play();
  }

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    el.remove();
  };
}
