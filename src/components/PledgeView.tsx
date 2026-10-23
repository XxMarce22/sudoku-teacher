import { TECHNIQUES } from '../lib/techniques'

export function PledgeView() {
  const basics = TECHNIQUES.filter((technique) => technique.level === 'basics').length
  const intermediate = TECHNIQUES.filter((technique) => technique.level === 'intermediate').length
  const advanced = TECHNIQUES.filter((technique) => technique.level === 'advanced').length

  return (
    <section className="pledge">
      <header className="pledge__hero">
        <p className="eyebrow">The dojo rules</p>
        <h1>No guessing. Ever.</h1>
        <p className="pledge__lede">
          A sudoku can always be finished by search — trying digits, hitting a
          contradiction, and backing up. That is brute force, and this app refuses
          to do it. Every placement and every elimination here comes from a
          technique a human can learn, check, and repeat.
        </p>
      </header>

      <div className="pledge__grid">
        <article className="pledge-card">
          <h2>No brute force</h2>
          <p>
            The solver has no backtracking, no recursion into trial placements,
            and no hidden search. If the board cannot advance with a known
            technique, the app stops and says so. It never fills a cell it cannot
            justify.
          </p>
        </article>
        <article className="pledge-card">
          <h2>Puzzles only from live APIs</h2>
          <p>
            Puzzles arrive from public sudoku APIs — primarily{' '}
            <a href="https://www.sudoku100.com/api" target="_blank" rel="noreferrer">
              Sudoku100
            </a>
            , which verifies that every board it hands out has a unique solution.
            Because Sudoku100 does not send browser CORS headers, the app reaches
            it through a local proxy (available in <code>npm run dev</code> and{' '}
            <code>npm run preview</code>). When that proxy is missing, the app
            falls back to{' '}
            <a href="https://sugoku.onrender.com/" target="_blank" rel="noreferrer">
              Sugoku
            </a>{' '}
            and{' '}
            <a href="https://sudoku-api.vercel.app/" target="_blank" rel="noreferrer">
              Dosuku
            </a>
            , which are CORS-enabled and called directly. The app never generates
            a puzzle locally and never asks an API for the answer.
          </p>
        </article>
        <article className="pledge-card">
          <h2>Validate before teaching</h2>
          <p>
            Every fetched board is checked cell by cell: 81 values, digits 0–9,
            no repeats in any row, column, or box, and at least one candidate in
            every empty cell. A board that fails validation is rejected.
          </p>
        </article>
        <article className="pledge-card">
          <h2>Explain the why</h2>
          <p>
            Each hint names the technique, highlights the pattern, lists the
            candidates it removes or the digit it places, and explains the logic
            in plain language. The move log keeps a complete record of how the
            puzzle was solved.
          </p>
        </article>
      </div>

      <section className="pledge__toolkit">
        <h2>The toolkit</h2>
        <p>
          {TECHNIQUES.length} human techniques: {basics} basics, {intermediate}{' '}
          intermediate, and {advanced} advanced patterns.
        </p>
        <ul className="pledge__list">
          {TECHNIQUES.map((technique) => (
            <li key={technique.id}>
              <strong>{technique.name}</strong>
              <span>{technique.tagline}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pledge__limits">
        <h2>Honest limits</h2>
        <p>
          This is a teaching tool, not a tournament engine. Some published
          puzzles require patterns beyond the toolkit — forcing chains, for
          example. The Sugoku and Dosuku fallbacks also do not guarantee unique
          solutions, so those boards may hide more than one completion. When a
          board cannot advance with a known technique, the dojo gets stuck
          honestly instead of guessing. Fetch another puzzle or enjoy the board
          as far as logic can take it.
        </p>
        <p>
          The digits you type yourself follow the same rules. The board rejects
          entries that clash with the candidate model, and after every accepted
          entry it replays forced logic to warn you when it can prove a
          contradiction — with a one-tap undo. But a typed digit is your move,
          not a proven deduction: the move log keeps them labelled as yours,
          and clearing one also rewinds the later moves that depended on it.
        </p>
      </section>
    </section>
  )
}
