// Loads a precomputed daily match.
//
// Each day is an immutable file holding, for every difficulty, the ROUNDS
// boards of that day's match and a par score (see scripts/build-numburst-daily
// .mjs). Loading it means the boards a player sees are the ones that were
// committed — so a later tuning change cannot rewrite a day someone has already
// played — and it moves the several-second board generation off the client,
// which is what makes Hard playable in a phone browser at all.
//
// Loading is best-effort. If the day's file is missing — past the generated
// range, or a deploy hiccup — the game falls back to generating each board from
// its seed, which reproduces the identical layout because the file was built
// from the same seeds. The only thing lost in the fallback is the par score,
// which cannot be recomputed cheaply on the client.

import { todayKey } from "../../core/daily.js";
import { radiusOf } from "./board.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, sets:Record<string,object>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/numburst/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      // Guard the shape: a stale or hand-edited file must not crash the game.
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to seeded generation */
  }

  cache.set(day, data);
  return data;
}

/** The frozen match for one difficulty: `{ par, rounds }`, or null. */
export function matchFor(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || !Array.isArray(set.rounds) || !set.rounds.length) return null;
  return set;
}

/**
 * Rebuild a live board from a stored round. The file carries only [x, y, value]
 * per orb; radius and id are derived here so the archive stays small and the
 * game gets back exactly the object generateBoard would have handed it.
 */
export function boardFromRound(stored) {
  if (!stored || !Array.isArray(stored.orbs)) return null;
  const orbs = stored.orbs.map(([x, y, value], id) => ({
    id, x, y, value, max: value, r: radiusOf(value), alive: true,
  }));
  return { orbs, size: stored.size, bombs: { ...stored.bombs } };
}
