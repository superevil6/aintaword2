// Dictionary: the single source of truth for "is this a real English word?"
//
// Two roles, one module:
//   1. Validity set  — ~152k words (the public-domain ENABLE lexicon) used to
//      guarantee a generated fake is NOT accidentally a real word.
//      NB: ENABLE is public domain — safe for commercial/ad-supported use.
//      Do not swap in cracklib or another GPL list; this file is served to
//      every visitor, which counts as distribution.
//   2. Source pool   — the curated common words the game actually shows as the
//      "real" option. These are unioned into the validity set so a source word
//      is never treated as invalid.
//
// The validity set is fetched at runtime from /data/dictionary.txt (kept out of
// the JS bundle — it's plain text and compresses well over the wire).

export class Dictionary {
  constructor() {
    this.valid = new Set();
    this.sources = [];
    this.loaded = false;
    this._words = null; // the lazily-imported word-pool module
    // sourcePool() is called every round and now filters ~36k words, so
    // memoise by (length band + tier set).
    this._poolCache = new Map();
  }

  async load() {
    if (this.loaded) return this;

    // Dynamic import so Vite code-splits the ~300KB word pool into its own
    // chunk, fetched only when the runtime generator is actually needed — i.e.
    // when there's no precomputed daily set for today.
    this._words = await import("../data/commonWords.js");
    const { wordsForTiers } = this._words;

    const url = `${import.meta.env.BASE_URL}data/dictionary.txt`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load dictionary (${res.status}) from ${url}`);
    }
    const text = await res.text();

    const valid = new Set();
    for (const line of text.split("\n")) {
      const w = line.trim();
      if (w) valid.add(w);
    }

    // De-dupe the curated pool and fold it into the validity set.
    const sources = [];
    const seen = new Set();
    for (const raw of wordsForTiers()) {
      const w = raw.toLowerCase();
      if (seen.has(w)) continue;
      seen.add(w);
      sources.push(w);
      valid.add(w);
    }

    this.valid = valid;
    this.sources = sources;
    this.loaded = true;
    return this;
  }

  isWord(word) {
    return this.valid.has(word.toLowerCase());
  }

  // The curated source pool, filtered by length band and SCOWL tier.
  // `tiers` is an array like ["10", "20"]; omit it for every tier.
  sourcePool({ minLen = 0, maxLen = Infinity, tiers = null } = {}) {
    const key = `${minLen}:${maxLen}:${tiers ? tiers.join(",") : "*"}`;
    const cached = this._poolCache.get(key);
    if (cached) return cached;

    const base = tiers ? this._words.wordsForTiers(tiers) : this.sources;
    const pool =
      minLen <= 0 && maxLen === Infinity
        ? base
        : base.filter((w) => w.length >= minLen && w.length <= maxLen);

    this._poolCache.set(key, pool);
    return pool;
  }

  /** Tier ids present in the pool, e.g. ["10","20","35"]. Empty until load(). */
  get tiers() {
    return this._words ? Object.keys(this._words.WORDS_BY_TIER) : [];
  }
}
