-- Move sync identity off the merchant-of-record model onto an anonymous,
-- client-generated device code.
--
-- WHY: the paid supporter tier was dropped for a plain tip jar (the site is now
-- free with no locked perks). Sync is free for everyone, and its identity is a
-- random "sync code" the client mints locally — a bearer capability with NO
-- personal information behind it. That means:
--   • the `users` table (email / license_key / sku) has no reason to exist;
--   • `results` is rekeyed from `license_key` to `device_code`.
--
-- Recreated rather than ALTERed so the schema is unambiguous across SQLite
-- versions. Losing the old rows is harmless: `results` is only a merge cache —
-- every device keeps its own local history (src/core/history.js) and re-pushes
-- it on the next sync, so nothing is permanently lost.

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS results;

CREATE TABLE results (
  device_code  TEXT NOT NULL,
  game         TEXT NOT NULL,
  puzzle_date  TEXT NOT NULL,        -- 'YYYY-MM-DD'
  score        INTEGER,
  detail       TEXT,                 -- JSON, opaque to the server
  completed_at INTEGER,              -- epoch ms
  PRIMARY KEY (device_code, game, puzzle_date)
);

CREATE INDEX IF NOT EXISTS idx_results_device ON results (device_code);

-- Housekeeping for sync buckets: first/last seen and a coarse write counter, so
-- an abusive code can be spotted and stale buckets pruned. Not an identity —
-- just the code and timestamps.
CREATE TABLE IF NOT EXISTS devices (
  device_code TEXT PRIMARY KEY,
  created_at  INTEGER,
  last_seen   INTEGER,
  writes      INTEGER NOT NULL DEFAULT 0
);
