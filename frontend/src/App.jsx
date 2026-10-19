import { useEffect, useRef, useState } from 'react'
import CityScene from './CityScene.jsx'
import InspectionMap from './InspectionMap.jsx'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail ?? response.statusText))
  }
  return body
}

const now = new Date()
const TODAY = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((part) => String(part).padStart(2, '0'))
  .join('-')

function formatNumber(value, digits = 1) {
  return value == null ? '—' : value.toFixed(digits)
}

function pad(value) {
  return String(value).padStart(4, '0')
}

function Report({ inspectionId, results }) {
  const damageCount = results.images.reduce((sum, image) => sum + image.damages.length, 0)
  return (
    <section className="report">
      <header className="report-head rise">
        <p className="kicker">Inspection report · #{inspectionId}</p>
        <h2>{results.object_name}</h2>
        <dl className="report-facts">
          <div>
            <dt>Date</dt>
            <dd>{results.inspection_date}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="is-ok">{results.status}</dd>
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

function App() {
  const [files, setFiles] = useState([])
  const [phase, setPhase] = useState('standby')
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reportRef = useRef(null)

  useEffect(() => {
    if (results) reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [results])

  function handleFiles(selected) {
    setFiles(selected)
    setPhase(selected.length ? 'loaded' : 'standby')
  }

  async function handleUpload(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    for (const [key, value] of [...form.entries()]) {
      if (value === '') form.delete(key)
    }

    setBusy(true)
    setResults(null)
    setPhase('uploading')
    setMessage('Uploading...')
    try {
      const inspection = await request('/inspections', { method: 'POST', body: form })
      setInspectionId(inspection.id)
      setPhase('uploaded')
      setMessage(`Uploaded. Inspection #${inspection.id}, images: ${inspection.images.length}.`)
    } catch (error) {
      setInspectionId(null)
      setPhase('error')
      setMessage(`Upload failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleAnalyze() {
    setBusy(true)
    setPhase('analyzing')
    setMessage('Analyzing...')
    try {
      const summary = await request(`/inspections/${inspectionId}/analyze`, { method: 'POST' })
      setResults(await request(`/inspections/${inspectionId}/results`))
      setPhase('done')
      setMessage(`Status: ${summary.status}. Damages found: ${summary.damages_found}.`)
    } catch (error) {
      setPhase('error')
      setMessage(`Analysis failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  const count = files.length

  return (
    <div className="app" data-phase={phase}>
      <CityScene phase={phase} />

      <header className="topbar rise">
        <div className="brand">Urban Inspection</div>
      </header>

      <form className="hero" onSubmit={handleUpload}>
        <div className="pitch">
          <h1 className="headline">
            <span className="rise" style={{ '--d': '200ms' }}>
              We spot the damage.
            </span>
            <span className="rise" style={{ '--d': '320ms' }}>
              <em>You plan the repair.</em>
            </span>
          </h1>
          <p className="lede rise" style={{ '--d': '450ms' }}>
            Upload a photo of a crack in your infrastructure. The model finds the damage, masks it and measures it
            in millimetres.
          </p>

          <input
            id="photo-input"
            className="sr-only"
            type="file"
            name="files"
            accept=".jpg,.jpeg,.png,.tif,.tiff"
            multiple
            required
            onChange={(event) => handleFiles([...event.currentTarget.files])}
          />
          <label htmlFor="photo-input" className="cta rise" style={{ '--d': '600ms' }}>
            <svg className="cta-camera" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M4 10.5h5l2.5-4h9l2.5 4h5v15H4z" />
              <circle cx="16" cy="17.5" r="5" />
            </svg>
            {count ? `${count} photo${count > 1 ? 's' : ''} selected — change` : 'Add photo for inspection'}
          </label>
        </div>

        {count > 0 && (
          <div className="brief">
            <p className="brief-title">Inspection details</p>
            <ul className="manifest">
              {files.slice(0, 4).map((file) => (
                <li key={`${file.name}:${file.size}`}>{file.name}</li>
              ))}
              {count > 4 && <li>+{count - 4} more</li>}
            </ul>

            <label className="field field-wide">
              <span>Object name</span>
              <input type="text" name="object_name" placeholder="Bridge pier 4, north face" required />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" name="inspection_date" defaultValue={TODAY} required />
            </label>
            <label className="field">
              <span>Scale, mm/px</span>
              <input type="number" name="scale_mm_per_px" step="any" min="0" placeholder="optional" />
            </label>
            <label className="field">
              <span>Latitude</span>
              <input type="number" name="latitude" step="any" min="-90" max="90" placeholder="from EXIF" />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input type="number" name="longitude" step="any" min="-180" max="180" placeholder="from EXIF" />
            </label>
            <p className="hint">Leave coordinates empty to read them from the image EXIF data.</p>

            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Upload
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleAnalyze} disabled={busy || inspectionId == null}>
                Analyze
              </button>
            </div>

            {message && <p className={`ticker ${phase === 'error' ? 'is-error' : ''}`}>{message}</p>}
          </div>
        )}
      </form>

      <InspectionMap />

      <div ref={reportRef} className="report-anchor">
        {results && <Report inspectionId={inspectionId} results={results} />}
      </div>
    </div>
  )
}

export default App
