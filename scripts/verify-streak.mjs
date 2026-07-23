// Unit checks for streak math (core/streak.js) and the live-played filter
// (core/history.js). Pure logic — no jsdom needed; a tiny localStorage stub
// covers the one history.js call.

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { computeStreak } = await import("../src/core/streak.js");
const { livePlayedDates } = await import("../src/core/history.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const section = (n) => console.log(`\n${n}:`);

// Day arithmetic mirroring streak.js, so tests read in offsets from a fixed today.
const TODAY = "2026-07-22";
const day = (delta) => {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86400000).toISOString().slice(0, 10);
};
const eq = (got, exp, msg) =>
  ok(got.current === exp.current && got.longest === exp.longest,
     `${msg} → current ${got.current}/${exp.current}, longest ${got.longest}/${exp.longest}`);

section("computeStreak");
eq(computeStreak([], TODAY), { current: 0, longest: 0 }, "empty");
eq(computeStreak([day(0)], TODAY), { current: 1, longest: 1 }, "today only");
eq(computeStreak([day(0), day(-1), day(-2)], TODAY), { current: 3, longest: 3 }, "three-day run to today");
eq(computeStreak([day(-1), day(-2)], TODAY), { current: 2, longest: 2 }, "played yesterday not today — still alive");
eq(computeStreak([day(-2), day(-3)], TODAY), { current: 0, longest: 2 }, "missed today and yesterday — broken");
eq(computeStreak([day(0), day(-3), day(-4), day(-5)], TODAY), { current: 1, longest: 3 }, "today plus older run");
eq(
  computeStreak([day(0), day(-1), day(-5), day(-6), day(-7), day(-8), day(-9)], TODAY),
  { current: 2, longest: 5 },
  "current smaller than a past longest",
);
// Unordered + duplicate input must be handled (Set-based).
eq(computeStreak([day(-2), day(0), day(-1), day(0)], TODAY), { current: 3, longest: 3 }, "unordered + duplicates");

section("livePlayedDates (backfill doesn't count)");
store.clear();
localStorage.setItem(
  "aintaword2:x:daily",
  JSON.stringify({
    v: 1,
    days: {
      "2026-07-20": { easy: { score: 1, playedAt: "2026-07-20T10:00:00.000Z" } }, // live
      "2026-01-05": { easy: { score: 1, playedAt: "2026-07-22T10:00:00.000Z" } }, // archive backfill
      "2026-07-18": { easy: { score: 1 } },                                        // no playedAt
    },
  }),
);
const live = livePlayedDates("x").sort();
ok(live.length === 1 && live[0] === "2026-07-20", "only the live-on-its-day date counts");

console.log("");
if (fail) { console.error(`FAILED — ${fail} problem${fail === 1 ? "" : "s"}`); process.exit(1); }
console.log(`all ${pass} checks passed`);
