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
