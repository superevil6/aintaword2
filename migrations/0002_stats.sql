-- Anonymous, aggregate play analytics.
--
-- Deliberately NOT like `results` (which is keyed by license_key): this table
-- holds bare counters keyed only by (day, game, event) — no identifier, no IP,
-- no cookie, nothing that could reconstruct an individual. The client
-- (src/core/stats.js) de-duplicates on the device so each browser bumps each
-- counter at most once per day, making a count "distinct devices", never people.
--
-- Written by functions/api/stat.js (INSERT … ON CONFLICT DO UPDATE count+1).
-- Read with: npx wrangler d1 execute wordems --remote --command \
--   "SELECT day, game, event, count FROM stats WHERE day = '<YYYY-MM-DD>' ORDER BY game, event"

CREATE TABLE IF NOT EXISTS stats (
  day    TEXT NOT NULL,      -- 'YYYY-MM-DD' (UTC)
  game   TEXT NOT NULL,
  event  TEXT NOT NULL,      -- 'open' | 'finish' | 'finish_all'
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, game, event)
);

CREATE INDEX IF NOT EXISTS idx_stats_day ON stats (day);
