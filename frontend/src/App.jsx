import { useState } from 'react'

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

function App() {
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleUpload(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    for (const [key, value] of [...form.entries()]) {
      if (value === '') form.delete(key)
    }

    setBusy(true)
    setResults(null)
    setMessage('Uploading...')
    try {
      const inspection = await request('/inspections', { method: 'POST', body: form })
      setInspectionId(inspection.id)
      setMessage(`Uploaded. Inspection #${inspection.id}, images: ${inspection.images.length}.`)
    } catch (error) {
      setInspectionId(null)
      setMessage(`Upload failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleAnalyze() {
    setBusy(true)
    setMessage('Analyzing...')
    try {
      const summary = await request(`/inspections/${inspectionId}/analyze`, { method: 'POST' })
      setResults(await request(`/inspections/${inspectionId}/results`))
      setMessage(`Status: ${summary.status}. Damages found: ${summary.damages_found}.`)
    } catch (error) {
      setMessage(`Analysis failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>Urban Inspection</h1>

      <form onSubmit={handleUpload}>
        <p>
          <label>
            Images: <input type="file" name="files" accept=".jpg,.jpeg,.png,.tif,.tiff" multiple required />
          </label>
        </p>
        <p>
          <label>
            Object name: <input type="text" name="object_name" required />
          </label>
        </p>
        <p>
          <label>
            Date: <input type="date" name="inspection_date" defaultValue={TODAY} required />
          </label>
        </p>
        <p>
          <label>
            Latitude: <input type="number" name="latitude" step="any" min="-90" max="90" />
          </label>{' '}
          <label>
            Longitude: <input type="number" name="longitude" step="any" min="-180" max="180" />
          </label>
          <br />
          <small>Leave empty to read coordinates from the image EXIF data.</small>
        </p>
        <p>
          <label>
            Scale (mm/px): <input type="number" name="scale_mm_per_px" step="any" min="0" />
          </label>
        </p>
        <p>
          <button type="submit" disabled={busy}>Upload</button>{' '}
          <button type="button" onClick={handleAnalyze} disabled={busy || inspectionId == null}>
            Analyze
          </button>
        </p>
      </form>

      {message && <p>{message}</p>}

      {results && (
        <section>
          <h2>
            Results: {results.object_name} ({results.inspection_date}), status: {results.status}
          </h2>
          {results.images.map((image) => (
            <article key={image.id}>
              <h3>Image {image.id}</h3>
              <p>
                Coordinates:{' '}
                {image.latitude == null
                  ? 'none'
                  : `${formatNumber(image.latitude, 6)}, ${formatNumber(image.longitude, 6)}`}
              </p>
              <table>
                <tbody>
                  <tr>
                    <td>
                      Original
                      <br />
                      <img src={image.original_url} alt="Original" width="480" />
                    </td>
                    {image.damages.map((damage) => (
                      <td key={damage.id}>
                        With mask
                        <br />
                        <img src={damage.overlay_url} alt="Image with mask" width="480" />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {image.damages.length === 0 && <p>No damage detected.</p>}
              {image.damages.map((damage) => (
                <div key={damage.id}>
                  <p>Damage {damage.id}, model confidence: {formatNumber(damage.confidence * 100)}%</p>
                  <ul>
                    {damage.measurements.map((measurement, index) => (
                      <li key={index}>
                        Length: {formatNumber(measurement.length_px)} px / {formatNumber(measurement.length_mm)} mm;
                        width: {formatNumber(measurement.width_px)} px / {formatNumber(measurement.width_mm)} mm
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

export default App
