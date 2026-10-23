import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { Header } from './components/Header'
import { PledgeView } from './components/PledgeView'
import { SenseiPanel } from './components/SenseiPanel'
import {
  TechniqueLibrary,
  type ExampleSearchState,
} from './components/TechniqueLibrary'
import {
  DIFFICULTY_OPTIONS,
  fetchPuzzle,
  type PuzzleDifficulty,
} from './lib/api'
import { readCachedPuzzle, saveCachedPuzzle } from './lib/cache'
import {
  EXAMPLE_SEARCH_ATTEMPTS,
  searchTechniqueExample,
} from './lib/exampleSearch'
import {
  assumedPlacedCells,
  createSession,
  manualPlacedCells,
  sessionReducer,
  type Session,
  type SessionAction,
} from './lib/session'
import { findAllSteps } from './lib/solver'
import { countGivens, isSolved } from './lib/sudoku'
import { TECHNIQUE_BY_ID, TECHNIQUES, type TechniqueId } from './lib/techniques'
import './App.css'

type ViewId = 'dojo' | 'techniques' | 'pledge'

export default function App() {
  const [view, setView] = useState<ViewId>('dojo')
  const [session, setSession] = useState<Session | null>(() => {
    const cached = readCachedPuzzle()
    if (!cached) return null
    return createSession(cached, {
      note: `Restored your last live puzzle from ${cached.meta.provider}. Fetch a new one whenever you like.`,
    })
  })
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(
    () => readCachedPuzzle()?.meta.requestedDifficulty ?? 'easy',
  )
  const [loadingPuzzle, setLoadingPuzzle] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [exampleSearch, setExampleSearch] = useState<ExampleSearchState | null>(null)

  const puzzleAbort = useRef<AbortController | null>(null)
  const exampleAbort = useRef<AbortController | null>(null)
  const didInit = useRef(false)

  const dispatch = useCallback((action: SessionAction) => {
    setSession((previous) => (previous ? sessionReducer(previous, action) : previous))
  }, [])

  const loadPuzzle = useCallback(async (requested: PuzzleDifficulty) => {
    puzzleAbort.current?.abort()
    const controller = new AbortController()
    puzzleAbort.current = controller
    setLoadingPuzzle(true)
    setFetchError(null)

    try {
      const puzzle = await fetchPuzzle(requested, controller.signal)
      if (controller.signal.aborted) return
      saveCachedPuzzle(puzzle)
      setDifficulty(puzzle.meta.requestedDifficulty)
      setSession(
        createSession(puzzle, {
          note: `Fresh live fetch from ${puzzle.meta.provider}. ${countGivens(puzzle.grid)} clues, all validated.`,
        }),
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFetchError(
        error instanceof Error ? error.message : 'The puzzle APIs could not be reached.',
      )
    } finally {
      if (puzzleAbort.current === controller) {
        setLoadingPuzzle(false)
      }
    }
  }, [])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    // The one-shot startup fetch reports progress through setLoadingPuzzle.
    // oxlint-disable-next-line react/set-state-in-effect
    if (!session) void loadPuzzle('easy')
  }, [session, loadPuzzle])

  useEffect(() => {
    return () => {
      puzzleAbort.current?.abort()
      exampleAbort.current?.abort()
    }
  }, [])

  const handleFindExample = useCallback(async (technique: TechniqueId) => {
    exampleAbort.current?.abort()
    const controller = new AbortController()
    exampleAbort.current = controller

    setExampleSearch({
      status: 'searching',
      technique,
      attempt: 1,
      attempts: EXAMPLE_SEARCH_ATTEMPTS,
      phase: 'fetching',
      moves: null,
    })

    try {
      const result = await searchTechniqueExample(technique, {
        attempts: EXAMPLE_SEARCH_ATTEMPTS,
        signal: controller.signal,
        onProgress: (progress) => {
          if (controller.signal.aborted) return
          setExampleSearch({
            status: 'searching',
            technique,
            attempt: progress.attempt,
            attempts: progress.attempts,
            phase: progress.phase,
            moves: progress.moves ?? null,
          })
        },
      })

      if (controller.signal.aborted) return

      if (!result) {
        setExampleSearch({
          status: 'not-found',
          technique,
          attempts: EXAMPLE_SEARCH_ATTEMPTS,
        })
        return
      }

      const techniqueMeta = TECHNIQUE_BY_ID[technique]
      setSession(
        createSession(result.puzzle, {
          startState: result.state,
          startPending: result.step,
          note: `Live ${result.puzzle.meta.difficulty.toLowerCase()} puzzle from ${result.puzzle.meta.provider}. The board was advanced ${result.movesApplied} logical move${result.movesApplied === 1 ? '' : 's'} before this ${techniqueMeta.name} appeared.`,
          demo: {
            movesApplied: result.movesApplied,
            attempts: result.attempts,
            techniqueName: techniqueMeta.name,
          },
        }),
      )
      setDifficulty(result.puzzle.meta.requestedDifficulty)
      setView('dojo')
      setExampleSearch(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setExampleSearch({
        status: 'error',
        technique,
        message:
          error instanceof Error ? error.message : 'The example search failed.',
      })
    }
  }, [])

  const cancelExampleSearch = useCallback(() => {
    exampleAbort.current?.abort()
    exampleAbort.current = null
    setExampleSearch(null)
  }, [])

  const currentState = session?.current ?? null
  const available = useMemo(() => {
    if (!currentState || isSolved(currentState.grid)) return []
    try {
      return findAllSteps(currentState)
    } catch {
      return []
    }
  }, [currentState])

  const solved = session ? isSolved(session.current.grid) : false
  const manualCells = useMemo(
    () => (session ? manualPlacedCells(session) : new Set<number>()),
    [session],
  )
  const assumedCells = useMemo(
    () => (session ? assumedPlacedCells(session) : new Set<number>()),
    [session],
  )

  return (
    <div className="app">
      <Header view={view} onNavigate={setView} />

      <main className="app__main">
        {view === 'dojo' ? (
          session ? (
            <div className="dojo">
              <section className="board-card" aria-label="Puzzle board">
                <div className="board-card__top">
                  <div className="puzzle-meta">
                    <span className={`pill pill--${session.puzzle.meta.difficulty.toLowerCase()}`}>
                      {session.puzzle.meta.difficulty}
                    </span>
                    <span>{countGivens(session.puzzle.grid)} clues</span>
                    <span aria-hidden="true">·</span>
                    <a
                      href={session.puzzle.meta.providerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {session.puzzle.meta.provider} API
                    </a>
                    {session.demo ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="puzzle-meta__demo">
                          demo after {session.demo.movesApplied} moves
                        </span>
                      </>
                    ) : null}
                  </div>

                  <div className="board-card__source">
                    <label className="sr-only" htmlFor="difficulty">
                      Difficulty for the next puzzle
                    </label>
                    <select
                      id="difficulty"
                      className="select"
                      value={difficulty}
                      disabled={loadingPuzzle}
                      onChange={(event) =>
                        setDifficulty(event.target.value as PuzzleDifficulty)
                      }
                    >
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      disabled={loadingPuzzle}
                      onClick={() => void loadPuzzle(difficulty)}
                    >
                      {loadingPuzzle ? 'Fetching…' : 'New puzzle'}
                    </button>
                  </div>
                </div>

                <Board
                  grid={session.current.grid}
                  initialGrid={session.puzzle.grid}
                  candidates={session.current.candidates}
                  pending={session.pending}
                  selected={session.selected}
                  showCandidates={session.showCandidates}
                  feedback={session.inputFeedback}
                  manualCells={manualCells}
                  assumedCells={assumedCells}
                  onSelect={(cell) => dispatch({ type: 'select', cell })}
                  onInputDigit={(digit) => dispatch({ type: 'input-digit', digit })}
                  onClearCell={() => dispatch({ type: 'clear-cell' })}
                />

                <div className="board-card__bottom">
                  <div className="board-tools">
                    <button
                      type="button"
                      className="tool"
                      aria-pressed={session.showCandidates}
                      onClick={() => dispatch({ type: 'toggle-candidates' })}
                    >
                      {session.showCandidates ? 'Candidates on' : 'Candidates off'}
                    </button>
                    <button
                      type="button"
                      className="tool"
                      disabled={session.history.length === 0}
                      onClick={() => dispatch({ type: 'undo' })}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className="tool"
                      disabled={
                        session.history.length === 0 &&
                        session.current === session.start &&
                        session.pending === session.startPending
                      }
                      onClick={() => dispatch({ type: 'reset' })}
                    >
                      Reset
                    </button>
                    {session.demo ? (
                      <button
                        type="button"
                        className="tool"
                        onClick={() => dispatch({ type: 'restart-puzzle' })}
                      >
                        Original puzzle
                      </button>
                    ) : null}
                  </div>
                  <p className="board-card__hint">
                    Click a cell, then type 1–9 to fill it — Backspace clears.
                    Arrow keys move around the board.
                  </p>
                </div>

                {fetchError ? (
                  <div className="inline-error" role="alert">
                    <span>{fetchError}</span>
                    <button
                      type="button"
                      className="btn btn--small btn--outline"
                      onClick={() => void loadPuzzle(difficulty)}
                    >
                      Retry fetch
                    </button>
                  </div>
                ) : null}
              </section>

              <SenseiPanel
                session={session}
                available={available}
                onShowNext={() => dispatch({ type: 'show-next' })}
                onShowStep={(step) => dispatch({ type: 'show-step', step })}
                onApply={() => dispatch({ type: 'apply-pending' })}
                onClearPending={() => dispatch({ type: 'clear-pending' })}
                onSolveAll={() => dispatch({ type: 'solve-all' })}
                onUndo={() => dispatch({ type: 'undo' })}
              />
            </div>
          ) : (
            <div className="empty-state">
              {loadingPuzzle ? (
                <div className="empty-card">
                  <span className="spinner spinner--large" aria-hidden="true" />
                  <h1>Fetching a valid puzzle…</h1>
                  <p>
                    Asking Sudoku100 — unique, logic-friendly puzzles — first, with
                    Sugoku and Dosuku as fallbacks. Every board is validated before
                    it is shown.
                  </p>
                </div>
              ) : (
                <div className="empty-card empty-card--error" role="alert">
                  <span className="empty-card__mark" aria-hidden="true">
                    !
                  </span>
                  <h1>The puzzle APIs did not answer</h1>
                  <p>{fetchError}</p>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void loadPuzzle(difficulty)}
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )
        ) : null}

        {view === 'techniques' ? (
          <TechniqueLibrary
            search={exampleSearch}
            onFindExample={(technique) => void handleFindExample(technique)}
            onCancelSearch={cancelExampleSearch}
          />
        ) : null}

        {view === 'pledge' ? <PledgeView /> : null}
      </main>

      <footer className="site-footer">
        <p>
          {TECHNIQUES.length} deterministic techniques. Zero guesses. Puzzles are
          fetched live from the Sudoku100, Sugoku, and Dosuku APIs and validated
          before play.
        </p>
        <p>
          {solved
            ? 'The current board is solved. Ask for a new puzzle to keep practising.'
            : 'Every hint names its technique and shows the pattern behind it.'}
        </p>
      </footer>
    </div>
  )
}
