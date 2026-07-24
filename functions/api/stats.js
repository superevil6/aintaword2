// GET /api/stats — a tiny password-protected dashboard for the anonymous tally.
//
// Reads the `stats` table (see migrations/0002_stats.sql) and renders the
// per-game funnel — opened → finished → all difficulties — for one day, plus a
// 14-day trend. Read-only: it never exposes anything per-user, because the table
// holds none. The write path is functions/api/stat.js.
//
// AUTH: HTTP Basic, so a browser shows a native login prompt (no login page to
// build). Any username; the password must equal env.STATS_TOKEN — a Cloudflare
// SECRET, not a wrangler.toml var. Set it before use:
//   • local:  add `STATS_TOKEN=<pick-one>` to .dev.vars
//   • prod:   npx wrangler pages secret put STATS_TOKEN
// FAILS CLOSED: with no token configured the endpoint is locked, never open.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayString = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayUTC = () => dayString(Date.now());

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Shift a 'YYYY-MM-DD' key by whole days (UTC). */
function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  return dayString(Date.UTC(y, m - 1, d) + delta * 86_400_000);
}

function unauthorized() {
  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Wordems stats", charset="UTF-8"' },
  });
}

/** @returns {true|false|"unconfigured"} */
function checkAuth(request, env) {
  const token = env.STATS_TOKEN;
  if (!token) return "unconfigured";
  const header = request.headers.get("Authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const pass = decoded.slice(decoded.indexOf(":") + 1);
  return pass === token;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return new Response("D1 binding 'DB' not configured", { status: 503 });

  const auth = checkAuth(request, env);
  if (auth === "unconfigured") {
    return new Response(
      "Stats dashboard is not configured. Set the STATS_TOKEN secret to enable it.",
      { status: 503 },
    );
  }
  if (!auth) return unauthorized();

  const url = new URL(request.url);
  const raw = url.searchParams.get("day");
  const today = todayUTC();
  let day = DATE_RE.test(raw || "") ? raw : today;
  if (day > today) day = today;

  // The chosen day's funnel.
  const dayRows = (
    await env.DB.prepare("SELECT game, event, count FROM stats WHERE day = ?1")
      .bind(day)
      .all()
  ).results || [];

  // 14-day opened/finished totals, for a trend beneath the day view.
  const since = shiftDay(today, -13);
  const trendRows = (
    await env.DB.prepare(
      `SELECT game, event, SUM(count) AS total FROM stats
       WHERE day >= ?1 AND day <= ?2 AND event IN ('open', 'finish')
       GROUP BY game, event`,
    )
      .bind(since, today)
      .all()
  ).results || [];

  return new Response(renderPage({ day, today, dayRows, trendRows, since }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function pivotDay(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.game) || { game: r.game, open: 0, finish: 0, finish_all: 0 };
    if (r.event in g) g[r.event] = r.count;
    by.set(r.game, g);
  }
  return [...by.values()].sort((a, b) => b.open - a.open || a.game.localeCompare(b.game));
}

function pivotTrend(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.game) || { game: r.game, open: 0, finish: 0 };
    if (r.event === "open") g.open = r.total;
    else if (r.event === "finish") g.finish = r.total;
    by.set(r.game, g);
  }
  return [...by.values()].sort((a, b) => b.open - a.open || a.game.localeCompare(b.game));
}

function pct(n, d) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function renderPage({ day, today, dayRows, trendRows, since }) {
  const games = pivotDay(dayRows);
  const trend = pivotTrend(trendRows);
  const totals = games.reduce(
    (t, g) => ({ open: t.open + g.open, finish: t.finish + g.finish, finish_all: t.finish_all + g.finish_all }),
    { open: 0, finish: 0, finish_all: 0 },
  );
  const prev = shiftDay(day, -1);
  const next = day < today ? shiftDay(day, 1) : null;

  const dayTable = games.length
    ? games
        .map(
          (g) => `<tr>
            <td class="g">${esc(g.game)}</td>
            <td class="n">${g.open}</td>
            <td class="n">${g.finish}</td>
            <td class="n">${g.finish_all}</td>
            <td class="n"><span class="bar" style="--p:${g.open ? Math.round((g.finish / g.open) * 100) : 0}"></span>${pct(g.finish, g.open)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No plays recorded on this day.</td></tr>`;

  const trendTable = trend.length
    ? trend
        .map(
          (g) => `<tr><td class="g">${esc(g.game)}</td><td class="n">${g.open}</td><td class="n">${g.finish}</td><td class="n">${pct(g.finish, g.open)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty">No plays in the last 14 days.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Wordems · play stats</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1220; color: #eef0ff;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: max(16px, env(safe-area-inset-top)) 16px 40px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 0.15em; }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: #a6abcf; margin: 2rem 0 0.6rem; }
  .sub { color: #a6abcf; font-size: 0.85rem; margin: 0 0 1.2rem; }
  .nav { display: flex; align-items: center; gap: 0.75rem; margin: 1rem 0 0.5rem; }
  .nav a, .nav span { color: #eef0ff; text-decoration: none; padding: 0.3rem 0.7rem;
    border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; font-size: 0.9rem; }
  .nav a:hover { border-color: #7c5cff; }
  .nav .day { font-weight: 700; border-color: transparent; }
  .nav .disabled { opacity: 0.35; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem 0.6rem; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.07); }
  th:first-child, td.g { text-align: left; }
  th { color: #a6abcf; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
  td.g { font-weight: 600; }
  td.n { font-variant-numeric: tabular-nums; }
  tr.tot td { border-top: 2px solid rgba(255,255,255,0.14); font-weight: 700; }
  .empty { text-align: center; color: #a6abcf; padding: 1.2rem; }
  .bar { display: inline-block; width: 46px; height: 6px; margin-right: 8px; vertical-align: middle;
    border-radius: 3px; background: linear-gradient(90deg, #33d69f calc(var(--p) * 1%), rgba(255,255,255,0.1) 0); }
</style></head>
<body><div class="wrap">
  <h1>Play stats</h1>
  <p class="sub">Anonymous per-game daily counts — distinct devices, no identity. Times are UTC.</p>

  <div class="nav">
    <a href="?day=${prev}" aria-label="Previous day">‹ ${prev}</a>
    <span class="day">${day}${day === today ? " · today" : ""}</span>
    ${next ? `<a href="?day=${next}" aria-label="Next day">${next} ›</a>` : `<span class="disabled">next ›</span>`}
  </div>

  <table>
    <thead><tr><th>Game</th><th>Opened</th><th>Finished</th><th>All diffs</th><th>Finish rate</th></tr></thead>
    <tbody>
      ${dayTable}
      ${games.length ? `<tr class="tot"><td class="g">All games</td><td class="n">${totals.open}</td><td class="n">${totals.finish}</td><td class="n">${totals.finish_all}</td><td class="n">${pct(totals.finish, totals.open)}</td></tr>` : ""}
    </tbody>
  </table>

  <h2>Last 14 days (${since} → ${today})</h2>
  <table>
    <thead><tr><th>Game</th><th>Opened</th><th>Finished</th><th>Finish rate</th></tr></thead>
    <tbody>${trendTable}</tbody>
  </table>
</div></body></html>`;
}
