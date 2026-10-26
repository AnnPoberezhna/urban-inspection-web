import { followLink } from './router.js'

function formatDate(value) {
  // Built from parts: new Date('2026-10-24') would be UTC midnight and can show the previous day.
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function InspectionList({ inspections, openId, error, onOpen }) {
  return (
    <section className="log" aria-label="Inspections">
      {error && <p className="ticker is-error">{error}</p>}

      {inspections == null && !error && <p className="log-loading">Scanning…</p>}

      {inspections?.length === 0 && (
        <div className="log-empty rise">
          <p>Nothing logged in this workspace yet.</p>
          <a href="/" className="btn btn-ghost" onClick={followLink}>
            New inspection
          </a>
        </div>
      )}

      {inspections?.length > 0 && (
        <ol className="log-list">
          {inspections.map((inspection, index) => {
            const isOpen = inspection.id === openId
            return (
              <li key={inspection.id} className="rise" style={{ '--d': `${160 + Math.min(index, 12) * 55}ms` }}>
                <button
                  type="button"
                  className={`log-entry ${isOpen ? 'is-open' : ''}`}
                  aria-current={isOpen ? 'true' : undefined}
                  onClick={() => onOpen(inspection.id)}
                >
                  <span className="log-id" aria-label={`Inspection ${inspection.id}`}>
                    {String(inspection.id).padStart(3, '0')}
                  </span>
                  <span className="log-body">
                    <span className="log-site">{inspection.site_name}</span>
                    <span className="log-meta">
                      {formatDate(inspection.inspection_date)} · {inspection.created_by ?? 'deleted user'}
                    </span>
                  </span>
                  <span className="log-status">
                    <span className="lamp" data-status={inspection.status} aria-hidden="true" />
                    {inspection.status}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
