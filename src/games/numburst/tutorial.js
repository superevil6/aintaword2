// Animated demo shown on the difficulty picker.
//
// A hand-placed diamond of four orbs, detonated once and looped. It is SCRIPTED,
// not simulated: the same four orbs and the same cascade every time, so the one
// idea the game lives or dies on is unmissable — a burst sets off the next, and
// each wave outward is worth MORE.
//
//        A(3)              bomb a 3 with a 3 → it empties and bursts
//      B(2) C(2)           the burst hits these for 2 (one less than 3) → ×2
//        D(2)              their bursts finish this one → ×3
//
// Scores 3, then +8 (two 2s at ×2), then +6 (one 2 at ×3) = 17. The running
// total climbing far past four dead 2s is the whole lesson: the long way round
// pays.
//
// Rules-accurate on purpose. A demo that cheated the numbers would teach a
// chain that the real board cannot produce.

const HUE_COOL = 210, HUE_HOT = 25, HUE_MIN = 2, HUE_MAX = 9;
const hue = (v) =>
  Math.round(HUE_COOL + (HUE_HOT - HUE_COOL) * Math.min(1, Math.max(0, (v - HUE_MIN) / (HUE_MAX - HUE_MIN))));

// Four orbs, positioned as percentages of the square demo field. `d` is the
// diameter (also a percentage) — bigger number, bigger orb, same as the board.
const ORBS = [
  { id: "A", x: 50, y: 24, v: 3, d: 30 },
  { id: "B", x: 33, y: 52, v: 2, d: 22 },
  { id: "C", x: 67, y: 52, v: 2, d: 22 },
  { id: "D", x: 50, y: 76, v: 2, d: 22 },
];

// The cascade, wave by wave. Each hit is [from, to] — an arrow and a -amount.
const WAVES = [
  { mult: 1, hits: [[null, "A"]], amount: 3, dead: ["A"], gained: 3 },   // the bomb
  { mult: 2, hits: [["A", "B"], ["A", "C"]], amount: 2, dead: ["B", "C"], gained: 8 },
  { mult: 3, hits: [["B", "D"], ["C", "D"]], amount: 1, dead: ["D"], gained: 6 },
];

const CAPTIONS = [
  "A 3-bomb empties this 3 — and it bursts.",
  "A burst hits what it touches for one less. These twos pop. ×2.",
  "Their bursts set off the next. ×3 — the long chain pays.",
];

const LAND_MS = 900;   // beat before the bomb lands
const WAVE_MS = 1100;  // between waves, so each is read
const HOLD_MS = 2200;  // pause on the finished total before looping

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
  el.className = "nb-demo";
  // Decorative: the written rules beside it carry the same information, and a
  // looping animation is not something to narrate to a screen reader.
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="nb-demo-field">
      ${ORBS.map((o) => `
        <div class="nb-demo-orb" data-orb="${o.id}" style="
          --nb-hue:${hue(o.v)};
          width:${o.d}%; height:${o.d}%;
          left:${o.x}%; top:${o.y}%;
        "><span>${o.v}</span></div>
      `).join("")}
    </div>
    <p class="nb-demo-score"><span class="nb-demo-pts">0</span></p>
    <p class="nb-demo-caption"></p>
  `;
  container.appendChild(el);

  const orbEl = (id) => el.querySelector(`[data-orb="${id}"]`);
  const field = el.querySelector(".nb-demo-field");
  const ptsEl = el.querySelector(".nb-demo-pts");
  const capEl = el.querySelector(".nb-demo-caption");

  const timers = new Set();
  let stopped = false;
  const after = (ms, fn) => {
    const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms);
    timers.add(t);
  };

  function reset() {
    for (const o of ORBS) {
      const e = orbEl(o.id);
      e.classList.remove("is-dead", "is-bursting");
      e.querySelector("span").textContent = String(o.v);
    }
    for (const fx of field.querySelectorAll(".nb-demo-arrow, .nb-demo-float, .nb-combo")) fx.remove();
    ptsEl.textContent = "0";
    capEl.textContent = "";
  }

  function drawArrow(from, to) {
    const a = ORBS.find((o) => o.id === from);
    const b = ORBS.find((o) => o.id === to);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    line.setAttribute("class", "nb-demo-arrow");
    // viewBox is the field's own 0–100 percentage space, so the endpoints are
    // just the orb coordinates with no conversion.
    line.setAttribute("viewBox", "0 0 100 100");
    line.innerHTML = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="#fff" stroke-width="1.4" stroke-linecap="round" pathLength="1" />`;
    field.appendChild(line);
    after(620, () => line.remove());
  }

  function floatDamage(id, amount) {
    const o = ORBS.find((x) => x.id === id);
    const tag = document.createElement("div");
    tag.className = "nb-demo-float";
    tag.textContent = `-${amount}`;
    tag.style.left = `${o.x}%`;
    tag.style.top = `${o.y}%`;
    field.appendChild(tag);
    after(760, () => tag.remove());
  }

  function combo(mult, gained) {
    const alive = WAVES.find((w) => w.mult === mult).dead.map((id) => ORBS.find((o) => o.id === id));
    const cx = alive.reduce((s, o) => s + o.x, 0) / alive.length;
    const cy = alive.reduce((s, o) => s + o.y, 0) / alive.length;
    const tag = document.createElement("div");
    tag.className = "nb-combo";
    tag.innerHTML = `<span class="nb-combo-x">&times;${mult}</span><span class="nb-combo-pts">+${gained}</span>`;
    tag.style.left = `${cx}%`;
    tag.style.top = `${cy}%`;
    field.appendChild(tag);
    after(900, () => tag.remove());
  }

  function play() {
    reset();
    let score = 0;

    after(LAND_MS, () => runWave(0, score));

    function runWave(i, running) {
      if (stopped || i >= WAVES.length) {
        after(HOLD_MS, play); // loop
        return;
      }
      const w = WAVES[i];
      capEl.textContent = CAPTIONS[i];

      for (const [from, to] of w.hits) {
        if (from != null) drawArrow(from, to);
        floatDamage(to, w.amount);
      }
      for (const id of w.dead) {
        const e = orbEl(id);
        e.querySelector("span").textContent = "0";
        e.classList.add("is-bursting");
        after(240, () => e.classList.add("is-dead"));
      }
      if (w.mult > 1) combo(w.mult, w.gained);

      running += w.gained;
      ptsEl.textContent = String(running);

      after(WAVE_MS, () => runWave(i + 1, running));
    }
  }

  if (prefersReducedMotion()) {
    // Show the finished total, no motion.
    for (const w of WAVES) for (const id of w.dead) orbEl(id).classList.add("is-dead");
    ptsEl.textContent = "17";
    capEl.textContent = CAPTIONS[CAPTIONS.length - 1];
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
