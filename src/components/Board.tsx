import { useRef } from 'react'
import {
  PEERS,
  colOf,
  hasCandidate,
  rowOf,
  type CandidateMasks,
  type Grid,
} from '../lib/sudoku'
import type { Step } from '../lib/solver'
import type { InputFeedback } from '../lib/session'

interface BoardProps {
  grid: Grid
  initialGrid: Grid
  candidates: CandidateMasks
  pending: Step | null
  selected: number | null
  showCandidates: boolean
  feedback: InputFeedback | null
  manualCells: ReadonlySet<number>
  assumedCells: ReadonlySet<number>
  onSelect: (cell: number | null) => void
  onInputDigit: (digit: number) => void
  onClearCell: () => void
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function buildDigitSet(step: Step | null): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  if (!step) return map
  for (const elimination of step.eliminations) {
    const set = map.get(elimination.cell) ?? new Set<number>()
    set.add(elimination.digit)
    map.set(elimination.cell, set)
  }
  return map
}

export function Board({
  grid,
  initialGrid,
  candidates,
  pending,
  selected,
  showCandidates,
  feedback,
  manualCells,
  assumedCells,
  onSelect,
  onInputDigit,
  onClearCell,
}: BoardProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const primary = new Set(pending?.cells ?? [])
  const secondary = new Set(pending?.secondaryCells ?? [])
  const eliminatedDigits = buildDigitSet(pending)
  const placementByCell = new Map<number, number>()
  for (const placement of pending?.placements ?? []) {
    placementByCell.set(placement.cell, placement.digit)
  }
  const colorByCell = new Map<number, string>()
  for (const group of pending?.colorGroups ?? []) {
    for (const cell of group.cells) colorByCell.set(cell, group.label)
  }
  const pendingUnitCells = new Set<number>(pending?.unit?.cells ?? [])

  const focusCell = (cell: number) => {
    const wrapped = Math.min(80, Math.max(0, cell))
    onSelect(wrapped)
    buttonRefs.current[wrapped]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = selected ?? 0
    const row = rowOf(current)
    const col = colOf(current)
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey

    if (plain && event.key >= '1' && event.key <= '9') {
      event.preventDefault()
      onInputDigit(Number(event.key))
      return
    }

    if (
      plain &&
      (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0')
    ) {
      event.preventDefault()
      onClearCell()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusCell(((row + 8) % 9) * 9 + col)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusCell(((row + 1) % 9) * 9 + col)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusCell(row * 9 + ((col + 8) % 9))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusCell(row * 9 + ((col + 1) % 9))
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusCell(row * 9)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusCell(row * 9 + 8)
    }
  }

  return (
    <div
      className="board"
      role="grid"
      aria-label="Sudoku board — arrow keys move, 1 to 9 fills the selected cell, Backspace clears"
      onKeyDown={handleKeyDown}
    >
      {grid.map((value, cell) => {
        const row = rowOf(cell)
        const col = colOf(cell)
        const isGiven = initialGrid[cell] !== 0
        const isSolvedCell = !isGiven && value !== 0
        const isManualCell = !isGiven && manualCells.has(cell) && value !== 0
        const isAssumedCell = !isGiven && assumedCells.has(cell) && value !== 0
        const isPeer = selected !== null && selected !== cell && PEERS[selected].includes(cell)
        const eliminationSet = eliminatedDigits.get(cell)
        const placement = placementByCell.get(cell)
        const colorLabel = colorByCell.get(cell)
        const isRejected = feedback?.kind === 'rejected' && feedback.cell === cell
        const isFlagged =
          feedback?.kind === 'placed' &&
          feedback.contradiction !== null &&
          feedback.cell === cell

        const classes = ['cell']
        if (col === 2 || col === 5) classes.push('cell--edge-right')
        if (row === 2 || row === 5) classes.push('cell--edge-bottom')
        if (isGiven) classes.push('cell--given')
        if (isSolvedCell) classes.push('cell--solved')
        if (isManualCell) classes.push('cell--manual')
        if (isAssumedCell) classes.push('cell--assumed')
        if (pendingUnitCells.has(cell)) classes.push('cell--unit')
        if (isPeer) classes.push('cell--peer')
        if (selected === cell) classes.push('cell--selected')
        if (primary.has(cell)) classes.push('cell--primary')
        if (secondary.has(cell)) classes.push('cell--secondary')
        if (eliminationSet) classes.push('cell--elimination')
        if (placement !== undefined) classes.push('cell--placement')
        if (colorLabel === 'A') classes.push('cell--color-a')
        if (colorLabel === 'B') classes.push('cell--color-b')
        if (isRejected) classes.push('cell--rejected')
        if (isFlagged) classes.push('cell--flagged')

        const candidatesVisible =
          value === 0 && placement === undefined && showCandidates

        const ariaParts = [
          `Row ${row + 1} column ${col + 1}`,
          isGiven
            ? `given ${value}`
            : value !== 0
              ? isAssumedCell
                ? `entered by you, unproven assumption, ${value}`
                : isManualCell
                  ? `entered by you ${value}`
                  : `solved ${value}`
              : placement !== undefined
                ? `suggested ${placement}`
                : 'empty',
        ]
        if (eliminationSet && eliminationSet.size > 0 && value === 0) {
          ariaParts.push(`remove ${[...eliminationSet].join(', ')}`)
        }

        return (
          <button
            key={cell}
            ref={(node) => {
              buttonRefs.current[cell] = node
            }}
            type="button"
            role="gridcell"
            tabIndex={(selected ?? 0) === cell ? 0 : -1}
            className={classes.join(' ')}
            aria-label={ariaParts.join(', ')}
            aria-pressed={selected === cell}
            onClick={() => onSelect(cell)}
            onFocus={() => onSelect(cell)}
          >
            {value !== 0 ? (
              <span className="cell__value">{value}</span>
            ) : placement !== undefined ? (
              <span className="cell__ghost" aria-hidden="true">
                {placement}
              </span>
            ) : candidatesVisible ? (
              <span className="candidates" aria-hidden="true">
                {DIGITS.map((digit) => {
                  const present = hasCandidate(candidates[cell], digit)
                  const eliminated = eliminationSet?.has(digit) ?? false
                  if (!present && !eliminated) {
                    return <span key={digit} className="candidate candidate--empty" />
                  }
                  return (
                    <span
                      key={digit}
                      className={
                        eliminated
                          ? 'candidate candidate--eliminated'
                          : 'candidate'
                      }
                    >
                      {present ? digit : ''}
                    </span>
                  )
                })}
              </span>
            ) : null}
            {colorLabel ? (
              <span className={`cell__color cell__color--${colorLabel.toLowerCase()}`} aria-hidden="true">
                {colorLabel}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
