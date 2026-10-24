import { useEffect, useRef, useState } from 'react'
import { clearToken, hasToken, request, setUnauthorizedHandler } from './api.js'
import AuthPage from './AuthPage.jsx'
import CityScene from './CityScene.jsx'
import InspectionMap from './InspectionMap.jsx'
import { followLink, navigate, usePath } from './router.js'

const AUTH_PAGES = { '/login': 'login', '/register': 'register' }

const now = new Date()
const TODAY = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((part) => String(part).padStart(2, '0'))
  .join('-')

function formatNumber(value, digits = 1) {
  return value == null ? '—' : value.toFixed(digits)
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function pad(value) {
  return String(value).padStart(4, '0')
}

function Report({ results }) {
  const damageCount = results.images.reduce((sum, image) => sum + image.damages.length, 0)
  const run = results.analysis_run
  return (
    <section className="report">
      <header className="report-head rise">
        <p className="kicker">Inspection report · #{results.id}</p>
        <h2>{results.site_name}</h2>
        <p className="report-byline">
          Uploaded by {results.created_by}
          {run
            ? ` · analyzed ${formatDateTime(run.finished_at ?? run.started_at)} with ${run.model_version}`
            : ' · not analyzed yet'}
        </p>
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

function CameraIcon() {
  return (
    <svg className="cta-camera" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 10.5h5l2.5-4h9l2.5 4h5v15H4z" />
      <circle cx="16" cy="17.5" r="5" />
    </svg>
  )
}

function Pitch({ children }) {
  return (
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
        Upload a photo of a crack in your infrastructure. The model finds the damage, masks it and measures it in
        millimetres.
      </p>
      {children}
    </div>
  )
}

function Inspector({ setPhase }) {
  const [files, setFiles] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [sites, setSites] = useState([])
  // Bumped after an upload so that lists depending on it are fetched again.
  const [refreshKey, setRefreshKey] = useState(0)
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    let active = true
    request('/workspaces')
      .then((list) => {
        if (!active) return
        setWorkspaces(list)
        setWorkspaceId((current) => current || String(list[0]?.id ?? ''))
      })
      .catch((error) => active && showMessage(`Cannot load workspaces: ${error.message}`, true))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    request(`/workspaces/${workspaceId}/sites`)
      .then((list) => active && setSites(list))
      .catch(() => active && setSites([]))
    return () => {
      active = false
    }
  }, [workspaceId, refreshKey])

  useEffect(() => {
    if (results) reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [results])

  function showMessage(text, error = false) {
    setMessage(text)
    setIsError(error)
  }

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
    showMessage('Uploading...')
    try {
      const inspection = await request('/inspections', { method: 'POST', body: form })
      setInspectionId(inspection.id)
      setRefreshKey((key) => key + 1)
      setPhase('uploaded')
      showMessage(`Uploaded. Inspection #${inspection.id} at ${inspection.site_name}, images: ${inspection.images.length}.`)
    } catch (error) {
      setInspectionId(null)
      setPhase('error')
      showMessage(`Upload failed: ${error.message}`, true)
    } finally {
      setBusy(false)
    }
  }

  async function handleAnalyze() {
    setBusy(true)
    setPhase('analyzing')
    showMessage('Analyzing...')
    try {
      const summary = await request(`/inspections/${inspectionId}/analyze`, { method: 'POST' })
      setResults(await request(`/inspections/${inspectionId}/results`))
      setPhase('done')
      showMessage(`Status: ${summary.status}. Damages found: ${summary.damages_found}.`)
    } catch (error) {
      setPhase('error')
      showMessage(`Analysis failed: ${error.message}`, true)
    } finally {
      setBusy(false)
    }
  }

  const count = files.length

  return (
    <>
      <form className="hero" onSubmit={handleUpload}>
        <Pitch>
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
            <CameraIcon />
            {count ? `${count} photo${count > 1 ? 's' : ''} selected — change` : 'Add photo for inspection'}
          </label>
        </Pitch>

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
              <span>Workspace</span>
              <select
                name="workspace_id"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.currentTarget.value)}
                required
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.is_personal ? 'Personal (only you)' : workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-wide">
              <span>Site</span>
              <input
                type="text"
                name="site_name"
                list="site-options"
                maxLength={255}
                placeholder="Bridge pier 4, north face"
                autoComplete="off"
                required
              />
              <datalist id="site-options">
                {sites.map((site) => (
                  <option key={site.id} value={site.name} />
                ))}
              </datalist>
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
            <p className="hint">
              Pick an existing site or type a new one. Leave coordinates empty to read them from the image EXIF data.
            </p>

            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Upload
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleAnalyze} disabled={busy || inspectionId == null}>
                Analyze
              </button>
            </div>

            {message && <p className={`ticker ${isError ? 'is-error' : ''}`}>{message}</p>}
          </div>
        )}
      </form>

      <InspectionMap />

      <div ref={reportRef} className="report-anchor">
        {results && <Report results={results} />}
      </div>
    </>
  )
}

function App() {
  const path = usePath()
  // undefined while a stored token is being checked, null when logged out.
  const [user, setUser] = useState(() => (hasToken() ? undefined : null))
  const [notice, setNotice] = useState('')
  const [phase, setPhase] = useState('standby')
  const authMode = AUTH_PAGES[path]

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setPhase('standby')
      setNotice('Your session has expired. Please log in again.')
      navigate('/login')
    })
  }, [])

  // Logged-in users have nothing to do on the auth pages; this also handles the redirect after login.
  useEffect(() => {
    if (authMode && user) navigate('/', { replace: true })
  }, [authMode, user])

  useEffect(() => {
    if (!hasToken()) return
    let active = true
    request('/auth/me')
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
    return () => {
      active = false
    }
  }, [])

  function handleLoggedIn(me) {
    setNotice('')
    setUser(me)
  }

  function handleLogout() {
    clearToken()
    setUser(null)
    setPhase('standby')
    setNotice('')
  }

  if (authMode) {
    if (user !== null) return null // still checking the stored token, or about to redirect
    // Keyed by mode, so switching between log in and register clears the form.
    return <AuthPage key={authMode} mode={authMode} notice={notice} onLoggedIn={handleLoggedIn} />
  }

  return (
    <div className="app" data-phase={phase}>
      <CityScene phase={phase} />

      <header className="topbar rise">
        <div className="brand">Urban Inspection</div>
        {user && (
          <div className="account">
            <span className="account-email">{user.email}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
        {user === null && (
          <nav className="account">
            <a href="/login" className="btn btn-ghost" onClick={followLink}>
              Log in
            </a>
            <a href="/register" className="btn btn-primary" onClick={followLink}>
              Register
            </a>
          </nav>
        )}
      </header>

      {user === null && (
        <>
          <div className="hero">
            <Pitch>
              <a href="/login" className="cta rise" style={{ '--d': '600ms' }} onClick={followLink}>
                <CameraIcon />
                Log in to start an inspection
              </a>
            </Pitch>
          </div>
          <InspectionMap />
        </>
      )}

      {/* Keyed by user, so logging out and in as someone else starts from a clean state. */}
      {user && <Inspector key={user.id} setPhase={setPhase} />}
    </div>
  )
}

export default App
