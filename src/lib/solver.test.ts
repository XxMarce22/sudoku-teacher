import { describe, expect, it } from 'vitest'
import { FIXTURE_PUZZLES, type FixturePuzzle } from './__fixtures__/puzzles'
import {
  applyManualDigit,
  applyStep,
  createSolverState,
  findAllSteps,
  findDirectContradiction,
  findNextStep,
  findProvableContradiction,
  findSinglePlacementProof,
  type SolverState,
  type Step,
} from './solver'
import { TECHNIQUES, type TechniqueId } from './techniques'
import {
  ALL_UNITS,
  digitMask,
  digitsOf,
  emptyCells,
  hasCandidate,
  isSolved,
  PEERS,
  popcount,
  validateGrid,
  type Grid,
} from './sudoku'

interface Trace {
  steps: Step[]
  finalState: SolverState
}

/** Replays a board the way the app does: one teachable step at a time. */
function playThrough(grid: Grid): Trace {
  let state = createSolverState(grid)
  const steps: Step[] = []

  for (let move = 0; move < 200; move += 1) {
    if (isSolved(state.grid)) break
    const next = findNextStep(state)
    if (!next) break
    steps.push(next)
    state = applyStep(state, next)
  }

  return { steps, finalState: state }
}

describe('fixture safety net', () => {
  it('records at least one fixture of each kind', () => {
    expect(FIXTURE_PUZZLES.some((puzzle) => puzzle.solvedByLogic)).toBe(true)
    expect(FIXTURE_PUZZLES.some((puzzle) => !puzzle.solvedByLogic)).toBe(true)
    expect(FIXTURE_PUZZLES.some((puzzle) => puzzle.source === 'Sudoku100')).toBe(true)
    expect(FIXTURE_PUZZLES.some((puzzle) => puzzle.source === 'Dosuku')).toBe(true)
  })

  for (const puzzle of FIXTURE_PUZZLES) {
    const label = `${puzzle.source} ${puzzle.difficulty} (${puzzle.grid.filter((v) => v !== 0).length} givens)`

    describe(label, () => {
      expect(validateGrid(puzzle.grid).ok).toBe(true)

      const trace = playThrough(puzzle.grid)

      it('never changes a given', () => {
        for (let cell = 0; cell < 81; cell += 1) {
          if (puzzle.grid[cell] === 0) continue
          expect(trace.finalState.grid[cell]).toBe(puzzle.grid[cell])
        }
      })

      it('only makes deductions that agree with the recorded solution', () => {
        for (const step of trace.steps) {
          expect(step.placements.length + step.eliminations.length).toBeGreaterThan(0)
          for (const placement of step.placements) {
            expect(placement.digit).toBe(puzzle.solution[placement.cell])
          }
          for (const elimination of step.eliminations) {
            expect(puzzle.solution[elimination.cell]).not.toBe(elimination.digit)
          }
        }
      })

      if (puzzle.solvedByLogic) {
        it('completes the board with documented techniques alone', () => {
          expect(isSolved(trace.finalState.grid)).toBe(true)
          expect(trace.finalState.grid).toEqual(puzzle.solution)
          expect(validateGrid(trace.finalState.grid).ok).toBe(true)
        })
      } else {
        it('stalls honestly instead of guessing', () => {
          expect(isSolved(trace.finalState.grid)).toBe(false)
          expect(findNextStep(trace.finalState)).toBeNull()
        })
      }
    })
  }
})

describe('findAllSteps', () => {
  it('offers only sound, effective steps at every state, across every fixture', () => {
    const covered = new Set<TechniqueId>()

    for (const puzzle of FIXTURE_PUZZLES) {
      let state = createSolverState(puzzle.grid)

      for (let move = 0; move < 200; move += 1) {
        if (isSolved(state.grid)) break

        const steps = findAllSteps(state)
        const techniques = new Set(steps.map((step) => step.technique))
        expect(techniques.size).toBe(steps.length) // one step per technique

        for (const step of steps) {
          covered.add(step.technique)
          expect(step.placements.length + step.eliminations.length).toBeGreaterThan(0)
          for (const placement of step.placements) {
            expect(placement.digit).toBe(puzzle.solution[placement.cell])
          }
          for (const elimination of step.eliminations) {
            expect(puzzle.solution[elimination.cell]).not.toBe(elimination.digit)
          }
        }

        const next = findNextStep(state)
        if (!next) break
        state = applyStep(state, next)
      }
    }

    for (const technique of TECHNIQUES) {
      expect(covered, `technique ${technique.id} never appeared`).toContain(technique.id)
    }
  })
})

describe('applyStep', () => {
  it('applies placements and eliminations without mutating the input state', () => {
    const puzzle = FIXTURE_PUZZLES[0]
    const state = createSolverState(puzzle.grid)
    const step = findNextStep(state)
    expect(step).not.toBeNull()
    if (!step) return

    const gridBefore = [...state.grid]
    const candidatesBefore = [...state.candidates]
    const after = applyStep(state, step)

    expect(state.grid).toEqual(gridBefore)
    expect(state.candidates).toEqual(candidatesBefore)
    expect(after).not.toBe(state)
    expect(after.grid).not.toBe(state.grid)
    expect(after.candidates).not.toBe(state.candidates)

    for (const placement of step.placements) {
      expect(after.grid[placement.cell]).toBe(placement.digit)
      expect(after.candidates[placement.cell]).toBe(0)
    }
    for (const elimination of step.eliminations) {
      expect(hasCandidate(after.candidates[elimination.cell], elimination.digit)).toBe(
        false,
      )
    }

    // The step's effect must match placements, eliminations, and the peer
    // clean-up of each placement — nothing more.
    const affected = new Set<number>([
      ...step.placements.map((item) => item.cell),
      ...step.eliminations.map((item) => item.cell),
    ])
    for (const placement of step.placements) {
      for (const peer of PEERS[placement.cell]) affected.add(peer)
      for (const peer of PEERS[placement.cell]) {
        if (gridBefore[peer] === 0) {
          expect(hasCandidate(after.candidates[peer], placement.digit)).toBe(false)
        }
      }
    }
    for (let cell = 0; cell < 81; cell += 1) {
      if (affected.has(cell)) continue
      expect(after.grid[cell]).toBe(gridBefore[cell])
      expect(after.candidates[cell]).toBe(candidatesBefore[cell])
    }
  })

  it('refuses to place a digit into an occupied cell', () => {
    const state = createSolverState(FIXTURE_PUZZLES[0].grid)
    const fakeStep: Step = {
      technique: 'naked-single',
      title: 'Nonsense',
      summary: 'Nonsense',
      explanation: 'Nonsense',
      cells: [0],
      secondaryCells: [],
      placements: [{ cell: 0, digit: 1 }],
      eliminations: [],
    }
    expect(() => applyStep(state, fakeStep)).toThrow(/occupied/)
  })
})

describe('determinism', () => {
  it('replays the same board to the same trace every time', () => {
    const puzzle = FIXTURE_PUZZLES.find((item) => item.solvedByLogic)
    expect(puzzle).toBeDefined()
    if (!puzzle) return

    const first = playThrough(puzzle.grid)
    const second = playThrough(puzzle.grid)

    expect(first.steps.map((step) => step.technique)).toEqual(
      second.steps.map((step) => step.technique),
    )
    expect(first.finalState.grid).toEqual(second.finalState.grid)
    expect(first.finalState.candidates).toEqual(second.finalState.candidates)
  })
})

describe('first techniques on a nearly empty board', () => {
  it('places a naked single when only one digit remains', () => {
    const grid = Array.from({ length: 81 }, () => 0)
    for (let col = 1; col <= 8; col += 1) grid[col] = col + 1 // row 1: digits 2-9
    expect(validateGrid(grid).ok).toBe(true)

    const step = findNextStep(createSolverState(grid))
    expect(step?.technique).toBe('naked-single')
    expect(step?.placements).toEqual([{ cell: 0, digit: 1 }])
  })

  it('spots a hidden single that is not a naked single', () => {
    const grid = Array.from({ length: 81 }, () => 0)
    // Box 1 (top-left) can only hold 8 in R1C1: every other cell of the box
    // sees an 8 in its row or column.
    grid[14] = 8 // row 2, outside the box
    grid[25] = 8 // row 3, outside the box
    grid[38] = 8 // column 3, outside the box
    grid[55] = 8 // column 2, outside the box
    expect(validateGrid(grid).ok).toBe(true)

    const state = createSolverState(grid)
    expect(state.candidates[0]).toBe(511) // R1C1 still has all nine candidates
    const step = findNextStep(state)
    expect(step?.technique).toBe('hidden-single')
    expect(step?.placements).toContainEqual({ cell: 0, digit: 8 })
    expect(step?.unit?.name).toBe('row 1')
    expect(step?.unit?.cells).toContain(0)
  })
})

describe('findSinglePlacementProof', () => {
  it('recognises a naked single', () => {
    const grid = Array.from({ length: 81 }, () => 0)
    for (let col = 1; col <= 8; col += 1) grid[col] = col + 1
    const state = createSolverState(grid)
    expect(findSinglePlacementProof(state, 0, 1)).toBe('naked-single')
    expect(findSinglePlacementProof(state, 0, 2)).toBeNull() // not a candidate
  })

  it('recognises a hidden single', () => {
    const grid = Array.from({ length: 81 }, () => 0)
    grid[14] = 8
    grid[25] = 8
    grid[38] = 8
    grid[55] = 8
    const state = createSolverState(grid)
    expect(findSinglePlacementProof(state, 0, 8)).toBe('hidden-single')
  })

  it('returns null when no single proves the digit', () => {
    const state = createSolverState(Array.from({ length: 81 }, () => 0))
    expect(findSinglePlacementProof(state, 40, 5)).toBeNull()
  })

  it('returns null for an occupied cell', () => {
    const puzzle = FIXTURE_PUZZLES[0]
    const state = createSolverState(puzzle.grid)
    const filled = state.grid.findIndex((value) => value !== 0)
    expect(findSinglePlacementProof(state, filled, 1)).toBeNull()
  })
})

describe('applyManualDigit', () => {
  it('fills a cell, clears its mask, and removes the digit from every peer', () => {
    const puzzle = FIXTURE_PUZZLES.find((item) => item.solvedByLogic)
    if (!puzzle) throw new Error('expected a logic-solvable fixture')
    const state = createSolverState(puzzle.grid)
    const cell = emptyCells(state.grid)[0]
    const digit = puzzle.solution[cell]

    const gridBefore = [...state.grid]
    const candidatesBefore = [...state.candidates]
    const after = applyManualDigit(state, cell, digit)

    expect(state.grid).toEqual(gridBefore)
    expect(state.candidates).toEqual(candidatesBefore)
    expect(after.grid[cell]).toBe(digit)
    expect(after.candidates[cell]).toBe(0)
    for (const peer of PEERS[cell]) {
      expect(hasCandidate(after.candidates[peer], digit)).toBe(false)
    }
  })

  it('refuses to fill an occupied cell', () => {
    const state = createSolverState(FIXTURE_PUZZLES[0].grid)
    const filled = state.grid.findIndex((value) => value !== 0)
    expect(() => applyManualDigit(state, filled, 1)).toThrow(/occupied/)
  })
})

function findProvablyWrongEntry(puzzle: FixturePuzzle) {
  const state = createSolverState(puzzle.grid)
  for (let cell = 0; cell < 81; cell += 1) {
    if (state.grid[cell] !== 0) continue
    for (const digit of digitsOf(state.candidates[cell])) {
      if (digit === puzzle.solution[cell]) continue
      const contradiction = findProvableContradiction(
        applyManualDigit(state, cell, digit),
      )
      if (contradiction) {
        return { cell, digit, forcedMoves: contradiction.forcedMoves }
      }
    }
  }
  return null
}

describe('contradiction probe', () => {
  const solvable = FIXTURE_PUZZLES.find((puzzle) => puzzle.solvedByLogic)
  if (!solvable) throw new Error('expected a logic-solvable fixture')

  it('stays quiet when true solution digits are entered', () => {
    const empties = emptyCells(solvable.grid)
    const sample = empties.filter((_, index) => index % 4 === 0)

    for (const cell of sample) {
      const state = applyManualDigit(
        createSolverState(solvable.grid),
        cell,
        solvable.solution[cell],
      )
      expect(
        findProvableContradiction(state),
        `no contradiction expected after placing the solution digit in cell ${cell}`,
      ).toBeNull()
    }
  })

  it('flags a wrong-but-candidate digit with a provable contradiction', () => {
    const example = findProvablyWrongEntry(solvable)
    expect(
      example,
      'expected at least one candidate-consistent wrong digit to be provably contradictory',
    ).not.toBeNull()
    if (!example) return
    expect(example.forcedMoves).toBeGreaterThanOrEqual(0)
  })

  it('does not invent a contradiction when the board merely stalls', () => {
    const stalling = FIXTURE_PUZZLES.find((puzzle) => !puzzle.solvedByLogic)
    if (!stalling) throw new Error('expected a stalling fixture')
    const trace = playThrough(stalling.grid)
    expect(findProvableContradiction(trace.finalState)).toBeNull()
  })
})

describe('findDirectContradiction', () => {
  it('is silent on valid fixture boards', () => {
    for (const puzzle of FIXTURE_PUZZLES) {
      expect(findDirectContradiction(createSolverState(puzzle.grid))).toBeNull()
    }
  })

  it('sees an empty cell with no candidates', () => {
    const state = createSolverState(FIXTURE_PUZZLES[0].grid)
    const cell = emptyCells(state.grid)[0]
    const candidates = [...state.candidates]
    candidates[cell] = 0
    const contradiction = findDirectContradiction({
      grid: state.grid,
      candidates,
    })
    expect(contradiction?.kind).toBe('empty-cell')
    expect(contradiction?.cell).toBe(cell)
    expect(contradiction?.forcedMoves).toBe(0)
  })

  it('sees a unit with no position left for a digit', () => {
    const state = createSolverState(FIXTURE_PUZZLES[0].grid)
    let target: { unitName: string; cells: number[]; digit: number } | null = null
    for (const unit of ALL_UNITS) {
      for (let digit = 1; digit <= 9; digit += 1) {
        if (unit.cells.some((cell) => state.grid[cell] === digit)) continue
        const positions = unit.cells.filter(
          (cell) =>
            state.grid[cell] === 0 && hasCandidate(state.candidates[cell], digit),
        )
        if (positions.length === 0) continue
        const safe = positions.every(
          (cell) => popcount(state.candidates[cell]) >= 2,
        )
        if (!safe) continue
        target = { unitName: unit.name, cells: unit.cells, digit }
        break
      }
      if (target) break
    }
    expect(target).not.toBeNull()
    if (!target) return

    const candidates = [...state.candidates]
    for (const cell of target.cells) {
      candidates[cell] &= ~digitMask(target.digit)
    }
    const contradiction = findDirectContradiction({ grid: state.grid, candidates })
    expect(contradiction?.kind).toBe('missing-digit')
    expect(contradiction?.unitName).toBe(target.unitName)
    expect(contradiction?.digit).toBe(target.digit)
  })
})
