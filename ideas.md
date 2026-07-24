Perks (for supporters)
- color themes or graphical asset packs for the games. Add a few periodically.
- archived daily games, so they have a calendar and can go back in time and
play previous days.
- Sound effect packs? I have a sound effect generator lol


New game, You have walls of letters that are scrolling by (variable speed depending on difficulty) on loop in multiple layers (go endlessly).
You have a letter (imagine B), and the first scrolling row has 6 letters, A, V, E, M, R, and S. You time your press to 'fire' the B, whatever letter it hits 
adds to the word. Imagine you hit A, now you have BA (only the last letter you hit was shown, so you're not shooting like 5 letters as that gets busy and ugly.)
The next row has more letters (different), and the player sees a T, and wants to spell battle so they aim for that. They get through 4 rows and have BATT.
Oops, the miss and hit a V. The word is cancelled since there's no BATTV word (to my knowledge).
In between each round you can cash out, so if you get BATTLE and the next row has S, you can go for the S for a better score, or you can cash out your points and not risk losing them if you miss. 
Each row should get slightly faster, so it's a greed move.
There are 5 rounds total since the player can miss and mess up easily.

--- WORKSHOPPED (measured against ENABLE, 172,820 words) ---
Working title: TBD (letter-shooter). Deliberate arcade OUTLIER — timing-driven,
no enumerated "par" like the daily puzzles. Skill floor = row-reading +
branch-knowledge + nerve, not pure reflexes.

MEASURED FACTS:
- Word layer is REAL, not cosmetic — but random rows are unfairly punishing.
  A live 4-letter prefix survives a random 6-letter row only 46-58% of the time;
  at 5 letters, 28-41% with <1 valid letter per row on average. So as literally
  described, words self-cap at ~4 letters and most deaths past that are FORCED
  (the row had no usable letter) — a loss the player could not prevent. Bad feel.
- Rigging rows to hold availability ~0.90-0.95 moves the risk from unfair
  forced-fail to TIMING, and produces a clean push-your-luck crossover: with a
  gentle speed ramp, optimal play is PUSH through length 5, STOP at 6. A steeper
  ramp pulls the stop point to 5. That interior stop point IS the greed decision.
- Two tuning knobs place the crossover: rig level (how reliably rows stay alive)
  and speed-ramp steepness.

DESIGN DECISIONS:
1. BRANCH-AWARE RIGGING. Every active row guarantees >=1 live continuation (no
   unfair deaths) AND stuffs in branching valid letters + a trap. e.g. prefix CA
   -> row has T (CAT, cash safe), R (CAR-TOON/-DIGAN, long branch), B (CAB),
   trap X (CAX dead). Word skill = picking the letter that keeps the LONGEST
   branch alive, not mere survival.
2. TIMING IS THE TAX, NOT THE WALL. Grabbing "any valid letter" (2-3 present) is
   easy; grabbing "the one that keeps a 7-letter word alive" under a speeding row
   is hard. Speed ramps WITHIN a word, resets each round.
3. GREED / CASH-OUT. Score superlinear in length (L^2 or Scrabble-value x length
   bonus). Cash out any time you sit on a complete valid word.
4. BUST = FORFEIT CURRENT WORD. A mis-time / dead-end letter loses only the
   in-progress word's points and ends that round; banked rounds are safe.
5. ROUND STRUCTURE. Run = 5 rounds (words). Within a round each row appends a
   letter, speed rising per row; cash the word or push one more row. Per-round
   push-your-luck arc + a meta-greed over the 5 rounds (bank early vs gamble last).

*** DIRECTION PIVOTED after playable prototyping — see FINAL below. The
branch-aware "spine" model is superseded by free-building. ***

FINAL DESIGN (playtested + fun, 2026-07-23):
- FREE-BUILDING, not ride-a-spine. No target word. Each scrolling row is an
  INDEPENDENT letter set with >=2 vowels guaranteed; player builds their OWN word
  by grabbing one letter per row. Cash any valid word (>=3), bust on dead prefix.
- Independent rows => look-ahead is fully honest (upper rows never change with
  your choices), which is the whole point of showing 4-5 rows: read the board,
  plan your own word around the vowels/consonants scrolling toward you.
- Measured (scratchpad/measure3.py): 2 vowels is the sweet spot — a 3rd adds
  nothing. Row WIDTH (N) is the stronger flexibility lever than vowel count, so
  rows WIDEN with word depth ("next row has more letters") to counter the
  availability sag. Words reliable through len 4, an achievement at 5, a stretch
  at 6+ — a healthy word-game curve; the L5+ dip becomes a read-the-board greed
  decision (cash the 4 or gamble the 5) rather than a rigged death.
- Prototype: scratchpad/lettershooter/ (index.html + commonwords.txt +
  dictionary.txt), served via python http.server. Tunable sliders: base speed,
  speed ramp/letter, row-speed spread, visible rows, letters/row, assist toggle
  (green-marks playable letters in active row). Full 125k ENABLE = validity backstop.
- LOCKED: FIXED SEED — everyone gets the identical daily board (same letters,
  speeds, directions, phases) so it's fair/shareable; NOT par-comparable like the
  puzzle games (timing execution varies), leaderboard = score. GIVEN AMMO — the
  first letter is handed to everyone (same seed), player does NOT pick it.
  => IMPL NOTE: all randomness (rows, speeds, dirs, scroll phase, ammo) must come
  from ONE seeded PRNG stream keyed on the date, not Math.random, so the endless
  row sequence is deterministic and identical for all players.
- Still open: port to src/games/lettershooter.

--- superseded exploration (kept for the measured facts) ---
GENERATOR PROTOTYPED + VALIDATED (scratchpad/generator.py, sim2.py):
- Branch-aware generator: given live prefix, rank live letters by longest word
  reachable (maxlen over prefix trie), always seed the top "long branch" letter +
  a short/safe letter, fill rest with frequency-weighted DEAD letters as traps.
- Availability 85-100% (sub-100% only = words that truly can't extend, e.g.
  STRENGTH — not unfair deaths). Long branch plantable in 87-100% of early/mid
  rows, ~54% by len 7. Trap count scales with difficulty (easy 3 / med 5 / hard 6-7).
- STOP DECISION IS REAL + INTERIOR: optimal target length peaks mid-range
  (easy/med gentle ramp = T5, hard = T4; steep ramp pulls to T3-4), ~30% score
  swing between stopping-too-early and pushing-too-far. Difficulty knobs work:
  steeper ramp -> shorter optimal word; more traps -> shorter optimal word.
- Word knowledge IS the skill: sim ceiling assumes player knows which live letter
  is the long branch; real gap vs "grab any live letter" = the word-skill payoff.
- CAVEAT: bust rates high (~50-60% pushing to T5) -> swingy, many forfeited words.
  forfeit-on-bust cushions it; parking at T4 stays within ~15% of optimal (casual-safe).

STILL OPEN: (1) FEEL — timing juice/fairness only judgeable by playing; needs a
playable HTML feel-test (fire input, scroll speed, hit window, readability of the
long branch under motion). (2) Port generator to JS in-repo. (3) Daily fairness =
fixed seed for layouts/speeds; NOT par-comparable like the other games.


New game idea, it is a color mixing game like previous (colorpath). You have a ball at the top of the screen, it's imagine that it's white! (pip friendly) There is a vertical wall below it, and you choose where to drop the white ball at the top. The vertical wall just below has two sides, the left side and the right side. The left side is colored red, (labeled near by with pip) and the right side is colored blue (same with pip). If the wall goes to the left side of the wall it becomes blue. There are two more similar walls below the first vertical wall, similarly one side on the left wall, is Yellow and Red, and the right wall is Blue and Yellow. If the player drops the ball in a way that goes to the left of the first wall, it will first turn red, then if the ball lands on the left side of the left secondary wall, it will become green, because it has passed the yellow side. Blue + Yellow = Green. Finally there is a goal at the bottom of the screen, it is Purple (appropriately labled with PIP just above or below it so it's obvious to DVT players). If the ball that passes the goal is Purple, the player gets points based on how quickly they determined to drop the ball, the faster they drop the ball in the correct set of gates (the lines) the more points they get. If they are wrong, they lose a set amount of points, such as 100. After every ball drop, the colors of each line, starting ball, and goal change. If two secondary colors are mixed they equal brown. So Green + Purple = brown. On medium mode, we can allow for negative colors, such as negative blue, which is denoted by a -, that will subtract blue from the ball, so if it was purple before passing, it will now become red. This adds complexity. We can consider throwing shades around for the hard mode, but I am open to pushback.

numburst:
Lower damage of combos very slightly.
Show a PERFECT text if the user clears the board.