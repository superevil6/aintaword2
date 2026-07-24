// Animated demo shown on the difficulty picker.
//
// A miniature of the real board so the picker shows what the game actually is:
// a white ball is aimed at a lane, drops STRAIGHT down past two walls — taking
// Red on the left of the first, Blue on the left of the second — and lands on
// the Purple goal. White → +Red → Red → +Blue → Purple.

import { WHITE, RED, YELLOW, BLUE, PURPLE, colorName } from "./board.js";
import { PALETTE_EVENT, paintSwatch, pipsMarkup, colorHex } from "./colors.js";

// A fixed depth-2 board. Walls laid out as the game would (root centered, its
// children centered in each half). The winning lane is the far left.
const WALLS = [
  { x: 0.5,  y: 1 / 3, left: { bit: RED,  sign: 1 }, right: { bit: BLUE,   sign: 1 } },
  { x: 0.25, y: 2 / 3, left: { bit: BLUE, sign: 1 }, right: { bit: YELLOW, sign: 1 } },
  { x: 0.75, y: 2 / 3, left: { bit: RED,  sign: 1 }, right: { bit: YELLOW, sign: 1 } },
];
const GOAL = PURPLE;
const AIM_X = 0.125;          // far-left lane center
const DROP_TOP = 88;          // where the ball comes to rest (% of field)
const FRAMES = [WHITE, RED, PURPLE]; // ball color: start, past wall 1, past wall 2

const CAPTIONS = [
  "A white ball, and a goal color.",
  "Aim at the lane that will mix to the goal.",
  "It drops straight down, taking each wall's colour it passes.",
  "Red then blue — that's purple. Goal!",
];

const AIM_MS = 950, DROP_MS = 1100, HOLD_MS = 1700;

function prefersReducedMotion() {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; }
  catch { return false; }
}

function sideLabel(op, side) {
  return `<span class="cd-side cd-side-${side}">
    <span class="cd-side-sign" aria-hidden="true">+</span>
    <span class="cd-swatch cd-side-swatch" data-color="${op.bit}">${pipsMarkup(op.bit)}</span>
    <span class="cd-side-letter" aria-hidden="true">${colorName(op.bit)[0]}</span>
  </span>`;
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup
 */
export function mountTutorial(container) {
  const el = document.createElement("div");
  el.className = "cd-demo";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="cd-demo-field">
      ${WALLS.map((w) => `
        <span class="cd-wall-line" style="left:${w.x * 100}%;top:${w.y * 100}%;height:${(1 - w.y) * 100}%"></span>
        <div class="cd-wall" style="left:${w.x * 100}%;top:${w.y * 100}%">
          ${sideLabel(w.left, "left")}<span class="cd-wall-gap"></span>${sideLabel(w.right, "right")}
        </div>`).join("")}
      <span class="cd-guide cd-demo-guide"></span>
      <span class="cd-ball cd-swatch cd-demo-ball" data-color="${WHITE}">${pipsMarkup(WHITE)}</span>
      <div class="cd-goalbar cd-demo-goalbar">
        <span class="cd-goalbar-label">GOAL</span>
        <span class="cd-goalbar-name">${colorName(GOAL)}</span>
      </div>
    </div>
    <p class="cd-demo-caption"></p>
  `;
  container.appendChild(el);

  const field   = el.querySelector(".cd-demo-field");
  const ball    = el.querySelector(".cd-demo-ball");
  const guide   = el.querySelector(".cd-demo-guide");
  const goalbar = el.querySelector(".cd-demo-goalbar");
  const caption = el.querySelector(".cd-demo-caption");

  const paintAll = () => {
    for (const s of el.querySelectorAll(".cd-swatch[data-color]")) paintSwatch(s, Number(s.dataset.color));
    field.style.setProperty("--cd-goal-color", colorHex(GOAL));
  };
  paintAll();

  let timers = [];
  const after = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  const setBall = (color) => { paintSwatch(ball, color); ball.dataset.color = color; };

  function reset() {
    setBall(WHITE);
    ball.style.left = "50%";
    ball.style.top = "6%";
    guide.style.left = "50%";
    guide.style.opacity = "1";
    goalbar.classList.remove("is-hit");
    caption.textContent = CAPTIONS[0];
  }

  function run() {
    reset();
    // aim
    after(AIM_MS, () => {
      ball.style.left = `${AIM_X * 100}%`;
      guide.style.left = `${AIM_X * 100}%`;
      caption.textContent = CAPTIONS[1];
    });
    // drop
    after(AIM_MS * 2, () => {
      caption.textContent = CAPTIONS[2];
      guide.style.opacity = "0";
      ball.style.top = `${DROP_TOP}%`;
      after((1 / 3) * DROP_MS, () => setBall(FRAMES[1]));   // past wall 1 → Red
      after((2 / 3) * DROP_MS, () => setBall(FRAMES[2]));   // past wall 2 → Purple
    });
    // land
    after(AIM_MS * 2 + DROP_MS, () => {
      goalbar.classList.add("is-hit");
      caption.textContent = CAPTIONS[3];
    });
    // loop
    after(AIM_MS * 2 + DROP_MS + HOLD_MS, run);
  }

  const onPalette = () => paintAll();
  window.addEventListener(PALETTE_EVENT, onPalette);

  if (prefersReducedMotion()) {
    // Static final frame: the ball settled on the goal, mixed to purple.
    setBall(GOAL);
    ball.style.left = `${AIM_X * 100}%`;
    ball.style.top = `${DROP_TOP}%`;
    guide.style.opacity = "0";
    goalbar.classList.add("is-hit");
    caption.textContent = CAPTIONS[3];
  } else {
    run();
  }

  return () => {
    window.removeEventListener(PALETTE_EVENT, onPalette);
    clear();
    el.remove();
  };
}
