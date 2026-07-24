// Animated demo shown on the difficulty picker.
//
// A faithful mini-simulation of the real game: a stack of rows scrolling
// CONTINUOUSLY past a central firing beam, the bottom one active. A letter is
// grabbed as it crosses the beam — then that row is consumed and the stack drops
// down, a fresh row sliding in at the top, so the next letter comes from the next
// row. It grabs S → SPARK across four rows, then cashes.
//
// The rows never pause: every row drifts left on one shared clock, and each is
// laid out (phase-locked) so its target letter reaches the beam exactly at its
// scheduled grab. Nothing marks the answer in advance — the demo shows that you
// read the scroll and time each grab. SPARK is real and every prefix is live —
// the e2e test checks that.

export const DEMO_WORD = "SPARK";

const TARGET_IDX = 3; // each row's target letter sits at this column
function row(target, letters) {
  return { target, letters, targetIdx: letters.indexOf(target) };
}
// Rows in play order: P, A, R, K spell SPARK after the ammo S; two fillers keep
// the look-ahead stack full as rows are consumed.
const DATA = [
  row("P", ["M", "B", "O", "P", "T", "E", "N", "A", "I", "S"]),
  row("A", ["R", "S", "I", "A", "L", "U", "D", "O", "T", "N"]),
  row("R", ["N", "C", "O", "R", "E", "T", "S", "I", "M", "A"]),
  row("K", ["W", "L", "A", "K", "O", "M", "E", "U", "R", "S"]),
  row("", ["T", "N", "S", "E", "R", "A", "L", "O", "C", "I"]),
  row("", ["D", "I", "O", "M", "P", "U", "C", "H", "A", "E"]),
];

const CELLD = 34;    // demo tile width (px)
const SLOT = 39;     // row height + gap — one vertical step
const REPS = 7;      // times the letter pattern repeats, so the strip fills the width
const MID_COPY = 3;  // which repeat holds the phase-locked target
const V = 42;        // scroll speed (px/s), shared by every row
const T0 = 1.0;      // first grab (s)
const DT = 1.7;      // seconds between grabs
const GRAB_CAPTION = "Grab a letter as it scrolls through the beam — then that row's gone and the next drops in.";
const CASH_CAPTION = "SPARK! Cash a real word before a row kills it. 🎯";

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
  el.className = "ls-demo";
  el.setAttribute("aria-hidden", "true"); // the prose beside it carries the rule
  el.innerHTML = `
    <div class="ls-demo-stage" id="ls-demo-stage">
      <div class="ls-demo-track" id="ls-demo-track"></div>
      <div class="ls-demo-beam"></div>
    </div>
    <div class="ls-demo-hud">
      <span class="ls-demo-ammo">${DEMO_WORD[0]}</span>
      <span class="ls-demo-word" id="ls-demo-word">${DEMO_WORD[0]}</span>
    </div>
    <p class="ls-demo-caption" id="ls-demo-caption"></p>`;
  container.appendChild(el);

  const stage = el.querySelector("#ls-demo-stage");
  const track = el.querySelector("#ls-demo-track");
  const wordEl = el.querySelector("#ls-demo-word");
  const capEl = el.querySelector("#ls-demo-caption");

  let rows = [];        // top → bottom; last is the active row under the beam
  let events = [];      // { t, fn } sorted by time, fired off the scroll clock
  let word = [DEMO_WORD[0]];
  let topGrabTime = 0;  // grab time assigned to the current top row
  let t0 = null;        // clock origin (first rAF timestamp)
  let raf = null;
  let restartPending = false;
  let stopped = false;
  const timers = new Set();
  const addTimer = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms); timers.add(t); };
  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers.clear(); };

  // Build a row whose target letter crosses the beam (stage centre) at `grabTime`.
  // The letters are repeated into a long strip that overflows both edges of the
  // stage at all times, so every row reads as one continuous line (no ragged
  // left/right edge as it drifts). The phase-locked target sits in a middle copy;
  // translateX(t) = phase − V·t, so at t = grabTime that cell is centred.
  function makeRow(d, grabTime) {
    const rowEl = document.createElement("div");
    rowEl.className = "ls-demo-row";
    const rtrack = document.createElement("div");
    rtrack.className = "ls-demo-rtrack";
    const strip = [];
    for (let r = 0; r < REPS; r++) strip.push(...d.letters);
    rtrack.innerHTML = strip.map((c) => `<span class="ls-demo-cell">${c}</span>`).join("");
    rowEl.appendChild(rtrack);
    const ti = d.targetIdx >= 0 ? d.targetIdx : TARGET_IDX;
    const targetAbs = MID_COPY * d.letters.length + ti; // the specific copy to grab
    const beamX = (stage.clientWidth || 300) / 2;
    const phase = beamX - (targetAbs * CELLD + CELLD / 2) + V * grabTime;
    return { el: rowEl, rtrack, data: d, targetAbs, phase };
  }
  const setActive = () => {
    for (const r of rows) r.el.classList.toggle("active", r === rows[rows.length - 1]);
  };

  function buildInitial() {
    track.style.transition = "none";
    track.style.transform = "translateY(0)";
    track.innerHTML = "";
    rows = [];
    // top → bottom = DATA[2], DATA[1], DATA[0]; grabbed bottom-first.
    [2, 1, 0].forEach((idx) => {
      const r = makeRow(DATA[idx], T0 + idx * DT);
      rows.push(r);
      track.appendChild(r.el);
    });
    topGrabTime = T0 + 2 * DT;
    setActive();
  }

  function grab(i) {
    const b = rows[rows.length - 1];
    const cell = b.rtrack.children[b.targetAbs];
    if (cell) { cell.classList.add("grabbed"); addTimer(450, () => cell.classList.remove("grabbed")); }
    word.push(DEMO_WORD[i + 1]);
    wordEl.textContent = word.join("");
  }

  // Drop a fresh row in at the top and slide the stack down one slot, clipping
  // the used row off the bottom. Horizontal scrolling keeps running throughout.
  function consume(nextData) {
    topGrabTime += DT;
    const r = makeRow(nextData, topGrabTime);
    rows.unshift(r);
    track.insertBefore(r.el, track.firstElementChild);
    track.style.transition = "none";
    track.style.transform = `translateY(${-SLOT}px)`;
    void track.offsetHeight; // reflow so the slide transition takes
    track.style.transition = "transform .5s ease";
    track.style.transform = "translateY(0)";
    addTimer(560, () => {
      const used = rows.pop();
      used.el.remove();
      track.style.transition = "none";
      track.style.transform = "translateY(0)";
      setActive();
    });
  }

  function scheduleEvents() {
    events = [];
    for (let i = 0; i < 4; i++) events.push({ t: T0 + i * DT, fn: () => grab(i) });
    for (let i = 0; i < 3; i++) events.push({ t: T0 + i * DT + 0.5, fn: () => consume(DATA[i + 3]) });
    events.push({ t: T0 + 3 * DT + 0.5, fn: () => { wordEl.classList.add("cash"); capEl.textContent = CASH_CAPTION; } });
    events.push({ t: T0 + 3 * DT + 2.6, fn: () => { restartPending = true; events = []; } });
    events.sort((a, b) => a.t - b.t);
  }

  function buildCycle() {
    clearTimers();
    word = [DEMO_WORD[0]];
    wordEl.textContent = word[0];
    wordEl.classList.remove("cash");
    capEl.textContent = GRAB_CAPTION;
    buildInitial();
    scheduleEvents();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (restartPending) { restartPending = false; buildCycle(); t0 = ts; }
    if (t0 == null) t0 = ts;
    const t = (ts - t0) / 1000;
    for (const r of rows) r.rtrack.style.transform = `translateX(${r.phase - V * t}px)`;
    while (events.length && events[0].t <= t) events.shift().fn();
  }

  if (prefersReducedMotion()) {
    buildInitial();
    // Hold a finished frame: word done, its last letter parked in the beam.
    wordEl.textContent = DEMO_WORD;
    wordEl.classList.add("cash");
    capEl.textContent = "Grab a letter from each scrolling row to build a word, then cash it. 🎯";
    const b = rows[rows.length - 1];
    const beamX = (stage.clientWidth || 300) / 2;
    b.rtrack.style.transform = `translateX(${beamX - (b.targetAbs * CELLD + CELLD / 2)}px)`;
  } else {
    buildCycle();
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
  }

  return () => {
    stopped = true;
    if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    clearTimers();
    el.remove();
  };
}
