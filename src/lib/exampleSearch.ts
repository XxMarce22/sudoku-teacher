import { fetchPuzzle, type LivePuzzle, type PuzzleDifficulty } from './api'
import {
  applyStep,
  createSolverState,
  findAllSteps,
  findNextStep,
  type SolverState,
  type Step,
} from './solver'
import { TECHNIQUE_BY_ID, type TechniqueId } from './techniques'
import { isSolved } from './sudoku'

export const EXAMPLE_SEARCH_ATTEMPTS = 6

export interface TechniqueExample {
  puzzle: LivePuzzle
  state: SolverState
  step: Step
  movesApplied: number
  attempts: number
}

export interface ExampleSearchProgress {
  attempt: number
  attempts: number
  phase: 'fetching' | 'scanning'
  puzzle?: LivePuzzle
  moves?: number
}

export interface ExampleSearchOptions {
  attempts?: number
  difficulty?: PuzzleDifficulty
  signal?: AbortSignal
  onProgress?: (progress: ExampleSearchProgress) => void
}

function difficultyForTechnique(technique: TechniqueId): PuzzleDifficulty {
  const meta = TECHNIQUE_BY_ID[technique]
  if (meta.level === 'basics') return 'easy'
  if (meta.level === 'intermediate') return 'medium'
  return 'hard'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The example search was cancelled.', 'AbortError')
  }
}

export async function searchTechniqueExample(
  technique: TechniqueId,
  options: ExampleSearchOptions = {},
): Promise<TechniqueExample | null> {
  const attempts = options.attempts ?? EXAMPLE_SEARCH_ATTEMPTS
  const difficulty = options.difficulty ?? difficultyForTechnique(technique)
  const { signal, onProgress } = options

  let puzzlesFetched = 0
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(signal)
    onProgress?.({ attempt, attempts, phase: 'fetching' })

    let puzzle: LivePuzzle
    try {
      puzzle = await fetchPuzzle(difficulty, signal)
      puzzlesFetched += 1
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      lastError = error instanceof Error ? error : new Error('The puzzle API failed.')
      continue
    }

    throwIfAborted(signal)
    onProgress?.({ attempt, attempts, phase: 'scanning', puzzle, moves: 0 })

    let state = createSolverState(puzzle.grid)
    for (let moves = 0; moves <= 120; moves += 1) {
      throwIfAborted(signal)
      if (moves % 20 === 0) {
        onProgress?.({ attempt, attempts, phase: 'scanning', puzzle, moves })
      }

      const steps = findAllSteps(state)
      const match = steps.find((step) => step.technique === technique)
      if (match) {
        return {
          puzzle,
          state,
          step: match,
          movesApplied: moves,
          attempts: attempt,
        }
      }

      if (isSolved(state.grid)) break
      const next = findNextStep(state)
      if (!next) break
      state = applyStep(state, next)
    }
  }

  if (puzzlesFetched === 0 && lastError) throw lastError
  return null
}

export function preferredDifficultyForTechnique(
  technique: TechniqueId,
): PuzzleDifficulty {
  return difficultyForTechnique(technique)
}
