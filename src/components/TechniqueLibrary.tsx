import { useState } from 'react'
import {
  TECHNIQUES,
  TECHNIQUE_LEVELS,
  techniqueLevelLabel,
  type TechniqueId,
  type TechniqueLevel,
} from '../lib/techniques'

export type ExampleSearchState =
  | {
      status: 'searching'
      technique: TechniqueId
      attempt: number
      attempts: number
      moves: number | null
      phase: 'fetching' | 'scanning'
    }
  | { status: 'not-found'; technique: TechniqueId; attempts: number }
  | { status: 'error'; technique: TechniqueId; message: string }

interface TechniqueLibraryProps {
  search: ExampleSearchState | null
  onFindExample: (technique: TechniqueId) => void
  onCancelSearch: () => void
}

export function TechniqueLibrary({
  search,
  onFindExample,
  onCancelSearch,
}: TechniqueLibraryProps) {
  const [filter, setFilter] = useState<'all' | TechniqueLevel>('all')

  const techniques =
    filter === 'all'
      ? TECHNIQUES
      : TECHNIQUES.filter((technique) => technique.level === filter)

  const searchBusy = search?.status === 'searching'

  return (
    <section className="library">
      <header className="library__hero">
        <p className="eyebrow">Technique library</p>
        <h1>Every move has a reason.</h1>
        <p className="library__lede">
          These are the techniques the dojo knows. Ask for a live example and the
          app fetches a real puzzle from a public API, solves it logically until
          the chosen pattern appears, and highlights it on the board. No puzzle is
          ever generated locally, and no move is ever guessed.
        </p>
      </header>

      <div className="library__filters" role="tablist" aria-label="Technique levels">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={filter === 'all' ? 'filter filter--active' : 'filter'}
          onClick={() => setFilter('all')}
        >
          All {TECHNIQUES.length}
        </button>
        {TECHNIQUE_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            role="tab"
            aria-selected={filter === level.id}
            className={filter === level.id ? 'filter filter--active' : 'filter'}
            onClick={() => setFilter(level.id)}
          >
            {level.label}{' '}
            {TECHNIQUES.filter((technique) => technique.level === level.id).length}
          </button>
        ))}
      </div>

      <div className="library__grid">
        {techniques.map((technique, index) => {
          const isSearchingThis =
            search?.status === 'searching' && search.technique === technique.id

          return (
            <article
              key={technique.id}
              className={`technique-card technique-card--${technique.level}`}
            >
              <div className="technique-card__top">
                <span className="technique-card__number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={`badge badge--${technique.level}`}>
                  {techniqueLevelLabel(technique.level)}
                </span>
              </div>
              <h2>{technique.name}</h2>
              <p className="technique-card__tagline">{technique.tagline}</p>

              <div className="technique-card__block">
                <h3>Recognize it</h3>
                <p>{technique.recognition}</p>
              </div>
              <div className="technique-card__block">
                <h3>Why it works</h3>
                <p>{technique.reasoning}</p>
              </div>
              <p className="technique-card__tip">
                <strong>Sensei tip:</strong> {technique.tip}
              </p>

              {isSearchingThis ? (
                <div className="technique-card__search">
                  <span className="spinner" aria-hidden="true" />
                  <span>
                    {search.phase === 'fetching'
                      ? `Fetching live puzzle ${search.attempt} of ${search.attempts}…`
                      : `Scanning logical moves… ${search.moves ?? 0} moves in`}
                  </span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={onCancelSearch}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="technique-card__footer">
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    disabled={searchBusy}
                    onClick={() => onFindExample(technique.id)}
                  >
                    Find a live example
                  </button>
                  {search?.status === 'not-found' && search.technique === technique.id ? (
                    <p className="technique-card__message">
                      No example surfaced in {search.attempts} live puzzles. Try again —
                      the puzzles are random.
                    </p>
                  ) : null}
                  {search?.status === 'error' && search.technique === technique.id ? (
                    <p className="technique-card__message technique-card__message--error">
                      {search.message}
                    </p>
                  ) : null}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
