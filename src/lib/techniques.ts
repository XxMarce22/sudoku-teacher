export type TechniqueId =
  | 'naked-single'
  | 'hidden-single'
  | 'naked-pair'
  | 'hidden-pair'
  | 'pointing'
  | 'claiming'
  | 'naked-triple'
  | 'hidden-triple'
  | 'naked-quad'
  | 'hidden-quad'
  | 'x-wing'
  | 'xy-wing'
  | 'skyscraper'
  | 'swordfish'
  | 'xyz-wing'
  | 'simple-coloring'
  | 'jellyfish'

export type TechniqueLevel = 'basics' | 'intermediate' | 'advanced'

export interface TechniqueMeta {
  id: TechniqueId
  name: string
  level: TechniqueLevel
  order: number
  tagline: string
  recognition: string
  reasoning: string
  tip: string
}

export const TECHNIQUES: TechniqueMeta[] = [
  {
    id: 'naked-single',
    name: 'Naked single',
    level: 'basics',
    order: 1,
    tagline: 'One cell, one possible digit.',
    recognition:
      'A cell has only one pencil mark left after checking its row, column, and box.',
    reasoning:
      'A cell must contain one digit. If eight digits are already excluded by its three units, the remaining digit is forced.',
    tip: 'Start with cells that have many filled neighbours. They often collapse to a single candidate.',
  },
  {
    id: 'hidden-single',
    name: 'Hidden single',
    level: 'basics',
    order: 2,
    tagline: 'One digit, one possible cell.',
    recognition:
      'Inside a row, column, or box, a digit can be placed in only one cell — even if that cell still has other pencil marks.',
    reasoning:
      'Every unit must contain each digit exactly once. If only one cell in a unit can hold a digit, that cell is forced regardless of its other candidates.',
    tip: 'Scan one unit at a time, or follow one digit across the grid. Both directions reveal hidden singles.',
  },
  {
    id: 'naked-pair',
    name: 'Naked pair',
    level: 'intermediate',
    order: 3,
    tagline: 'Two cells sharing two candidates.',
    recognition:
      'Two cells in the same unit have exactly the same two candidates, for example {3, 8} and {3, 8}.',
    reasoning:
      'The two digits must occupy those two cells in some order. No other cell in the unit can use either digit.',
    tip: 'Check all three unit types. A pair can be lying in a row, a column, or a box.',
  },
  {
    id: 'hidden-pair',
    name: 'Hidden pair',
    level: 'intermediate',
    order: 4,
    tagline: 'Two digits with only two homes.',
    recognition:
      'Two digits can appear in only the same two cells of a unit, even if those cells contain extra candidates.',
    reasoning:
      'Both digits need a home in the unit, and there are only two available cells. Those cells must be the pair, so their other candidates can be removed.',
    tip: 'Look for two digits that keep appearing in the same two cells. Extra pencil marks hide the pattern.',
  },
  {
    id: 'pointing',
    name: 'Pointing pair or triple',
    level: 'intermediate',
    order: 5,
    tagline: 'A box points along a line.',
    recognition:
      'Inside a box, all candidates for a digit lie in a single row or column.',
    reasoning:
      'The box must contain the digit, and the only places for it are on that line. Therefore the digit cannot appear elsewhere on the same line outside the box.',
    tip: 'Pick a digit and a box. If its candidates form a little line, it points at eliminations outside the box.',
  },
  {
    id: 'claiming',
    name: 'Box-line reduction',
    level: 'intermediate',
    order: 6,
    tagline: 'A line claims a box.',
    recognition:
      'Inside a row or column, all candidates for a digit lie in one box.',
    reasoning:
      'The line must place the digit somewhere, and every option is inside that box. The box therefore cannot use that digit outside the line.',
    tip: 'Pointing and claiming are mirror images. Look for a digit confined to one box along a line, or one line inside a box.',
  },
  {
    id: 'naked-triple',
    name: 'Naked triple',
    level: 'intermediate',
    order: 7,
    tagline: 'Three cells, three candidates.',
    recognition:
      'Three cells in a unit share only three candidates among them, such as {1,2}, {2,3}, and {1,3}.',
    reasoning:
      'The three digits must fill those three cells. Every other cell in the unit can drop those digits.',
    tip: 'The cells do not need to contain every digit individually; the union just needs to be three digits.',
  },
  {
    id: 'hidden-triple',
    name: 'Hidden triple',
    level: 'intermediate',
    order: 8,
    tagline: 'Three digits with only three homes.',
    recognition:
      'Three digits are confined to the same three cells of a unit.',
    reasoning:
      'The three digits need three homes, and only those cells are available. All other candidates in those cells can be removed.',
    tip: 'Hidden triples are easy to miss because the cells often look crowded with pencil marks.',
  },
  {
    id: 'naked-quad',
    name: 'Naked quad',
    level: 'intermediate',
    order: 9,
    tagline: 'Four cells, four candidates.',
    recognition:
      'Four cells in a unit share only four candidates among them.',
    reasoning:
      'Those four digits must occupy those four cells, so the digits cannot appear elsewhere in the unit.',
    tip: 'Quads are rarer than pairs and triples. Do not spend long hunting for them before checking simpler moves.',
  },
  {
    id: 'hidden-quad',
    name: 'Hidden quad',
    level: 'advanced',
    order: 10,
    tagline: 'Four digits with only four homes.',
    recognition:
      'Four digits are confined to the same four cells of a unit.',
    reasoning:
      'The four digits must occupy those four cells, so every other candidate in them can be removed.',
    tip: 'A hidden quad often appears when a unit is almost solved and several digits have been eliminated.',
  },
  {
    id: 'x-wing',
    name: 'X-Wing',
    level: 'advanced',
    order: 11,
    tagline: 'A two-by-two fish.',
    recognition:
      'For one digit, two rows each have exactly two candidates, and both rows use the same two columns.',
    reasoning:
      'Each row must place the digit once, and both placements must be in those two columns. The two columns are therefore claimed by the two rows, so the digit can be removed from the rest of those columns.',
    tip: 'The same pattern also works with two columns and two rows. Look for aligned pairs, not just two random candidates.',
  },
  {
    id: 'xy-wing',
    name: 'XY-Wing',
    level: 'advanced',
    order: 12,
    tagline: 'A pivot and two bivalue wings.',
    recognition:
      'A two-candidate pivot sees two two-candidate cells: {a,b}, {a,c}, and {b,c}. The two wings share the third digit c.',
    reasoning:
      'If the pivot is a, one wing becomes c. If the pivot is b, the other wing becomes c. At least one wing must be c, so any cell seeing both wings cannot contain c.',
    tip: 'Find a bivalue cell, then look for two bivalue peers that share one candidate with it and one candidate with each other.',
  },
  {
    id: 'skyscraper',
    name: 'Skyscraper',
    level: 'advanced',
    order: 13,
    tagline: 'Two towers sharing a base.',
    recognition:
      'For one digit, two rows each contain exactly two candidates, and the rows share one candidate column. Their other two candidates are the “tops”.',
    reasoning:
      'If both tops were false, both shared-base candidates would have to be true — impossible because they share a column. So at least one top is true, and cells seeing both tops cannot contain the digit.',
    tip: 'Look for two parallel lines with two candidates each and exactly one aligned end.',
  },
  {
    id: 'swordfish',
    name: 'Swordfish',
    level: 'advanced',
    order: 14,
    tagline: 'A three-by-three fish.',
    recognition:
      'For one digit, three rows have candidates restricted to the same three columns, with each row containing two or three candidates.',
    reasoning:
      'The three rows must place the digit in those three columns. The columns are fully claimed, so the digit can be removed from those columns in every other row.',
    tip: 'Swordfish is X-Wing extended to three rows and three columns. Column-based swordfish work the same way.',
  },
  {
    id: 'xyz-wing',
    name: 'XYZ-Wing',
    level: 'advanced',
    order: 15,
    tagline: 'A three-candidate pivot.',
    recognition:
      'A pivot {x,y,z} sees two cells {x,z} and {y,z}. Every wing is a subset of the pivot and both wings see the pivot.',
    reasoning:
      'If the pivot is z, z is in the pivot. If the pivot is x, the first wing must be z. If the pivot is y, the second wing must be z. Either way, a cell seeing all three cells cannot be z.',
    tip: 'The XYZ-Wing looks like an XY-Wing, but the pivot has three candidates and eliminations must see the pivot too.',
  },
  {
    id: 'simple-coloring',
    name: 'Simple coloring',
    level: 'advanced',
    order: 16,
    tagline: 'Follow a chain of conjugate pairs.',
    recognition:
      'For one digit, pairs of cells in units where the digit has exactly two candidates form a chain. Alternate two colors along the chain.',
    reasoning:
      'Each conjugate pair has one true and one false cell, so colors alternate. If two same-colored cells see each other, that color is impossible. If an outside cell sees both colors, it cannot contain the digit.',
    tip: 'Color one digit at a time. Do not worry about the rest of the board until the chain reveals a contradiction.',
  },
  {
    id: 'jellyfish',
    name: 'Jellyfish',
    level: 'advanced',
    order: 17,
    tagline: 'A four-by-four fish.',
    recognition:
      'For one digit, four rows have candidates restricted to the same four columns, with each row containing two to four candidates.',
    reasoning:
      'The four rows must place the digit in those four columns. The columns are claimed, so the digit can be removed from those columns in every other row.',
    tip: 'Jellyfish are uncommon. Check for smaller fish and simpler techniques first.',
  },
]

export const TECHNIQUE_BY_ID: Record<TechniqueId, TechniqueMeta> = Object.fromEntries(
  TECHNIQUES.map((technique) => [technique.id, technique]),
) as Record<TechniqueId, TechniqueMeta>

export const TECHNIQUE_LEVELS: { id: TechniqueLevel; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

export function techniqueLevelLabel(level: TechniqueLevel): string {
  if (level === 'basics') return 'Basics'
  if (level === 'intermediate') return 'Intermediate'
  return 'Advanced'
}
