// Sigil generator — the DOM-free core the build/verify scripts import.
//
// A sigil is a small abstract mark: strokes laid on a 3×4 lattice. They are
// GENERATED rather than taken from a symbol font for three reasons:
//
//   1. Licensing. Wingdings and friends are proprietary; their EULAs forbid
//      redistribution and webfont embedding.
//   2. The mechanic needs marks that are confusable in FRAGMENTS but distinct
//      as wholes. Pictographic dingbats fail at this — a single wedge showing a
//      wing and a tail fin reads as "airplane" instantly, because the player
//      recognises the referent rather than the shape. Abstract marks have no
//      referent to shortcut to.
//   3. Symmetry becomes a tunable difficulty parameter rather than an accident
//      of whichever glyphs a font happens to contain.
//
// Everything here is deterministic in its seed, so a day's sigils regenerate
// identically on any machine.

import { Rng } from "../../core/rng.js";

// ── lattice ─────────────────────────────────────────────────────────────────
// 3 columns × 4 rows gives a rune-ish aspect ratio. Node index is col*4 + row,
// which is what the compact wire encoding below writes.
export const COLS = [-1, 0, 1];
export const ROWS = [-1.5, -0.5, 0.5, 1.5];

export const NODES = COLS.flatMap((x) => ROWS.map((y) => ({ x, y })));

const nodeIndex = (x, y) => COLS.indexOf(x) * ROWS.length + ROWS.indexOf(y);
const key = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;

// Segments longer than this read as spidery rather than rune-like.
const MAX_SEG = 2.35;
const BOW = 0.55;

function nodesFor(filter) {
  return NODES.filter((n) => !filter || filter(n.x, n.y));
}

/**
 * Every stroke available on a region of the lattice: capped-length segments,
 * bowed curves in both directions, dots and rings on each node.
 */
function buildPool(filter) {
  const nodes = nodesFor(filter);
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > MAX_SEG) continue;
      out.push({ type: "line", a, b, len: d });
      if (d >= 0.9 && d <= 2.1) {
        out.push({ type: "curve", a, b, bow: BOW, len: d * 1.15 });
        out.push({ type: "curve", a, b, bow: -BOW, len: d * 1.15 });
      }
    }
  }
  for (const n of nodes) {
    out.push({ type: "dot", a: n, b: n, r: 0.15, len: 0.5 });
    out.push({ type: "ring", a: n, b: n, r: 0.38, len: 2.4 });
  }
  return out;
}

// A curve lying ON the mirror axis bows to one side, so its reflection bows the
// other — it is NOT self-symmetric, and including one silently breaks the whole
// mirror tier. Straight segments, dots and rings on the axis map to themselves.
const axisCurve = (s) => s.type === "curve" && s.a.x === 0 && s.b.x === 0;

const POOL_FULL = buildPool(null);
const POOL_MIRROR = buildPool((x) => x >= 0).filter((s) => !axisCurve(s));
const POOL_AXIS = buildPool((x) => x === 0).filter((s) => !axisCurve(s));

// ── geometry ────────────────────────────────────────────────────────────────

export const ends = (s) => (s.type === "dot" || s.type === "ring" ? [s.a] : [s.a, s.b]);

export const sameStroke = (p, q) =>
  p.type === q.type &&
  ((key(p.a.x, p.a.y) === key(q.a.x, q.a.y) && key(p.b.x, p.b.y) === key(q.b.x, q.b.y)) ||
   (key(p.a.x, p.a.y) === key(q.b.x, q.b.y) && key(p.b.x, p.b.y) === key(q.a.x, q.a.y))) &&
  (p.bow || 0) === (q.bow || 0);

const strokeKey = (s) => `${s.type}${key(s.a.x, s.a.y)}${key(s.b.x, s.b.y)}${s.bow || 0}`;

/** Canonical identity of a sigil, independent of stroke order. */
export const sigilKey = (g) => g.map(strokeKey).sort().join("|");

const nodesOf = (strokes) => {
  const set = new Set();
  for (const s of strokes) for (const e of ends(s)) set.add(key(e.x, e.y));
  return set;
};
const touches = (stroke, nodeSet) => ends(stroke).some((n) => nodeSet.has(key(n.x, n.y)));

export const inkOf = (strokes) => strokes.reduce((t, s) => t + s.len, 0);

function bbox(strokes) {
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const s of strokes) {
    for (const n of ends(s)) {
      const pad = s.type === "ring" ? s.r : 0;
      x0 = Math.min(x0, n.x - pad); x1 = Math.max(x1, n.x + pad);
      y0 = Math.min(y0, n.y - pad); y1 = Math.max(y1, n.y + pad);
    }
  }
  return { w: x1 - x0, h: y1 - y0 };
}

/**
 * Growth guarantees connectivity, but a mutation that drops a middle stroke can
 * sever the figure — and disconnected debris is an obvious tell in a decoy grid.
 */
export function connected(strokes) {
  const par = {};
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const s of strokes) {
    const e = ends(s).map((n) => key(n.x, n.y));
    for (const k of e) if (!(k in par)) par[k] = k;
    for (let i = 1; i < e.length; i++) par[find(e[0])] = find(e[i]);
  }
  return new Set(Object.keys(par).map(find)).size <= 1;
}

export const mirrorX = (s) => ({
  ...s,
  a: { x: -s.a.x, y: s.a.y },
  b: { x: -s.b.x, y: s.b.y },
  bow: s.bow != null ? -s.bow : undefined,
});
const rot180 = (s) => ({ ...s, a: { x: -s.a.x, y: -s.a.y }, b: { x: -s.b.x, y: -s.b.y } });
const onAxisX = (s) => ends(s).every((n) => n.x === 0);

/** Fraction of strokes that have a mirror partner: 1 means truly symmetric. */
export function mirrorScore(g) {
  const m = g.map(mirrorX);
  return g.filter((s) => m.some((q) => sameStroke(s, q))).length / g.length;
}

/**
 * Quality gates. Together these hold ink mass, footprint and connectedness
 * roughly constant across the whole generated set, so one day's sigil is not
 * visibly denser or sparser than another's.
 */
export function acceptable(strokes, sym) {
  if (!strokes || !strokes.length) return false;
  const m = strokes.length;
  const ink = inkOf(strokes);
  // The band scales with the ACTUAL stroke count. A fixed ceiling rejected
  // nearly every 7-stroke figure; keying it to the REQUESTED count instead
  // broke the symmetric modes, whose mirroring changes the real total.
  if (ink < Math.max(2.6, 0.78 * m) || ink > 1.6 * m) return false;
  const bb = bbox(strokes);
  if (bb.h < 1.8 || bb.w < 1.2) return false;
  if (!connected(strokes)) return false;
  // An "asymmetric" sigil that happens to be symmetric would resolve cleanly
  // under the sweep and quietly leak out of the hard tier.
  if (sym === "none" && mirrorScore(strokes) > 0.6) return false;
  return true;
}

// ── growth ──────────────────────────────────────────────────────────────────

/**
 * Seed with a real segment, then only ever add strokes sharing an endpoint with
 * what is already there — connectivity by construction.
 */
function grow(rng, pool, n) {
  const seeds = pool.filter((s) => s.type === "line" && s.len >= 1);
  if (!seeds.length) return null;
  const chosen = [seeds[rng.int(0, seeds.length - 1)]];
  const nodeSet = nodesOf(chosen);
  let rings = 0, dots = 0;
  while (chosen.length < n) {
    const cands = pool.filter((s) => {
      if (s.type === "ring" && rings >= 1) return false;
      if (s.type === "dot" && dots >= 1) return false;
      if (chosen.some((c) => sameStroke(c, s))) return false;
      return touches(s, nodeSet);
    });
    if (!cands.length) break;
    const pick = cands[rng.int(0, cands.length - 1)];
    if (pick.type === "ring") rings++;
    if (pick.type === "dot") dots++;
    chosen.push(pick);
    for (const e of ends(pick)) nodeSet.add(key(e.x, e.y));
  }
  return chosen.length === n ? chosen : null;
}

/**
 * A stroke sitting on the mirror axis maps to itself, so it preserves symmetry
 * while breaking the strict even-stroke parity that mirroring would otherwise
 * force. Without it, odd and even stroke counts collapse into the same figures.
 */
function addAxisStroke(strokes, rng) {
  const nodeSet = nodesOf(strokes);
  const cands = POOL_AXIS.filter(
    (s) => touches(s, nodeSet) && !strokes.some((c) => sameStroke(c, s)));
  if (!cands.length) return null;
  return [...strokes, cands[rng.int(0, cands.length - 1)]];
}

export const SYMMETRIES = ["mirror", "none", "rot180"];

/**
 * One sigil, deterministic in (seed, n, sym).
 *
 * @param {string|number} seed
 * @param {number} n    exact stroke count
 * @param {"mirror"|"none"|"rot180"} sym
 * @returns {object[]|null} strokes, or null if no figure met the gates
 */
export function makeSigil(seed, n, sym) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = new Rng(`sigil:${sym}:${n}:${seed}:${attempt}`);
    let strokes = null;

    if (sym === "mirror") {
      const half = grow(rng, POOL_MIRROR, Math.max(2, Math.floor(n / 2)));
      if (half) {
        strokes = [...half];
        for (const s of half) if (!onAxisX(s)) strokes.push(mirrorX(s));
        if (n % 2 === 1) strokes = addAxisStroke(strokes, rng) || strokes;
      }
    } else if (sym === "rot180") {
      const half = grow(rng, buildPoolTop(), Math.max(2, Math.floor(n / 2)));
      if (half) {
        strokes = [...half];
        for (const s of half) strokes.push(rot180(s));
        // A segment from P to −P is invariant under 180° rotation, so it joins
        // the two halves without breaking the symmetry.
        const p = half[0].a;
        if (p.x || p.y) {
          strokes.push({
            type: "line",
            a: { x: p.x, y: p.y },
            b: { x: -p.x, y: -p.y },
            len: 2 * Math.hypot(p.x, p.y),
          });
        }
      }
    } else {
      strokes = grow(rng, POOL_FULL, n);
    }

    // Exact stroke count matters for a DAILY. Mirroring does not always double
    // cleanly (axis strokes map to themselves), so asking for 7 was yielding
    // 5, 6 or 7 depending on the seed — i.e. some days quietly much easier.
    if (strokes && strokes.length === n && acceptable(strokes, sym)) return strokes;
  }
  return null;
}

let _poolTop = null;
// Rotational symmetry of S ∪ rot180(S) holds for ANY generating set, so this
// region is chosen purely for density — the strict top half starved the mode.
function buildPoolTop() {
  _poolTop ||= buildPool((x, y) => y < 0.9);
  return _poolTop;
}

// ── decoys ──────────────────────────────────────────────────────────────────

/**
 * Decoys MUST share the answer's symmetry class. Mutating one stroke of a
 * mirrored figure breaks its symmetry, which would make the answer the only
 * symmetric option on the board — solvable without ever watching the sweep.
 *
 * @returns {object[][]} up to `count` sigils, each one stroke from the answer
 */
export function decoysFor(answer, seed, count, sym, n) {
  if (sym === "mirror") return mutateHalf(answer, seed, count);
  if (sym === "rot180") return siblings(answer, seed, count, sym, n);
  return mutateFull(answer, seed, count);
}

function mutateFull(base, seed, count) {
  const rng = new Rng(`sigil:decoy:${seed}`);
  const out = [], seen = new Set([sigilKey(base)]);
  for (const i of rng.shuffle(base.map((_, j) => j))) {
    const stem = base.filter((_, j) => j !== i);
    const nodeSet = nodesOf(stem);
    const cands = rng.shuffle(POOL_FULL.filter(
      (s) => touches(s, nodeSet) && !base.some((c) => sameStroke(c, s))));
    for (const pick of cands) {
      const cand = [...stem, pick];
      const k = sigilKey(cand);
      if (seen.has(k) || !acceptable(cand, "none")) continue;
      seen.add(k);
      out.push(cand);
      if (out.length >= count) return out;
    }
  }
  return out;
}

function mutateHalf(base, seed, count) {
  // The generating half is recoverable: it is exactly the strokes in x >= 0.
  const half = base.filter((s) => ends(s).every((n) => n.x >= 0));
  if (half.length < 2) return [];
  const rng = new Rng(`sigil:decoy:${seed}`);
  const out = [], seen = new Set([sigilKey(base)]);
  const remirror = (h) => {
    const full = [...h];
    for (const s of h) if (!onAxisX(s)) full.push(mirrorX(s));
    return full;
  };
  for (const i of rng.shuffle(half.map((_, j) => j))) {
    const stem = half.filter((_, j) => j !== i);
    const nodeSet = nodesOf(stem);
    const cands = rng.shuffle(POOL_MIRROR.filter(
      (s) => touches(s, nodeSet) && !half.some((c) => sameStroke(c, s))));
    for (const pick of cands) {
      const cand = remirror([...stem, pick]);
      const k = sigilKey(cand);
      if (seen.has(k) || cand.length !== base.length || !acceptable(cand, "mirror")) continue;
      seen.add(k);
      out.push(cand);
      if (out.length >= count) return out;
    }
  }
  return out;
}

/** Fallback for classes with no clean one-stroke mutation: whole siblings. */
function siblings(base, seed, count, sym, n) {
  const out = [], seen = new Set([sigilKey(base)]);
  for (let k = 1; k < 600 && out.length < count; k++) {
    const g = makeSigil(`${seed}:sib:${k}`, n, sym);
    if (!g) continue;
    const sk = sigilKey(g);
    if (seen.has(sk)) continue;
    seen.add(sk);
    out.push(g);
  }
  return out;
}

// ── compact wire format ─────────────────────────────────────────────────────
// A day's file holds the sigils themselves, not just a seed, so what ships IS
// the puzzle. Full JSON geometry would run ~38 KB/day; this encoding keeps a
// day near 2 KB, in line with the other games' daily files.
//
//   line   L<a><b>      curve  C<a><b> (bow +) / c<a><b> (bow −)
//   dot    D<a>         ring   R<a>
//
// where <a>/<b> are base-36 lattice node indices (0–b).

const enc = (n) => nodeIndex(n.x, n.y).toString(36);
const dec = (ch) => NODES[parseInt(ch, 36)];

export function encodeSigil(strokes) {
  return strokes.map((s) => {
    if (s.type === "line") return `L${enc(s.a)}${enc(s.b)}`;
    if (s.type === "curve") return `${s.bow > 0 ? "C" : "c"}${enc(s.a)}${enc(s.b)}`;
    if (s.type === "dot") return `D${enc(s.a)}`;
    return `R${enc(s.a)}`;
  }).join("");
}

export function decodeSigil(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const t = str[i];
    if (t === "L" || t === "C" || t === "c") {
      const a = dec(str[i + 1]), b = dec(str[i + 2]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      out.push(t === "L"
        ? { type: "line", a, b, len: d }
        : { type: "curve", a, b, bow: t === "C" ? BOW : -BOW, len: d * 1.15 });
      i += 3;
    } else if (t === "D") {
      out.push({ type: "dot", a: dec(str[i + 1]), b: dec(str[i + 1]), r: 0.15, len: 0.5 });
      i += 2;
    } else if (t === "R") {
      out.push({ type: "ring", a: dec(str[i + 1]), b: dec(str[i + 1]), r: 0.38, len: 2.4 });
      i += 2;
    } else {
      throw new Error(`sigilsweep: bad stroke code "${t}" at ${i}`);
    }
  }
  return out;
}
