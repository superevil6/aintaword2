# Entitlements

The client-side seam that splits the free experience from supporter perks. Perks
are **additive and cosmetic** — they never gate core gameplay, and a free player
loses nothing. Puzzles are seed-derived and generated client-side, so this is
goodwill, not DRM: a determined user flipping a localStorage flag just gets a
colour or an old puzzle. That's an accepted trade.

## The one source of truth

`src/core/entitlements.js` — everything routes through it, so no game or screen
hardcodes an "is this unlocked?" check.

| Export | Purpose |
| --- | --- |
| `SKU.SUPPORTER` | the one entitlement id today |
| `isSupporter()` | convenience: holds any supporter entitlement |
| `hasEntitlement(sku)` | general check |
| `heldSkus()` | everything the player holds |
| `grant(sku)` / `revoke(sku)` | mutate locally (prod: only the license path calls these) |
| `onChange(cb)` | subscribe; UI relights live |
| `installDevBackdoor()` | dev-only testing hook |

Storage: `localStorage["aintaword2:entitlements"] = { skus: [] }`.

## What's gated today

- **Puzzle archive** — replay past dailies. Entry point is the 📅 button in the
  app bar (`src/main.js`), shown only while in a game AND `isSupporter()`.
- **Themes** — Ember / Forest / Slate / Ocean / Candy are supporter-locked;
  **Nebula (default) and High Contrast are free** (`src/core/theme.js`,
  `isUnlocked()`). High Contrast is free on purpose: accessibility is never
  paywalled, and keeping a real free theme makes the picker worth showing to
  everyone (so it also surfaces the perk to non-supporters).
- The `★ Supporter` badge in the app bar reflects the state.

## Testing it (dev builds only)

`installDevBackdoor()` is called from `main.js` only under `import.meta.env.DEV`:

- `?supporter=1` / `?supporter=0` in the URL (auto-stripped after)
- `wg.setSupporter(true | false)` in the console
- any build, from devtools: `localStorage.setItem("aintaword2:entitlements", '{"skus":["supporter"]}')`

Production ships **no** backdoor.

## Remaining for launch — DEFERRED on purpose

Nothing below is built yet, and it shouldn't be until there's evidence of
**organic pull** (strangers playing/returning, not friends-and-family). Don't
build payment plumbing for an audience that doesn't exist. When that signal
shows up, wire it — and note the callers above never change; they keep asking
`isSupporter()`.

1. **Lemon Squeezy** — a product/variant with license keys enabled (merchant of
   record; handles global tax).
2. **Cloudflare Worker** (same-origin, on the existing Pages project) —
   a signature-verified webhook that writes a `users` row to **D1**, plus a
   license-validate endpoint that calls the LS API.
3. **Client license-key entry UI** — on a valid key, `grant(SKU.SUPPORTER)` into
   the same localStorage slot this file already reads; re-validate ~once a day so
   the site stays offline-playable.
4. **Optional: cross-device sync** — the per-(game,date) history store
   (`src/core/history.js`) is already the data model; sync reads/writes it to D1.

See the publish-backend plan for hosting/cost specifics.
