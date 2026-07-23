// Supporter entitlements — the single source of truth for the free/supporter
// split. Every "is this unlocked?" decision in the app routes through here, so
// no game or hub ever hardcodes the check.
//
// ── Today ──────────────────────────────────────────────────────────────────
// The only grant is a local flag in localStorage. That is enough to build and
// test supporter-only features before any backend exists.
//
// ── At publish (see the publish-backend-plan) ──────────────────────────────
// This module gains a real grant path: the player pastes a Lemon Squeezy
// license key, a thin Cloudflare Worker validates it (and activates the device
// against the key's instance limit), and the validated SKUs are written into
// the SAME localStorage slot this module already reads. Callers never change —
// they keep asking isSupporter() / hasEntitlement(sku). Validation is cached
// and re-checked about once a day, so the site stays offline-playable.
//
// Note: supporter perks are goodwill/cosmetic by design. Puzzles are
// seed-derived and generated client-side, so a determined user can flip this
// flag regardless — that's an accepted trade, not a hole to plug.

const STORE_KEY = "aintaword2:entitlements";

/**
 * SKUs a purchase can grant. At publish these mirror the Lemon Squeezy product
 * / variant ids. Keep this the one list the rest of the app imports.
 */
export const SKU = {
  SUPPORTER: "supporter",
};

const CHANGE_EVENT = "wg:entitlements-change";

function read() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { skus: [] };
    const data = JSON.parse(raw);
    return data && Array.isArray(data.skus) ? data : { skus: [] };
  } catch {
    // Private mode / quota / corrupt blob — treat as "no entitlements", which
    // is the safe default: the free experience must always work.
    return { skus: [] };
  }
}

function write(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — the grant just won't persist this session */
  }
  // Let live UI (e.g. the app-bar badge, a locked-perk button) react without
  // a reload. Fired even on no-op writes so callers can treat it as "recheck".
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no window (tests / SSR) */
  }
}

/** Does the player currently hold a given entitlement? */
export function hasEntitlement(sku) {
  return read().skus.includes(sku);
}

/** Convenience for the common case: any supporter-level entitlement. */
export function isSupporter() {
  return hasEntitlement(SKU.SUPPORTER);
}

/** Every SKU the player holds, e.g. for a "manage supporter status" screen. */
export function heldSkus() {
  return read().skus.slice();
}

/**
 * Grant an entitlement locally.
 *
 * In production the ONLY caller is the license-validation path, after the
 * Worker confirms a real key. In development it is also what the dev backdoor
 * (installDevBackdoor) uses to fake a supporter for testing.
 */
export function grant(sku) {
  const data = read();
  if (!data.skus.includes(sku)) {
    data.skus.push(sku);
    write(data);
  }
}

/** Revoke a locally-held entitlement (e.g. a refund/expiry the Worker reports). */
export function revoke(sku) {
  const data = read();
  const next = data.skus.filter((s) => s !== sku);
  if (next.length !== data.skus.length) {
    write({ ...data, skus: next });
  }
}

/**
 * Subscribe to entitlement changes. Returns an unsubscribe function.
 * @param {() => void} cb
 */
export function onChange(cb) {
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// ── Dev backdoor ────────────────────────────────────────────────────────────
//
// A way to fake a supporter locally so supporter-only features can be built and
// tested before any purchase flow exists. Two triggers, both dev-only:
//
//   • URL:     ?supporter=1  grants,  ?supporter=0  revokes  (then the param is
//              stripped from the address bar so it doesn't linger or get shared)
//   • Console: wg.setSupporter(true | false)  and  wg.isSupporter()
//
// Guarded by the caller (main.js gates on import.meta.env.DEV) so a production
// build never advertises `?supporter=1` as a free unlock. To fake it in ANY
// build from devtools, run:
//   localStorage.setItem("aintaword2:entitlements", '{"skus":["supporter"]}')
export function installDevBackdoor() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has("supporter")) {
      const on = params.get("supporter") !== "0";
      on ? grant(SKU.SUPPORTER) : revoke(SKU.SUPPORTER);
      params.delete("supporter");
      const url = new URL(location.href);
      url.search = params.toString();
      history.replaceState(history.state, "", url);
    }
  } catch {
    /* ignore — dev convenience only */
  }

  window.wg = Object.assign(window.wg || {}, {
    setSupporter(on = true) {
      on ? grant(SKU.SUPPORTER) : revoke(SKU.SUPPORTER);
      return isSupporter();
    },
    isSupporter,
    heldSkus,
  });

  // eslint-disable-next-line no-console
  console.info(
    "%c[dev]%c supporter backdoor ready — wg.setSupporter(true) or ?supporter=1",
    "color:#7c5cff;font-weight:bold",
    "color:inherit",
  );
}
