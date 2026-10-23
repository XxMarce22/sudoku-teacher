import { describe, expect, it } from 'vitest'
import {
  ALL_DIGITS_MASK,
  BOXES,
  CELL_COUNT,
  COLS,
  PEERS,
  ROWS,
  UNITS_BY_CELL,
  boxOf,
  cellIndex,
  cellLabel,
  colOf,
  computeCandidates,
  countGivens,
  digitMask,
  digitsOf,
  emptyCells,
  formatCandidateList,
  formatCellList,
  formatDigitList,
  gridToString,
  hasCandidate,
  isSolved,
  parseGridString,
  popcount,
  rowOf,
  unitLabel,
  validateGrid,
  type Grid,
} from './sudoku'

function emptyGrid(): Grid {
  return Array.from({ length: CELL_COUNT }, () => 0)
}

/** The classic valid base pattern, built independently of the solver. */
function solvedPattern(): Grid {
  const grid: Grid = []
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      grid.push(((row * 3 + Math.floor(row / 3) + col) % 9) + 1)
    }
  }
  return grid
}

const KNOWN_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

describe('units and peers', () => {
  it('builds nine rows, nine columns and nine boxes of nine cells', () => {
    for (const unit of [...ROWS, ...COLS, ...BOXES]) {
      expect(unit.cells).toHaveLength(9)
      expect(new Set(unit.cells).size).toBe(9)
    }
    expect(ROWS[0].cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(COLS[0].cells).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72])
    expect(BOXES[4].cells).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50])
    expect(ROWS[0].name).toBe('row 1')
    expect(unitLabel('col', 3)).toBe('column 4')
    expect(unitLabel('box', 8)).toBe('box 9')
  })

  it('gives every cell exactly 20 peers and three units', () => {
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      expect(PEERS[cell]).toHaveLength(20)
      expect(new Set(PEERS[cell]).size).toBe(20)
      expect(PEERS[cell]).not.toContain(cell)
      expect(UNITS_BY_CELL[cell]).toHaveLength(3)
    }
    expect(PEERS[0]).toContain(1)
    expect(PEERS[0]).toContain(9)
    expect(PEERS[0]).toContain(10)
    expect(PEERS[0]).not.toContain(30)
  })

  it('maps coordinates both ways', () => {
    expect(cellIndex(4, 2)).toBe(38)
    expect(rowOf(38)).toBe(4)
    expect(colOf(38)).toBe(2)
    expect(boxOf(38)).toBe(3)
    expect(boxOf(0)).toBe(0)
    expect(boxOf(80)).toBe(8)
    expect(cellLabel(0)).toBe('R1C1')
    expect(cellLabel(38)).toBe('R5C3')
    expect(cellLabel(80)).toBe('R9C9')
  })
})

describe('candidate masks', () => {
  it('packs digits 1-9 into single bits', () => {
    expect(digitMask(1)).toBe(1)
    expect(digitMask(9)).toBe(256)
    expect(ALL_DIGITS_MASK).toBe(511)
    expect(hasCandidate(0b000000101, 1)).toBe(true)
    expect(hasCandidate(0b000000101, 2)).toBe(false)
    expect(digitsOf(0)).toEqual([])
    expect(digitsOf(ALL_DIGITS_MASK)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(popcount(0)).toBe(0)
    expect(popcount(ALL_DIGITS_MASK)).toBe(9)
    expect(popcount(0b1010)).toBe(2)
  })

  it('computes candidates from the givens alone', () => {
    const grid = emptyGrid()
    expect(computeCandidates(grid).every((mask) => mask === ALL_DIGITS_MASK)).toBe(true)

    grid[0] = 5
    const candidates = computeCandidates(grid)
    expect(candidates[0]).toBe(0)
    for (const peer of PEERS[0]) {
      expect(hasCandidate(candidates[peer], 5)).toBe(false)
    }
    expect(hasCandidate(candidates[40], 5)).toBe(true)
  })
})

describe('validateGrid', () => {
  it('accepts an empty board and a fully solved board', () => {
    expect(validateGrid(emptyGrid())).toEqual({ ok: true, errors: [], givens: 0 })

    const solved = solvedPattern()
    const validation = validateGrid(solved)
    expect(validation.ok).toBe(true)
    expect(validation.givens).toBe(81)
    expect(isSolved(solved)).toBe(true)
  })

  it('rejects anything that is not 81 integer cells between 0 and 9', () => {
    expect(validateGrid(null).ok).toBe(false)
    expect(validateGrid(emptyGrid().slice(0, 80)).errors[0]).toBe(
      'The puzzle must contain exactly 81 cells.',
    )

    const fractional = emptyGrid()
    fractional[5] = 1.5
    expect(validateGrid(fractional).errors[0]).toBe('R1C6 contains an invalid value.')

    const outOfRange = emptyGrid()
    outOfRange[5] = 10
    expect(validateGrid(outOfRange).ok).toBe(false)
  })

  it('rejects repeats inside a row, column, or box', () => {
    const rowClash = emptyGrid()
    rowClash[0] = 5
    rowClash[1] = 5
    expect(validateGrid(rowClash).errors[0]).toBe(
      'Row 1 contains 5 twice (R1C1 and R1C2).',
    )

    const colClash = emptyGrid()
    colClash[0] = 7
    colClash[9] = 7
    expect(validateGrid(colClash).errors[0]).toBe(
      'Column 1 contains 7 twice (R1C1 and R2C1).',
    )

    const boxClash = emptyGrid()
    boxClash[0] = 7
    boxClash[10] = 7
    expect(validateGrid(boxClash).errors[0]).toBe(
      'Box 1 contains 7 twice (R1C1 and R2C2).',
    )
  })

  it('rejects empty cells that lost every candidate', () => {
    const grid = emptyGrid()
    for (let col = 1; col <= 8; col += 1) grid[col] = col + 1 // row 1: 2..9
    grid[9] = 1 // column 1 covers the last missing digit
    expect(validateGrid(grid).errors).toContain('R1C1 has no legal candidates.')
  })
})

describe('grid helpers', () => {
  it('counts givens and lists empty cells', () => {
    expect(countGivens(emptyGrid())).toBe(0)
    expect(emptyCells(emptyGrid())).toHaveLength(81)
    expect(emptyCells(solvedPattern())).toHaveLength(0)

    const grid = parseGridString(KNOWN_PUZZLE)
    expect(grid).not.toBeNull()
    if (grid) expect(countGivens(grid)).toBe(30)
  })

  it('parses decorated puzzle strings and prints plain ones', () => {
    const parsed = parseGridString(KNOWN_PUZZLE)
    expect(parsed).toEqual([...KNOWN_PUZZLE].map(Number))

    const decorated = KNOWN_PUZZLE.match(/.{9}/g)?.join(' ') ?? ''
    expect(parseGridString(decorated)).toEqual(parsed)
    expect(parseGridString('123')).toBeNull()
    expect(parseGridString(KNOWN_PUZZLE.replace('5', 'x'))).toBeNull()

    if (parsed) expect(gridToString(parsed)).toBe(KNOWN_PUZZLE)
  })

  it('formats digit, cell and candidate lists for humans', () => {
    expect(formatDigitList([])).toBe('')
    expect(formatDigitList([4])).toBe('4')
    expect(formatDigitList([4, 7])).toBe('4 and 7')
    expect(formatDigitList([1, 4, 5, 9])).toBe('1, 4, 5 and 9')
    expect(formatDigitList([1, 4, 5, 9], 'or')).toBe('1, 4, 5 or 9')

    expect(formatCellList([0])).toBe('R1C1')
    expect(formatCellList([0, 10])).toBe('R1C1 and R2C2')
    expect(formatCellList([0, 1, 2])).toBe('R1C1, R1C2 and R1C3')

    expect(formatCandidateList(0)).toBe('none')
    expect(formatCandidateList(digitMask(3) | digitMask(9))).toBe('3 9')
  })
})
