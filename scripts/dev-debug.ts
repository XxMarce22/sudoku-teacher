import { applyStep, createSolverState, findAllSteps, findNextStep } from '../src/lib/solver'
import { isSolved, validateGrid, formatCandidateList, cellLabel, type Grid } from '../src/lib/sudoku'

async function batch(limit: number) {
  const query = `{newboard(limit:${limit}){grids{value,solution,difficulty}}}`
  const r = await fetch(`https://sudoku-api.vercel.app/api/dosuku?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(25000) })
  const j = await r.json() as any
  return j.newboard.grids as Array<{value:number[][], solution:number[][], difficulty:string}>
}

const grids = await batch(3)
for (const raw of grids) {
  const grid = raw.value.flat() as Grid
  const solution = raw.solution.flat() as Grid
  console.log('=== difficulty', raw.difficulty, 'givens', grid.filter(v=>v).length, 'valid', validateGrid(grid).ok)
  let state = createSolverState(grid)
  for (let i=0;i<200;i++){
    if (isSolved(state.grid)) { console.log('SOLVED at move', i); break }
    const all = findAllSteps(state)
    const next = findNextStep(state)
    if (i < 5 || !next) console.log(i, 'available:', all.map(s=>s.technique).join(','), 'next:', next?.technique, '|', next?.summary)
    if (!next) {
      console.log('STUCK. Empty cells:')
      for (let c=0;c<81;c++) if (state.grid[c]===0) {
        const trueDigit = solution[c]
        const mask = state.candidates[c]
        console.log(' ', cellLabel(c), 'cands:', formatCandidateList(mask), 'true:', trueDigit)
      }
      break
    }
    state = applyStep(state, next)
  }
  const finalMatches = state.grid.every((v,c)=> v===0 || v===solution[c])
  console.log('final matches solution on placed cells:', finalMatches)
}
