// Animated demo shown on the difficulty picker.
//
// One idea, three beats: two words appear, one is real, and the fake is always
// a near-miss of the real spelling rather than gibberish. Each frame holds the
// pair unanswered for a moment BEFORE revealing — the pause is the point, since
// it lets you play along, and playing along is what teaches the game. The
// scoring lands on the reveal as a +1 / −3s chip, so the stakes are shown
// rather than described.
//
// Rules-accurate on purpose: every fake here is a real output of the game's own
// fakeCandidates(), one per transformation type the generator can produce —
// degeminate, vowel-swap, geminate. The e2e test re-derives them from the live
// dictionary, so a demo pair the board would never serve fails the build. That
// guard has already earned its keep: "calender" looks like the obvious fake for
// "calendar" and is in fact a real word (a machine that presses cloth).
//
// The real word alternates sides so the demo never teaches "the answer is on
// the left".

/**
 * @type {Array<{real: string, fake: string, type: string, realLeft: boolean, caption: string}>}
 */
export const FRAMES = [
  {
    real: "balloon",
    fake: "baloon",
    type: "degeminate",
    realLeft: true,
    caption: "One word is real. One is a <b>near-miss</b> of it.",
  },
  {
    real: "separate",
    fake: "seperate",
    type: "vowel-swap",
    realLeft: false,
    caption: "The fakes are the misspellings you'd <b>actually make</b>.",
  },
  {
    real: "necessary",
    fake: "neccessary",
    type: "geminate",
    realLeft: true,
    caption: "Right: <b>+1</b>. Wrong: <b>3 seconds</b> off a clock that never stops.",
  },
];

const ASK_MS = 1150;    // both words up, unanswered — your turn to spot it
const REVEAL_MS = 1600; // answer showing, long enough to register
const FIRST_MS = 500;   // small beat before the first frame asks

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
  el.className = "aaw-demo";
  // Decorative: the lede above and the rules below carry the same information
  // in prose, so there is nothing here a screen reader needs to chase.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="aaw-demo-pair">
      <div class="aaw-demo-choice" data-slot="0">
        <span class="aaw-demo-word"></span>
        <span class="aaw-demo-chip"></span>
      </div>
      <div class="aaw-demo-choice" data-slot="1">
        <span class="aaw-demo-word"></span>
        <span class="aaw-demo-chip"></span>
      </div>
    </div>
    <p class="aaw-demo-caption"></p>
  `;
  container.appendChild(el);

  const slots = [...el.querySelectorAll(".aaw-demo-choice")];
  const capEl = el.querySelector(".aaw-demo-caption");

  /** Paint frame `i`; `revealed` decides whether the answer is showing. */
  function show(i, revealed) {
    const f = FRAMES[i];
    const words = f.realLeft ? [f.real, f.fake] : [f.fake, f.real];

    slots.forEach((slot, k) => {
      const isReal = words[k] === f.real;
      const word = slot.querySelector(".aaw-demo-word");
      word.textContent = words[k];
      // Same auto-fit lever the board uses: size the word against its own tile
      // so a 10-letter fake doesn't overflow the box a 7-letter one fits.
      word.style.setProperty("--len", String(words[k].length));
      slot.classList.toggle("is-real", revealed && isReal);
      slot.classList.toggle("is-fake", revealed && !isReal);
      slot.querySelector(".aaw-demo-chip").textContent =
        revealed ? (isReal ? "+1" : "−3s") : "";
    });

    el.classList.toggle("is-revealed", revealed);
    capEl.innerHTML = f.caption;
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
    // The last frame, already answered — the destination, held still. It is the
    // one that states the scoring, so a static viewer still gets the stakes.
    show(FRAMES.length - 1, true);
  } else {
    let i = 0;
    show(0, false);
    const reveal = () => {
      show(i, true);
      after(REVEAL_MS, ask);
    };
    const ask = () => {
      i = (i + 1) % FRAMES.length;
      show(i, false);
      after(ASK_MS, reveal);
    };
    after(FIRST_MS + ASK_MS, reveal);
  }

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    el.remove();
  };
}
