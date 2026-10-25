import { useEffect, useRef, useState } from 'react'
import { analyzeInspection, request } from './api.js'
import InspectionMap from './InspectionMap.jsx'
import { CameraIcon, Pitch } from './Pitch.jsx'
import Report from './Report.jsx'

const now = new Date()
const TODAY = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((part) => String(part).padStart(2, '0'))
  .join('-')

export default function UploadPage({ workspaces, workspaceId, workspacesError, onWorkspaceChange, setPhase }) {
  const [files, setFiles] = useState([])
  const [sites, setSites] = useState([])
  // Bumped after an upload so that the site suggestions include a newly created site.
  const [sitesKey, setSitesKey] = useState(0)
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const reportRef = useRef(null)

  // Leaving the page puts the city scene back at rest.
  useEffect(() => () => setPhase('standby'), [setPhase])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    request(`/workspaces/${workspaceId}/sites`)
      .then((list) => active && setSites(list))
      .catch(() => active && setSites([]))
    return () => {
      active = false
    }
  }, [workspaceId, sitesKey])

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
      setSitesKey((key) => key + 1)
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
    setAnalyzeError('')
    try {
      const { summary, results: latest } = await analyzeInspection(inspectionId)
      setResults(latest)
      setPhase('done')
      showMessage(`Status: ${summary.status}. Damages found: ${summary.damages_found}.`)
    } catch (error) {
      setPhase('error')
      showMessage(`Analysis failed: ${error.message}`, true)
      setAnalyzeError(`Analysis failed: ${error.message}`)
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
                onChange={(event) => onWorkspaceChange(event.currentTarget.value)}
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

            {workspacesError && <p className="ticker is-error">{workspacesError}</p>}
            {message && <p className={`ticker ${isError ? 'is-error' : ''}`}>{message}</p>}
          </div>
        )}
      </form>

      <InspectionMap />

      <div ref={reportRef} className="report-anchor">
        {results && (
          <Report results={results} busy={busy} analyzeError={analyzeError} onAnalyze={handleAnalyze} />
        )}
      </div>
    </>
  )
}
