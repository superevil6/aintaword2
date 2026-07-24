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
| `migrations/0002_stats.sql` | `stats` — anonymous aggregate play counters |
| `functions/api/health.js` | `GET /api/health` — liveness + D1 check |
| `functions/api/sync.js` | `POST /api/sync` — push/pull history rows by key |
| `functions/api/stat.js` | `POST /api/stat` — bump one anonymous play counter |
| `functions/api/stats.js` | `GET /api/stats` — Basic-Auth dashboard (funnel + trend) |
| `functions/_utils.js` | shared `json()` helper (`_` = not routed) |

## Analytics (anonymous, aggregate)

`stats(day, game, event, count)` holds bare per-day counters — **no identifier,
IP, or cookie** (unlike `results`, which is keyed by license). The client
(`src/core/stats.js`) de-dupes on the device, so a count is "distinct devices",
not people; it honors Do Not Track / GPC and a hub opt-out toggle. Events per
game per day: `open` (played), `finish` (finished a round), `finish_all` (every
difficulty). Today's live plays only — archive replays don't count. The endpoint
is unauthenticated by design (free players count too), so treat numbers as a
directional signal; add Cloudflare rate-limiting on `/api/stat` if inflation
matters.

### Dashboard — `GET /api/stats`

A read-only, Basic-Auth page: the per-game funnel for a day (with prev/next
nav) plus a 14-day trend. Open `https://wordems.com/api/stats` in a browser —
it prompts for login: **any username**, password = the `STATS_TOKEN` secret.
`?day=YYYY-MM-DD` picks a day. Fails closed: with no `STATS_TOKEN` set, it's
locked, never open.

Set the secret (it's a SECRET, not a `wrangler.toml` var):

```sh
# production
npx wrangler pages secret put STATS_TOKEN
# local dev — add to .dev.vars:
echo 'STATS_TOKEN=pick-a-strong-password' >> .dev.vars
```

### Or query D1 directly

```sh
npx wrangler d1 execute wordems --remote --command \
  "SELECT game, event, count FROM stats WHERE day = '2026-07-24' ORDER BY game, event"

# Popularity + completion funnel, pivoted per game for a day:
npx wrangler d1 execute wordems --remote --command \
  "SELECT game,
          MAX(CASE WHEN event='open'       THEN count END) AS opened,
          MAX(CASE WHEN event='finish'     THEN count END) AS finished,
          MAX(CASE WHEN event='finish_all' THEN count END) AS all_diffs
   FROM stats WHERE day = '2026-07-24' GROUP BY game ORDER BY opened DESC"
```

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
