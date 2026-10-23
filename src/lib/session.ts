import type { LivePuzzle } from './api'
import {
  applyManualDigit,
  applyStep,
  createSolverState,
  findDirectContradiction,
  findNextStep,
  findProvableContradiction,
  findSinglePlacementProof,
  type AppliedMove,
  type Contradiction,
  type ManualMove,
  type SolverState,
  type Step,
} from './solver'
import {
  BOXES,
  COLS,
  ROWS,
  boxOf,
  cellLabel,
  colOf,
  hasCandidate,
  isSolved,
  rowOf,
} from './sudoku'

export interface DemoInfo {
  movesApplied: number
  attempts: number
  techniqueName: string
}

export type InputFeedback =
  | {
      kind: 'placed'
      cell: number
      digit: number
      contradiction: Contradiction | null
      provenBy: 'naked-single' | 'hidden-single' | null
      message: string
    }
  | { kind: 'rejected'; cell: number; digit: number; message: string }
  | { kind: 'cleared'; cell: number; message: string }
  | { kind: 'info'; message: string }

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
  inputFeedback: InputFeedback | null
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
  | { type: 'input-digit'; digit: number }
  | { type: 'clear-cell' }

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
    inputFeedback: null,
  }
}

function solvedNote(history: AppliedMove[]): string {
  if (history.length === 0) return 'This puzzle is already solved.'
  const manual = history.filter((move) => move.kind === 'manual').length
  const assumed = history.filter(
    (move) => move.kind === 'manual' && move.provenBy === null,
  ).length
  const moveWord = history.length === 1 ? 'move' : 'moves'
  if (assumed > 0) {
    return `Every cell is filled, but ${assumed} of your entries ${assumed === 1 ? 'was' : 'were'} not proven by a documented technique. The board is solved only if ${assumed === 1 ? 'that assumption is' : 'those assumptions are'} correct — I cannot certify it without guessing.`
  }
  if (manual === history.length) {
    return `Solved with ${history.length} ${moveWord}, all placed by you — no guessing from the engine.`
  }
  if (manual > 0) {
    return `Solved with ${history.length} ${moveWord} — ${manual} placed by you and ${history.length - manual} by documented techniques. No guessing, no backtracking.`
  }
  return `Solved with ${history.length} logical ${moveWord} — no guessing, no backtracking.`
}

function stuckNote(totalMoves: number, assumed = 0): string {
  if (assumed > 0) {
    return `No move found after ${totalMoves} logical move${totalMoves === 1 ? '' : 's'}. Your ${assumed === 1 ? 'unproven entry may' : `${assumed} unproven entries may`} also be wrong, and a wrong assumption can block every technique. Undo ${assumed === 1 ? 'it' : 'them'} or reset — either way, I will not guess.`
  }
  return `No move found after ${totalMoves} logical move${totalMoves === 1 ? '' : 's'}. Either this puzzle needs a technique beyond the dojo's toolkit, or it does not have a single solution — some fallback providers do not check. Either way, I will not guess.`
}

function assumedCount(history: AppliedMove[]): number {
  return history.filter((move) => move.kind === 'manual' && move.provenBy === null)
    .length
}

function contradictionClause(contradiction: Contradiction): string {
  return contradiction.kind === 'empty-cell'
    ? `${cellLabel(contradiction.cell ?? 0)} has no candidates left`
    : `${contradiction.unitName} has no place left for ${contradiction.digit}`
}

function contradictionDeadEnd(contradiction: Contradiction): string {
  if (contradiction.forcedMoves === 0) {
    return `it immediately leaves a dead end: ${contradictionClause(contradiction)}`
  }
  return `after ${contradiction.forcedMoves} more logical move${contradiction.forcedMoves === 1 ? '' : 's'}, ${contradictionClause(contradiction)}`
}

function movedCells(move: AppliedMove, cell: number): boolean {
  if (move.kind === 'manual') return move.cell === cell
  return move.step.placements.some((placement) => placement.cell === cell)
}

/** Cells still on the board that the player placed by hand. */
export function manualPlacedCells(session: Session): Set<number> {
  const cells = new Set<number>()
  for (const move of session.history) {
    if (move.kind === 'manual' && session.current.grid[move.cell] === move.digit) {
      cells.add(move.cell)
    }
  }
  return cells
}

/** Hand-played entries that no documented technique proves; hints depend on them. */
export function assumedManualMoves(session: Session): ManualMove[] {
  return session.history.filter(
    (move): move is ManualMove =>
      move.kind === 'manual' &&
      move.provenBy === null &&
      session.current.grid[move.cell] === move.digit,
  )
}

/** Cells the player filled without a documented proof. */
export function assumedPlacedCells(session: Session): Set<number> {
  return new Set(assumedManualMoves(session).map((move) => move.cell))
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'show-step':
      return {
        ...state,
        pending: action.step,
        selected: null,
        note: null,
        inputFeedback: null,
      }

    case 'show-next': {
      if (isSolved(state.current.grid)) {
        return {
          ...state,
          pending: null,
          inputFeedback: null,
          note: solvedNote(state.history),
        }
      }
      const hasManual = state.history.some((move) => move.kind === 'manual')
      const contradiction = hasManual
        ? findProvableContradiction(state.current)
        : findDirectContradiction(state.current)
      if (contradiction) {
        return {
          ...state,
          pending: null,
          inputFeedback: null,
          note: `This board contradicts itself — ${contradictionClause(contradiction)}. A technique cannot repair a broken board: undo recent entries, or reset.`,
        }
      }
      const step = findNextStep(state.current)
      if (!step) {
        return {
          ...state,
          pending: null,
          inputFeedback: null,
          note: stuckNote(state.history.length, assumedCount(state.history)),
        }
      }
      return {
        ...state,
        pending: step,
        selected: null,
        note: null,
        inputFeedback: null,
      }
    }

    case 'clear-pending':
      return { ...state, pending: null, note: null }

    case 'apply-pending': {
      if (!state.pending) return state
      const next = applyStep(state.current, state.pending)
      const history: AppliedMove[] = [
        ...state.history,
        { kind: 'step', step: state.pending, before: state.current },
      ]
      const solved = isSolved(next.grid)
      return {
        ...state,
        current: next,
        history,
        pending: null,
        selected: null,
        note: solved ? solvedNote(history) : null,
        inputFeedback: null,
      }
    }

    case 'solve-all': {
      let current = state.current
      const history: AppliedMove[] = [...state.history]
      let guard = 0
      let contradiction = findDirectContradiction(current)
      while (!contradiction && !isSolved(current.grid) && guard < 120) {
        const step = findNextStep(current)
        if (!step) break
        history.push({ kind: 'step', step, before: current })
        current = applyStep(current, step)
        contradiction = findDirectContradiction(current)
        guard += 1
      }
      const solved = isSolved(current.grid)
      return {
        ...state,
        current,
        history,
        pending: null,
        selected: null,
        note: contradiction
          ? `This board contradicts itself — ${contradictionClause(contradiction)}. A technique cannot repair a broken board: undo recent entries, or reset.`
          : solved
            ? solvedNote(history)
            : stuckNote(history.length, assumedCount(history)),
        inputFeedback: null,
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
        inputFeedback: null,
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
        inputFeedback: null,
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
        inputFeedback: null,
      }
    }

    case 'select':
      return { ...state, selected: action.cell }

    case 'toggle-candidates':
      return { ...state, showCandidates: !state.showCandidates }

    case 'set-note':
      return { ...state, note: action.note }

    case 'input-digit': {
      const cell = state.selected
      const digit = action.digit

      if (cell === null) {
        return {
          ...state,
          inputFeedback: {
            kind: 'info',
            message: 'Select a cell first, then type 1–9 to place a digit.',
          },
        }
      }

      if (state.puzzle.grid[cell] !== 0) {
        return {
          ...state,
          inputFeedback: {
            kind: 'rejected',
            cell,
            digit,
            message: `${cellLabel(cell)} is a given clue — it cannot be changed.`,
          },
        }
      }

      const existing = state.current.grid[cell]
      if (existing !== 0) {
        return {
          ...state,
          inputFeedback: {
            kind: 'rejected',
            cell,
            digit,
            message: `${cellLabel(cell)} already holds ${existing}. Clear it first (Backspace), then type the new digit.`,
          },
        }
      }

      if (!hasCandidate(state.current.candidates[cell], digit)) {
        const units = [ROWS[rowOf(cell)], COLS[colOf(cell)], BOXES[boxOf(cell)]]
        const clash = units.find((unit) =>
          unit.cells.some((peer) => state.current.grid[peer] === digit),
        )
        return {
          ...state,
          inputFeedback: {
            kind: 'rejected',
            cell,
            digit,
            message: clash
              ? `${digit} is not a candidate for ${cellLabel(cell)} — ${digit} is already placed in ${clash.name}.`
              : `${digit} is not a candidate for ${cellLabel(cell)} — logical eliminations have already ruled it out.`,
          },
        }
      }

      const provenBy = findSinglePlacementProof(state.current, cell, digit)
      const current = applyManualDigit(state.current, cell, digit)
      const contradiction = findProvableContradiction(current)
      const history: AppliedMove[] = [
        ...state.history,
        { kind: 'manual', cell, digit, provenBy, before: state.current },
      ]
      const solved = isSolved(current.grid)

      let message: string
      if (contradiction) {
        message = `${digit} in ${cellLabel(cell)} was a live candidate, but it leads to a provable contradiction: ${contradictionDeadEnd(contradiction)}. Undo is recommended.`
      } else if (provenBy) {
        message = `Placed ${digit} in ${cellLabel(cell)}. That is a ${provenBy === 'naked-single' ? 'naked' : 'hidden'} single — the digit is forced by a documented technique.`
      } else {
        message = `Placed ${digit} in ${cellLabel(cell)}. No documented technique proves that digit, and I could not prove a contradiction either. I am treating it as your assumption: later hints are conditional on it, and undo is recommended if you are unsure.`
      }

      return {
        ...state,
        current,
        history,
        pending: null,
        note: solved ? solvedNote(history) : null,
        inputFeedback: {
          kind: 'placed',
          cell,
          digit,
          contradiction,
          provenBy,
          message,
        },
      }
    }

    case 'clear-cell': {
      const cell = state.selected
      if (cell === null) {
        return {
          ...state,
          inputFeedback: {
            kind: 'info',
            message: 'Select a cell first, then press Backspace to clear it.',
          },
        }
      }

      if (state.puzzle.grid[cell] !== 0) {
        return {
          ...state,
          inputFeedback: {
            kind: 'info',
            message: `${cellLabel(cell)} is a given clue — it cannot be cleared.`,
          },
        }
      }

      const value = state.current.grid[cell]
      if (value === 0) {
        return {
          ...state,
          inputFeedback: {
            kind: 'info',
            message: `${cellLabel(cell)} is already empty.`,
          },
        }
      }

      let index = -1
      for (let cursor = state.history.length - 1; cursor >= 0; cursor -= 1) {
        if (movedCells(state.history[cursor], cell)) {
          index = cursor
          break
        }
      }
      if (index < 0) {
        return {
          ...state,
          inputFeedback: {
            kind: 'info',
            message: `${cellLabel(cell)} came with the starting position, so there is nothing of yours to clear there. Use Reset to go further back.`,
          },
        }
      }

      const laterMoves = state.history.length - index - 1
      return {
        ...state,
        current: state.history[index].before,
        history: state.history.slice(0, index),
        pending: null,
        note: null,
        inputFeedback: {
          kind: 'cleared',
          cell,
          message:
            laterMoves === 0
              ? `Cleared ${value} from ${cellLabel(cell)}.`
              : `Cleared ${value} from ${cellLabel(cell)}, together with the ${laterMoves} move${laterMoves === 1 ? '' : 's'} made after it — later moves can depend on that entry.`,
        },
      }
    }

    default:
      return state
  }
}
