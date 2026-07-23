// Animated demo shown on the site picker.
//
// One idea, three beats, built as a little tower that grows a floor per frame:
// a floor is any real word standing on two consonant pillars and its WIDTH is
// its worth; stacking climbs higher; each storey up pays GRAVITY, so the widest
// floors belong at the base and you stop when the next floor can't beat its
// gravity. Concrete and rules-accurate: PLASTER (7) → BRIGHT (6) → DRUM (4),
// each a real word bookended by consonants, each net-positive, widths falling.
//
// Every word here is checked in the e2e test — real, consonant-bookended, and
// worth more than the gravity of its storey — so the demo can never teach a
// floor the board would reject.

import { pillarsOf, floorNet } from "./engine.js";

export const GRAVITY = 1;

// Floors bottom → top, the order they are laid. Height is the index.
export const DEMO_FLOORS = [
  { word: "PLASTER", caption: "A floor is any real word on two consonant pillars — its <b>width</b> is its worth." },
  { word: "BRIGHT", caption: "Stack another storey to climb — but each one up pays <b>gravity</b>." },
  { word: "DRUM", caption: "Widest at the base; stop when a floor won't beat its gravity. ⛏️" },
];

const FRAME_MS = 2100;
const FIRST_MS = 700;

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
  el.className = "st-demo";
  el.setAttribute("aria-hidden", "true"); // the prose beside it carries the rule
  el.innerHTML = `
    <div class="st-demo-tower" id="st-demo-tower"></div>
    <p class="st-demo-caption" id="st-demo-caption"></p>
  `;
  container.appendChild(el);

  const towerEl = el.querySelector("#st-demo-tower");
  const capEl = el.querySelector("#st-demo-caption");

  // Show the tower with the first `n` floors laid (newest on top → reverse).
  function show(n) {
    const rows = [];
    for (let h = 0; h < n; h++) {
      const { word } = DEMO_FLOORS[h];
      const p = pillarsOf(word);
      const net = floorNet(p.width, h, GRAVITY);
      const mid = word.slice(1, -1).toUpperCase();
      rows.push(`
        <div class="st-demo-floor ${h === n - 1 ? "fresh" : ""}" style="--w:${p.width}">
          <span class="st-demo-pil">${p.left.toUpperCase()}</span>
          <span class="st-demo-mid">${mid}</span>
          <span class="st-demo-pil">${p.right.toUpperCase()}</span>
          <span class="st-demo-net">+${net}</span>
        </div>`);
    }
    towerEl.innerHTML = rows.reverse().join("");
    capEl.innerHTML = DEMO_FLOORS[n - 1].caption;
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
    show(DEMO_FLOORS.length); // the finished tower, held still
  } else {
    let n = 1;
    show(1);
    const step = () => {
      n = n >= DEMO_FLOORS.length ? 1 : n + 1;
      show(n);
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
