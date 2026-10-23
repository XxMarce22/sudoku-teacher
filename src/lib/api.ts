import { validateGrid, type Grid } from './sudoku'

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard' | 'random'

export interface PuzzleMeta {
  provider: string
  providerUrl: string
  difficulty: string
  requestedDifficulty: PuzzleDifficulty
  fetchedAt: string
}

export interface LivePuzzle {
  grid: Grid
  meta: PuzzleMeta
}

export const DIFFICULTY_OPTIONS: { value: PuzzleDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'random', label: 'Surprise me' },
]

// Sudoku100 sends no CORS headers, so the browser calls it through the local
// proxy configured in vite.config.ts (available in `npm run dev` and
// `npm run preview`). It is the preferred source because every puzzle it
// hands out has a verified unique solution.
const SUDOKU100_PROXY = '/puzzle-api/sudoku100/api/sudoku-image'
const SUDOKU100_SITE = 'https://www.sudoku100.com/api'

const SUGOKU_URL = 'https://sugoku.onrender.com/board'
const DOSUKU_URL = 'https://sudoku-api.vercel.app/api/dosuku'

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<unknown> {
  if (outerSignal?.aborted) {
    throw new DOMException('The request was cancelled.', 'AbortError')
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abortFromOuter = () => controller.abort()
  outerSignal?.addEventListener('abort', abortFromOuter, { once: true })

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`The puzzle API returned HTTP ${response.status}.`)
    }
    const text = await response.text()
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error('The puzzle API returned a response that was not JSON.')
    }
  } catch (error) {
    if (outerSignal?.aborted) {
      throw new DOMException('The request was cancelled.', 'AbortError')
    }
    if (timedOut) {
      throw new Error(`The puzzle API did not answer within ${Math.round(timeoutMs / 1000)} seconds.`)
    }
    if (isAbortError(error)) {
      throw new Error('The puzzle API request was interrupted.')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timer)
    outerSignal?.removeEventListener('abort', abortFromOuter)
  }
}

function normalizeBoard(input: unknown, provider: string): Grid {
  if (
    !Array.isArray(input) ||
    input.length !== 9 ||
    !input.every((row) => Array.isArray(row) && row.length === 9)
  ) {
    throw new Error(`${provider} returned a board that was not 9×9.`)
  }

  const flat = (input as unknown[][]).flat()
  if (!flat.every((value) => Number.isInteger(value))) {
    throw new Error(`${provider} returned non-numeric cells.`)
  }

  const grid = flat as Grid
  const validation = validateGrid(grid)
  if (!validation.ok) {
    throw new Error(`${provider} returned an invalid puzzle: ${validation.errors[0]}`)
  }

  return grid
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

async function fetchFromSudoku100(
  requestedDifficulty: PuzzleDifficulty,
  signal?: AbortSignal,
): Promise<LivePuzzle> {
  const params = new URLSearchParams({ returnData: 'true', gridSize: '9' })
  if (requestedDifficulty !== 'random') {
    params.set('difficulty', requestedDifficulty)
  }

  const payload = (await fetchJson(
    `${SUDOKU100_PROXY}?${params.toString()}`,
    15_000,
    signal,
  )) as { success?: unknown; puzzleArray?: unknown }

  if (payload.success === false) {
    throw new Error('Sudoku100 reported that it could not create a puzzle.')
  }

  const grid = normalizeBoard(payload.puzzleArray, 'Sudoku100')

  return {
    grid,
    meta: {
      provider: 'Sudoku100',
      providerUrl: SUDOKU100_SITE,
      difficulty:
        requestedDifficulty === 'random' ? 'Random' : titleCase(requestedDifficulty),
      requestedDifficulty,
      fetchedAt: new Date().toISOString(),
    },
  }
}

async function fetchFromSugoku(
  requestedDifficulty: PuzzleDifficulty,
  signal?: AbortSignal,
): Promise<LivePuzzle> {
  const url = `${SUGOKU_URL}?difficulty=${encodeURIComponent(requestedDifficulty)}`
  const payload = (await fetchJson(url, 10_000, signal)) as { board?: unknown }
  const grid = normalizeBoard(payload.board, 'Sugoku')

  return {
    grid,
    meta: {
      provider: 'Sugoku',
      providerUrl: 'https://sugoku.onrender.com/',
      difficulty:
        requestedDifficulty === 'random' ? 'Random' : titleCase(requestedDifficulty),
      requestedDifficulty,
      fetchedAt: new Date().toISOString(),
    },
  }
}

async function fetchFromDosuku(
  requestedDifficulty: PuzzleDifficulty,
  signal?: AbortSignal,
): Promise<LivePuzzle> {
  const query = '{newboard(limit:1){grids{value,difficulty}}}'
  const url = `${DOSUKU_URL}?query=${encodeURIComponent(query)}`
  const payload = (await fetchJson(url, 10_000, signal)) as {
    newboard?: { grids?: Array<{ value?: unknown; difficulty?: unknown }> }
  }
  const board = payload.newboard?.grids?.[0]
  if (!board) throw new Error('Dosuku returned no puzzle board.')

  const grid = normalizeBoard(board.value, 'Dosuku')
  const difficulty =
    typeof board.difficulty === 'string' && board.difficulty.trim().length > 0
      ? titleCase(board.difficulty.trim().toLowerCase())
      : 'Random'

  return {
    grid,
    meta: {
      provider: 'Dosuku',
      providerUrl: 'https://sudoku-api.vercel.app/',
      difficulty,
      requestedDifficulty,
      fetchedAt: new Date().toISOString(),
    },
  }
}

export async function fetchPuzzle(
  requestedDifficulty: PuzzleDifficulty,
  signal?: AbortSignal,
): Promise<LivePuzzle> {
  const failures: string[] = []

  try {
    return await fetchFromSudoku100(requestedDifficulty, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    const message = error instanceof Error ? error.message : 'Sudoku100 failed.'
    failures.push(
      message.includes('not JSON')
        ? 'Sudoku100 was not reachable (it is served through the local dev/preview proxy).'
        : `Sudoku100: ${message}`,
    )
  }

  try {
    return await fetchFromSugoku(requestedDifficulty, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    const message = error instanceof Error ? error.message : 'the request failed.'
    failures.push(`Sugoku: ${message}`)
  }

  try {
    return await fetchFromDosuku(requestedDifficulty, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    const message = error instanceof Error ? error.message : 'the request failed.'
    failures.push(`Dosuku: ${message}`)
  }

  throw new Error(
    `No live puzzle arrived. ${failures.join(' ')} Check your connection and try again.`,
  )
}
