// POST /api/sync — cross-device history sync.
//
// Body: { key: string, results?: Array<{ game, puzzle_date, score?, detail?, completed_at? }> }
// Upserts any provided rows for `key` (idempotent via the composite PK), then
// returns ALL of that key's rows so the client can merge. Identity is the
// license key; because each (game, date) row is unique, sync is a conflict-free
// union rather than a last-write-wins overwrite.
//
// AUTH: the key must be a validated supporter. /api/license/validate records
// holders in `users`; this endpoint rejects any key without an active `users`
// row (401). The SYNC_ENABLED master switch still gates the whole endpoint on
// top of that. See docs/backend.md.
import { json } from "../_utils.js";

const MAX_ROWS = 2000; // guard against an oversized push

export async function onRequestPost({ env, request }) {
  // Kill-switch. This is an open write endpoint (no real auth yet), so it stays
  // OFF unless SYNC_ENABLED is explicitly "true". Production leaves it unset →
  // 403, keeping it inert on the live domain until Lemon Squeezy key validation
  // is wired. Local dev turns it on via .dev.vars.
  if (env.SYNC_ENABLED !== "true") {
    return json({ error: "sync is not enabled" }, 403);
  }
  if (!env.DB) return json({ error: "D1 binding 'DB' not configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) return json({ error: "missing 'key'" }, 400);

  // The key must be a validated supporter (an active row written by
  // /api/license/validate). Unknown or revoked keys can't read or write.
  const user = await env.DB.prepare("SELECT status FROM users WHERE license_key = ?1")
    .bind(key)
    .first();
  if (!user || user.status !== "active") {
    return json({ error: "invalid or inactive key" }, 401);
  }

  const incoming = Array.isArray(body.results) ? body.results.slice(0, MAX_ROWS) : [];

  const upsert = env.DB.prepare(
    `INSERT INTO results (license_key, game, puzzle_date, score, detail, completed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (license_key, game, puzzle_date) DO UPDATE SET
       score = excluded.score,
       detail = excluded.detail,
       completed_at = excluded.completed_at`,
  );

  const batch = [];
  for (const r of incoming) {
    if (!r || typeof r.game !== "string" || typeof r.puzzle_date !== "string") continue;
    batch.push(
      upsert.bind(
        key,
        r.game,
        r.puzzle_date,
        Number.isFinite(r.score) ? r.score : null,
        typeof r.detail === "string" ? r.detail : null,
        Number.isFinite(r.completed_at) ? r.completed_at : null,
      ),
    );
  }
  if (batch.length) await env.DB.batch(batch);

  const { results } = await env.DB
    .prepare(
      "SELECT game, puzzle_date, score, detail, completed_at FROM results WHERE license_key = ?1",
    )
    .bind(key)
    .all();

  return json({ ok: true, count: results?.length ?? 0, results: results ?? [] });
}
