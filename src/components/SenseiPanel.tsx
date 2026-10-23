import { TECHNIQUE_BY_ID, techniqueLevelLabel } from '../lib/techniques'
import type { Step } from '../lib/solver'
import { assumedManualMoves, manualPlacedCells, type Session } from '../lib/session'
import { cellLabel, digitsOf, emptyCells, isSolved } from '../lib/sudoku'

interface SenseiPanelProps {
  session: Session
  available: Step[]
  onShowNext: () => void
  onShowStep: (step: Step) => void
  onApply: () => void
  onClearPending: () => void
  onSolveAll: () => void
  onUndo: () => void
}

function eliminationChips(step: Step) {
  const grouped = new Map<number, number[]>()
  for (const elimination of step.eliminations) {
    const list = grouped.get(elimination.cell) ?? []
    list.push(elimination.digit)
    grouped.set(elimination.cell, list)
  }
  return [...grouped.entries()].map(([cell, digits]) => ({
    cell,
    digits,
  }))
}

function assumptionList(moves: { cell: number; digit: number }[]): string {
  return moves.map((move) => `${move.digit} in ${cellLabel(move.cell)}`).join(', ')
}

export function SenseiPanel({
  session,
  available,
  onShowNext,
  onShowStep,
  onApply,
  onClearPending,
  onSolveAll,
  onUndo,
}: SenseiPanelProps) {
  const solved = isSolved(session.current.grid)
  const filled = 81 - emptyCells(session.current.grid).length
  const progress = Math.round((filled / 81) * 100)
  const pendingMeta = session.pending ? TECHNIQUE_BY_ID[session.pending.technique] : null
  const selected = session.selected
  const manualCells = manualPlacedCells(session)
  const assumedMoves = assumedManualMoves(session)
  const assumedCells = new Set(assumedMoves.map((move) => move.cell))
  const manualMoves = session.history.filter((move) => move.kind === 'manual').length
  const feedback = session.inputFeedback
  const feedbackAssumed =
    feedback?.kind === 'placed' &&
    feedback.contradiction === null &&
    feedback.provenBy === null

  const uniqueAvailable: Step[] = []
  const seen = new Set<string>()
  for (const step of available) {
    if (seen.has(step.technique)) continue
    seen.add(step.technique)
    uniqueAvailable.push(step)
  }

  return (
    <aside className="sensei" aria-label="Sudoku teacher panel">
      <div className="sensei__head">
        <div className="sensei__identity">
          <span className="sensei__seal" aria-hidden="true">
            9
          </span>
          <div>
            <h2 className="sensei__title">Sensei</h2>
            <p className="sensei__subtitle">Logic-only hint engine</p>
          </div>
        </div>
        <span className="sensei__percent">
          {progress}
          <span>%</span>
        </span>
      </div>

      <div className="progress" aria-label={`${filled} of 81 cells filled`}>
        <span className="progress__fill" style={{ width: `${progress}%` }} />
      </div>

      {session.note ? <p className="sensei__note">{session.note}</p> : null}

      {feedback ? (
        <div
          className={`feedback feedback--${feedback.kind}${
            feedback.kind === 'placed' && feedback.contradiction
              ? ' feedback--warning'
              : ''
          }${feedbackAssumed ? ' feedback--assumed' : ''}`}
          role={
            feedback.kind === 'rejected' ||
            (feedback.kind === 'placed' && feedback.contradiction)
              ? 'alert'
              : 'status'
          }
        >
          <p className="feedback__message">{feedback.message}</p>
          {feedback.kind === 'placed' &&
          (feedback.contradiction || feedback.provenBy === null) ? (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={onUndo}
            >
              {feedback.contradiction
                ? 'Undo that entry'
                : 'Undo that assumption'}
            </button>
          ) : null}
        </div>
      ) : null}

      {assumedMoves.length > 0 && !solved ? (
        <div className="sensei__assumption" role="note">
          <h3>Hints are conditional</h3>
          <p>
            No documented technique proves{' '}
            {assumedMoves.length === 1 ? 'your entry' : 'these entries'}:{' '}
            <strong>{assumptionList(assumedMoves)}</strong>. Every hint below
            assumes {assumedMoves.length === 1 ? 'it is' : 'they are'} correct.
            If {assumedMoves.length === 1 ? 'it is' : 'they are'} not, the hint
            can be wrong too — undo the {assumedMoves.length === 1 ? 'entry' : 'entries'}{' '}
            to make the board provable again.
          </p>
        </div>
      ) : null}

      {solved ? (
        <div className="sensei__solved">
          <span className="sensei__solved-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <h3>Puzzle solved</h3>
            <p>
              {assumedMoves.length > 0
                ? `Every cell is filled, but ${assumedMoves.length === 1 ? 'one of your entries was an assumption' : `${assumedMoves.length} of your entries were assumptions`} rather than a proven move (${assumptionList(assumedMoves)}). Treat this solution as conditional: if ${assumedMoves.length === 1 ? 'that entry is' : 'those entries are'} wrong, the board is too — I cannot certify it without guessing.`
                : manualMoves > 0
                  ? `Every cell is filled — ${manualMoves === 1 ? 'one entry was yours' : `${manualMoves} entries were yours`}, the rest came from documented techniques. No guessing, no backtracking.`
                  : 'Every cell was placed with a documented technique. No guessing, no backtracking, no brute force.'}
            </p>
          </div>
        </div>
      ) : null}

      {session.pending && pendingMeta ? (
        <section className={`step step--${pendingMeta.level}`}>
          <div className="step__topline">
            <span className={`badge badge--${pendingMeta.level}`}>
              {techniqueLevelLabel(pendingMeta.level)}
            </span>
            <span className="step__technique">{pendingMeta.name}</span>
          </div>
          <h3 className="step__title">{session.pending.title}</h3>
          <p className="step__explanation">{session.pending.explanation}</p>

          {assumedMoves.length > 0 ? (
            <p className="step__conditional">
              Conditional on your unproven{' '}
              {assumedMoves.length === 1 ? 'entry' : 'entries'}:{' '}
              {assumptionList(assumedMoves)}. If{' '}
              {assumedMoves.length === 1 ? 'that digit is' : 'those digits are'}{' '}
              wrong, this move may not hold.
            </p>
          ) : null}

          {session.pending.placements.length > 0 ? (
            <ul className="step__chips" aria-label="Placements">
              {session.pending.placements.map((placement) => (
                <li key={`${placement.cell}-${placement.digit}`} className="chip chip--place">
                  +{placement.digit} in {cellLabel(placement.cell)}
                </li>
              ))}
            </ul>
          ) : null}

          {session.pending.eliminations.length > 0 ? (
            <ul className="step__chips" aria-label="Eliminations">
              {eliminationChips(session.pending).map(({ cell, digits }) => (
                <li key={cell} className="chip chip--remove">
                  remove {digits.join(', ')} from {cellLabel(cell)}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="step__actions">
            <button type="button" className="btn btn--primary" onClick={onApply}>
              Apply this move
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClearPending}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {!session.pending && !solved ? (
        <div className="sensei__actions">
          <button type="button" className="btn btn--primary btn--wide" onClick={onShowNext}>
            Teach me the next move
          </button>
          <button type="button" className="btn btn--outline btn--wide" onClick={onSolveAll}>
            Solve all with logic
          </button>
        </div>
      ) : null}

      {!solved && uniqueAvailable.length > 0 ? (
        <section className="available">
          <h3 className="sensei__section-title">Available right now</h3>
          <ul className="available__list">
            {uniqueAvailable.map((step) => {
              const meta = TECHNIQUE_BY_ID[step.technique]
              return (
                <li key={step.technique}>
                  <button
                    type="button"
                    className={`available__item available__item--${meta.level}`}
                    onClick={() => onShowStep(step)}
                    title={step.summary}
                  >
                    <span>{meta.name}</span>
                    <span className="available__hint">
                      {step.placements.length > 0 ? 'places a digit' : 'removes candidates'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {selected !== null ? (
        <section className="inspector">
          <h3 className="sensei__section-title">Cell inspector</h3>
          <p className="inspector__rows">
            <strong>{cellLabel(selected)}</strong>
            {session.current.grid[selected] !== 0 ? (
              <span>
                {' '}
                holds {session.current.grid[selected]}
                {session.puzzle.grid[selected] !== 0
                  ? ' (given)'
                  : manualCells.has(selected)
                    ? assumedCells.has(selected)
                      ? ' (yours, assumed)'
                      : ' (yours)'
                    : ' (placed)'}
              </span>
            ) : session.current.candidates[selected] === 0 ? (
              <span> has no candidates</span>
            ) : (
              <span>
                {' '}
                candidates: {digitsOf(session.current.candidates[selected]).join(', ')}
              </span>
            )}
          </p>
        </section>
      ) : null}

      {session.history.length > 0 ? (
        <section className="log">
          <h3 className="sensei__section-title">
            Move log <span className="log__count">{session.history.length}</span>
          </h3>
          <ol className="log__list">
            {[...session.history].reverse().map((move, index) => {
              const number = session.history.length - index
              if (move.kind === 'manual') {
                const assumed = move.provenBy === null
                const proof =
                  move.provenBy === 'naked-single'
                    ? 'naked single'
                    : move.provenBy === 'hidden-single'
                      ? 'hidden single'
                      : null
                return (
                  <li
                    key={`manual-${number}`}
                    className={`log__item--manual${assumed ? ' log__item--assumed' : ''}`}
                  >
                    <span className="log__number">{number}</span>
                    <span>
                      <strong>You</strong>
                      <span className="log__summary">
                        {' '}
                        placed {move.digit} in {cellLabel(move.cell)}
                      </span>{' '}
                      <span
                        className={`log__tag ${assumed ? 'log__tag--assumed' : 'log__tag--proof'}`}
                      >
                        {assumed ? 'assumed' : proof}
                      </span>
                    </span>
                  </li>
                )
              }
              return (
                <li key={`${move.step.technique}-${number}`}>
                  <span className="log__number">{number}</span>
                  <span>
                    <strong>{TECHNIQUE_BY_ID[move.step.technique].name}</strong>
                    <span className="log__summary"> {move.step.summary}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}
    </aside>
  )
}
