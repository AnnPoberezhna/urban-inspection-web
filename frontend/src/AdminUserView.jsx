import { useEffect, useRef, useState } from 'react'
import { request } from './api.js'
import InspectionList from './InspectionList.jsx'
import Report from './Report.jsx'
import { followLink } from './router.js'
import WorkspacePanel from './WorkspacePanel.jsx'

/** An admin's read-only look at one user's History page, to see what is wrong on their side. */
export default function AdminUserView({ userId }) {
  const [account, setAccount] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [accountError, setAccountError] = useState('')
  // The list is stored with the workspace it belongs to, so a stale list is never shown for another one.
  const [loaded, setLoaded] = useState(null)
  const [listError, setListError] = useState('')
  const [inspectionId, setInspectionId] = useState(null)
  const [results, setResults] = useState(null)
  const [openError, setOpenError] = useState('')
  const reportRef = useRef(null)

  const inspections = loaded?.workspaceId === workspaceId ? loaded.list : null

  useEffect(() => {
    let active = true
    Promise.all([request(`/admin/users/${userId}`), request(`/admin/users/${userId}/workspaces`)])
      .then(([found, list]) => {
        if (!active) return
        setAccount(found)
        setWorkspaces(list)
        setWorkspaceId(String(list[0]?.id ?? ''))
      })
      .catch((failure) => active && setAccountError(`Cannot load this account: ${failure.message}`))
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    request(`/admin/users/${userId}/inspections?workspace_id=${workspaceId}`)
      .then((list) => {
        if (!active) return
        setLoaded({ workspaceId, list })
        setListError('')
      })
      .catch((failure) => active && setListError(`Cannot load inspections: ${failure.message}`))
    return () => {
      active = false
    }
  }, [userId, workspaceId])

  useEffect(() => {
    if (results) reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [results])

  async function handleOpen(id) {
    setOpenError('')
    try {
      const opened = await request(`/admin/inspections/${id}/results`)
      setInspectionId(id)
      setResults(opened)
    } catch (failure) {
      setOpenError(`Cannot open inspection #${id}: ${failure.message}`)
    }
  }

  return (
    <>
      <section className="desk">
        <header className="desk-head rise">
          <div>
            <a href="/admin" className="back-link" onClick={followLink}>
              ← All users
            </a>
            <h1 className="desk-title">Inspections</h1>
          </div>
          {account && (
            <p className="readonly-note">
              <b>Read-only</b> Viewing as <span className="readonly-email">{account.email}</span>. You see their
              workspaces and inspections as they do, but can't change or analyze anything.
            </p>
          )}
        </header>

        <WorkspacePanel readOnly workspaces={workspaces} workspaceId={workspaceId} onSelect={setWorkspaceId} />

        <InspectionList
          readOnly
          inspections={inspections}
          openId={results ? inspectionId : null}
          error={accountError || listError || openError}
          onOpen={handleOpen}
        />
      </section>

      <div ref={reportRef} className="report-anchor">
        {results && <Report results={results} />}
      </div>
    </>
  )
}
