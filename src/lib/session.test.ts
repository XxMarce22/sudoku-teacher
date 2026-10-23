import { describe, expect, it } from 'vitest'
import { FIXTURE_PUZZLES, type FixturePuzzle } from './__fixtures__/puzzles'
import {
  assumedManualMoves,
  assumedPlacedCells,
  createSession,
  manualPlacedCells,
  sessionReducer,
  type Session,
} from './session'
import {
  applyManualDigit,
  createSolverState,
  findAllSteps,
  findDirectContradiction,
  findNextStep,
  findProvableContradiction,
  findSinglePlacementProof,
} from './solver'
import {
  digitMask,
  digitsOf,
  emptyCells,
  hasCandidate,
  isSolved,
  PEERS,
  validateGrid,
  type Grid,
} from './sudoku'
import type { LivePuzzle } from './api'

function livePuzzle(fixture: FixturePuzzle): LivePuzzle {
  return {
    grid: fixture.grid,
    meta: {
      provider: fixture.source,
      providerUrl: 'https://example.test/api',
      difficulty: fixture.difficulty,
      requestedDifficulty: 'easy',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

const solvable = FIXTURE_PUZZLES.find((puzzle) => puzzle.solvedByLogic)
const stalling = FIXTURE_PUZZLES.find((puzzle) => !puzzle.solvedByLogic)
if (!solvable || !stalling) {
  throw new Error('fixtures must include one solvable and one stalling puzzle')
}

describe('createSession', () => {
  it('starts fresh with candidates shown and no pending step', () => {
    const session = createSession(livePuzzle(solvable))
    expect(session.current).toBe(session.start)
    expect(session.pending).toBeNull()
    expect(session.history).toEqual([])
    expect(session.showCandidates).toBe(true)
    expect(session.selected).toBeNull()
    expect(session.demo).toBeNull()
  })

  it('can start from an advanced state with a pending demo step', () => {
    const state = createSolverState(solvable.grid)
    const step = findNextStep(state)
    const session = createSession(livePuzzle(solvable), {
      startState: state,
      startPending: step,
      note: 'demo',
      demo: { movesApplied: 4, attempts: 1, techniqueName: 'X-Wing' },
    })
    expect(session.current).toBe(state)
    expect(session.pending).toBe(step)
    expect(session.demo?.movesApplied).toBe(4)
  })
})

describe('hint flow', () => {
  it('shows the next teachable step and applies it', () => {
    const session = createSession(livePuzzle(solvable))
    const expected = findNextStep(session.current)

    const hinted = sessionReducer(session, { type: 'show-next' })
    expect(hinted.pending?.technique).toBe(expected?.technique)

    const applied = sessionReducer(hinted, { type: 'apply-pending' })
    expect(applied.pending).toBeNull()
    expect(applied.history).toHaveLength(1)
    expect(applied.current).not.toBe(session.current)

    for (const placement of hinted.pending?.placements ?? []) {
      expect(applied.current.grid[placement.cell]).toBe(placement.digit)
    }
  })

  it('undoes a move back to the exact previous state', () => {
    const session = createSession(livePuzzle(solvable))
    const hinted = sessionReducer(session, { type: 'show-next' })
    const applied = sessionReducer(hinted, { type: 'apply-pending' })

    const undone = sessionReducer(applied, { type: 'undo' })
    expect(undone.history).toHaveLength(0)
    expect(undone.current.grid).toEqual(session.current.grid)
    expect(undone.current.candidates).toEqual(session.current.candidates)
  })

  it('resets back to the starting board and pending step', () => {
    const state = createSolverState(solvable.grid)
    const step = findNextStep(state)
    const session = createSession(livePuzzle(solvable), {
      startState: state,
      startPending: step,
    })

    const moved = sessionReducer(
      sessionReducer(session, { type: 'show-next' }),
      { type: 'apply-pending' },
    )
    const reset = sessionReducer(moved, { type: 'reset' })
    expect(reset.current).toBe(state)
    expect(reset.pending).toBe(step)
    expect(reset.history).toEqual([])
  })

  it('clears pending steps and notes on demand', () => {
    const session = createSession(livePuzzle(solvable), { note: 'hello' })
    const hinted = sessionReducer(session, { type: 'show-next' })
    const cleared = sessionReducer(hinted, { type: 'clear-pending' })
    expect(cleared.pending).toBeNull()
    expect(cleared.note).toBeNull()

    const noted = sessionReducer(session, { type: 'set-note', note: 'note' })
    expect(noted.note).toBe('note')
  })
})

describe('solve all', () => {
  it('finishes a solvable board with logic alone and says so', () => {
    const session = createSession(livePuzzle(solvable))
    const solved = sessionReducer(session, { type: 'solve-all' })

    expect(isSolved(solved.current.grid)).toBe(true)
    expect(solved.current.grid).toEqual(solvable.solution)
    expect(solved.history.length).toBeGreaterThan(0)
    expect(solved.note).toMatch(/no guessing, no backtracking/i)
  })

  it('stops on a stalling board and refuses to guess', () => {
    const session = createSession(livePuzzle(stalling))
    const stuck = sessionReducer(session, { type: 'solve-all' })

    expect(isSolved(stuck.current.grid)).toBe(false)
    expect(stuck.note).toMatch(/will not guess/i)
    expect(findNextStep(stuck.current)).toBeNull()
    expect(findAllSteps(stuck.current)).toEqual([])
  })

  it('reports a stuck board when asked for the next move', () => {
    const session = createSession(livePuzzle(stalling))
    const sunk = sessionReducer(session, { type: 'show-next' })

    // Either the board still has a step to offer or it reports being stuck —
    // never a guess. This loops until the toolkit runs dry.
    let current = sunk
    let guard = 0
    while (current.pending && guard < 200) {
      current = sessionReducer(current, { type: 'apply-pending' })
      current = sessionReducer(current, { type: 'show-next' })
      guard += 1
    }
    expect(current.pending).toBeNull()
    expect(current.note).toMatch(/will not guess/i)
  })

  it('blames the assumption when unproven entries block the toolkit', () => {
    const session = createSession(livePuzzle(stalling))
    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell: 1 }),
      { type: 'input-digit', digit: 6 },
    )
    const attempted = sessionReducer(typed, { type: 'solve-all' })

    expect(isSolved(attempted.current.grid)).toBe(false)
    expect(attempted.note).toMatch(/unproven entry may also be wrong/i)
    expect(attempted.note).toMatch(/will not guess/i)
  })

  it('describes a finished board as conditional when an assumption remains', () => {
    const base = createSession(livePuzzle(stalling))
    // Deliberately put the wrong digit on the board: this exercises the copy
    // that must refuse to certify a solution that rests on an assumption.
    const filled = [...stalling.solution]
    filled[1] = 6
    const crafted: Session = {
      ...base,
      current: { grid: filled, candidates: Array.from({ length: 81 }, () => 0) },
      history: [
        { kind: 'manual', cell: 1, digit: 6, provenBy: null, before: base.current },
      ],
    }

    const finished = sessionReducer(crafted, { type: 'show-next' })
    expect(finished.note).toMatch(/only if that assumption is correct/i)
    expect(finished.note).toMatch(/cannot certify/i)
  })
})

describe('puzzle controls', () => {
  it('selects cells and toggles the candidate display', () => {
    const session = createSession(livePuzzle(solvable))
    const selected = sessionReducer(session, { type: 'select', cell: 40 })
    expect(selected.selected).toBe(40)

    const toggled = sessionReducer(selected, { type: 'toggle-candidates' })
    expect(toggled.showCandidates).toBe(false)
  })

  it('restarts a demo back to the original puzzle', () => {
    const state = createSolverState(solvable.grid)
    const step = findNextStep(state)
    const demo = createSession(livePuzzle(solvable), {
      startState: state,
      startPending: step,
      demo: { movesApplied: 3, attempts: 2, techniqueName: 'Swordfish' },
    })

    const restarted = sessionReducer(demo, { type: 'restart-puzzle' })
    const fresh = createSolverState(solvable.grid)
    expect(restarted.current.grid).toEqual(fresh.grid)
    expect(restarted.current.candidates).toEqual(fresh.candidates)
    expect(restarted.demo).toBeNull()
    expect(restarted.pending).toBeNull()
    expect(restarted.note).toMatch(/original puzzle/i)
  })
})

describe('keyboard input', () => {
  it("places a candidate-consistent digit and logs it as the player's move", () => {
    const session = createSession(livePuzzle(solvable))
    const cell = emptyCells(session.current.grid)[0]
    const digit = solvable.solution[cell]
    expect(hasCandidate(session.current.candidates[cell], digit)).toBe(true)

    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell }),
      { type: 'input-digit', digit },
    )

    expect(typed.current.grid[cell]).toBe(digit)
    expect(typed.current.candidates[cell]).toBe(0)
    expect(typed.history).toHaveLength(1)
    expect(typed.history[0]).toMatchObject({ kind: 'manual', cell, digit })
    expect(typed.inputFeedback?.kind).toBe('placed')
    if (typed.inputFeedback?.kind === 'placed') {
      expect(typed.inputFeedback.contradiction).toBeNull()
      // The app records whether a documented single justifies the entry.
      expect(typed.inputFeedback.provenBy).toBe(
        findSinglePlacementProof(session.current, cell, digit),
      )
    }
    expect(manualPlacedCells(typed).has(cell)).toBe(true)

    const undone = sessionReducer(typed, { type: 'undo' })
    expect(undone.current.grid).toEqual(session.current.grid)
    expect(undone.current.candidates).toEqual(session.current.candidates)
    expect(undone.inputFeedback).toBeNull()
  })

  it('treats a wrong-but-unprovable digit as an assumption, not a fact', () => {
    // This stalling fixture reproduces the reported false hint: typing 6 in
    // R1C2 (the recorded solution is 5) evades the contradiction probe, and
    // the naive next hint is "Hidden single 6 in row 2" — which only follows
    // from the assumption.
    const session = createSession(livePuzzle(stalling))
    expect(stalling.grid[1]).toBe(0)
    expect(stalling.solution[1]).toBe(5)

    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell: 1 }),
      { type: 'input-digit', digit: 6 },
    )
    expect(typed.current.grid[1]).toBe(6)
    expect(typed.inputFeedback?.kind).toBe('placed')
    if (typed.inputFeedback?.kind === 'placed') {
      expect(typed.inputFeedback.contradiction).toBeNull()
      expect(typed.inputFeedback.provenBy).toBeNull()
      expect(typed.inputFeedback.message).toMatch(/assumption/i)
    }
    expect(assumedManualMoves(typed)).toMatchObject([
      { kind: 'manual', cell: 1, digit: 6, provenBy: null },
    ])
    expect(assumedPlacedCells(typed).has(1)).toBe(true)

    const hinted = sessionReducer(typed, { type: 'show-next' })
    expect(hinted.pending?.technique).toBe('hidden-single')
    expect(hinted.pending?.title).toBe('Hidden single 6 in row 2')
    expect(hinted.pending?.placements).toEqual([{ cell: 15, digit: 6 }])
    // The hint is conditional: the recorded solution says R2C7 is not 6.
    expect(stalling.solution[15]).not.toBe(6)

    const cleared = sessionReducer(
      sessionReducer(typed, { type: 'select', cell: 1 }),
      { type: 'clear-cell' },
    )
    expect(assumedManualMoves(cleared)).toEqual([])
    expect(cleared.current.grid[1]).toBe(0)
  })

  it('does not mark an entry proven by a naked single as an assumption', () => {
    const solution = patternSolution()
    const grid = [...solution]
    grid[80] = 0
    const puzzle: LivePuzzle = {
      grid,
      meta: {
        provider: 'test',
        providerUrl: 'https://example.test/api',
        difficulty: 'easy',
        requestedDifficulty: 'easy',
        fetchedAt: '2026-01-01T00:00:00.000Z',
      },
    }

    const session = createSession(puzzle)
    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell: 80 }),
      { type: 'input-digit', digit: solution[80] },
    )
    expect(typed.history[0]).toMatchObject({ provenBy: 'naked-single' })
    expect(typed.inputFeedback?.kind).toBe('placed')
    if (typed.inputFeedback?.kind === 'placed') {
      expect(typed.inputFeedback.provenBy).toBe('naked-single')
      expect(typed.inputFeedback.message).toMatch(/naked single/i)
    }
    expect(assumedManualMoves(typed)).toEqual([])
    expect(assumedPlacedCells(typed).size).toBe(0)
  })

  it('rejects typing into a given cell or one that already holds a digit', () => {
    const session = createSession(livePuzzle(solvable))
    const given = session.current.grid.findIndex((value) => value !== 0)

    const onGiven = sessionReducer(
      sessionReducer(session, { type: 'select', cell: given }),
      { type: 'input-digit', digit: 1 },
    )
    expect(onGiven.inputFeedback?.kind).toBe('rejected')
    expect(onGiven.current).toBe(session.current)

    const empty = emptyCells(session.current.grid)[0]
    const filled = sessionReducer(
      sessionReducer(session, { type: 'select', cell: empty }),
      { type: 'input-digit', digit: solvable.solution[empty] },
    )
    const again = sessionReducer(filled, { type: 'input-digit', digit: 2 })
    expect(again.inputFeedback?.kind).toBe('rejected')
    if (again.inputFeedback?.kind === 'rejected') {
      expect(again.inputFeedback.message).toMatch(/already holds/)
    }
    expect(again.current).toBe(filled.current)
  })

  it('names the clashing unit when a digit is already placed as a peer', () => {
    const session = createSession(livePuzzle(solvable))
    const state = session.current
    let clash: { cell: number; digit: number } | null = null
    for (let cell = 0; cell < 81 && !clash; cell += 1) {
      if (state.grid[cell] !== 0) continue
      for (const peer of PEERS[cell]) {
        if (state.grid[peer] !== 0) {
          clash = { cell, digit: state.grid[peer] }
          break
        }
      }
    }
    expect(clash).not.toBeNull()
    if (!clash) return

    const rejected = sessionReducer(
      sessionReducer(session, { type: 'select', cell: clash.cell }),
      { type: 'input-digit', digit: clash.digit },
    )
    expect(rejected.inputFeedback?.kind).toBe('rejected')
    if (rejected.inputFeedback?.kind === 'rejected') {
      expect(rejected.inputFeedback.message).toMatch(/already placed in/)
    }
    expect(rejected.history).toEqual([])
    expect(rejected.current).toBe(session.current)
  })

  it('explains a rejection caused by earlier logical eliminations', () => {
    const session = createSession(livePuzzle(solvable))
    const cell = emptyCells(session.current.grid)[0]
    const digit = solvable.solution[cell]
    const candidates = [...session.current.candidates]
    // The true digit is never placed in a peer, so the only reason to reject it
    // here is the candidate mask itself.
    candidates[cell] &= ~digitMask(digit)
    const crafted: Session = {
      ...session,
      current: { grid: session.current.grid, candidates },
    }

    const rejected = sessionReducer(
      sessionReducer(crafted, { type: 'select', cell }),
      { type: 'input-digit', digit },
    )
    expect(rejected.inputFeedback?.kind).toBe('rejected')
    if (rejected.inputFeedback?.kind === 'rejected') {
      expect(rejected.inputFeedback.message).toMatch(/logical eliminations/)
    }
    expect(rejected.current).toBe(crafted.current)
    expect(rejected.history).toEqual([])
  })

  it('dismisses a pending hint when the player types', () => {
    const session = createSession(livePuzzle(solvable))
    const hinted = sessionReducer(session, { type: 'show-next' })
    const placement = hinted.pending?.placements[0]
    expect(placement).toBeDefined()
    if (!placement) return

    const typed = sessionReducer(
      sessionReducer(hinted, { type: 'select', cell: placement.cell }),
      { type: 'input-digit', digit: placement.digit },
    )
    expect(typed.pending).toBeNull()
    expect(typed.current.grid[placement.cell]).toBe(placement.digit)
  })

  it('flags a provably contradictory entry and clears it on undo', () => {
    const session = createSession(livePuzzle(solvable))
    const state = session.current
    let example: { cell: number; digit: number } | null = null
    for (let cell = 0; cell < 81 && !example; cell += 1) {
      if (state.grid[cell] !== 0) continue
      for (const digit of digitsOf(state.candidates[cell])) {
        if (digit === solvable.solution[cell]) continue
        if (findProvableContradiction(applyManualDigit(state, cell, digit))) {
          example = { cell, digit }
          break
        }
      }
    }
    expect(example).not.toBeNull()
    if (!example) return

    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell: example.cell }),
      { type: 'input-digit', digit: example.digit },
    )
    expect(typed.inputFeedback?.kind).toBe('placed')
    if (typed.inputFeedback?.kind === 'placed') {
      expect(typed.inputFeedback.contradiction).not.toBeNull()
      expect(typed.inputFeedback.message).toMatch(/contradiction/i)
    }

    const undone = sessionReducer(typed, { type: 'undo' })
    expect(undone.current.grid[example.cell]).toBe(0)
    expect(undone.history).toEqual([])
    expect(undone.inputFeedback).toBeNull()
  })

  it('does not crash when solve-all walks into a mid-chain contradiction', () => {
    const session = createSession(livePuzzle(solvable))
    const state = session.current
    let example: { cell: number; digit: number } | null = null
    for (let cell = 0; cell < 81 && !example; cell += 1) {
      if (state.grid[cell] !== 0) continue
      for (const digit of digitsOf(state.candidates[cell])) {
        if (digit === solvable.solution[cell]) continue
        const next = applyManualDigit(state, cell, digit)
        if (
          findDirectContradiction(next) === null &&
          findProvableContradiction(next) !== null
        ) {
          example = { cell, digit }
          break
        }
      }
    }
    expect(
      example,
      'expected a contradiction that only surfaces after forced moves',
    ).not.toBeNull()
    if (!example) return

    const typed = sessionReducer(
      sessionReducer(session, { type: 'select', cell: example.cell }),
      { type: 'input-digit', digit: example.digit },
    )
    expect(typed.inputFeedback?.kind).toBe('placed')

    const attempted = sessionReducer(typed, { type: 'solve-all' })
    expect(attempted.note).toMatch(/contradicts itself/i)
  })

  it('clears a typed digit, rewinding later moves that depended on it', () => {
    const session = createSession(livePuzzle(solvable))
    const [cellA, cellB] = emptyCells(session.current.grid)

    let current = sessionReducer(session, { type: 'select', cell: cellA })
    current = sessionReducer(current, {
      type: 'input-digit',
      digit: solvable.solution[cellA],
    })
    current = sessionReducer(current, { type: 'select', cell: cellB })
    current = sessionReducer(current, {
      type: 'input-digit',
      digit: solvable.solution[cellB],
    })
    expect(current.history).toHaveLength(2)

    const cleared = sessionReducer(
      sessionReducer(current, { type: 'select', cell: cellA }),
      { type: 'clear-cell' },
    )
    expect(cleared.current.grid[cellA]).toBe(0)
    expect(cleared.current.grid[cellB]).toBe(0)
    expect(cleared.history).toEqual([])
    expect(cleared.current.candidates).toEqual(session.current.candidates)
    expect(cleared.inputFeedback?.kind).toBe('cleared')
    if (cleared.inputFeedback?.kind === 'cleared') {
      expect(cleared.inputFeedback.message).toMatch(/1 move made after it/)
    }
  })

  it('clears the most recent entry in a single step', () => {
    const session = createSession(livePuzzle(solvable))
    const cell = emptyCells(session.current.grid)[0]
    let current = sessionReducer(session, { type: 'select', cell })
    current = sessionReducer(current, {
      type: 'input-digit',
      digit: solvable.solution[cell],
    })
    const cleared = sessionReducer(current, { type: 'clear-cell' })
    expect(cleared.current.grid[cell]).toBe(0)
    expect(cleared.history).toEqual([])
    if (cleared.inputFeedback?.kind === 'cleared') {
      expect(cleared.inputFeedback.message).toMatch(/^Cleared \d from R\dC\d\.$/)
    } else {
      expect(cleared.inputFeedback?.kind).toBe('cleared')
    }
  })

  it('refuses to clear givens and reports empty cells', () => {
    const session = createSession(livePuzzle(solvable))
    const given = session.current.grid.findIndex((value) => value !== 0)
    const onGiven = sessionReducer(
      sessionReducer(session, { type: 'select', cell: given }),
      { type: 'clear-cell' },
    )
    expect(onGiven.inputFeedback?.kind).toBe('info')
    if (onGiven.inputFeedback?.kind === 'info') {
      expect(onGiven.inputFeedback.message).toMatch(/given/i)
    }

    const empty = emptyCells(session.current.grid)[0]
    const onEmpty = sessionReducer(
      sessionReducer(session, { type: 'select', cell: empty }),
      { type: 'clear-cell' },
    )
    expect(onEmpty.inputFeedback?.kind).toBe('info')
    if (onEmpty.inputFeedback?.kind === 'info') {
      expect(onEmpty.inputFeedback.message).toMatch(/already empty/)
    }
  })

  it('reports a contradictory board instead of guessing or crashing', () => {
    const session = createSession(livePuzzle(solvable))
    const cell = emptyCells(session.current.grid)[0]
    const candidates = [...session.current.candidates]
    candidates[cell] = 0
    const broken: Session = {
      ...session,
      current: { grid: session.current.grid, candidates },
    }

    const hinted = sessionReducer(broken, { type: 'show-next' })
    expect(hinted.pending).toBeNull()
    expect(hinted.note).toMatch(/contradicts itself/i)

    const attempted = sessionReducer(broken, { type: 'solve-all' })
    expect(attempted.note).toMatch(/contradicts itself/i)
    expect(attempted.current).toBe(broken.current)
  })

  it('mentions your own entries when a manual move finishes the puzzle', () => {
    const solution = patternSolution()
    expect(validateGrid(solution).ok).toBe(true)
    const grid = [...solution]
    grid[80] = 0
    const puzzle: LivePuzzle = {
      grid,
      meta: {
        provider: 'test',
        providerUrl: 'https://example.test/api',
        difficulty: 'easy',
        requestedDifficulty: 'easy',
        fetchedAt: '2026-01-01T00:00:00.000Z',
      },
    }

    const session = createSession(puzzle)
    const finished = sessionReducer(
      sessionReducer(session, { type: 'select', cell: 80 }),
      { type: 'input-digit', digit: solution[80] },
    )
    expect(isSolved(finished.current.grid)).toBe(true)
    expect(finished.note).toMatch(/placed by you/i)
  })
})

/** A classic shifted-rows solution grid: valid, easy to construct. */
function patternSolution(): Grid {
  return Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9)
    const col = index % 9
    return ((row * 3 + Math.floor(row / 3) + col) % 9) + 1
  })
}
