// Game registry — the seam that keeps this "one game now, many games later".
//
// Each game is a self-contained module that exports a descriptor of this shape:
//
//   export default {
//     id:          "aintaword",           // url-safe slug, unique
//     title:       "Ain't a Word",        // display name
//     tagline:     "Spot the real word.", // one-liner for a hub card
//     description: "...",                  // longer blurb
//     accent:      "#7c5cff",             // theme color for hub card
//     tags:        ["word"],              // similarity labels, drive relatedGames()
//     mount(container, opts) { ... return () => {/* cleanup */} }
//   }
//
// A future hub page just imports the registry, renders a card per game, and
// calls mount() on the chosen one. For now main.js mounts the single game
// directly, but going through the registry keeps that path honest.

const games = new Map();

export function registerGame(descriptor) {
  if (!descriptor || !descriptor.id) {
    throw new Error("registerGame: descriptor needs an id");
  }
  if (typeof descriptor.mount !== "function") {
    throw new Error(`registerGame: game "${descriptor.id}" needs a mount() function`);
  }
  games.set(descriptor.id, descriptor);
  return descriptor;
}

export function getGame(id) {
  return games.get(id);
}

export function allGames() {
  return [...games.values()];
}

/**
 * Games most like `id`, best match first, for a "play one more" hand-off.
 *
 * Ranking is simply how many `tags` a candidate shares with the source game.
 * A game that shares nothing is still a valid pick — the point is to keep the
 * player in the collection, so a fallback beats an empty result. Ties (and the
 * no-shared-tag fallback) are broken randomly so a finished game does not
 * always funnel to the same neighbor; a word game still tends to suggest
 * another word game because those share a tag and outrank the rest.
 *
 * @param {string} id       source game id (excluded from the result)
 * @param {number} [limit]  how many to return
 * @returns {object[]} game descriptors
 */
export function relatedGames(id, limit = 1) {
  const self = games.get(id);
  if (!self) return [];
  const selfTags = new Set(self.tags || []);

  const scored = [...games.values()]
    .filter((g) => g.id !== id)
    .map((g) => ({
      game: g,
      shared: (g.tags || []).reduce((n, t) => n + (selfTags.has(t) ? 1 : 0), 0),
    }));

  // Shuffle before the stable sort so equal-scoring games land in a random
  // order rather than always registration order.
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  scored.sort((a, b) => b.shared - a.shared);

  return scored.slice(0, limit).map((s) => s.game);
}
