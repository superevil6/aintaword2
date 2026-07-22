// Loads a precomputed daily puzzle set.
//
// Each day is an immutable file — public/data/rootword/<YYYY-MM-DD>.json —
// holding, for every difficulty, that day's { letters, seed, budget } (see
// scripts/build-rootword-daily.mjs). Freezing the SEQUENCE of puzzles into
// committed files is what lets the rack generator improve without rewriting a
// day someone already played, and gives every player worldwide the same puzzle.
//
// Note par is NOT trusted from the file — it is recomputed at runtime from the
// shipped word pool (engine.makePuzzle), because par is cheap here and keeping
// it live means a par-scoping fix reaches old days too. The file only pins the
// letters+seed, which is the part that must stay stable.
//
// Loading is best-effort: if the day's file is missing (past the generated
// range, or a deploy hiccup) the game falls back to the curated racks baked
// into difficulty.js, so it always has a puzzle to hand out.

import { todayKey } from "../../core/daily.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, sets:Record<string,object>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/rootword/${day}.json`);
    if (res.ok) {
      const json = await res.json();
      // Guard the shape: a stale or hand-edited file must not crash the game.
      if (json && json.v === FORMAT && json.sets && typeof json.sets === "object") {
        data = json;
      }
    }
  } catch {
    /* offline, 404, malformed — fall back to the baked racks */
  }

  cache.set(day, data);
  return data;
}

/** The frozen `{ letters, seed }` for one difficulty, or null. */
export function rackFromDay(data, difficulty) {
  const set = data?.sets?.[difficulty];
  if (!set || typeof set.letters !== "string" || typeof set.seed !== "string") return null;
  return { letters: set.letters, seed: set.seed };
}
