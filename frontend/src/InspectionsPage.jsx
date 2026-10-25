import { useEffect, useRef, useState } from 'react'
import { analyzeInspection, request } from './api.js'
import InspectionList from './InspectionList.jsx'
import Report from './Report.jsx'
import WorkspacePanel from './WorkspacePanel.jsx'

const STATUSES = ['completed', 'processing', 'pending', 'failed']

export default function InspectionsPage({
  workspaces,
  workspaceId,
  workspacesError,
  onWorkspaceChange,
  onWorkspaceCreated,
}) {
  // The list is stored with the workspace it belongs to, so a stale list is never shown for another one.
  const [loaded, setLoaded] = useState(null)
  const [listError, setListError] = useState('')
  // Bumped after an analysis so that the list shows the new status.
  const [refreshKey, setRefreshKey] = useState(0)
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [openError, setOpenError] = useState('')
  const reportRef = useRef(null)

  const inspections = loaded?.workspaceId === workspaceId ? loaded.list : null

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    request(`/inspections?workspace_id=${workspaceId}`)
      .then((list) => {
        if (!active) return
        setLoaded({ workspaceId, list })
        setListError('')
      })
      .catch((error) => active && setListError(`Cannot load inspections: ${error.message}`))
    return () => {
      active = false
    }
  }, [workspaceId, refreshKey])

  useEffect(() => {
    if (results) reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [results])

  async function handleOpen(id) {
    setOpenError('')
    try {
      const opened = await request(`/inspections/${id}/results`)
      setInspectionId(id)
      setAnalyzeError('')
      setResults(opened)
    } catch (error) {
      setOpenError(`Cannot open inspection #${id}: ${error.message}`)
    }
  }

  async function handleAnalyze() {
    setBusy(true)
    setAnalyzeError('')
    try {
      const { results: latest } = await analyzeInspection(inspectionId)
      setResults(latest)
    } catch (error) {
      setAnalyzeError(`Analysis failed: ${error.message}`)
    } finally {
      setBusy(false)
      setRefreshKey((key) => key + 1)
    }
  }

  const counts = {}
  for (const inspection of inspections ?? []) counts[inspection.status] = (counts[inspection.status] ?? 0) + 1

  return (
    <>
      <section className="desk">
        <header className="desk-head rise">
          <h1 className="desk-title">Inspections</h1>
          {inspections && (
            <ul className="tally" aria-label="Inspections by status">
              <li>
                <b>{inspections.length}</b> total
              </li>
              {STATUSES.filter((status) => counts[status]).map((status) => (
                <li key={status}>
                  <span className="lamp" data-status={status} aria-hidden="true" />
                  <b>{counts[status]}</b> {status}
                </li>
              ))}
            </ul>
          )}
        </header>

        <WorkspacePanel
          workspaces={workspaces}
          workspaceId={workspaceId}
          onSelect={onWorkspaceChange}
          onCreated={onWorkspaceCreated}
        />

        <InspectionList
          inspections={inspections}
          openId={results ? inspectionId : null}
          error={listError || openError || workspacesError}
          onOpen={handleOpen}
        />
      </section>

      <div ref={reportRef} className="report-anchor">
        {results && (
          <Report results={results} busy={busy} analyzeError={analyzeError} onAnalyze={handleAnalyze} />
        )}
      </div>
    </>
  )
}
