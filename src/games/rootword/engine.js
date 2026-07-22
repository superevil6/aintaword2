// Rootword engine — the pure puzzle logic, free of any DOM.
//
// A Rootword puzzle is: a set of allowed LETTERS, a branch BUDGET, and a SEED
// word planted for free. You grow a trie from the root; every branch spends one
// budget; every root-to-node path that spells a real word bears fruit. Words
// sharing a prefix share the branch, so the game is packing the most fruit into
// the budget.
//
// Kept DOM-free on purpose (like colorpath's model and numburst's board): the
// eventual scripts/verify-rootword.mjs reads the same functions under Node to
// re-derive par, exactly the way the other games are checked.

/** Points a completed word is worth: longer words pay more. 3→1 … 7→5. */
export function scoreOf(len) {
  return len - 2;
}

/** The prefixes of `seed`, i.e. the nodes planted for free. `"car" → car`. */
export function seedPathSet(seed) {
  const s = new Set();
  for (let i = 1; i <= seed.length; i++) s.add(seed.slice(0, i));
  return s;
}

/**
 * Build the trie of every pool word spellable with `letters` (letters are
 * reusable — this is about which words are *reachable*, not a tile budget).
 *
 * Returns the root of a trie whose nodes are
 *   { path, ch, len, word:boolean, children:Map<char,node> }
 * The root has path "" and len 0.
 */
export function buildReachableTrie(letters, pool) {
  const allowed = new Set(letters);
  const root = { path: "", ch: "", len: 0, word: false, children: new Map() };
  for (const w of pool) {
    let ok = true;
    for (const c of w) {
      if (!allowed.has(c)) { ok = false; break; }
    }
    if (!ok) continue;
    let node = root;
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      let next = node.children.get(c);
      if (!next) {
        next = { path: w.slice(0, i + 1), ch: c, len: i + 1, word: false, children: new Map() };
        node.children.set(c, next);
      }
      node = next;
    }
    node.word = true;
  }
  return root;
}

/** Index a trie by node path, for O(1) "which letters extend this node?". */
export function indexTrie(root) {
  const map = new Map();
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    map.set(n.path, n);
    for (const c of n.children.values()) stack.push(c);
  }
  return map;
}

/**
 * TRUE optimal par: the maximum score of a connected subtree rooted at the
 * root, spending at most `budget` NON-seed branches. Seed-path edges are free
 * (the seed is a gift), so they cost nothing and their word (if any) is banked.
 *
 * A tree knapsack. For each node we compute, per edge-budget b, the best value
 * obtainable inside its subtree, then merge children as a bounded knapsack. The
 * reachable tries are only a few hundred to ~1500 nodes, so this is instant and
 * — because it reads the same shipped pool for every player — deterministic and
 * identical worldwide, the property a daily par needs.
 *
 * @param {object} root       reachable trie root
 * @param {number} budget     branches the player may spend (excludes the seed)
 * @param {Set<string>} seedPaths  node paths planted free (from seedPathSet)
 * @returns {number} optimal total score, seed word included
 */
export function optimalPar(root, budget, seedPaths) {
  const N = budget;
  function dp(node) {
    const self = node.word ? scoreOf(node.len) : 0;
    let best = new Int32Array(N + 1); // best[b] = value from children using ≤ b edges
    for (const child of node.children.values()) {
      const free = seedPaths.has(child.path);
      const cdp = dp(child);
      // cost to include this child = (free ? 0 : 1) + edges spent below it
      const prof = new Int32Array(N + 1);
      for (let e = 0; e <= N; e++) {
        const below = free ? e : e - 1;
        prof[e] = below < 0 ? -1e9 : cdp[Math.min(below, N)];
      }
      for (let e = 1; e <= N; e++) if (prof[e] < prof[e - 1]) prof[e] = prof[e - 1];
      const merged = new Int32Array(N + 1);
      for (let b = 0; b <= N; b++) {
        let m = best[b];
        for (let c = 0; c <= b; c++) {
          const v = best[b - c] + prof[c];
          if (v > m) m = v;
        }
        merged[b] = m;
      }
      best = merged;
    }
    const out = new Int32Array(N + 1);
    for (let b = 0; b <= N; b++) out[b] = self + best[b];
    return out;
  }
  return dp(root)[N];
}

/**
 * Like optimalPar, but reconstructs the words of ONE optimal tree, not just the
 * score. Same recurrence, carrying the winning word list alongside each value
 * so the result screen can show "the best tree also found …". Runs once per
 * puzzle (build/finish time), so the extra array copying is not hot.
 *
 * @returns {{score:number, words:string[]}}
 */
export function optimalSolution(root, budget, seedPaths) {
  const N = budget;
  const memo = new Map();
  function dp(node) {
    if (memo.has(node)) return memo.get(node);
    const self = node.word ? scoreOf(node.len) : 0;
    const selfWords = node.word ? [node.path] : [];
    // best[b] = { value, words } achievable from children using ≤ b edges
    let best = Array.from({ length: N + 1 }, () => ({ value: 0, words: [] }));
    for (const child of node.children.values()) {
      const free = seedPaths.has(child.path);
      const cdp = dp(child);
      const prof = new Array(N + 1);
      for (let e = 0; e <= N; e++) {
        const below = free ? e : e - 1;
        prof[e] = below < 0 ? { value: -Infinity, words: [] } : cdp[Math.min(below, N)];
      }
      for (let e = 1; e <= N; e++) if (prof[e].value < prof[e - 1].value) prof[e] = prof[e - 1];
      const merged = new Array(N + 1);
      for (let b = 0; b <= N; b++) {
        let pick = best[b]; // spend nothing on this child
        // c starts at 0 so a FREE (seed-path) child's cost-0 value — e.g. the
        // seed word itself — is added, matching optimalPar. Non-free children
        // have prof[0] = -Infinity, so c=0 is a no-op for them.
        for (let c = 0; c <= b; c++) {
          const v = best[b - c].value + prof[c].value;
          if (v > pick.value) pick = { value: v, words: best[b - c].words.concat(prof[c].words) };
        }
        merged[b] = pick;
      }
      best = merged;
    }
    const out = best.map((x) => ({ value: self + x.value, words: selfWords.concat(x.words) }));
    memo.set(node, out);
    return out;
  }
  const r = dp(root)[N];
  return { score: r.value, words: r.words };
}

/**
 * Compute the full puzzle from a raw rack `{ letters, seed }` and a budget.
 * Bundles the reachable trie, its index, the seed's free paths, true par, and
 * the word list of one optimal tree (for the end-of-round "what you missed").
 */
export function makePuzzle({ letters, seed, budget }, pool) {
  const chars = [...new Set(letters)];
  const root = buildReachableTrie(chars, pool);
  const index = indexTrie(root);
  const seedPaths = seedPathSet(seed);
  // Par must be measured over the space the PLAYER can actually grow. The seed
  // anchors them to one trunk — the root is not a spot they can start a fresh
  // first letter — so the reachable space is the seed's first-letter subtree,
  // not the whole trie. Scoring par over the whole trie let it (and the
  // "what you missed" list) count words on other trunks that can never be
  // planted from this seed (e.g. HEART-words under a THE seed).
  const trunk = root.children.get(seed[0]) || root;
  const best = optimalSolution(trunk, budget, seedPaths);
  return {
    letters: chars, seed, budget, root, index, seedPaths,
    par: best.score,
    optimalWords: best.words,
  };
}
