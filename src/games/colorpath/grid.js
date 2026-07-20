// Color Path — grid model.
//
// Holds the static color layout and all mutable player state.
// No DOM access here.
//
// Rules:
//   - Any circle can only be visited once (burned when stepped on)
//   - Undo restores the previous step but the move counter never decreases
//   - Reset restores everything including the move counter

import { applyPrimary } from "./colors.js";

export class Grid {
  /**
   * @param {number}   size      - Side length of the square grid
   * @param {number[]} colors    - Flat array of size*size color values
   * @param {number[]} targets   - Cell indices the player must collect
   * @param {number[]} obstacles - Cell indices that are impassable
   */
  constructor(size, colors, targets, obstacles = []) {
    this.size    = size;
    this.colors  = colors;          // immutable layout
    this.targets = new Set(targets);// cells that must be collected
    this.obstacles = new Set(obstacles); // impassable cells

    this._init();
  }

  _init() {
    this.trail      = [0];          // ordered visited cells; trail[0] = start
    this.burned     = new Set([0]); // all visited indices (for O(1) lookup)
    this.collected  = new Set();    // subset of targets that have been visited
    this.moves      = 0;            // ratcheting counter (never decreases)
    this._undoStack = [];           // [{to, wasTarget}]
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get currentIndex() { return this.trail[this.trail.length - 1]; }
  get currentColor() { return this.colors[this.currentIndex]; }
  get isComplete()   { return this.collected.size === this.targets.size; }

  colorAt(idx)     { return this.colors[idx]; }
  isBurned(idx)    { return this.burned.has(idx); }
  isVisited(idx)   { return this.burned.has(idx); }
  isTarget(idx)    { return this.targets.has(idx); }
  isCollected(idx) { return this.collected.has(idx); }
  isObstacle(idx)  { return this.obstacles.has(idx); }
  canUndo()        { return this._undoStack.length > 0; }

  // ── Adjacency ─────────────────────────────────────────────────────────────

  neighborsOf(idx) {
    const { size } = this;
    const r = Math.floor(idx / size);
    const c = idx % size;
    const out = [];
    if (r > 0)        out.push((r - 1) * size + c);
    if (r < size - 1) out.push((r + 1) * size + c);
    if (c > 0)        out.push(r * size + (c - 1));
    if (c < size - 1) out.push(r * size + (c + 1));
    return out;
  }

  // ── Move resolution ───────────────────────────────────────────────────────

  /**
   * Adjacent unburned cells reachable by applying primaryBit from current pos.
   * Obstacles (color 7) are never reachable.
   * Empty → button disabled. One → auto-move. Two+ → player must tap one.
   */
  targetsFor(primaryBit) {
    const resultColor = applyPrimary(this.currentColor, primaryBit);
    return this.neighborsOf(this.currentIndex)
      .filter(n => this.colors[n] === resultColor && !this.burned.has(n) && !this.isObstacle(n));
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  moveForward(idx) {
    const wasTarget = this.targets.has(idx);
    this._undoStack.push({ to: idx, wasTarget });
    this.trail.push(idx);
    this.burned.add(idx);
    if (wasTarget) this.collected.add(idx);
    this.moves++;
  }

  /** Undo the last move. Move counter stays. Returns false if nothing to undo. */
  undo() {
    if (this._undoStack.length === 0) return false;
    const { to, wasTarget } = this._undoStack.pop();
    this.trail.pop();
    this.burned.delete(to);
    if (wasTarget) this.collected.delete(to);
    return true;
  }

  /** Backtrack to a specific cell in the trail. Move counter stays. */
  backtrackTo(idx) {
    const pos = this.trail.indexOf(idx);
    if (pos === -1 || pos === this.trail.length - 1) return false;
    
    // Pop moves from the trail until we reach idx
    while (this.trail.length > pos + 1) {
      const popped = this.trail.pop();
      const state = this._undoStack.pop();
      this.burned.delete(popped);
      if (state?.wasTarget) this.collected.delete(popped);
    }
    return true;
  }

  /** Full reset — restores start state including move counter. */
  reset() {
    this._init();
  }
}
