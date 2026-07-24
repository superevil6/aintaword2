// Link-preview copy for every game, plus the site itself.
//
// This is the ONE place a shared link's title and description come from. It
// exists because of a hard limit of static hosting: a link preview (the card
// Discord, Slack, iMessage, Twitter and the rest draw) is built by a crawler
// that reads <title> and the meta tags out of the HTML the server returns —
// and never runs the page's JavaScript. Our whole app is one index.html served
// for every `?game=` URL, so without help every share would show the same tags.
//
// scripts/share-pages plugin (see vite.config.js) turns each entry below into a
// real file — public/g/<id>/index.html at build — that carries these tags and
// then bounces a human into the app. The crawler reads the tags; the player
// lands in the game.
//
// Descriptions are written to stand ALONE in a feed: each names its own game,
// because the card is often all a reader sees. Kept near 150 characters, the
// length most crawlers show before truncating.

export const SITE_SHARE = {
  title: "Wordems",
  description:
    "A small collection of daily puzzle games — a fresh board every day for each. " +
    "Spot the fake word, mix light into color, and more.",
};

/** Keyed by game id. Order is display order on any list that iterates it. */
export const GAME_SHARE = {
  aintaword: {
    title: "Ain't a Word",
    description:
      "A 60-second word game. Two words appear — one real, one a convincing fake. " +
      "Pick the real one before the clock runs out.",
  },
  colorpath: {
    title: "Color Path",
    description:
      "Mix red, yellow and blue as you move, and light up every glowing circle on " +
      "the board — in as few steps as you can. A new grid daily.",
  },
  wordiamond: {
    title: "Wordiamond",
    description:
      "Four words share their corner letters, so rotating one side moves two others. " +
      "Lock the words you find and untangle the ring. A daily puzzle.",
  },
  numburst: {
    title: "Numburst",
    description:
      "Burst the big numbered orbs first — each one takes its neighbors down with it. " +
      "Spend a handful of bombs for the biggest chain reaction.",
  },
  photonfinish: {
    title: "Photon Finish",
    description:
      "Aim beams of light through gates that brighten and dim them, and land each " +
      "on its finish line at exactly the right brightness. A daily optics puzzle.",
  },
  rootword: {
    title: "Rootword",
    description:
      "Grow a word tree from one seed. Words that start alike share a branch, so " +
      "pack the most fruit onto a fertile trunk — up to the day's par. A daily puzzle.",
  },
  mirrorword: {
    title: "Mirrorword",
    description:
      "A mirror runs down the diagonal, reflecting every letter you place. Fill the " +
      "grid so each row is a word; chase the rarest letters, worth double when mirrored.",
  },
  vanityplate: {
    title: "Vanity Plate",
    description:
      "Word golf on a license plate. Find a word whose three letters appear in order — " +
      "TRK → TREK — in as few letters as you can. Six plates a day.",
  },
  storey: {
    title: "Storey",
    description:
      "Build a tower of words. Each floor is a word on two consonant pillars from your " +
      "daily tiles — wider pays more, but every storey up fights gravity. Reach par.",
  },
  colordrop: {
    title: "Colordrop",
    description:
      "Drop a white ball down the one chute whose gates mix red, yellow and blue " +
      "into the goal color. The faster you read it and commit, the more it scores.",
  },
  lettershooter: {
    title: "Letter Shooter",
    description:
      "Walls of letters scroll past a firing beam. Grab one letter per row to build a " +
      "word, and cash it before a row kills it. Push your luck across five rounds.",
  },
  sigilsweep: {
    title: "Sigil Sweep",
    description:
      "A split line rotates through a hidden mark, showing one true sliver and its " +
      "mirror image. Assemble it from memory and pick it out — the sooner the better.",
  },
};

/** Share copy for a game id, or the site copy when the id is unknown/absent. */
export function shareFor(gameId) {
  return GAME_SHARE[gameId] ?? SITE_SHARE;
}
