// Animated demo shown on the difficulty picker.
//
// A 3×3 square — the smallest board that has a real diagonal — filling in beat
// by beat. It teaches the one thing prose keeps failing to land: a letter you
// place is REFLECTED across the diagonal, so a row and its matching column are
// the same word, and you only ever do half the work.
//
// The square is CAT / ARE / TEE (row i == column i), chosen so every word is
// familiar and no intermediate frame spells an unintended one — the same
// discipline as Wordiamond's demo. The reflecting beat places E off the
// diagonal at (1,2) and shows its twin appear at (2,1).
//
//     C A T        given: top row + left column (they share the corner C)
//     A R E        R sits on the diagonal (its own mirror)
//     T E E        E at (1,2) reflects to (2,1)
//
// Every frame is a superset of the one before; e2e-mirrorword.mjs checks the
// final frame really is a valid symmetric square over the shipped pool.

export const DEMO_SQUARE = ["cat", "are", "tee"]; // rows == columns
export const GIVEN = [0, 1, 2, 3, 6];             // top row + left column
export const DIAGONAL = [0, 4, 8];

/** Each frame is the 3×3 board as the player would see it ("" = empty). */
export const FRAMES = [
  ["c", "a", "t", "a", "",  "",  "t", "",  ""],
  ["c", "a", "t", "a", "r", "",  "t", "",  ""],
  ["c", "a", "t", "a", "r", "e", "t", "e", ""],
  ["c", "a", "t", "a", "r", "e", "t", "e", "e"],
];

/** The mirrored pair to spotlight as it appears, per frame (or null). */
export const REFLECT = [null, null, [5, 7], null];

export const CAPTIONS = [
  "The top row is given — a mirror runs down the diagonal.",
  "Type into any cell…",
  "…and it reflects across the diagonal to its twin.",
  "Make every row a word — each column comes free.",
];

const READ_MS = 1600; // time to take a frame in before the next beat
const HOLD_MS = 2600;  // pause on the finished square before looping

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** Which rows currently read their intended word (all three cells filled). */
function wordRows(cells) {
  const out = [];
  for (let r = 0; r < 3; r++) {
    const w = cells[r * 3] + cells[r * 3 + 1] + cells[r * 3 + 2];
    if (w === DEMO_SQUARE[r]) out.push(r);
  }
  return out;
}

/**
 * Mount the demo into `container`.
 * @returns {() => void} cleanup — cancels the loop and removes the element
 */
export function mountTutorial(container) {
  const el = document.createElement("div");
  el.className = "mw-demo";
  // Decorative: the rules beside it carry the same information, and a looping
  // animation is not something to announce to a screen reader.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="mw-demo-board">
      ${Array.from({ length: 9 }, (_, i) => `<span class="mw-demo-tile" data-cell="${i}"></span>`).join("")}
    </div>
    <p class="mw-demo-caption"></p>
  `;
  container.appendChild(el);

  const tiles = [...el.querySelectorAll(".mw-demo-tile")];
  const caption = el.querySelector(".mw-demo-caption");
  tiles.forEach((t, i) => { if (DIAGONAL.includes(i)) t.classList.add("is-diag"); });

  let timer = null;
  const after = (ms, fn) => { timer = setTimeout(fn, ms); };

  function render(step) {
    const cells = FRAMES[step];
    const lit = new Set(wordRows(cells));
    const reflect = REFLECT[step];
    tiles.forEach((tile, i) => {
      tile.textContent = (cells[i] || "").toUpperCase();
      tile.classList.toggle("is-given", GIVEN.includes(i) && !!cells[i]);
      tile.classList.toggle("is-filled", !!cells[i] && !GIVEN.includes(i));
      tile.classList.toggle("is-word", lit.has(Math.floor(i / 3)) && !!cells[i]);
      tile.classList.toggle("is-reflect", !!reflect && reflect.includes(i));
    });
    caption.textContent = CAPTIONS[step];
  }

  function play(step) {
    render(step);
    if (step >= FRAMES.length - 1) { after(HOLD_MS, () => play(0)); return; }
    after(READ_MS, () => play(step + 1));
  }

  if (prefersReducedMotion()) render(FRAMES.length - 1);
  else play(0);

  return () => { clearTimeout(timer); timer = null; el.remove(); };
}
