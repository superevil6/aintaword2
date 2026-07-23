// GET /api/health — proves the Worker is live and the D1 binding works.
// A 200 with a user count also confirms the schema has been migrated.
import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: "D1 binding 'DB' not configured" }, 503);
  try {
    const row = await env.DB.prepare("SELECT count(*) AS n FROM users").first();
    return json({ ok: true, users: row?.n ?? 0 });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
