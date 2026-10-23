import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCachedPuzzle, saveCachedPuzzle } from './cache'
import { FIXTURE_PUZZLES } from './__fixtures__/puzzles'
import type { LivePuzzle } from './api'

const sourcePuzzle = FIXTURE_PUZZLES[0]

const livePuzzle: LivePuzzle = {
  grid: sourcePuzzle.grid,
  meta: {
    provider: 'Sudoku100',
    providerUrl: 'https://www.sudoku100.com/api',
    difficulty: 'Easy',
    requestedDifficulty: 'easy',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  },
}

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('puzzle cache', () => {
  it('round-trips a live puzzle', () => {
    saveCachedPuzzle(livePuzzle)
    const restored = readCachedPuzzle()
    expect(restored?.grid).toEqual(livePuzzle.grid)
    expect(restored?.meta).toEqual(livePuzzle.meta)
  })

  it('survives broken JSON and unknown shapes', () => {
    localStorage.setItem('sudoku-sensei:last-live-puzzle:v1', '{not json')
    expect(readCachedPuzzle()).toBeNull()

    localStorage.setItem('sudoku-sensei:last-live-puzzle:v1', JSON.stringify({ grid: [1] }))
    expect(readCachedPuzzle()).toBeNull()
  })

  it('drops cached grids that no longer validate', () => {
    saveCachedPuzzle(livePuzzle)
    const key = 'sudoku-sensei:last-live-puzzle:v1'
    const broken = JSON.parse(store.get(key) ?? '{}') as { grid: number[] }
    broken.grid[0] = 99
    localStorage.setItem(key, JSON.stringify(broken))

    expect(readCachedPuzzle()).toBeNull()
    expect(store.has(key)).toBe(false)
  })

  it('rejects metadata that is not a known shape', () => {
    saveCachedPuzzle(livePuzzle)
    const key = 'sudoku-sensei:last-live-puzzle:v1'
    const payload = JSON.parse(store.get(key) ?? '{}') as {
      meta: Record<string, unknown>
    }
    payload.meta.requestedDifficulty = 'nightmare'
    localStorage.setItem(key, JSON.stringify(payload))

    expect(readCachedPuzzle()).toBeNull()
  })
})
