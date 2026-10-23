import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPuzzle } from './api'
import { FIXTURE_PUZZLES } from './__fixtures__/puzzles'
import type { Grid } from './sudoku'

const sourcePuzzle = FIXTURE_PUZZLES[0]

function toRows(grid: Grid): number[][] {
  const rows: number[][] = []
  for (let row = 0; row < 9; row += 1) {
    rows.push(grid.slice(row * 9, row * 9 + 9))
  }
  return rows
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

function htmlResponse() {
  return {
    ok: true,
    status: 200,
    text: async () => '<!doctype html><html><body>not a puzzle</body></html>',
  }
}

type Route = (url: string) => ReturnType<typeof jsonResponse> | undefined

function mockRoutes(route: Route) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input)
    const response = route(url)
    if (response) return response
    throw new TypeError(`unrouted request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPuzzle', () => {
  it('prefers Sudoku100 and forwards the requested difficulty', async () => {
    const fetchMock = mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) {
        return jsonResponse({ success: true, puzzleArray: toRows(sourcePuzzle.grid) })
      }
      return undefined
    })

    const puzzle = await fetchPuzzle('hard')
    expect(puzzle.meta.provider).toBe('Sudoku100')
    expect(puzzle.meta.difficulty).toBe('Hard')
    expect(puzzle.meta.requestedDifficulty).toBe('hard')
    expect(puzzle.grid).toEqual(sourcePuzzle.grid)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('difficulty=hard')
    expect(String(fetchMock.mock.calls[0][0])).toContain('gridSize=9')
  })

  it('omits the difficulty parameter for a surprise puzzle', async () => {
    const fetchMock = mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) {
        return jsonResponse({ success: true, puzzleArray: toRows(sourcePuzzle.grid) })
      }
      return undefined
    })

    const puzzle = await fetchPuzzle('random')
    expect(puzzle.meta.difficulty).toBe('Random')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('difficulty=')
  })

  it('falls back to Sugoku when the local proxy is not available', async () => {
    mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) return htmlResponse()
      if (url.startsWith('https://sugoku.onrender.com/board')) {
        return jsonResponse({ board: toRows(sourcePuzzle.grid) })
      }
      return undefined
    })

    const puzzle = await fetchPuzzle('easy')
    expect(puzzle.meta.provider).toBe('Sugoku')
  })

  it('falls back to Dosuku when Sudoku100 sends garbage and Sugoku is down', async () => {
    mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) {
        return jsonResponse({ success: true, puzzleArray: [1, 2, 3] })
      }
      if (url.startsWith('https://sugoku.onrender.com/board')) {
        return jsonResponse({ error: 'boom' }, 503)
      }
      if (url.startsWith('https://sudoku-api.vercel.app/')) {
        return jsonResponse({
          newboard: {
            grids: [{ value: toRows(sourcePuzzle.grid), difficulty: 'Hard' }],
          },
        })
      }
      return undefined
    })

    const puzzle = await fetchPuzzle('medium')
    expect(puzzle.meta.provider).toBe('Dosuku')
    expect(puzzle.meta.difficulty).toBe('Hard')
    expect(puzzle.grid).toEqual(sourcePuzzle.grid)
  })

  it('reports every failure when nothing answers', async () => {
    mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) return htmlResponse()
      if (url.startsWith('https://sugoku.onrender.com/board')) {
        return jsonResponse({ error: 'boom' }, 500)
      }
      if (url.startsWith('https://sudoku-api.vercel.app/')) {
        return jsonResponse({ newboard: { grids: [] } })
      }
      return undefined
    })

    await expect(fetchPuzzle('easy')).rejects.toThrow(/No live puzzle arrived/)
    await expect(fetchPuzzle('easy')).rejects.toThrow(/Sugoku/)
    await expect(fetchPuzzle('easy')).rejects.toThrow(/Dosuku/)
  })

  it('propagates an abort instead of falling through', async () => {
    const fetchMock = mockRoutes(() => undefined)
    const controller = new AbortController()
    controller.abort()

    await expect(fetchPuzzle('easy', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects boards with non-numeric cells before showing them', async () => {
    mockRoutes((url) => {
      if (url.startsWith('/puzzle-api/sudoku100/')) {
        const rows = toRows(sourcePuzzle.grid)
        rows[0][0] = '5' as unknown as number
        return jsonResponse({ success: true, puzzleArray: rows })
      }
      if (url.startsWith('https://sugoku.onrender.com/board')) {
        return jsonResponse({ board: toRows(sourcePuzzle.grid) })
      }
      return undefined
    })

    const puzzle = await fetchPuzzle('easy')
    expect(puzzle.meta.provider).toBe('Sugoku')
  })
})
