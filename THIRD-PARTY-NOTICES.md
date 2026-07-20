# Third-Party Notices

This project ships two derived word lists. Both sources permit commercial use,
including ad-supported hosting. Retain this file when distributing the game.

---

## ENABLE word list — Public Domain

`public/data/dictionary.txt` is derived from the **ENABLE** (Enhanced North
American Benchmark Lexicon) word list, compiled by Alan Beale, filtered here to
lowercase entries of 3–12 letters.

ENABLE was explicitly released into the **public domain**. No restrictions
apply to its use, modification, or sale. Attribution is offered as a courtesy,
not an obligation.

Used solely to verify that a generated fake word is not accidentally a real
English word.

---

## SCOWL — Copyright 2000-2018 Kevin Atkinson

`src/data/commonWords.js` is generated from **SCOWL** (Spell Checker Oriented
Word Lists), size level 10, English and American variants. The full upstream
notice is retained at `scripts/data/scowl/COPYRIGHT`.

> The collective work is Copyright 2000-2018 by Kevin Atkinson as well as any
> of the copyrights mentioned below:
>
> Copyright 2000-2018 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute and sell these word lists, the
> associated scripts, the output created from the scripts, and its
> documentation for any purpose is hereby granted without fee, provided that
> the above copyright notice appears in all copies and that both that copyright
> notice and this permission notice appear in supporting documentation. Kevin
> Atkinson makes no representations about the suitability of this array for any
> purpose. It is provided "as is" without express or implied warranty.

SCOWL's level 10 tier draws on the Moby (TM) Words II package, which was
explicitly placed in the public domain, and on Alan Beale's 12Dicts package.

Note that this license explicitly covers **"the output created from the
scripts"** — which is what `commonWords.js` is — and explicitly permits
**selling**. The only obligation is that this notice travels with the work.

---

## Build tooling — MIT

Vite, esbuild, and jsdom are MIT licensed and used at **build/test time only**.
No third-party code is included in the production bundle (`dist/`); the shipped
JavaScript and CSS are original to this project.

---

## Deliberately NOT used

- **cracklib** (`/usr/share/dict/cracklib-small`) — GPL-2.0-or-later. Copyleft;
  the dictionary is served to every visitor, which constitutes distribution.
- **google-10000-english** — derived from the Google Web Trillion Word Corpus
  distributed by the Linguistic Data Consortium. Its own license states it is
  *not* recommended for commercial use without an LDC license.

Do not reintroduce either as a data source for this project.
