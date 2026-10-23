/**
 * Development helper: collects real puzzles from two public APIs and audits
 * every deduction the logic-only solver makes on them, then writes a checked
 * fixture set for the test suite.
 *
 * Sources:
 * - Sudoku100 (primary): verified-unique puzzles; the API returns only the
 *   puzzle. A fixture is kept only when the logic toolkit completes the board,
 *   and the completed grid (checked for validity) becomes the recorded
 *   solution.
 * - Dosuku (fallback): returns a paired solution, so every deduction is
 *   checked directly against it — this works even when the toolkit cannot
 *   finish the board, and those stalls are kept deliberately.
 *
 * This script fetches only. It never generates a puzzle, and it contains no
 * search, backtracking, or guessing of any kind.
 *
 * Run with: npm run collect-fixtures
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyStep,
  createSolverState,
  findAllSteps,
  findNextStep,
} from '../src/lib/solver'
import { TECHNIQUES, type TechniqueId } from '../src/lib/techniques'
import { isSolved, validateGrid, type Grid } from '../src/lib/sudoku'

interface CandidateFixture {
  source: 'Sudoku100' | 'Dosuku'
  difficulty: string
  solvedByLogic: boolean
  grid: Grid
  solution: Grid
}

interface AuditedCandidate {
  fixture: CandidateFixture
  techniques: Set<TechniqueId>
}

const SUDOKU100_URL = 'https://www.sudoku100.com/api/sudoku-image'
const DOSUKU_URL = 'https://sudoku-api.vercel.app/api/dosuku'

const TARGET_SUDOKU100 = 14
const MAX_SUDOKU100_REQUESTS = 40
const TARGET_DOSUKU = 3
const MAX_DOSUKU_BATCHES = 14
const DOSUKU_BATCH_SIZE = 4

function flatten(rows: number[][]): Grid {
  return rows.flat()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function verifyPair(grid: Grid, solution: Grid): string | null {
  if (!isSolved(solution)) return 'solution is not complete'
  const validation = validateGrid(solution)
  if (!validation.ok) return `solution invalid: ${validation.errors[0]}`
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid[cell] !== 0 && grid[cell] !== solution[cell]) {
      return `solution disagrees with given at cell ${cell}`
    }
  }
  return null
}

function replayAudit(
  grid: Grid,
  reference: Grid | null,
): { solved: boolean; finalGrid: Grid; techniques: Set<TechniqueId>; error: string | null } {
  let state = createSolverState(grid)
  const techniques = new Set<TechniqueId>()

  try {
    for (let moves = 0; moves < 200; moves += 1) {
      if (isSolved(state.grid)) break

      for (const step of findAllSteps(state)) {
        techniques.add(step.technique)
        if (!reference) continue
        for (const elimination of step.eliminations) {
          if (reference[elimination.cell] === elimination.digit) {
            throw new Error(
              `step ${step.technique} eliminated the true candidate ${elimination.digit} from cell ${elimination.cell}`,
            )
          }
        }
        for (const placement of step.placements) {
          if (reference[placement.cell] !== placement.digit) {
            throw new Error(
              `step ${step.technique} placed ${placement.digit} in cell ${placement.cell}, expected ${reference[placement.cell]}`,
            )
          }
        }
      }

      const next = findNextStep(state)
      if (!next) break
      state = applyStep(state, next)

      if (reference) {
        for (let cell = 0; cell < 81; cell += 1) {
          const value = state.grid[cell]
          if (value !== 0 && value !== reference[cell]) {
            throw new Error(
              `after ${next.technique}: cell ${cell} holds ${value}, expected ${reference[cell]}`,
            )
          }
        }
      }
    }
  } catch (error) {
    return {
      solved: false,
      finalGrid: state.grid,
      techniques,
      error: error instanceof Error ? error.message : 'audit failed',
    }
  }

  return {
    solved: isSolved(state.grid),
    finalGrid: state.grid,
    techniques,
    error: null,
  }
}

async function fetchSudoku100(difficulty: 'easy' | 'medium' | 'hard'): Promise<Grid> {
  const params = new URLSearchParams({
    returnData: 'true',
    gridSize: '9',
    difficulty,
  })
  const response = await fetch(`${SUDOKU100_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Sudoku100 HTTP ${response.status}`)
  const payload = (await response.json()) as { success?: unknown; puzzleArray?: unknown }
  if (payload.success === false) throw new Error('Sudoku100 reported a failure')
  if (!Array.isArray(payload.puzzleArray)) throw new Error('Sudoku100 sent no puzzleArray')
  return flatten(payload.puzzleArray as number[][])
}

async function collectSudoku100(): Promise<AuditedCandidate[]> {
  const rotation: Array<'easy' | 'medium' | 'hard'> = [
    'easy',
    'medium',
    'hard',
    'hard',
  ]
  const candidates: AuditedCandidate[] = []

  for (
    let request = 0;
    request < MAX_SUDOKU100_REQUESTS && candidates.length < TARGET_SUDOKU100 * 2;
    request += 1
  ) {
    const difficulty = rotation[request % rotation.length]
    let grid: Grid
    try {
      grid = await fetchSudoku100(difficulty)
    } catch (error) {
      console.warn(`sudoku100 ${difficulty}: ${error instanceof Error ? error.message : error}`)
      await sleep(400)
      continue
    }

    const validation = validateGrid(grid)
    if (!validation.ok) {
      console.warn(`sudoku100 ${difficulty}: skipped invalid puzzle (${validation.errors[0]})`)
      continue
    }

    const audit = replayAudit(grid, null)
    if (audit.error) {
      console.error(`sudoku100 ${difficulty}: AUDIT FAILURE: ${audit.error}`)
      console.error('grid:', JSON.stringify(grid))
      throw new Error(`Refusing to write fixtures: ${audit.error}`)
    }
    if (!audit.solved) {
      console.warn(`sudoku100 ${difficulty}: toolkit stalled, skipping`)
      continue
    }

    const completion = audit.finalGrid
    if (!isSolved(completion) || !validateGrid(completion).ok) {
      throw new Error('Sudoku100 completion failed validation')
    }

    // Re-audit against the completion: catches nondeterminism outright.
    const second = replayAudit(grid, completion)
    if (second.error || second.finalGrid.join() !== completion.join()) {
      throw new Error(`Sudoku100 replay disagreed with itself: ${second.error ?? 'different grid'}`)
    }

    candidates.push({
      fixture: {
        source: 'Sudoku100',
        difficulty,
        solvedByLogic: true,
        grid,
        solution: completion,
      },
      techniques: audit.techniques,
    })
    console.log(
      `sudoku100 ${difficulty}: solved in ${audit.techniques.size}-technique trace (${candidates.length} kept)`,
    )
  }

  return candidates
}

async function fetchDosukuBatch(): Promise<
  Array<{ grid: Grid; solution: Grid; difficulty: string }>
> {
  const query = `{newboard(limit:${DOSUKU_BATCH_SIZE}){grids{value,solution,difficulty}}}`
  const response = await fetch(`${DOSUKU_URL}?query=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`Dosuku HTTP ${response.status}`)
  const payload = (await response.json()) as {
    newboard?: {
      grids?: Array<{ value?: number[][]; solution?: number[][]; difficulty?: string }>
    }
  }
  const grids = payload.newboard?.grids ?? []
  return grids
    .filter((raw) => Array.isArray(raw.value) && Array.isArray(raw.solution))
    .map((raw) => ({
      grid: flatten(raw.value as number[][]),
      solution: flatten(raw.solution as number[][]),
      difficulty: raw.difficulty ?? 'Unknown',
    }))
}

async function collectDosuku(): Promise<AuditedCandidate[]> {
  const picked: AuditedCandidate[] = []
  let sawStall = false

  for (
    let batch = 0;
    batch < MAX_DOSUKU_BATCHES &&
    (picked.length < TARGET_DOSUKU || !sawStall);
    batch += 1
  ) {
    let grids: Array<{ grid: Grid; solution: Grid; difficulty: string }>
    try {
      grids = await fetchDosukuBatch()
    } catch (error) {
      console.warn(`dosuku batch ${batch}: ${error instanceof Error ? error.message : error}`)
      await sleep(500)
      continue
    }

    for (const raw of grids) {
      if (picked.length >= TARGET_DOSUKU && sawStall) break
      if (!validateGrid(raw.grid).ok) continue
      const pairProblem = verifyPair(raw.grid, raw.solution)
      if (pairProblem) continue

      const audit = replayAudit(raw.grid, raw.solution)
      if (audit.error) {
        console.error(`dosuku: AUDIT FAILURE: ${audit.error}`)
        console.error('grid:', JSON.stringify(raw.grid))
        throw new Error(`Refusing to write fixtures: ${audit.error}`)
      }

      // Keep one stalling board on purpose: it backs the "stuck" tests.
      const wanted = !audit.solved ? !sawStall : picked.length < TARGET_DOSUKU
      if (!wanted) continue
      if (!audit.solved) sawStall = true

      picked.push({
        fixture: {
          source: 'Dosuku',
          difficulty: raw.difficulty,
          solvedByLogic: audit.solved,
          grid: raw.grid,
          solution: raw.solution,
        },
        techniques: audit.techniques,
      })
      console.log(
        `dosuku ${raw.difficulty}: solved=${audit.solved}, techniques=${[...audit.techniques].sort().join(',')}`,
      )
    }
  }

  return picked
}

async function main(): Promise<void> {
  const fromSudoku100 = await collectSudoku100()
  if (fromSudoku100.length === 0) {
    throw new Error('Could not collect any Sudoku100 puzzles.')
  }

  const fromDosuku = await collectDosuku()

  // The rotation above already spreads difficulty across the kept puzzles, so
  // the first TARGET_SUDOKU100 candidates make a fine fixture set.
  const chosen = [
    ...fromSudoku100.slice(0, TARGET_SUDOKU100),
    ...fromDosuku,
  ].map((candidate) => candidate.fixture)

  const coverage = new Set<TechniqueId>()
  for (const candidate of [...fromSudoku100, ...fromDosuku]) {
    for (const technique of candidate.techniques) coverage.add(technique)
  }

  const header = `// Generated by scripts/collect-fixtures.ts from live Sudoku100 and Dosuku
// API puzzles. Every deduction made by the logic-only solver while replaying
// these boards was audited before this file was written: nothing here was
// generated locally, guessed, or searched. Do not edit by hand.
//
// solvedByLogic=true fixtures must be completed by findNextStep alone.
// solvedByLogic=false fixtures are kept on purpose: they stall the toolkit,
// which backs the "the dojo will not guess" tests.
`
  const body = `import type { Grid } from '../sudoku'

export interface FixturePuzzle {
  source: 'Sudoku100' | 'Dosuku'
  difficulty: string
  solvedByLogic: boolean
  grid: Grid
  solution: Grid
}

export const FIXTURE_PUZZLES: FixturePuzzle[] = ${JSON.stringify(chosen, null, 2)}
`

  const here = dirname(fileURLToPath(import.meta.url))
  const target = join(here, '..', 'src', 'lib', '__fixtures__', 'puzzles.ts')
  writeFileSync(target, header + body, 'utf8')

  const missing = TECHNIQUES.map((technique) => technique.id).filter(
    (id) => !coverage.has(id),
  )
  console.log(`\nwrote ${chosen.length} fixtures to ${target}`)
  console.log(
    `covered ${coverage.size}/${TECHNIQUES.length} techniques in audited traces; missing: ${missing.join(', ') || 'none'}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
