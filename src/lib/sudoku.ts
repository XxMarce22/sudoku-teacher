export const CELL_COUNT = 81
export const ALL_DIGITS_MASK = 0b111111111

export type Grid = number[]
export type CandidateMasks = number[]
export type UnitType = 'row' | 'col' | 'box'

export interface Unit {
  type: UnitType
  index: number
  cells: number[]
  name: string
}

export interface GridValidation {
  ok: boolean
  errors: string[]
  givens: number
}

export function cellIndex(row: number, col: number): number {
  return row * 9 + col
}

export function rowOf(index: number): number {
  return Math.floor(index / 9)
}

export function colOf(index: number): number {
  return index % 9
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3)
}

export function cellLabel(index: number): string {
  return `R${rowOf(index) + 1}C${colOf(index) + 1}`
}

export function unitLabel(type: UnitType, index: number): string {
  if (type === 'row') return `row ${index + 1}`
  if (type === 'col') return `column ${index + 1}`
  return `box ${index + 1}`
}

export function digitMask(digit: number): number {
  return 1 << (digit - 1)
}

export function hasCandidate(mask: number, digit: number): boolean {
  return (mask & digitMask(digit)) !== 0
}

export function digitsOf(mask: number): number[] {
  const digits: number[] = []
  for (let digit = 1; digit <= 9; digit += 1) {
    if (mask & digitMask(digit)) digits.push(digit)
  }
  return digits
}

export function popcount(mask: number): number {
  let count = 0
  let value = mask
  while (value !== 0) {
    value &= value - 1
    count += 1
  }
  return count
}

function makeUnit(type: UnitType, index: number): Unit {
  const cells: number[] = []
  if (type === 'row') {
    for (let col = 0; col < 9; col += 1) cells.push(cellIndex(index, col))
  } else if (type === 'col') {
    for (let row = 0; row < 9; row += 1) cells.push(cellIndex(row, index))
  } else {
    const startRow = Math.floor(index / 3) * 3
    const startCol = (index % 3) * 3
    for (let row = startRow; row < startRow + 3; row += 1) {
      for (let col = startCol; col < startCol + 3; col += 1) {
        cells.push(cellIndex(row, col))
      }
    }
  }
  return { type, index, cells, name: unitLabel(type, index) }
}

export const ROWS: Unit[] = Array.from({ length: 9 }, (_, index) =>
  makeUnit('row', index),
)
export const COLS: Unit[] = Array.from({ length: 9 }, (_, index) =>
  makeUnit('col', index),
)
export const BOXES: Unit[] = Array.from({ length: 9 }, (_, index) =>
  makeUnit('box', index),
)
export const ALL_UNITS: Unit[] = [...ROWS, ...COLS, ...BOXES]

export const UNITS_BY_CELL: Unit[][] = Array.from(
  { length: CELL_COUNT },
  () => [],
)
for (const unit of ALL_UNITS) {
  for (const cell of unit.cells) UNITS_BY_CELL[cell].push(unit)
}

export const PEERS: number[][] = Array.from({ length: CELL_COUNT }, () => [])
for (let cell = 0; cell < CELL_COUNT; cell += 1) {
  const peers = new Set<number>()
  for (const unit of UNITS_BY_CELL[cell]) {
    for (const peer of unit.cells) {
      if (peer !== cell) peers.add(peer)
    }
  }
  PEERS[cell] = [...peers].sort((a, b) => a - b)
}

export function emptyCells(grid: Grid): number[] {
  const cells: number[] = []
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    if (grid[cell] === 0) cells.push(cell)
  }
  return cells
}

export function countGivens(grid: Grid): number {
  return grid.reduce((count, value) => count + (value === 0 ? 0 : 1), 0)
}

export function isSolved(grid: Grid): boolean {
  return grid.every((value) => value >= 1 && value <= 9)
}

export function computeCandidates(grid: Grid): CandidateMasks {
  const candidates = grid.map((value) => (value === 0 ? ALL_DIGITS_MASK : 0))

  for (const unit of ALL_UNITS) {
    let used = 0
    for (const cell of unit.cells) {
      if (grid[cell] !== 0) used |= digitMask(grid[cell])
    }
    for (const cell of unit.cells) {
      if (grid[cell] === 0) candidates[cell] &= ~used
    }
  }

  return candidates
}

export function validateGrid(input: unknown): GridValidation {
  const errors: string[] = []

  if (!Array.isArray(input) || input.length !== CELL_COUNT) {
    return { ok: false, errors: ['The puzzle must contain exactly 81 cells.'], givens: 0 }
  }

  const grid = input as number[]
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const value = grid[index]
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      errors.push(`${cellLabel(index)} contains an invalid value.`)
    }
  }

  if (errors.length > 0) return { ok: false, errors, givens: 0 }

  for (const unit of ALL_UNITS) {
    const seen = new Map<number, number>()
    for (const cell of unit.cells) {
      const value = grid[cell]
      if (value === 0) continue
      const previous = seen.get(value)
      if (previous !== undefined) {
        errors.push(
          `${unit.name[0].toUpperCase()}${unit.name.slice(1)} contains ${value} twice (${cellLabel(previous)} and ${cellLabel(cell)}).`,
        )
      } else {
        seen.set(value, cell)
      }
    }
  }

  if (errors.length === 0) {
    const candidates = computeCandidates(grid)
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      if (grid[cell] === 0 && candidates[cell] === 0) {
        errors.push(`${cellLabel(cell)} has no legal candidates.`)
      }
    }
  }

  return { ok: errors.length === 0, errors, givens: countGivens(grid) }
}

export function parseGridString(value: string): Grid | null {
  const chars = value.trim().replace(/[\s.|,_-]+/g, '')
  if (!/^[0-9]{81}$/.test(chars)) return null
  return [...chars].map((char) => Number(char))
}

export function gridToString(grid: Grid): string {
  return grid.join('')
}

export function formatDigitList(digits: number[], conjunction = 'and'): string {
  if (digits.length === 0) return ''
  if (digits.length === 1) return String(digits[0])
  if (digits.length === 2) return `${digits[0]} ${conjunction} ${digits[1]}`
  return `${digits.slice(0, -1).join(', ')} ${conjunction} ${digits[digits.length - 1]}`
}

export function formatCellList(cells: number[], conjunction = 'and'): string {
  const labels = cells.map(cellLabel)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} ${conjunction} ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels[labels.length - 1]}`
}

export function formatCandidateList(mask: number): string {
  const digits = digitsOf(mask)
  return digits.length === 0 ? 'none' : digits.join(' ')
}
