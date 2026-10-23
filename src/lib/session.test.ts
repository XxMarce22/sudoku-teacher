import { describe, expect, it } from 'vitest'
import { FIXTURE_PUZZLES, type FixturePuzzle } from './__fixtures__/puzzles'
import { createSession, sessionReducer } from './session'
import { createSolverState, findAllSteps, findNextStep } from './solver'
import { isSolved } from './sudoku'
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
