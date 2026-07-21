// Board geometry, and the three difficulty modes built on it.
//
// A board is an N-gon with L letters along each edge, adjacent edges SHARING
// their corner letter. An N-gon therefore holds N*(L-1) cells, not N*L, and
// rotating one edge drags two neighbours' corners with it — the coupling that
// makes this a puzzle rather than N independent dials.
//
// ── cell numbering ─────────────────────────────────────────────────────────
// Cells 0..N-1 are the vertices, clockwise from `offset`. After them come each
// edge's interior cells, edge by edge: edge k owns the (L-2) cells starting at
// N + (L-2)*k, running from vertex k toward vertex k+1.
//
// ── reading direction ──────────────────────────────────────────────────────
// Letters always stay upright, and each edge is read in whichever direction
// keeps the word readable — left-to-right, or top-to-bottom on a steep edge,
// never right-to-left. That is `reversed`: true where the word runs against
// the clockwise walk.
//
// The cost is that corners take mixed roles. On a square the top-left corner
// begins BOTH the top and left words, while the bottom-right ENDS both the
// right and bottom words. A uniform clockwise cycle would make every corner an
// end-meets-start join, but half the words would render backwards — a bad
// trade in a game about recognising words quickly.

const TAU = Math.PI * 2;

const SHAPE_DEFS = {
  triangle: {
    id: "triangle",
    label: "Triangle",
    sides: 3,
    offset: 0, // apex up
    reversed: [false, true, true],
    sideNames: ["Right", "Base", "Left"],
  },
  square: {
    id: "square",
    label: "Square",
    sides: 4,
    // -45 degrees puts a vertex at each corner, so the board is axis-aligned
    // rather than standing on a point.
    offset: -TAU / 8,
    reversed: [false, false, true, true],
    sideNames: ["Top", "Right", "Bottom", "Left"],
  },
  pentagon: {
    id: "pentagon",
    label: "Pentagon",
    sides: 5,
    offset: 0, // vertex up
    reversed: [false, false, true, true, false],
    sideNames: ["Upper right", "Right", "Base", "Lower left", "Upper left"],
  },
};

/**
 * The difficulty ladder, chosen from exhaustive measurement rather than feel.
 * `depth` is the average shortest distance to any solution across every
 * reachable state; `dark` is the share of states where no unsolved side reads
 * a word — time spent with no feedback at all.
 *
 *   easy    square/3   depth 3.65   dark 47.8%
 *   medium  square/4   depth 6.51   dark 85.5%
 *   hard    pentagon/4 depth   ~9   dark    ~86%
 *
 * Easy and Medium share a shape deliberately: the step up is pure depth on a
 * board the player already understands. Word length is the axis only up to
 * four letters — five-letter sides measured 97.8% dark, which is past the
 * point where the game stops giving the player anything to reason about.
 */
export const MODES = [
  {
    id: "easy",
    label: "Easy",
    blurb: "Four three-letter words. Well lit, and shallow.",
    shape: "square",
    sideLen: 3,
    scramble: 5,
  },
  {
    id: "medium",
    label: "Medium",
    blurb: "Four four-letter words. The full square.",
    shape: "square",
    sideLen: 4,
    scramble: 7,
  },
  {
    id: "hard",
    label: "Hard",
    blurb: "Five four-letter words. One more side to fight you.",
    shape: "pentagon",
    sideLen: 4,
    scramble: 9,
  },
];

export const MODE_ORDER = MODES.map((m) => m.id);
export const getMode = (id) => MODES.find((m) => m.id === id) ?? MODES[1];

const vertexCell = (k, n) => ((k % n) + n) % n;
const interiorCells = (k, n, len) =>
  Array.from({ length: len - 2 }, (_, j) => n + (len - 2) * k + j);

function build(def, len) {
  const n = def.sides;
  const cellCount = n * (len - 1);

  // Vertices on a unit circle, clockwise, y growing downward as screens do.
  const verts = [];
  for (let k = 0; k < n; k++) {
    const theta = def.offset + (k * TAU) / n;
    verts.push({ x: Math.sin(theta), y: -Math.cos(theta) });
  }

  const positions = new Array(cellCount);
  verts.forEach((v, k) => { positions[vertexCell(k, n)] = { ...v }; });
  for (let k = 0; k < n; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % n];
    interiorCells(k, n, len).forEach((cell, j) => {
      const t = (j + 1) / (len - 1);
      positions[cell] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });
  }

  // Fit the shape to its box. The vertices sit on a unit circle, which
  // inscribes the CORNERS rather than the outline — a square would otherwise
  // fill only 71% of its width. Rescale uniformly; never stretch, since a
  // stretched triangle is a different shape.
  {
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(
      (Math.max(...xs) - Math.min(...xs)) / 2,
      (Math.max(...ys) - Math.min(...ys)) / 2,
    ) || 1;
    positions.forEach((p) => {
      p.x = (p.x - cx) / half;
      p.y = (p.y - cy) / half;
    });
  }

  const sides = [];
  for (let k = 0; k < n; k++) {
    const walk = [vertexCell(k, n), ...interiorCells(k, n, len), vertexCell(k + 1, n)];
    const slots = def.reversed[k] ? [...walk].reverse() : walk;

    const from = positions[slots[0]];
    const to = positions[slots[slots.length - 1]];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const mag = Math.hypot(dx, dy) || 1;
    // Unit vector along the reading direction. A drag is projected onto this,
    // which is what lets one gesture handler serve every edge at any angle.
    const dir = { x: dx / mag, y: dy / mag };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const nmag = Math.hypot(mid.x, mid.y) || 1;
    // Outward normal, for hanging controls off an edge without covering it.
    const normal = { x: mid.x / nmag, y: mid.y / nmag };

    sides.push({ index: k, label: def.sideNames[k], slots, dir, normal, mid });
  }

  const sideOf = {};
  sides.forEach((side, i) => side.slots.forEach((slot) => { (sideOf[slot] ||= []).push(i); }));

  // Corner constraints as the generator needs them: pairs of
  // (side, position-in-word) that must hold the same letter.
  const joins = [];
  for (let k = 0; k < n; k++) {
    const cell = vertexCell(k, n);
    const [a, b] = sideOf[cell];
    joins.push([
      { side: a, pos: sides[a].slots.indexOf(cell) },
      { side: b, pos: sides[b].slots.indexOf(cell) },
    ]);
  }

  // Closest approach between any two cells, in unit coordinates. Tile size is
  // derived from this rather than from a grid assumption, so a 3-letter square
  // gets fat tiles and a pentagon's tighter packing gets smaller ones —
  // without either shape ever overlapping itself.
  let minSpacing = Infinity;
  for (let a = 0; a < cellCount; a++) {
    for (let b = a + 1; b < cellCount; b++) {
      const d = Math.hypot(positions[a].x - positions[b].x, positions[a].y - positions[b].y);
      if (d < minSpacing) minSpacing = d;
    }
  }

  return {
    shape: def.id, label: def.label, n, sideLen: len, cellCount,
    positions, sides, sideOf, joins, minSpacing,
  };
}

const cache = new Map();

/** Geometry for a shape at a given side length. Cached; treat as immutable. */
export function getBoard(shapeId, sideLen) {
  const key = `${shapeId}/${sideLen}`;
  if (!cache.has(key)) {
    const def = SHAPE_DEFS[shapeId];
    if (!def) throw new Error(`unknown shape "${shapeId}"`);
    cache.set(key, build(def, sideLen));
  }
  return cache.get(key);
}

/** Geometry for a mode. */
export const boardFor = (mode) => getBoard(mode.shape, mode.sideLen);

/**
 * Cell positions in pixels for a board `size` px across with `cell`-px tiles.
 * Returns top-left corners, ready to hand to a translate().
 */
export function layout(board, size, cell) {
  const r = (size - cell) / 2;
  return board.positions.map((p) => ({
    x: size / 2 + p.x * r - cell / 2,
    y: size / 2 + p.y * r - cell / 2,
  }));
}

/** Centre of a cell, for placing controls relative to it. */
export function cellCentre(board, size, cell, slot) {
  const r = (size - cell) / 2;
  const p = board.positions[slot];
  return { x: size / 2 + p.x * r, y: size / 2 + p.y * r };
}
