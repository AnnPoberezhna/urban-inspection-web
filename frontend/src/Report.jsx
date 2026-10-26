function formatNumber(value, digits = 1) {
  return value == null ? '—' : value.toFixed(digits)
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function pad(value) {
  return String(value).padStart(4, '0')
}

export default function Report({ results, busy, analyzeError, onAnalyze, onNewInspection }) {
  const damageCount = results.images.reduce((sum, image) => sum + image.damages.length, 0)
  const run = results.analysis_run
  return (
    <section className="report">
      <header className="report-head rise">
        <p className="kicker">Inspection report · #{results.id}</p>
        <h2>{results.site_name}</h2>
        <p className="report-byline">
          Uploaded by {results.created_by ?? 'a deleted user'}
          {run
            ? ` · analyzed ${formatDateTime(run.finished_at ?? run.started_at)} with ${run.model_version}`
            : ' · not analyzed yet'}
        </p>
        <div className="report-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onAnalyze}
            disabled={busy || results.status === 'processing'}
          >
            {busy ? 'Working...' : run ? 'Analyze again' : 'Analyze'}
          </button>
          {onNewInspection && (
            <button type="button" className="btn btn-ghost" onClick={onNewInspection} disabled={busy}>
              New inspection
            </button>
          )}
          {analyzeError && <p className="ticker is-error">{analyzeError}</p>}
        </div>
        <dl className="report-facts">
          <div>
            <dt>Date</dt>
            <dd>{results.inspection_date}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className={results.status === 'failed' ? 'is-alert' : 'is-ok'}>{results.status}</dd>
          </div>
          <div>
            <dt>Images</dt>
            <dd>{results.images.length}</dd>
          </div>
          <div>
            <dt>Damages</dt>
            <dd className={damageCount ? 'is-alert' : ''}>{damageCount}</dd>
          </div>
        </dl>
      </header>

      {results.images.map((image, index) => (
        <article key={image.id} className="frame rise" style={{ '--d': `${120 + index * 120}ms` }}>
          <div className="frame-meta">
            <span>IMG-{pad(image.id)}</span>
            <span>
              {image.captured_at ? `Captured ${formatDateTime(image.captured_at)}` : 'Capture time unknown'}
              {' · '}
              {image.latitude == null
                ? 'No coordinates'
                : `${formatNumber(image.latitude, 6)}, ${formatNumber(image.longitude, 6)}`}
            </span>
          </div>

          <div className="plates">
            <figure>
              <img src={image.original_url} alt="Original" />
              <figcaption>Original</figcaption>
            </figure>
            {image.damages.map((damage) => (
              <figure key={damage.id}>
                <img src={damage.overlay_url} alt="Image with mask" />
                <figcaption>Mask · D-{pad(damage.id)}</figcaption>
              </figure>
            ))}
          </div>

          {image.damages.length === 0 ? (
            <p className="clean">No damage detected.</p>
          ) : (
            <table className="measure">
              <thead>
                <tr>
                  <th>Damage</th>
                  <th>Confidence</th>
                  <th>Length px</th>
                  <th>Length mm</th>
                  <th>Width px</th>
                  <th>Width mm</th>
                </tr>
              </thead>
              <tbody>
                {image.damages.flatMap((damage) =>
                  damage.measurements.map((measurement, row) => (
                    <tr key={`${damage.id}:${row}`}>
                      <td>D-{pad(damage.id)}</td>
                      <td>{formatNumber(damage.confidence * 100)}%</td>
                      <td>{formatNumber(measurement.length_px)}</td>
                      <td>{formatNumber(measurement.length_mm)}</td>
                      <td>{formatNumber(measurement.width_px)}</td>
                      <td>{formatNumber(measurement.width_mm)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </article>
      ))}
    </section>
  )
}
