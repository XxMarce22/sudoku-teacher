type ViewId = 'dojo' | 'techniques' | 'pledge'

interface HeaderProps {
  view: ViewId
  onNavigate: (view: ViewId) => void
}

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'dojo', label: 'Dojo' },
  { id: 'techniques', label: 'Techniques' },
  { id: 'pledge', label: 'No-guess pledge' },
]

export function Header({ view, onNavigate }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button
          type="button"
          className="brand"
          onClick={() => onNavigate('dojo')}
          aria-label="Sudoku Sensei, go to the dojo"
        >
          <svg className="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="var(--ink)" />
            <rect x="8" y="8" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="16.5" y="8" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="25" y="8" width="7" height="7" rx="2" fill="var(--accent)" />
            <rect x="8" y="16.5" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="16.5" y="16.5" width="7" height="7" rx="2" fill="var(--accent)" />
            <rect x="25" y="16.5" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="8" y="25" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="16.5" y="25" width="7" height="7" rx="2" fill="var(--paper-2)" />
            <rect x="25" y="25" width="7" height="7" rx="2" fill="var(--paper-2)" />
          </svg>
          <span className="brand__text">
            <span className="brand__name">Sudoku Sensei</span>
            <span className="brand__tagline">Learn the logic. Never guess.</span>
          </span>
        </button>

        <nav className="site-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'site-nav__link site-nav__link--active' : 'site-nav__link'}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <span className="logic-badge" title="The solver only uses deterministic human techniques">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M10 1.8 3.2 4.5v4.4c0 4 2.7 7.7 6.8 9.3 4.1-1.6 6.8-5.3 6.8-9.3V4.5L10 1.8Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="m6.8 10 2.2 2.2 4.2-4.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Logic only
        </span>
      </div>
    </header>
  )
}
