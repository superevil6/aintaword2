-- Wordems backend schema (Cloudflare D1 / SQLite).
--
-- Two tiny tables:
--   users   — written by the Lemon Squeezy webhook when a supporter buys; the
--             license key doubles as their identity (no accounts/OAuth).
--   results — the cross-device sync surface. It mirrors the client's
--             per-(game, date) history store (src/core/history.js): one row per
--             completed puzzle. The composite primary key makes re-pushes
--             idempotent, so sync is a conflict-free UNION — no last-write-wins
--             clobber across devices.

CREATE TABLE IF NOT EXISTS users (
  license_key TEXT PRIMARY KEY,
  email       TEXT,
  sku         TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  granted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS results (
  license_key  TEXT NOT NULL,
  game         TEXT NOT NULL,
  puzzle_date  TEXT NOT NULL,        -- 'YYYY-MM-DD'
  score        INTEGER,
  detail       TEXT,                 -- JSON, opaque to the server
  completed_at INTEGER,              -- epoch ms
  PRIMARY KEY (license_key, game, puzzle_date)
);

CREATE INDEX IF NOT EXISTS idx_results_key ON results (license_key);
