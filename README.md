# Sudoku Sensei — Solver / Teacher

A Sudoku solver that refuses to guess. Every placement and every elimination is
produced by a named, human-checkable technique, explained in plain language on
the board itself. Puzzles are fetched live from public sudoku APIs — nothing is
generated locally, and the app never asks an API for the answer.

## The no-brute-force pledge

- The solver has **no backtracking, no trial placements, no hidden search**.
  There is no brute-force code anywhere in this repository.
- When a board cannot advance with a known technique, the app says so
  ("I will not guess") instead of silently searching.
- All 17 implemented techniques are *sound*: they never remove a candidate or
  place a digit that could contradict a valid solution.
- Digits you type yourself are checked against the candidate model and probed
  for provable contradictions, but they are never counted as deductions — the
  move log labels them as yours.

The full promise is spelled out in the app under **No-guess pledge**.

## Puzzle sources (APIs only)

| Provider | Role | Notes |
| --- | --- | --- |
| [Sudoku100](https://www.sudoku100.com/api) | Primary | Free, no key. Every puzzle is validated to have a unique solution. It does **not** send CORS headers, so the browser reaches it through a local proxy (see below). |
| [Sugoku](https://sugoku.onrender.com/) | Fallback | CORS-enabled, called directly. Does not guarantee unique solutions. |
| [Dosuku](https://sudoku-api.vercel.app/) | Fallback | CORS-enabled, called directly. Does not guarantee unique solutions. |

Every fetched board is validated before it is shown: 81 integer cells, no
repeats in any row/column/box, and at least one candidate in every empty cell.
The app requests **puzzles only** — never solutions — and stores the last live
puzzle in `localStorage` so a refresh does not lose the board.

### The local proxy

`vite.config.ts` exposes `/puzzle-api/sudoku100/*` → `https://www.sudoku100.com/*`
for both `npm run dev` and `npm run preview`. That is what lets the browser use
Sudoku100 despite its missing CORS headers. On a plain static deployment the
proxy path is unavailable; the app detects that and falls back to Sugoku and
Dosuku automatically.

## Techniques

Basics: naked single, hidden single. Intermediate: naked/hidden pairs and
triples, pointing, claiming. Advanced: naked/hidden quads, X-Wing, Swordfish,
Jellyfish, XY-Wing, XYZ-Wing, Skyscraper, Simple Coloring.

The **Techniques** view can search live puzzles for a real example of any
technique and load it into the dojo.

## Playing by hand

The board is fully playable from the keyboard:

- click a cell (or move with the **arrow keys**, **Home**, **End**) and type
  **1–9** to fill it;
- **Backspace**, **Delete**, or **0** clears the selected cell;
- **Undo** / **Reset** and the move log cover hand-played entries too.

Hand-played digits are held to the dojo's standards, not exempted from them:

- an entry is accepted only if the digit is still a candidate for that cell
  (no row/column/box clashes, nothing already eliminated by logic);
- after every accepted entry the engine replays *forced logical moves only* and
  reports it immediately if it finds a provable contradiction — with a one-tap
  undo;
- a typed digit is still your move, not a theorem: it is labelled "You" in the
  move log and never presented as a proven deduction. When clearing an entry
  that later moves depended on, those moves are rewound with it so the board
  always stays logically consistent.

## Commands

```bash
npm install
npm run dev        # app + Sudoku100 proxy
npm run test       # vitest suite (fixtures, solver audits, session, api)
npm run lint       # oxlint
npm run build      # tsc -b && vite build
npm run preview    # serves dist/ with the same proxy
npm run collect-fixtures   # refresh test fixtures from live APIs (network)
```

## Architecture

```
src/lib/
  sudoku.ts        grid/unit/peer maths, candidate masks, validation, formatting
  solver.ts        the 17 deterministic detectors + findNextStep/findAllSteps/applyStep
  techniques.ts    technique catalog (names, levels, teaching copy)
  api.ts           Sudoku100 proxy + Sugoku/Dosuku fallbacks with validation
  cache.ts         localStorage cache of the last live puzzle
  exampleSearch.ts plays fetched puzzles until a requested technique appears
  session.ts       session reducer: hints, keyboard input, apply, undo, reset
  __fixtures__/    audited live puzzles for the test suite (generated)
src/components/    Board, SenseiPanel, TechniqueLibrary, PledgeView, Header
scripts/           dev-only fixture collector (fetches + audits, never solves)
```

### Tests

`npm test` runs 115 checks, including:

- full replays of live API puzzles, asserting every deduction agrees with the
  recorded solution and that givens are never touched;
- honest-stall tests: puzzles the toolkit cannot finish are kept on purpose, and
  the app must report being stuck rather than guess;
- contradiction-probe tests: true digits never trip the probe, wrong digits it
  can prove dead ends are flagged, and hand-played entries are undone cleanly;
- API fallback tests with mocked network responses and abort handling.

Fixtures are collected with `npm run collect-fixtures`, which fetches boards
from Sudoku100 and Dosuku and audits every deduction before writing
`src/lib/__fixtures__/puzzles.ts`. The collector only fetches — it contains no
search or guessing.

Sudoku100 serves the primary puzzles; thanks to the Sudoku100 team for the
free API.
