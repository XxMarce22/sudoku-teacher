import { validateGrid, type Grid } from './sudoku'
import type { LivePuzzle, PuzzleDifficulty } from './api'

const STORAGE_KEY = 'sudoku-sensei:last-live-puzzle:v1'

interface StoredPuzzle {
  grid: Grid
  meta: LivePuzzle['meta']
}

function isDifficulty(value: unknown): value is PuzzleDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'random'
}

export function saveCachedPuzzle(puzzle: LivePuzzle): void {
  try {
    const payload: StoredPuzzle = {
      grid: puzzle.grid,
      meta: puzzle.meta,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // A blocked storage API should never stop the dojo from working.
  }
}

export function readCachedPuzzle(): LivePuzzle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredPuzzle>
    if (!parsed || !Array.isArray(parsed.grid) || !parsed.meta) return null

    const validation = validateGrid(parsed.grid)
    if (!validation.ok) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    const meta = parsed.meta
    if (
      typeof meta.provider !== 'string' ||
      typeof meta.providerUrl !== 'string' ||
      typeof meta.difficulty !== 'string' ||
      typeof meta.fetchedAt !== 'string' ||
      !isDifficulty(meta.requestedDifficulty)
    ) {
      return null
    }

    return { grid: [...parsed.grid], meta }
  } catch {
    return null
  }
}
