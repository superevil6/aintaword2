// Loads a precomputed daily set of sigilsweep puzzles.
//
// Each day is an immutable file holding the exact puzzles for every difficulty
// (see scripts/build-sigilsweep-daily.mjs). Loading it means the marks a player
// sees are the ones committed — the same for everyone — not whatever the current
// generator would now produce. Loading is best-effort: if the file is missing,
// the game regenerates the identical puzzles from the same seed.

import { todayKey } from "../../core/daily.js";
import { deserializePuzzle } from "./generator.js";

const FORMAT = 1;
const cache = new Map();

/**
 * @returns {Promise<{date:string, v:number, sets:Record<string,object[]>}|null>}
 */
export async function loadDay(day = todayKey(), base = import.meta.env?.BASE_URL ?? "/") {
  if (cache.has(day)) return cache.get(day);

  let data = null;
  try {
    const res = await fetch(`${base}data/sigilsweep/${day}.json`);
    if (res.ok) {
      const json = await res.json();
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

/** The frozen puzzles for one difficulty, decoded to runtime shape, or null. */
export function setsFor(data, difficulty) {
  const raw = data?.sets?.[difficulty];
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.map((p) => deserializePuzzle({ ...p, t: difficulty }));
}
