// Animated demo shown on the difficulty picker.
//
// Four circles in a row, walked left to right by three presses. It teaches the
// two things prose is worst at: that a primary is a TOGGLE (the same blue
// button adds on the way out and removes on the way back), and that your whole
// trail takes your current colour as you move.
//
// The row is White → Blue → Green → Yellow, which is exactly the colour the
// player holds after 0, 1, 2 and 3 presses — so one array describes both the
// circles and the walk.

import { WHITE, BLUE, GREEN, YELLOW, COLOR_HEX, PRIMARIES, primaryAdds } from "./colors.js";

const NODES = [WHITE, BLUE, GREEN, YELLOW];

const STEPS = [
  { bit: 4 }, // + blue    white (000) -> blue   (100)
  { bit: 2 }, // + yellow  blue  (100) -> green  (110)
  { bit: 4 }, // - blue    green (110) -> yellow (010)
];

const CAPTIONS = [
  "You start on white — none of the primaries.",
  "Add blue. You step across, and your trail takes your colour.",
  "Add yellow. Blue and yellow make green.",
  "Remove blue. Green without blue leaves yellow.",
];

const READ_MS  = 950;  // time to take in a step before the next press
const PRESS_MS = 430;  // button held down before the move resolves
const HOLD_MS  = 1900; // pause on the finished row before looping

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
  el.className = "cp-demo";
  // Decorative: the written rules beside it carry the same information, and a
  // looping animation is not something to announce to a screen reader.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="cp-demo-row">
      ${NODES.map((_, i) => {
        // The last circle wears the real board's target treatment, so the walk
        // reads as "get to that one" rather than an abstract colour exercise.
        const isGoal = i === NODES.length - 1;
        return `<span class="cp-demo-slot">
          <span class="cp-demo-node${isGoal ? " is-goal" : ""}"></span>
          ${isGoal ? `<span class="cp-demo-goal-label">Grab me!</span>` : ""}
        </span>`;
      }).join("")}
    </div>
    <div class="cp-demo-controls">
      ${PRIMARIES.map(
        (p) => `<span class="cp-demo-btn" data-bit="${p.bit}" style="--primary-color: ${p.hex}"></span>`,
      ).join("")}
    </div>
    <p class="cp-demo-caption"></p>
  `;
  container.appendChild(el);

  const nodes   = [...el.querySelectorAll(".cp-demo-node")];
  const btns    = [...el.querySelectorAll(".cp-demo-btn")];
  const caption = el.querySelector(".cp-demo-caption");

  let timer = null;
  const after = (ms, fn) => { timer = setTimeout(fn, ms); };

  function render(step) {
    const playerColor = NODES[step];
    nodes.forEach((node, i) => {
      // Everything up to and including the player wears the player's colour;
      // circles still ahead keep their own.
      const shown = i <= step ? playerColor : NODES[i];
      node.style.setProperty("--demo-color", COLOR_HEX[shown]);
      node.classList.toggle("is-current", i === step);
      node.classList.toggle("is-trail", i < step);
    });

    for (const btn of btns) {
      const bit = Number(btn.dataset.bit);
      btn.textContent = primaryAdds(playerColor, bit) ? "+" : "−";
      btn.classList.remove("is-pressed");
    }

    caption.textContent = CAPTIONS[step];
  }

  function play(step) {
    render(step);

    if (step >= STEPS.length) {
      after(HOLD_MS, () => play(0));
      return;
    }

    after(READ_MS, () => {
      const { bit } = STEPS[step];
      btns.find((b) => Number(b.dataset.bit) === bit)?.classList.add("is-pressed");
      after(PRESS_MS, () => play(step + 1));
    });
  }

  if (prefersReducedMotion()) {
    render(0); // static first frame; the rules list explains the rest
  } else {
    play(0);
  }

  return () => {
    clearTimeout(timer);
    timer = null;
    el.remove();
  };
}
