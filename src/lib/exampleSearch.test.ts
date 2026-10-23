import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePuzzle } from './api'
import { FIXTURE_PUZZLES } from './__fixtures__/puzzles'
import { searchTechniqueExample } from './exampleSearch'

const { fetchPuzzleMock } = vi.hoisted(() => ({ fetchPuzzleMock: vi.fn() }))

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, fetchPuzzle: fetchPuzzleMock }
})

const sourcePuzzle = FIXTURE_PUZZLES[0]

function livePuzzle(grid: number[]): LivePuzzle {
  return {
    grid,
    meta: {
      provider: sourcePuzzle.source,
      providerUrl: 'https://example.test/api',
      difficulty: sourcePuzzle.difficulty,
      requestedDifficulty: 'easy',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

beforeEach(() => {
  fetchPuzzleMock.mockReset()
})

describe('searchTechniqueExample', () => {
  it('finds a live example on the first puzzle when the pattern is there', async () => {
    fetchPuzzleMock.mockResolvedValue(livePuzzle(sourcePuzzle.grid))

    const result = await searchTechniqueExample('naked-single', { attempts: 1 })
    expect(result).not.toBeNull()
    expect(result?.step.technique).toBe('naked-single')
    expect(result?.puzzle.meta.provider).toBe(sourcePuzzle.source)
    expect(result?.movesApplied).toBe(0)
    expect(fetchPuzzleMock).toHaveBeenCalledTimes(1)
  })

  it('gives up honestly when no fetched board offers the technique', async () => {
    // A finished board contains no steps at all, so no search can succeed.
    fetchPuzzleMock.mockResolvedValue(livePuzzle(sourcePuzzle.solution))

    const result = await searchTechniqueExample('x-wing', { attempts: 1 })
    expect(result).toBeNull()
    expect(fetchPuzzleMock).toHaveBeenCalledTimes(1)
  })

  it('propagates fetch failures when no puzzle ever loads', async () => {
    fetchPuzzleMock.mockRejectedValue(new Error('api down'))

    await expect(searchTechniqueExample('x-wing', { attempts: 2 })).rejects.toThrow(
      'api down',
    )
    expect(fetchPuzzleMock).toHaveBeenCalledTimes(2)
  })
})
