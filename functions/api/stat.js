// Anonymous, aggregate play analytics — one bare counter per (day, game, event).
//
// Records NO identity of any kind: no license key, no cookie, no stored IP. It
// exists so the site can see which games get played and finished each day and
// tune accordingly — a popularity signal, not per-user tracking. The client
// (src/core/stats.js) de-dupes on the device, so a bump means "one more device
// did this today", never a person.
//
// Unauthenticated ON PURPOSE — it must count free players too. That means the
// numbers are inflatable by anyone POSTing directly; treat them as a directional
// signal, and add Cloudflare rate-limiting on this route if that ever matters.

import { json } from "../_utils.js";

// event is a fixed vocabulary; game is validated by shape so new games need no
// server change. day must be today or yesterday (UTC) — clock-skew tolerance,
// nothing older, so the table can't be back-filled with arbitrary dates.
const EVENTS = new Set(["open", "finish", "finish_all"]);
const GAME_RE = /^[a-z][a-z0-9-]{1,24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayString = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding 'DB' not configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const game = typeof body?.game === "string" ? body.game : "";
  const event = typeof body?.event === "string" ? body.event : "";
  const day = typeof body?.day === "string" ? body.day : "";

  if (!GAME_RE.test(game) || !EVENTS.has(event) || !DATE_RE.test(day)) {
    return json({ error: "invalid event" }, 400);
  }
  const today = dayString(Date.now());
  const yesterday = dayString(Date.now() - 86_400_000);
  if (day !== today && day !== yesterday) {
    return json({ error: "day out of range" }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO stats (day, game, event, count) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (day, game, event) DO UPDATE SET count = count + 1`,
  )
    .bind(day, game, event)
    .run();

  return json({ ok: true });
}
