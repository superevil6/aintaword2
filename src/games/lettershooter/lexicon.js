// Runtime dictionary for Letter Shooter.
//
// Unlike the other word games, Letter Shooter needs a PREFIX query, not just
// "is this a word?": grabbing a letter that leaves no live word is an instant
// bust, so the game constantly asks "does any word still start with this?". The
// shared core/dictionary.js only answers exact validity, so we load the ENABLE
// list ourselves as a SORTED array and answer both from it — `isWord` by set
// membership, `isPrefix` by a binary search (see engine.prefixExists). The text
// file is the same one core/dictionary fetches, so the browser serves it from
// cache if another game already pulled it.

import { prefixExists } from "./engine.js";

/**
 * @returns {Promise<{isWord:(w:string)=>boolean, isPrefix:(s:string)=>boolean}>}
 */
export async function loadLexicon(base = import.meta.env?.BASE_URL ?? "/") {
  const res = await fetch(`${base}data/dictionary.txt`);
  const text = await res.text();
  // ENABLE ships lowercase and lexicographically sorted — exactly what the
  // binary-search prefix check needs.
  const words = text.split("\n").map((w) => w.trim()).filter(Boolean);
  const set = new Set(words);
  return {
    isWord: (w) => set.has(String(w).toLowerCase()),
    isPrefix: (s) => prefixExists(words, String(s).toLowerCase()),
  };
}
