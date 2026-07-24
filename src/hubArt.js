// Decorative per-game motifs for the hub tiles.
//
// Each entry is inline SVG line-art on a 0–100 viewBox, drawn with
// `stroke="currentColor"` (and `fill="currentColor"` for solid bits) so a tile
// can tint it with its own accent and fade it via opacity — see .hub-card-art
// in hub.css. Kept as line-art on purpose: one colour, scales to any size, and
// no raster assets or extra build step. A game with no motif here falls back to
// its initial letter, so this map can stay incomplete without breaking the hub.
//
// These are background decoration, never content — the hub marks them
// aria-hidden. Tweak freely; geometry only has to read at a glance behind text.

const ART = {
  // Word golf on a licence plate: the plate, its bolts, and abstract glyphs.
  vanityplate: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="30" width="80" height="40" rx="7"/>
      <circle cx="21" cy="40" r="2.5" fill="currentColor" stroke="none"/>
      <circle cx="79" cy="40" r="2.5" fill="currentColor" stroke="none"/>
      <path d="M28 44v12 M40 44v12 M50 44l7 12 M57 44l-7 12 M66 44v12"/>
    </svg>`,

  // A cut gem: the table and crown facets of a diamond.
  wordiamond: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linejoin="round">
      <path d="M50 16 L82 42 L50 86 L18 42 Z"/>
      <path d="M18 42 H82 M50 16 L37 42 L50 86 M50 16 L63 42 L50 86"/>
    </svg>`,

  // A colour ball holding a star, ringed by pips.
  colorpath: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linejoin="round">
      <circle cx="50" cy="50" r="33"/>
      <path transform="translate(37 31) scale(1.05)" fill="currentColor" stroke="none"
            d="M12 2 L14.9 8.6 L22 9.2 L16.6 13.9 L18.2 21 L12 17.2 L5.8 21
               L7.4 13.9 L2 9.2 L9.1 8.6 Z"/>
      <circle cx="27" cy="35" r="2.4" fill="currentColor" stroke="none"/>
      <circle cx="73" cy="35" r="2.4" fill="currentColor" stroke="none"/>
      <circle cx="30" cy="66" r="2.4" fill="currentColor" stroke="none"/>
      <circle cx="70" cy="66" r="2.4" fill="currentColor" stroke="none"/>
    </svg>`,

  // Colordrop: a ball poised to fall through a little tree of wall-slots onto
  // the goal bar. The drop + gates + goal, not another colour ball (that reads
  // as colorpath) — one colour, tinted by the tile accent.
  colordrop: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="50" cy="18" r="8" fill="currentColor" stroke="none"/>
      <path d="M50 34 V54 M30 58 V78 M70 58 V78"/>
      <path d="M15 88 H85" stroke-width="5"/>
    </svg>`,

  // A beam entering level, bouncing 90° off a mirror, landing on the finish.
  photonfinish: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M12 34 H52 V78" stroke-width="4"/>
      <path d="M40 24 L64 46" stroke-width="3.5"/>
      <path d="M30 78 H74" stroke-width="4" stroke-dasharray="7 5"/>
      <circle cx="52" cy="78" r="4.5" fill="currentColor" stroke="none"/>
    </svg>`,

  // Spot the real word: a magnifier over a pair of letter strokes.
  aintaword: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="44" cy="44" r="26"/>
      <path d="M63 63 L84 84"/>
      <path d="M35 52 L44 33 L53 52 M38 46 H50"/>
    </svg>`,

  // A chain reaction: a core orb bursting into shards and satellite orbs.
  numburst: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="50" cy="50" r="15"/>
      <path d="M50 27 V16 M50 73 V84 M27 50 H16 M73 50 H84
               M34 34 L26 26 M66 34 L74 26 M34 66 L26 74 M66 66 L74 74"/>
      <circle cx="22" cy="22" r="4" fill="currentColor" stroke="none"/>
      <circle cx="80" cy="26" r="3" fill="currentColor" stroke="none"/>
      <circle cx="24" cy="78" r="3" fill="currentColor" stroke="none"/>
    </svg>`,

  // A word tree: a branching trunk bearing fruit.
  rootword: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 86 V54 M50 54 L32 34 M50 54 L68 34
               M32 34 L23 20 M32 34 L41 20 M68 34 L59 20 M68 34 L77 20"/>
      <circle cx="23" cy="18" r="4" fill="currentColor" stroke="none"/>
      <circle cx="41" cy="18" r="4" fill="currentColor" stroke="none"/>
      <circle cx="59" cy="18" r="4" fill="currentColor" stroke="none"/>
      <circle cx="77" cy="18" r="4" fill="currentColor" stroke="none"/>
    </svg>`,

  // A word square with the mirror running down its diagonal.
  mirrorword: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linejoin="round">
      <rect x="20" y="20" width="60" height="60" rx="5"/>
      <path d="M40 20 V80 M60 20 V80 M20 40 H80 M20 60 H80"/>
      <path d="M20 20 L80 80" stroke-width="5" stroke-dasharray="7 6"/>
    </svg>`,

  // A tower of words: offset blocks stacked against gravity.
  storey: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linejoin="round">
      <rect x="28" y="60" width="42" height="16" rx="2"/>
      <rect x="34" y="42" width="36" height="16" rx="2"/>
      <rect x="30" y="24" width="30" height="16" rx="2"/>
    </svg>`,

  // Scrolling rows of letter tiles crossing a firing beam — one captured in it,
  // a launcher firing up from below.
  lettershooter: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linejoin="round">
      <rect x="12" y="19" width="16" height="14" rx="2"/>
      <rect x="42" y="19" width="16" height="14" rx="2"/>
      <rect x="72" y="19" width="16" height="14" rx="2"/>
      <rect x="12" y="43" width="16" height="14" rx="2"/>
      <rect x="42" y="43" width="16" height="14" rx="2"/>
      <rect x="72" y="43" width="16" height="14" rx="2"/>
      <rect x="12" y="67" width="16" height="14" rx="2"/>
      <rect x="72" y="67" width="16" height="14" rx="2"/>
      <rect x="42" y="67" width="16" height="14" rx="2" fill="currentColor" stroke="none"/>
      <path d="M40 13 V87 M60 13 V87" stroke-width="2.5" opacity="0.8"/>
      <path d="M44 96 L50 89 L56 96" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`,

  // Sigil Sweep: an abstract mark behind a rotating split line, the near half
  // solid and the far half faint — the reveal-and-reflect idea in one frame.
  sigilsweep: `
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="50" cy="50" r="34" opacity="0.4"/>
      <path d="M50 30 V70 M50 34 L66 44 M50 56 H64"/>
      <path d="M50 30 L36 40 M50 70 L38 60" opacity="0.32"/>
      <path d="M50 12 V88" stroke-width="2.5" opacity="0.85"/>
    </svg>`,
};

/** The SVG motif for a game id, or null if it has none (hub falls back). */
export function hubArt(id) {
  return ART[id] || null;
}
