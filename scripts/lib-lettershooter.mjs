// Shared lexicon for the Letter Shooter builder and verifier.
//
// Both need the same two questions answered off the same bytes: "is this a
// word?" (cashable) and "does any word still start with this?" (still alive).
// We load the ENABLE list the client also fetches, as a SORTED lowercase array,
// and answer prefixes with the same binary search the client uses
// (engine.prefixExists) so builder, verifier and player never disagree.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { prefixExists } from "../src/games/lettershooter/engine.js";
import { WORDS as ROOT } from "../src/data/rootwordPool.js";
import { WORDS_BY_TIER } from "../src/data/commonWords.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @returns {{isWord:(w:string)=>boolean, isPrefix:(s:string)=>boolean, words:string[]}} */
export function loadLexicon() {
  const text = readFileSync(path.join(dir, "..", "public/data/dictionary.txt"), "utf8");
  const words = text.split("\n").map((w) => w.trim()).filter(Boolean);
  const set = new Set(words);
  return {
    isWord: (w) => set.has(String(w).toLowerCase()),
    isPrefix: (s) => prefixExists(words, String(s).toLowerCase()),
    words,
  };
}

/**
 * The FAMILIAR pool par is measured over — the same everyday sources storey uses
 * (rootword ∪ SCOWL tiers 10 & 20), so par is a target a normal vocabulary can
 * reach. Rarer/longer ENABLE words let a strong player climb ABOVE par; they
 * never define it. Lowercased, ≥3 letters, alphabetic.
 * @returns {Set<string>}
 */
export function loadFamiliar() {
  const src = [...ROOT, ...WORDS_BY_TIER["10"], ...WORDS_BY_TIER["20"]];
  const out = new Set();
  for (const w of src) {
    const lw = String(w).toLowerCase();
    if (lw.length >= 3 && /^[a-z]+$/.test(lw)) out.add(lw);
  }
  return out;
}
