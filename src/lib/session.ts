import type { LivePuzzle } from './api'
import {
  applyStep,
  createSolverState,
  findNextStep,
  type AppliedMove,
  type SolverState,
  type Step,
} from './solver'
import { isSolved } from './sudoku'

export interface DemoInfo {
  movesApplied: number
  attempts: number
  techniqueName: string
}

export interface Session {
  puzzle: LivePuzzle
  start: SolverState
  startPending: Step | null
  current: SolverState
  history: AppliedMove[]
  pending: Step | null
  selected: number | null
  showCandidates: boolean
  note: string | null
  demo: DemoInfo | null
}

export interface SessionOptions {
  startState?: SolverState
  startPending?: Step | null
  note?: string | null
  demo?: DemoInfo | null
}

export type SessionAction =
  | { type: 'show-step'; step: Step }
  | { type: 'show-next' }
  | { type: 'clear-pending' }
  | { type: 'apply-pending' }
  | { type: 'solve-all' }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'restart-puzzle' }
  | { type: 'select'; cell: number | null }
  | { type: 'toggle-candidates' }
  | { type: 'set-note'; note: string | null }

export function createSession(
  puzzle: LivePuzzle,
  options: SessionOptions = {},
): Session {
  const initial = createSolverState(puzzle.grid)
  return {
    puzzle,
    start: options.startState ?? initial,
    startPending: options.startPending ?? null,
    current: options.startState ?? initial,
    history: [],
    pending: options.startPending ?? null,
    selected: null,
    showCandidates: true,
    note: options.note ?? null,
    demo: options.demo ?? null,
  }
}

function solvedNote(totalMoves: number): string {
  if (totalMoves === 0) return 'This puzzle is already solved.'
  return `Solved with ${totalMoves} logical move${totalMoves === 1 ? '' : 's'} — no guessing, no backtracking.`
}

function stuckNote(totalMoves: number): string {
  return `No move found after ${totalMoves} logical move${totalMoves === 1 ? '' : 's'}. Either this puzzle needs a technique beyond the dojo's toolkit, or it does not have a single solution — some fallback providers do not check. Either way, I will not guess.`
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'show-step':
      return { ...state, pending: action.step, selected: null, note: null }

    case 'show-next': {
      if (isSolved(state.current.grid)) {
        return {
          ...state,
          pending: null,
          note: solvedNote(state.history.length),
        }
      }
      const step = findNextStep(state.current)
      if (!step) {
        return {
          ...state,
          pending: null,
          note: stuckNote(state.history.length),
        }
      }
      return { ...state, pending: step, selected: null, note: null }
    }

    case 'clear-pending':
      return { ...state, pending: null, note: null }

    case 'apply-pending': {
      if (!state.pending) return state
      const next = applyStep(state.current, state.pending)
      const history = [
        ...state.history,
        { step: state.pending, before: state.current },
      ]
      const solved = isSolved(next.grid)
      return {
        ...state,
        current: next,
        history,
        pending: null,
        selected: null,
        note: solved ? solvedNote(history.length) : null,
      }
    }

    case 'solve-all': {
      let current = state.current
      const history = [...state.history]
      let guard = 0
      while (!isSolved(current.grid) && guard < 120) {
        const step = findNextStep(current)
        if (!step) break
        history.push({ step, before: current })
        current = applyStep(current, step)
        guard += 1
      }
      const solved = isSolved(current.grid)
      return {
        ...state,
        current,
        history,
        pending: null,
        selected: null,
        note: solved ? solvedNote(history.length) : stuckNote(history.length),
      }
    }

    case 'undo': {
      if (state.history.length === 0) return state
      const history = [...state.history]
      const last = history.pop() as AppliedMove
      return {
        ...state,
        current: last.before,
        history,
        pending: null,
        selected: null,
        note: null,
      }
    }

    case 'reset':
      return {
        ...state,
        current: state.start,
        history: [],
        pending: state.startPending,
        selected: null,
        note: null,
      }

    case 'restart-puzzle': {
      const initial = createSolverState(state.puzzle.grid)
      return {
        ...state,
        start: initial,
        startPending: null,
        current: initial,
        history: [],
        pending: null,
        selected: null,
        demo: null,
        note: 'Back to the original puzzle from this live fetch.',
      }
    }

    case 'select':
      return { ...state, selected: action.cell }

    case 'toggle-candidates':
      return { ...state, showCandidates: !state.showCandidates }

    case 'set-note':
      return { ...state, note: action.note }

    default:
      return state
  }
}
