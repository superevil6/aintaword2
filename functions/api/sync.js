// POST /api/sync — cross-device history sync.
//
// Body: { device_code: string, results?: Array<{ game, puzzle_date, score?, detail?, completed_at? }> }
// Upserts any provided rows for `device_code` (idempotent via the composite PK),
// then returns ALL of that code's rows so the client can merge. Because each
// (game, date) row is unique, sync is a conflict-free union rather than a
// last-write-wins overwrite.
//
// IDENTITY / AUTH: the sync code is a bearer capability generated on the client
// (src/core/syncCode.js). There is no account and no personal data — whoever
// holds the code owns that bucket. So there is nothing to validate against a
// users table; we only sanity-check the code's SHAPE (bounded length + charset)
// to reject junk, and cap a bucket's size. Puzzle scores aren't sensitive, which
// is what makes a bare bearer code an acceptable trust model here.
//
// The SYNC_ENABLED master switch still gates the whole endpoint. See
// docs/backend.md.
import { json } from "../_utils.js";

const MAX_ROWS = 2000;              // cap a single push
const MAX_ROWS_PER_DEVICE = 20000;  // cap a bucket's total size (abuse ceiling)

// A canonical sync code is exactly 26 base32 chars. Accept the whole [0-9A-Z]
// range (a lenient superset of the client's Crockford alphabet) so validation
// never rejects a real code, while still bounding length and charset.
const CODE_RE = /^[0-9A-Z]{26}$/;

export async function onRequestPost({ env, request }) {
  // Kill-switch. Left unset → 403, so the endpoint can be disabled instantly
  // without a redeploy if it is ever abused. Production sets it "true".
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

  const code = typeof body?.device_code === "string"
    ? body.device_code.replace(/[\s-]/g, "").toUpperCase()
    : "";
  if (!CODE_RE.test(code)) return json({ error: "invalid device code" }, 400);

  const now = Date.now();
  const incoming = Array.isArray(body.results) ? body.results.slice(0, MAX_ROWS) : [];

  // Reject a push that would blow a bucket past its ceiling — cheap defence
  // against someone filling storage under one code. (Real per-IP rate limiting
  // belongs at the Cloudflare edge; this is the last-ditch cap.)
  if (incoming.length) {
    const row = await env.DB
      .prepare("SELECT COUNT(*) AS c FROM results WHERE device_code = ?1")
      .bind(code)
      .first();
    if ((row?.c ?? 0) >= MAX_ROWS_PER_DEVICE) {
      return json({ error: "sync bucket is full" }, 429);
    }
  }

  const upsert = env.DB.prepare(
    `INSERT INTO results (device_code, game, puzzle_date, score, detail, completed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (device_code, game, puzzle_date) DO UPDATE SET
       score = excluded.score,
       detail = excluded.detail,
       completed_at = excluded.completed_at`,
  );

  const batch = [];
  for (const r of incoming) {
    if (!r || typeof r.game !== "string" || typeof r.puzzle_date !== "string") continue;
    batch.push(
      upsert.bind(
        code,
        r.game,
        r.puzzle_date,
        Number.isFinite(r.score) ? r.score : null,
        typeof r.detail === "string" ? r.detail : null,
        Number.isFinite(r.completed_at) ? r.completed_at : null,
      ),
    );
  }
  if (batch.length) await env.DB.batch(batch);

  // Housekeeping: record first/last seen and a coarse write counter. No identity,
  // just the code and timestamps — for spotting abuse and pruning stale buckets.
  await env.DB
    .prepare(
      `INSERT INTO devices (device_code, created_at, last_seen, writes)
       VALUES (?1, ?2, ?2, ?3)
       ON CONFLICT (device_code) DO UPDATE SET
         last_seen = ?2,
         writes = writes + ?3`,
    )
    .bind(code, now, batch.length)
    .run();

  const { results } = await env.DB
    .prepare(
      "SELECT game, puzzle_date, score, detail, completed_at FROM results WHERE device_code = ?1",
    )
    .bind(code)
    .all();

  return json({ ok: true, count: results?.length ?? 0, results: results ?? [] });
}
