// Animated demo shown on the difficulty picker.
//
// Five tiles in an L — a row of three and a column of three, SHARING their
// corner. That is the smallest arrangement that can show the one thing prose
// keeps failing to land: the corner belongs to both words, so the two sides
// are not independent.
//
// It teaches three things in order:
//   1. rotating a side slides its letters along it, and they wrap
//   2. a side that reads a real word lights up, and can be locked
//   3. a locked side pins the shared corner, so its neighbour then turns with
//      only its free letters — which is why locking is the tool that makes the
//      game solvable rather than a convenience
//
// Point 3 is the one that matters. A player who never locks meets the full
// puzzle with no technique for holding on to progress, and the board reads as
// random. The rules text has always said so and nobody reads rules text.
//
// Cells are [corner, r1, r2, c1, c2]:
//
//     corner r1 r2      row  = corner r1 r2
//     c1                col  = corner c1 c2
//     c2
//
// ATC / AWO -> rotate row -> CAT / CWO -> lock CAT -> swap the column's two
// free letters -> COW. Every intermediate state is checked against the word
// list the game actually ships (see the demo test in e2e-wordiamond.mjs) so no
// accidental word lights up mid-lesson and teaches the wrong thing.
//
// Those words are constrained twice over: they must be FAMILIAR, since the win
// check only accepts familiar words, and no intermediate arrangement may be
// one. An earlier version used CUB, which is in the dictionary but not in the
// familiar pool — the demo would have shown a word lighting up that the real
// board refuses.

const ROW = [0, 1, 2];
const COL = [0, 3, 4];

/** Each frame is the board as the player would see it at that beat. */
export const FRAMES = [
  { cells: ["a", "t", "c", "w", "o"], locked: false },
  { cells: ["c", "a", "t", "w", "o"], locked: false },
  { cells: ["c", "a", "t", "w", "o"], locked: true },
  { cells: ["c", "a", "t", "o", "w"], locked: true },
];

export const CAPTIONS = [
  "Four words share their corner letters.",
  "Rotate a side and its letters slide along it, wrapping round the end.",
  "CAT is a real word — lock it, and the corner it shares is pinned.",
  "Now the column turns without disturbing CAT: only its free letters move.",
];

/** The motion that gets from frame n-1 to frame n, if any. */
const MOTION = [
  null,
  { slots: ROW, axis: "x" },
  null, // the lock closing is the beat; nothing slides
  { slots: [3, 4], axis: "y" }, // corner pinned, so only the two free cells
];

const READ_MS = 1500; // time to take a frame in before the next beat
const SLIDE_MS = 380; // the shift itself
const HOLD_MS = 2400; // pause on the finished L before looping

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
  el.className = "wd-demo";
  // Decorative: the rules beside it carry the same information, and a looping
  // animation is not something to announce to a screen reader.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="wd-demo-board">
      ${[0, 1, 2, 3, 4].map((i) => `<span class="wd-demo-tile" data-cell="${i}"></span>`).join("")}
      <span class="wd-demo-lock" data-el="lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/>
        <path data-el="shackle" d="M8 11V7a4 4 0 0 1 8 0"/></svg>
      </span>
    </div>
    <p class="wd-demo-caption"></p>
  `;
  container.appendChild(el);

  const tiles = [...el.querySelectorAll(".wd-demo-tile")];
  const lock = el.querySelector('[data-el="lock"]');
  const shackle = el.querySelector('[data-el="shackle"]');
  const caption = el.querySelector(".wd-demo-caption");

  let timer = null;
  const after = (ms, fn) => { timer = setTimeout(fn, ms); };

  function render(step) {
    const frame = FRAMES[step];
    tiles.forEach((tile, i) => {
      tile.textContent = frame.cells[i].toUpperCase();
      tile.style.transform = "";
      tile.style.opacity = "";
      tile.classList.remove("is-sliding");
      // A side lights up the moment it reads a word — the same signal the real
      // board gives, so the demo is not teaching a different vocabulary.
      const inRow = ROW.includes(i);
      const inCol = COL.includes(i);
      const rowWord = frame.cells[0] + frame.cells[1] + frame.cells[2] === "cat";
      const colWord = frame.cells[0] + frame.cells[3] + frame.cells[4] === "cow";
      tile.classList.toggle("is-word", (inRow && rowWord) || (inCol && colWord));
      tile.classList.toggle("is-locked", frame.locked && inRow);
    });
    lock.classList.toggle("is-on", frame.locked);
    lock.classList.toggle("is-ready", !frame.locked && step >= 1);
    // The shackle closes when the lock does — the same two icons the board uses.
    shackle.setAttribute("d", frame.locked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 8 0");
    caption.textContent = CAPTIONS[step];
  }

  /** Slide a run of tiles one cell along, then hand over to the next frame. */
  function slide(motion, next) {
    const { slots, axis } = motion;
    slots.forEach((slot, i) => {
      const tile = tiles[slot];
      tile.classList.add("is-sliding");
      tile.style.transform = axis === "x" ? "translateX(100%)" : "translateY(100%)";
      // The tile running off the end is the one arriving at the other, so it
      // fades rather than sliding through its neighbours.
      if (i === slots.length - 1) tile.style.opacity = "0";
    });
    after(SLIDE_MS, next);
  }

  function play(step) {
    render(step);

    if (step >= FRAMES.length - 1) {
      after(HOLD_MS, () => play(0));
      return;
    }

    after(READ_MS, () => {
      const motion = MOTION[step + 1];
      if (motion) slide(motion, () => play(step + 1));
      else play(step + 1);
    });
  }

  if (prefersReducedMotion()) {
    // Nothing animates, so show the finished state: both words made, the row
    // locked. The goal is legible even if the route to it is not shown.
    render(FRAMES.length - 1);
  } else {
    play(0);
  }

  return () => {
    clearTimeout(timer);
    timer = null;
    el.remove();
  };
}
