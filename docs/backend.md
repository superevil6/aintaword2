# Backend (Cloudflare Pages Functions + D1)

Same-origin API for the Wordems site. It lives in `functions/` and deploys with
the site — no separate Worker, no CORS. D1 (SQLite) is the store.

Status: **infrastructure only.** The endpoints work, but nothing in the app
calls them yet, and the sync endpoint is **unauthenticated** until Lemon Squeezy
license validation is wired (that's the identity). Build/verify this now; connect
the client when LS test-mode keys exist.

## Files

| Path | What |
| --- | --- |
| `wrangler.toml` | Pages config + the D1 binding (`DB`) |
| `migrations/0001_init.sql` | `users` + `results` schema |
| `functions/api/health.js` | `GET /api/health` — liveness + D1 check |
| `functions/api/sync.js` | `POST /api/sync` — push/pull history rows by key |
| `functions/_utils.js` | shared `json()` helper (`_` = not routed) |

## One-time setup (needs your Cloudflare login)

```sh
# 1. Create the database — prints a database_id.
npx wrangler d1 create wordems

# 2. Paste that id into wrangler.toml → [[d1_databases]].database_id
#    (replace PLACEHOLDER_run_wrangler_d1_create).

# 3. Apply the schema — both remote (production) and local (dev).
npx wrangler d1 migrations apply wordems --remote
npx wrangler d1 migrations apply wordems --local
```

If the Pages dashboard doesn't pick the binding up from `wrangler.toml`, add it
by hand: Pages project → **Settings → Functions → D1 database bindings** →
variable name `DB` → database `wordems`.

## Deploy

Push to `main` — Cloudflare builds the site *and* bundles `functions/` into the
Functions runtime automatically. (Or `npx wrangler pages deploy dist`.)

## Test

In VS Code, the **backend: build + serve (wrangler)** task (or the **▶ Play full
stack** launch config) runs the three steps below in one go.

```sh
# Apply the schema to the LOCAL D1 FIRST (once; safe to repeat). Skipping this is
# why /api/health returns "no such table: users" — the binding works, the local
# database is just empty. --remote does the same to production before you deploy.
npx wrangler d1 migrations apply wordems --local

# Build + serve the site + Functions + local D1 at http://localhost:8788
npm run build
npx wrangler pages dev dist

# Liveness (expect {"ok":true,"users":0}):
curl http://localhost:8788/api/health

# Sync round-trip: push two rows, get them back.
curl -sX POST http://localhost:8788/api/sync \
  -H 'content-type: application/json' \
  -d '{"key":"TEST-KEY","results":[
        {"game":"mirrorword","puzzle_date":"2026-07-20","score":36,"completed_at":1},
        {"game":"storey","puzzle_date":"2026-07-21","score":40,"completed_at":2}]}'

# Idempotent — pushing the same rows again returns the same set, no duplicates.
```

Against production, swap the host for `https://wordems.com`.

## Enabling /api/sync

`/api/sync` is an open write endpoint with no real auth yet, so it's gated by a
`SYNC_ENABLED` flag and returns **403** unless it's `"true"`:

- **Local:** `.dev.vars` (gitignored) sets `SYNC_ENABLED=true`, so `wrangler pages
  dev` has it on for testing.
- **Production:** leave it unset → the endpoint stays inert on the live domain
  even after deploy. Turn it on only once key validation is wired: Pages project
  → Settings → Environment variables → `SYNC_ENABLED` = `true`.

`/api/health` is not gated — it only reads a count, and it's useful for liveness.

## Remaining (deferred — needs Lemon Squeezy)

1. **`functions/api/webhook/lemonsqueezy.js`** — signature-verified; writes a
   `users` row on purchase.
2. **`functions/api/license/validate.js`** — validates a key against the LS API
   (test mode first), so `/api/sync` can require a real key instead of trusting
   the caller.
3. **Client** — a license-key entry UI that, on a valid key, calls
   `grant(SKU.SUPPORTER)` and drives sync from `src/core/history.js`.

See `docs/entitlements.md` and the publish-backend plan.
