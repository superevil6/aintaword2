// Vanity Plate — pure rules, no DOM, no data files.
//
// The one place the "does this word satisfy this plate?" question is answered,
// shared by the browser game (game.js), the daily builder
// (scripts/build-vanityplate-daily.mjs) and any e2e harness, so all three agree
// to the letter. Keep it dependency-free so Node can import it as-is.
//
// A plate is three letters (e.g. "COL"). A word satisfies it when those three
// letters appear IN ORDER as a subsequence of the word — c…o…l — as in
// COOL, CAROL, CLOSE-no (no second-position o before l? COLD yes). The score of
// a hole is the word's LENGTH: shortest wins, like golf. Par is the shortest
// everyday word; a rarer, shorter word beats par for a birdie.

/**
 * Indices in `word` that the three plate letters match, greedily and in order,
 * or null if the plate is not a subsequence of the word.
 * @param {string} word
 * @param {string} plate
 * @returns {number[]|null}
 */
export function matchPositions(word, plate) {
  const w = word.toLowerCase();
  const p = plate.toLowerCase();
  const pos = [];
  let i = 0;
  for (let k = 0; k < w.length && i < p.length; k++) {
    if (w[k] === p[i]) {
      pos.push(k);
      i++;
    }
  }
  return i === p.length ? pos : null;
}

/** How many of the plate's letters are matched so far — for the live "lit" feedback. */
export function litCount(word, plate) {
  const w = word.toLowerCase();
  const p = plate.toLowerCase();
  let i = 0;
  for (let k = 0; k < w.length && i < p.length; k++) {
    if (w[k] === p[i]) i++;
  }
  return i;
}

/** Does `word` satisfy `plate` (all three letters, in order)? */
export function satisfies(word, plate) {
  return matchPositions(word, plate) !== null;
}

/**
 * A guess is legal for a hole when it is at least four letters, it satisfies
 * the plate, and it is a real word. Three-letter words are suppressed: the only
 * 3-letter word that can satisfy a 3-letter plate is the plate spelled out, so
 * allowing them just hands out a trivial birdie. Validity is the caller's
 * dictionary — the engine stays data-free.
 * @param {string} word
 * @param {string} plate
 * @param {(w:string)=>boolean} isWord
 */
export function isLegal(word, plate, isWord) {
  const w = word.trim().toLowerCase();
  return w.length >= 4 && satisfies(w, plate) && isWord(w);
}

// Golf naming for a hole's result, keyed on strokes-minus-par.
// `grid` is the spoiler-free share tile.
export function scoreLabel(diff) {
  if (diff <= -2) return { key: "eagle", label: "Eagle!", grid: "🦅" };
  if (diff === -1) return { key: "birdie", label: "Birdie", grid: "🐦" };
  if (diff === 0) return { key: "par", label: "Par", grid: "🟩" };
  if (diff === 1) return { key: "bogey", label: "Bogey", grid: "🟧" };
  return { key: "over", label: `+${diff}`, grid: "🟥" };
}
