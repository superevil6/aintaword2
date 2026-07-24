# colordrop — design spec

Status: **SHIPPED** (2026-07-23) — wired into the menu, verify + e2e green, 122-day
archive built. Name is a placeholder sibling to `colorpath`; rename is cheap
(folder + id + manifest). Kill switch: remove the one import line in src/main.js.

## One-liner

A falling-ball color-mixing speed puzzle. A blank (white) ball drops through a
short board of two-sided walls; each side it passes adds or subtracts a pigment.
Read the board, pick the one drop lane whose recipe mixes to the goal color, and
commit fast. Fast + correct = big points; wrong = flat penalty.

This is an **arcade outlier** in the collection (timing-scored, no enumerated
"par"), the same family as the letter-shooter idea — not a deduction puzzle like
the word games.

## Color algebra — reuse `colorpath/colors.js`

Do **not** invent a color model. Lift the RYB 3-bit bitmask wholesale:

```
RED = 001   YELLOW = 010   BLUE = 100
WHITE = 000  ORANGE = 011  PURPLE = 101  GREEN = 110  BROWN = 111
```

Ball starts **WHITE = 0** (a blank canvas, not additive-light white).

- **Add a pigment** (positive gate) = OR the bit.   `Red|Yellow = Orange`
- **Subtract a pigment** (negative gate, "−") = AND-NOT the bit.  `Purple & ~Blue = Red`

Everything the user described falls out for free:
- two secondaries mix to brown: `Green(110) | Purple(101) = 111 = Brown` ✓
- adding a pigment you already have is a no-op (OR is idempotent) — matters for
  the generator's uniqueness reasoning.

Reuse directly: `COLOR_NAMES`, `pipsMarkup`, `colorHex`/`paintSwatch`, the
`classic` + `cvd` palettes, and the `PALETTE_EVENT` theming. **This is what makes
the game colorblind-accessible on day one** — the pips + cvd lightness ladder are
already tuned in colorpath. Do not add a shade/lightness axis: it overloads the
exact channel the cvd palette depends on. (Cut, per user.)

## Board = N deterministic lanes

The board is **N vertical drop lanes**. The walls are the visual justification for
why lane *k* has recipe *k*; the outcome is decided the instant the player drops.

- The ball **falls straight and keeps its lane**. At each wall it goes left/right
  purely by which side of the apex its x is on. **No ricochet, no randomness** —
  same drop-x always yields the same color. (The falling animation is cosmetic
  reward; the result is a lane→recipe lookup.)
- The ball must **retain its horizontal position through every level** so a
  2-level board yields 4 distinct outcomes, not 2. Think in lanes, not bounces.
- Each wall has two sides, each **labeled + pipped** (left/right), showing the
  pigment op it applies (`+Red`, `−Blue`, …).
- **Apex drops:** disallow a drop directly over a wall apex — a thin dead-zone,
  or snap the drop into the nearest lane. The player never gets an ambiguous
  result.
- **Goal** sits at the bottom, a single target color, labeled + pipped above/below
  so it's unambiguous for cvd players.

## Generator contract (must be solvable + unique)

Order matters — this is the fix for the "unreachable Purple" bug in the original
pitch:

1. Lay out the walls first (topology + which pigment op each side applies).
2. **Enumerate every lane's full recipe** by folding its ops over WHITE
   (`fold |bit / &~bit`). This yields the reachable leaf colors.
3. **Pick the goal from the enumerated leaves** — never independently.
4. Ensure the goal color appears at **exactly one leaf** (unique correct lane).
   Re-roll gates or the goal until this holds.
5. Ensure **every lane has a non-zero-width drop zone** (a centered wall-1 with
   sub-walls crammed against it can leave a recipe unhittable — a layout, not
   logic, constraint).

Ship a small enumeration/solver used both by the daily-set builder and a verify
script, so no board ever ships unsolvable or ambiguous (mirrors mirrorword/storey
`verify-*` gates). **This is the "measure before shipping" step for this game.**

## Difficulty ladder — corrected by measurement

The original plan ("negatives are the ladder, add them at depth 2 for medium")
was **falsified by `scripts/measure-colordrop.mjs`**. Two structural ceilings:

1. **At depth 2, a live subtraction can only cancel the one held primary back to
   White.** You can't subtract *down to a real color* until there are two
   pigments to remove one from — i.e. depth 3. So depth-2 negatives just spawn
   White goals and dead no-ops; medium had to move to depth 3.
2. **Forcing the *answer lane* to subtract collapses the goal to a primary.** A
   depth-3 subtracting lane has ≤2 adds before the subtract, so it lands on one
   bit. So hard requires subtraction to be *in play* (live decoys the player
   must compute), not that the answer itself subtracts — that keeps the full
   goal palette.

Ladder (FINAL — driven by the user's "rows" framing + measurement):

| Tier   | Board (rows/lanes) | Gates                              | What's new             |
|--------|--------------------|------------------------------------|------------------------|
| Easy   | 2 rows / 4 lanes   | primary, adds only                 | pure union eval        |
| Medium | 3 rows / 8 lanes   | primary, + minus gates             | a row + subtraction    |
| Hard   | 3 rows / 8 lanes   | primary + **secondary**, + minus   | two-bit gates (+Orange)|

Measured facts behind this:
- **Depth-4 hard was rejected**: adds-only depth 4 saturates (7/16 lanes brown,
  46% can't place a goal); and 16 lanes is too dense to read fast.
- **Secondary gates need minus gates**: a secondary is +2 bits, so adds-only
  secondary collapses (5/8 brown, 44% unsolvable). Secondary + minus is the
  richest board measured (93% solvable, even goal palette across all 7 colors).
- Minus gates only bite at depth ≥3 (at depth 2 a live subtraction just cancels
  to White) — which is why they enter at medium.

Interaction: a 2D spatial playfield (the user's sketch) — one white ball, aim &
release, straight drop (no physics), walls as slotting lines down to the goal.
No shades on any tier.

## Scoring & session

- **One drop per board.** Commit, watch it resolve, score, next board.
- Correct: points scale with **speed** (time from board-reveal to drop; the fall
  animation itself doesn't count against the clock).
- Wrong: flat **−100** (penalty can scale with tier later).
- **Daily, fixed seed: 3–5 boards per difficulty.** Not endlessly generated —
  everyone gets the same set that day, so the total score is comparable and
  shareable. Come back tomorrow for a new set.

## Reuse map (mirror colorpath's structure)

- `colors.js` — **import from colorpath or extract to shared core**; do not fork.
- `generator.js` — walls + enumerate-then-pick-goal contract above.
- `dailySet.js` / `results.js` / `share.js` — clone colorpath's daily-seed,
  best-score persistence, and spoiler-free share patterns.
- `difficulty.js`, `tutorial.js`, `game.js` (drop UI + fall animation), `index.js`,
  `colordrop.css`.
- Register in `main.js` + share manifest + `package.json` test chain; add
  `verify-colordrop` + `e2e-colordrop` (use the `e2e-*` harness that exposes
  `CustomEvent`/`Event` globals — see the known base-e2e issue).

## Open / next

- Enumeration solver + daily-set builder (the gating deliverable).
- Lane-layout math guaranteeing every recipe a real drop zone.
- Point curve for the speed reward; per-tier penalty scaling.
- Archive of past daily sets as a supporter perk (shared infra).
