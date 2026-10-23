import {
  ALL_DIGITS_MASK,
  ALL_UNITS,
  BOXES,
  COLS,
  PEERS,
  ROWS,
  boxOf,
  cellLabel,
  colOf,
  computeCandidates,
  digitMask,
  digitsOf,
  formatCellList,
  formatDigitList,
  hasCandidate,
  isSolved,
  popcount,
  rowOf,
  type CandidateMasks,
  type Grid,
  type Unit,
} from './sudoku'
import type { TechniqueId } from './techniques'

export interface Placement {
  cell: number
  digit: number
}

export interface Elimination {
  cell: number
  digit: number
}

export interface ColorGroup {
  label: string
  cells: number[]
}

export interface Step {
  technique: TechniqueId
  title: string
  summary: string
  explanation: string
  cells: number[]
  secondaryCells: number[]
  placements: Placement[]
  eliminations: Elimination[]
  colorGroups?: ColorGroup[]
}

export interface SolverState {
  grid: Grid
  candidates: CandidateMasks
}

export interface AppliedMove {
  step: Step
  before: SolverState
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function createSolverState(grid: Grid): SolverState {
  const copy = [...grid]
  return {
    grid: copy,
    candidates: computeCandidates(copy),
  }
}

function* combinations<T>(items: T[], size: number): Generator<T[]> {
  if (size < 1 || size > items.length) return
  const indices = Array.from({ length: size }, (_, index) => index)

  while (true) {
    yield indices.map((index) => items[index])

    let cursor = size - 1
    while (cursor >= 0 && indices[cursor] === items.length - size + cursor) {
      cursor -= 1
    }
    if (cursor < 0) return

    indices[cursor] += 1
    for (let index = cursor + 1; index < size; index += 1) {
      indices[index] = indices[index - 1] + 1
    }
  }
}

function cellsWithDigit(state: SolverState, cells: number[], digit: number): number[] {
  return cells.filter(
    (cell) =>
      state.grid[cell] === 0 && hasCandidate(state.candidates[cell], digit),
  )
}

function candidateSet(mask: number): string {
  return `{${digitsOf(mask).join(', ')}}`
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

function assertConsistent(state: SolverState): void {
  for (let cell = 0; cell < 81; cell += 1) {
    if (state.grid[cell] === 0 && state.candidates[cell] === 0) {
      throw new Error(
        `The board is inconsistent: ${cellLabel(cell)} has no candidates.`,
      )
    }
  }
}

function placementStep(
  technique: TechniqueId,
  title: string,
  cell: number,
  digit: number,
  explanation: string,
): Step {
  return {
    technique,
    title,
    summary: `Place ${digit} in ${cellLabel(cell)}.`,
    explanation,
    cells: [cell],
    secondaryCells: [],
    placements: [{ cell, digit }],
    eliminations: [],
  }
}

function findNakedSingle(state: SolverState): Step | null {
  for (let cell = 0; cell < 81; cell += 1) {
    if (state.grid[cell] !== 0) continue
    const mask = state.candidates[cell]
    if (popcount(mask) !== 1) continue
    const digit = digitsOf(mask)[0]
    return placementStep(
      'naked-single',
      'Naked single',
      cell,
      digit,
      `${cellLabel(cell)} has only one candidate left: ${digit}. Every other digit is already blocked by a placed digit in its row, column, or box.`,
    )
  }
  return null
}

function findHiddenSingle(state: SolverState): Step | null {
  for (const unit of ALL_UNITS) {
    for (const digit of DIGITS) {
      const positions = cellsWithDigit(state, unit.cells, digit)
      if (positions.length !== 1) continue

      const cell = positions[0]
      if (popcount(state.candidates[cell]) === 1) continue

      return placementStep(
        'hidden-single',
        `Hidden single ${digit} in ${unit.name}`,
        cell,
        digit,
        `In ${unit.name}, ${digit} has only one possible cell: ${cellLabel(cell)}. No other empty cell in the unit still has ${digit} as a candidate, so the unit's ${digit} must go there.`,
      )
    }
  }
  return null
}

function findNakedSubset(
  state: SolverState,
  size: 2 | 3 | 4,
): Step | null {
  const name = size === 2 ? 'Naked pair' : size === 3 ? 'Naked triple' : 'Naked quad'

  for (const unit of ALL_UNITS) {
    const eligible = unit.cells.filter((cell) => {
      if (state.grid[cell] !== 0) return false
      const count = popcount(state.candidates[cell])
      return count >= 2 && count <= size
    })
    if (eligible.length < size) continue

    for (const combo of combinations(eligible, size)) {
      let union = 0
      for (const cell of combo) union |= state.candidates[cell]
      if (popcount(union) !== size) continue

      const comboSet = new Set(combo)
      const eliminations: Elimination[] = []
      for (const cell of unit.cells) {
        if (state.grid[cell] !== 0 || comboSet.has(cell)) continue
        for (const digit of digitsOf(union)) {
          if (hasCandidate(state.candidates[cell], digit)) {
            eliminations.push({ cell, digit })
          }
        }
      }
      if (eliminations.length === 0) continue

      const digits = digitsOf(union)
      return {
        technique: size === 2 ? 'naked-pair' : size === 3 ? 'naked-triple' : 'naked-quad',
        title: `${name} ${digits.join('/')} in ${unit.name}`,
        summary: `Remove ${formatDigitList(digits)} from the rest of ${unit.name}.`,
        explanation: `${formatCellList(combo)} in ${unit.name} share only the candidates ${formatDigitList(digits)}. Those ${size} cells must hold those ${size} digits in some order, so no other cell in ${unit.name} can use them.`,
        cells: combo,
        secondaryCells: [],
        placements: [],
        eliminations,
      }
    }
  }
  return null
}

function findHiddenSubset(
  state: SolverState,
  size: 2 | 3 | 4,
): Step | null {
  const name = size === 2 ? 'Hidden pair' : size === 3 ? 'Hidden triple' : 'Hidden quad'

  for (const unit of ALL_UNITS) {
    for (const combo of combinations(DIGITS, size)) {
      const cells = new Set<number>()
      let valid = true
      for (const digit of combo) {
        const positions = cellsWithDigit(state, unit.cells, digit)
        if (positions.length === 0) {
          valid = false
          break
        }
        for (const cell of positions) cells.add(cell)
      }
      if (!valid || cells.size !== size) continue

      const subsetCells = [...cells].sort((a, b) => a - b)
      const subsetMask = combo.reduce((mask, digit) => mask | digitMask(digit), 0)
      const eliminations: Elimination[] = []
      for (const cell of subsetCells) {
        for (const digit of digitsOf(state.candidates[cell])) {
          if (!hasCandidate(subsetMask, digit)) {
            eliminations.push({ cell, digit })
          }
        }
      }
      if (eliminations.length === 0) continue

      return {
        technique: size === 2 ? 'hidden-pair' : size === 3 ? 'hidden-triple' : 'hidden-quad',
        title: `${name} ${combo.join('/')} in ${unit.name}`,
        summary: `Remove other candidates from ${formatCellList(subsetCells)}.`,
        explanation: `In ${unit.name}, digits ${formatDigitList(combo)} can only appear in ${formatCellList(subsetCells)}. Those cells must supply all ${size} digits, so every other candidate in them can be removed.`,
        cells: subsetCells,
        secondaryCells: [],
        placements: [],
        eliminations,
      }
    }
  }
  return null
}

function findPointing(state: SolverState): Step | null {
  for (const box of BOXES) {
    for (const digit of DIGITS) {
      const positions = cellsWithDigit(state, box.cells, digit)
      if (positions.length < 2) continue

      const row = rowOf(positions[0])
      const sameRow = positions.every((cell) => rowOf(cell) === row)
      const col = colOf(positions[0])
      const sameCol = positions.every((cell) => colOf(cell) === col)

      if (sameRow) {
        const rowUnit = ROWS[row]
        const eliminations: Elimination[] = []
        for (const cell of rowUnit.cells) {
          if (boxOf(cell) === box.index) continue
          if (
            state.grid[cell] === 0 &&
            hasCandidate(state.candidates[cell], digit)
          ) {
            eliminations.push({ cell, digit })
          }
        }
        if (eliminations.length > 0) {
          const kind = positions.length === 2 ? 'Pointing pair' : 'Pointing triple'
          return {
            technique: 'pointing',
            title: `${kind} on ${digit}`,
            summary: `Remove ${digit} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
            explanation: `In ${box.name}, every candidate for ${digit} is in ${rowUnit.name} (${formatCellList(positions)}). The box must contain ${digit}, so the row's ${digit} has to be inside this box. Remove ${digit} from the rest of ${rowUnit.name}.`,
            cells: positions,
            secondaryCells: [],
            placements: [],
            eliminations,
          }
        }
      }

      if (sameCol) {
        const colUnit = COLS[col]
        const eliminations: Elimination[] = []
        for (const cell of colUnit.cells) {
          if (boxOf(cell) === box.index) continue
          if (
            state.grid[cell] === 0 &&
            hasCandidate(state.candidates[cell], digit)
          ) {
            eliminations.push({ cell, digit })
          }
        }
        if (eliminations.length > 0) {
          const kind = positions.length === 2 ? 'Pointing pair' : 'Pointing triple'
          return {
            technique: 'pointing',
            title: `${kind} on ${digit}`,
            summary: `Remove ${digit} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
            explanation: `In ${box.name}, every candidate for ${digit} is in ${colUnit.name} (${formatCellList(positions)}). The box must contain ${digit}, so the column's ${digit} has to be inside this box. Remove ${digit} from the rest of ${colUnit.name}.`,
            cells: positions,
            secondaryCells: [],
            placements: [],
            eliminations,
          }
        }
      }
    }
  }
  return null
}

function findClaiming(state: SolverState): Step | null {
  for (const line of [...ROWS, ...COLS]) {
    for (const digit of DIGITS) {
      const positions = cellsWithDigit(state, line.cells, digit)
      if (positions.length < 2) continue

      const box = boxOf(positions[0])
      if (!positions.every((cell) => boxOf(cell) === box)) continue

      const boxUnit = BOXES[box]
      const eliminations: Elimination[] = []
      for (const cell of boxUnit.cells) {
        if (line.cells.includes(cell)) continue
        if (
          state.grid[cell] === 0 &&
          hasCandidate(state.candidates[cell], digit)
        ) {
          eliminations.push({ cell, digit })
        }
      }
      if (eliminations.length === 0) continue

      const lineWord = line.type === 'row' ? 'row' : 'column'
      return {
        technique: 'claiming',
        title: `Box-line reduction on ${digit}`,
        summary: `Remove ${digit} from the rest of ${boxUnit.name}.`,
        explanation: `In ${line.name}, every candidate for ${digit} is inside ${boxUnit.name} (${formatCellList(positions)}). The ${lineWord} must contain ${digit}, so ${boxUnit.name}'s ${digit} must lie on ${line.name}. Remove ${digit} from the rest of the box.`,
        cells: positions,
        secondaryCells: [],
        placements: [],
        eliminations,
      }
    }
  }
  return null
}

function findFish(
  state: SolverState,
  size: 2 | 3 | 4,
): Step | null {
  const technique: TechniqueId =
    size === 2 ? 'x-wing' : size === 3 ? 'swordfish' : 'jellyfish'
  const name = size === 2 ? 'X-Wing' : size === 3 ? 'Swordfish' : 'Jellyfish'

  for (const orientation of ['row', 'col'] as const) {
    const baseUnits = orientation === 'row' ? ROWS : COLS
    const coverUnits = orientation === 'row' ? COLS : ROWS

    for (const digit of DIGITS) {
      const entries = baseUnits
        .map((unit) => ({
          unit,
          positions: cellsWithDigit(state, unit.cells, digit),
        }))
        .filter(
          (entry) =>
            entry.positions.length >= 2 && entry.positions.length <= size,
        )
      if (entries.length < size) continue

      for (const combo of combinations(entries, size)) {
        const cover = new Set<number>()
        for (const entry of combo) {
          for (const cell of entry.positions) {
            cover.add(orientation === 'row' ? colOf(cell) : rowOf(cell))
          }
        }
        if (cover.size !== size) continue

        const baseIndices = new Set(combo.map((entry) => entry.unit.index))
        const patternCells = combo.flatMap((entry) => entry.positions)
        const eliminations: Elimination[] = []

        for (const coverIndex of cover) {
          for (const cell of coverUnits[coverIndex].cells) {
            const baseIndex = orientation === 'row' ? rowOf(cell) : colOf(cell)
            if (baseIndices.has(baseIndex)) continue
            if (
              state.grid[cell] === 0 &&
              hasCandidate(state.candidates[cell], digit)
            ) {
              eliminations.push({ cell, digit })
            }
          }
        }
        if (eliminations.length === 0) continue

        const baseName = orientation === 'row' ? 'row' : 'column'
        const coverName = orientation === 'row' ? 'column' : 'row'
        const baseLabels = combo.map((entry) => entry.unit.index + 1)
        const coverLabels = [...cover].map((index) => index + 1).sort((a, b) => a - b)
        return {
          technique,
          title: `${name} on ${digit}`,
          summary: `Remove ${digit} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
          explanation: `For ${digit}, ${baseName}s ${formatDigitList(baseLabels)} have candidates only in ${coverName}s ${formatDigitList(coverLabels)}. Each ${baseName} must place ${digit}, and together they claim all ${size} ${coverName}s. Remove ${digit} from the rest of those ${coverName}s. (Pattern cells: ${formatCellList(patternCells)}.)`,
          cells: patternCells,
          secondaryCells: [],
          placements: [],
          eliminations,
        }
      }
    }
  }
  return null
}

function findXYWing(state: SolverState): Step | null {
  for (let pivot = 0; pivot < 81; pivot += 1) {
    if (state.grid[pivot] !== 0) continue
    const pivotMask = state.candidates[pivot]
    if (popcount(pivotMask) !== 2) continue

    const [digitA, digitB] = digitsOf(pivotMask)
    const wingsByShared = new Map<number, { cell: number; other: number }[]>()

    for (const cell of PEERS[pivot]) {
      if (state.grid[cell] !== 0) continue
      const mask = state.candidates[cell]
      if (popcount(mask) !== 2) continue

      const shared = mask & pivotMask
      if (popcount(shared) !== 1) continue
      const other = mask & ~pivotMask
      if (popcount(other) !== 1) continue

      const sharedDigit = digitsOf(shared)[0]
      const otherDigit = digitsOf(other)[0]
      const list = wingsByShared.get(sharedDigit) ?? []
      list.push({ cell, other: otherDigit })
      wingsByShared.set(sharedDigit, list)
    }

    const wingsA = wingsByShared.get(digitA) ?? []
    const wingsB = wingsByShared.get(digitB) ?? []
    for (const wingA of wingsA) {
      for (const wingB of wingsB) {
        if (wingA.cell === wingB.cell) continue
        if (wingA.other !== wingB.other) continue

        const common = new Set(PEERS[wingB.cell])
        const eliminations: Elimination[] = []
        for (const cell of PEERS[wingA.cell]) {
          if (!common.has(cell)) continue
          if (cell === pivot || cell === wingA.cell || cell === wingB.cell) continue
          if (state.grid[cell] !== 0) continue
          if (hasCandidate(state.candidates[cell], wingA.other)) {
            eliminations.push({ cell, digit: wingA.other })
          }
        }
        if (eliminations.length === 0) continue

        const digitC = wingA.other
        return {
          technique: 'xy-wing',
          title: `XY-Wing on ${digitC}`,
          summary: `Remove ${digitC} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
          explanation: `Pivot ${cellLabel(pivot)} has candidates ${candidateSet(pivotMask)}. It sees ${cellLabel(wingA.cell)} ${candidateSet(state.candidates[wingA.cell])} and ${cellLabel(wingB.cell)} ${candidateSet(state.candidates[wingB.cell])}. If the pivot is ${digitA}, ${cellLabel(wingA.cell)} must be ${digitC}; if the pivot is ${digitB}, ${cellLabel(wingB.cell)} must be ${digitC}. Either way, at least one wing is ${digitC}, so any cell seeing both wings cannot be ${digitC}.`,
          cells: [pivot, wingA.cell, wingB.cell],
          secondaryCells: [],
          placements: [],
          eliminations,
        }
      }
    }
  }
  return null
}

function findXYZWing(state: SolverState): Step | null {
  for (let pivot = 0; pivot < 81; pivot += 1) {
    if (state.grid[pivot] !== 0) continue
    const pivotMask = state.candidates[pivot]
    if (popcount(pivotMask) !== 3) continue

    const wings = PEERS[pivot]
      .filter((cell) => {
        if (state.grid[cell] !== 0) return false
        const mask = state.candidates[cell]
        return popcount(mask) === 2 && (mask & ~pivotMask) === 0
      })
      .sort((a, b) => a - b)

    for (let first = 0; first < wings.length; first += 1) {
      for (let second = first + 1; second < wings.length; second += 1) {
        const wingA = wings[first]
        const wingB = wings[second]
        const maskA = state.candidates[wingA]
        const maskB = state.candidates[wingB]
        if ((maskA | maskB) !== pivotMask) continue

        const shared = maskA & maskB
        if (popcount(shared) !== 1) continue
        const digit = digitsOf(shared)[0]

        const seesA = new Set(PEERS[wingA])
        const seesB = new Set(PEERS[wingB])
        const eliminations: Elimination[] = []
        for (const cell of PEERS[pivot]) {
          if (!seesA.has(cell) || !seesB.has(cell)) continue
          if (state.grid[cell] !== 0) continue
          if (hasCandidate(state.candidates[cell], digit)) {
            eliminations.push({ cell, digit })
          }
        }
        if (eliminations.length === 0) continue

        return {
          technique: 'xyz-wing',
          title: `XYZ-Wing on ${digit}`,
          summary: `Remove ${digit} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
          explanation: `Pivot ${cellLabel(pivot)} has candidates ${candidateSet(pivotMask)}. It sees ${cellLabel(wingA)} ${candidateSet(maskA)} and ${cellLabel(wingB)} ${candidateSet(maskB)}. If the pivot is ${digit}, the pivot itself is ${digit}; if it is either other candidate, one of the wings must be ${digit}. So ${digit} is always present among these three cells, and any cell seeing all three cannot contain it.`,
          cells: [pivot, wingA, wingB],
          secondaryCells: [],
          placements: [],
          eliminations,
        }
      }
    }
  }
  return null
}

function findSkyscraper(state: SolverState): Step | null {
  for (const orientation of ['row', 'col'] as const) {
    const baseUnits = orientation === 'row' ? ROWS : COLS
    const coverName = orientation === 'row' ? 'column' : 'row'
    const coordinateOf = orientation === 'row' ? colOf : rowOf

    for (const digit of DIGITS) {
      const entries = baseUnits
        .map((unit) => ({
          unit,
          positions: cellsWithDigit(state, unit.cells, digit),
        }))
        .filter((entry) => entry.positions.length === 2)

      for (let first = 0; first < entries.length; first += 1) {
        for (let second = first + 1; second < entries.length; second += 1) {
          const entryA = entries[first]
          const entryB = entries[second]
          const shared = entryA.positions
            .map((cell) => coordinateOf(cell))
            .filter((coordinate) =>
              entryB.positions.some((cell) => coordinateOf(cell) === coordinate),
            )
          if (shared.length !== 1) continue

          const sharedCoordinate = shared[0]
          const topA = entryA.positions.find(
            (cell) => coordinateOf(cell) !== sharedCoordinate,
          )
          const topB = entryB.positions.find(
            (cell) => coordinateOf(cell) !== sharedCoordinate,
          )
          const baseA = entryA.positions.find(
            (cell) => coordinateOf(cell) === sharedCoordinate,
          )
          const baseB = entryB.positions.find(
            (cell) => coordinateOf(cell) === sharedCoordinate,
          )
          if (
            topA === undefined ||
            topB === undefined ||
            baseA === undefined ||
            baseB === undefined
          ) {
            continue
          }

          const seesB = new Set(PEERS[topB])
          const pattern = new Set([topA, topB, baseA, baseB])
          const eliminations: Elimination[] = []
          for (const cell of PEERS[topA]) {
            if (!seesB.has(cell)) continue
            if (pattern.has(cell)) continue
            if (state.grid[cell] !== 0) continue
            if (hasCandidate(state.candidates[cell], digit)) {
              eliminations.push({ cell, digit })
            }
          }
          if (eliminations.length === 0) continue

          const sharedLine = `${coverName} ${sharedCoordinate + 1}`
          return {
            technique: 'skyscraper',
            title: `Skyscraper on ${digit}`,
            summary: `Remove ${digit} from ${formatCellList(eliminations.map((item) => item.cell))}.`,
            explanation: `${capitalize(entryA.unit.name)} and ${entryB.unit.name} each have exactly two candidates for ${digit}, and they share ${sharedLine} as a base. If both other ends were false, both base cells would have to be ${digit}, which is impossible in one ${coverName}. So at least one of ${cellLabel(topA)} and ${cellLabel(topB)} must be ${digit}. Any cell seeing both tops cannot be ${digit}.`,
            cells: [topA, topB, baseA, baseB],
            secondaryCells: [],
            placements: [],
            eliminations,
          }
        }
      }
    }
  }
  return null
}

function findSimpleColoring(state: SolverState): Step | null {
  for (const digit of DIGITS) {
    const adjacency: number[][] = Array.from({ length: 81 }, () => [])
    for (const unit of ALL_UNITS) {
      const positions = cellsWithDigit(state, unit.cells, digit)
      if (positions.length !== 2) continue
      const [a, b] = positions
      if (!adjacency[a].includes(b)) adjacency[a].push(b)
      if (!adjacency[b].includes(a)) adjacency[b].push(a)
    }

    const visited = new Array<boolean>(81).fill(false)
    for (let start = 0; start < 81; start += 1) {
      if (visited[start] || adjacency[start].length === 0) continue

      const color = new Map<number, 0 | 1>([[start, 0]])
      const queue = [start]
      let consistent = true
      const component: number[] = []

      while (queue.length > 0) {
        const cell = queue.shift() as number
        component.push(cell)
        visited[cell] = true
        const nextColor = color.get(cell) === 0 ? 1 : 0
        for (const peer of adjacency[cell]) {
          const existing = color.get(peer)
          if (existing === undefined) {
            color.set(peer, nextColor)
            queue.push(peer)
          } else if (existing !== nextColor) {
            consistent = false
          }
        }
      }
      if (!consistent) continue

      const groupA = component.filter((cell) => color.get(cell) === 0).sort((a, b) => a - b)
      const groupB = component.filter((cell) => color.get(cell) === 1).sort((a, b) => a - b)
      if (groupA.length === 0 || groupB.length === 0) continue

      const colorGroups: ColorGroup[] = [
        { label: 'A', cells: groupA },
        { label: 'B', cells: groupB },
      ]

      let conflict: { group: ColorGroup; first: number; second: number } | null = null
      for (const group of colorGroups) {
        for (let first = 0; first < group.cells.length && !conflict; first += 1) {
          for (let second = first + 1; second < group.cells.length; second += 1) {
            if (PEERS[group.cells[first]].includes(group.cells[second])) {
              conflict = {
                group,
                first: group.cells[first],
                second: group.cells[second],
              }
              break
            }
          }
        }
        if (conflict) break
      }

      if (conflict) {
        return {
          technique: 'simple-coloring',
          title: `Simple coloring on ${digit}`,
          summary: `Remove ${digit} from every group ${conflict.group.label} cell.`,
          explanation: `The conjugate-pair chain for ${digit} alternates between group A and group B: one group is true and the other is false. ${cellLabel(conflict.first)} and ${cellLabel(conflict.second)} are both in group ${conflict.group.label} and see each other, so group ${conflict.group.label} cannot be the true group. Remove ${digit} from every cell in that group.`,
          cells: component,
          secondaryCells: [],
          placements: [],
          eliminations: conflict.group.cells.map((cell) => ({ cell, digit })),
          colorGroups,
        }
      }

      const componentSet = new Set(component)
      const outsideEliminations: Elimination[] = []
      let example: { cell: number; seesA: number; seesB: number } | null = null
      for (let cell = 0; cell < 81; cell += 1) {
        if (componentSet.has(cell) || state.grid[cell] !== 0) continue
        if (!hasCandidate(state.candidates[cell], digit)) continue
        const peers = PEERS[cell]
        const seesA = groupA.find((groupCell) => peers.includes(groupCell))
        const seesB = groupB.find((groupCell) => peers.includes(groupCell))
        if (seesA === undefined || seesB === undefined) continue
        outsideEliminations.push({ cell, digit })
        if (!example) example = { cell, seesA, seesB }
      }

      if (outsideEliminations.length > 0 && example) {
        return {
          technique: 'simple-coloring',
          title: `Simple coloring on ${digit}`,
          summary: `Remove ${digit} from ${formatCellList(outsideEliminations.map((item) => item.cell))}.`,
          explanation: `The conjugate-pair chain for ${digit} alternates between groups A and B; exactly one group is true. ${cellLabel(example.cell)} sees ${cellLabel(example.seesA)} in group A and ${cellLabel(example.seesB)} in group B, so whichever group is true, ${cellLabel(example.cell)} cannot be ${digit}.`,
          cells: component,
          secondaryCells: [],
          placements: [],
          eliminations: outsideEliminations,
          colorGroups,
        }
      }
    }
  }
  return null
}

const DETECTORS: Array<(state: SolverState) => Step | null> = [
  findNakedSingle,
  findHiddenSingle,
  (state) => findNakedSubset(state, 2),
  (state) => findHiddenSubset(state, 2),
  findPointing,
  findClaiming,
  (state) => findNakedSubset(state, 3),
  (state) => findHiddenSubset(state, 3),
  (state) => findNakedSubset(state, 4),
  (state) => findHiddenSubset(state, 4),
  (state) => findFish(state, 2),
  findXYWing,
  findSkyscraper,
  (state) => findFish(state, 3),
  findXYZWing,
  findSimpleColoring,
  (state) => findFish(state, 4),
]

export function findAllSteps(state: SolverState): Step[] {
  assertConsistent(state)
  if (isSolved(state.grid)) return []
  const steps: Step[] = []
  for (const detector of DETECTORS) {
    const step = detector(state)
    if (step) steps.push(step)
  }
  return steps
}

export function findNextStep(state: SolverState): Step | null {
  assertConsistent(state)
  if (isSolved(state.grid)) return null
  for (const detector of DETECTORS) {
    const step = detector(state)
    if (step) return step
  }
  return null
}

export function applyStep(state: SolverState, step: Step): SolverState {
  const grid = [...state.grid]
  const candidates = [...state.candidates]

  for (const elimination of step.eliminations) {
    candidates[elimination.cell] &= ~digitMask(elimination.digit)
  }

  for (const placement of step.placements) {
    if (grid[placement.cell] !== 0) {
      throw new Error(`Cannot place ${placement.digit} in an occupied cell.`)
    }
    grid[placement.cell] = placement.digit
    candidates[placement.cell] = 0
    for (const peer of PEERS[placement.cell]) {
      candidates[peer] &= ~digitMask(placement.digit)
    }
  }

  return { grid, candidates }
}

export function applySteps(
  state: SolverState,
  steps: Step[],
): SolverState {
  let next = state
  for (const step of steps) next = applyStep(next, step)
  return next
}

export function remainingCandidateCount(state: SolverState): number {
  let total = 0
  for (let cell = 0; cell < 81; cell += 1) {
    if (state.grid[cell] === 0) {
      total += popcount(state.candidates[cell])
    }
  }
  return total
}

export function allDigitsMask(): number {
  return ALL_DIGITS_MASK
}

export function stepUnitCells(step: Step): Unit[] {
  const units: Unit[] = []
  for (const cell of step.cells) {
    for (const unit of ALL_UNITS) {
      if (unit.cells.includes(cell) && !units.some((item) => item.type === unit.type && item.index === unit.index)) {
        units.push(unit)
      }
    }
  }
  return units
}
