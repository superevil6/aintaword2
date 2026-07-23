// POST /api/license/validate  { key: string }
//
// Validates a Lemon Squeezy license key LIVE against the LS License API, and on
// success records/refreshes the holder in `users` so /api/sync can trust the key
// without re-hitting LS on every request. The LS license endpoints are
// authenticated by the key itself — no store API key or secret is needed here.
//
// Optional env: LS_VARIANT_ID — if set, the key must belong to that product
// variant (your Supporter tier), rejecting valid keys from unrelated products.
import { json } from "../../_utils.js";

const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";

export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ error: "D1 binding 'DB' not configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) return json({ error: "missing 'key'" }, 400);

  // Ask Lemon Squeezy. The License API is form-encoded.
  let ls;
  try {
    const res = await fetch(LS_VALIDATE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ license_key: key }),
    });
    ls = await res.json();
  } catch {
    return json({ valid: false, error: "validation service unavailable" }, 502);
  }

  // LS marks a key "active" only AFTER an activation; a freshly bought,
  // never-activated key is "inactive" yet fully legitimate (LS still returns
  // valid:true). We use the key as identity, not device-activation, so accept
  // both — rejecting only revoked ("disabled") or "expired" keys.
  const status = ls?.license_key?.status;
  const usable = ls?.valid === true && status !== "expired" && status !== "disabled";
  // If a variant is configured, the key must belong to it.
  const variantOk =
    !env.LS_VARIANT_ID || String(ls?.meta?.variant_id) === String(env.LS_VARIANT_ID);
  // Reject sandbox keys — UNLESS explicitly allowed. While the store is
  // unactivated every key is a test key, so ALLOW_TEST_KEYS="true" keeps things
  // working; dropping it (at store activation) makes production reject test keys.
  const testKeyOk = env.ALLOW_TEST_KEYS === "true" || ls?.license_key?.test_mode !== true;

  if (!usable || !variantOk || !testKeyOk) return json({ valid: false }, 200);

  // Record/refresh the holder so /api/sync can authorise by key lookup.
  const email = ls?.meta?.customer_email ?? null;
  await env.DB.prepare(
    `INSERT INTO users (license_key, email, sku, status, granted_at)
     VALUES (?1, ?2, 'supporter', 'active', ?3)
     ON CONFLICT (license_key) DO UPDATE SET email = excluded.email, status = 'active'`,
  )
    .bind(key, email, Date.now())
    .run();

  return json({ valid: true, sku: "supporter" });
}
