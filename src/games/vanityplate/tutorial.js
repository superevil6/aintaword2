// Animated demo shown on the garage (difficulty picker).
//
// One idea, three beats: the plate's three letters must appear IN ORDER inside
// your word, any real word counts, and the SHORTEST word wins. A single plate,
// CAT, and three real words that each hide C·A·T further and further apart —
// CARPET (6), CART (4), CAT (3) — so the lit letters spread out while the length
// falls to par. That is the whole game; birdies and the golf scorecard are
// left for the round itself to reveal.
//
// Rules-accurate on purpose: the highlighted letters come from the real
// matchPositions() the game plays with, so the demo cannot show a match the
// board would reject. Every word is checked against ENABLE in the e2e test.

import { matchPositions } from "./engine.js";

export const PLATE = "CAT";
const PAR = 3;

export const FRAMES = [
  { word: "CARPET", caption: "Its three letters must appear <b>in order</b> — C·A·T." },
  { word: "CART", caption: "Any real word counts — but the <b>shortest</b> one wins." },
  { word: "CAT", caption: "Par: three letters, nothing wasted. ⛳" },
];

const FRAME_MS = 2100; // hold each beat long enough to read
const FIRST_MS = 700; // small beat before the loop's first frame

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup — stops the loop and removes the element.
 */
export function mountTutorial(container) {
  const el = document.createElement("div");
  el.className = "vp-demo";
  // Decorative: the sub-heading beside it carries the same rule in prose.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="vp-demo-plate">${PLATE.split("")
      .map((c) => `<span class="vp-demo-pch">${c}</span>`)
      .join('<span class="vp-demo-pch dash">·</span>')}</div>
    <div class="vp-demo-word" id="vp-demo-word"></div>
    <p class="vp-demo-caption" id="vp-demo-caption"></p>
  `;
  container.appendChild(el);

  const wordEl = el.querySelector("#vp-demo-word");
  const capEl = el.querySelector("#vp-demo-caption");

  function show(i) {
    const { word, caption } = FRAMES[i];
    const pos = new Set(matchPositions(word, PLATE));
    const diff = word.length - PAR;
    const rel = diff === 0 ? "par" : `+${diff}`;
    wordEl.innerHTML =
      word
        .split("")
        .map((c, k) => `<span class="vp-demo-tile ${pos.has(k) ? "p" : "x"}">${c}</span>`)
        .join("") +
      `<span class="vp-demo-badge ${diff === 0 ? "is-par" : ""}">${word.length}·${rel}</span>`;
    capEl.innerHTML = caption;
  }

  const timers = new Set();
  let stopped = false;
  const after = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  };

  if (prefersReducedMotion()) {
    show(FRAMES.length - 1); // the par frame — the destination, held still
  } else {
    let i = 0;
    show(0);
    const step = () => {
      i = (i + 1) % FRAMES.length;
      el.classList.remove("vp-demo-flip");
      // reflow to restart the flip transition
      void el.offsetWidth;
      el.classList.add("vp-demo-flip");
      show(i);
      after(FRAME_MS, step);
    };
    after(FIRST_MS + FRAME_MS, step);
  }

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    el.remove();
  };
}
