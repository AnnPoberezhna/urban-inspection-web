import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { request } from './api.js'

const NOTICE_MS = 6000

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function plural(count, word) {
  return count === 1 ? word : `${word}s`
}

function DeletionImpact({ preview }) {
  const { deleted_workspaces: deleted, deleted_inspections, kept_workspaces: kept, kept_inspections } = preview
  return (
    <div className="delete-impact">
      <section>
        <p className="rail-label is-alert">Deleted for good</p>
        <ul>
          <li>
            {deleted.length} {plural(deleted.length, 'workspace')}: {deleted.join(', ')}
          </li>
          <li>
            {deleted_inspections} {plural(deleted_inspections, 'inspection')} in{' '}
            {deleted.length === 1 ? 'it' : 'them'}, with their images and analyses
          </li>
        </ul>
      </section>
      {(kept.length > 0 || kept_inspections > 0) && (
        <section>
          <p className="rail-label">Stays with the team</p>
          <ul>
            {kept.map((workspace, index) => (
              <li key={index}>
                {workspace.name}
                {workspace.new_owner && ` (${workspace.new_owner} becomes its owner)`}
              </li>
            ))}
            {kept_inspections > 0 && (
              <li>
                {kept_inspections} {plural(kept_inspections, 'inspection')} they uploaded to shared workspaces,
                shown as uploaded by a deleted user
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Shows what deleting the account removes, and asks for its email before deleting it. */
function DeleteDialog({ user, pending, error, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [typed, setTyped] = useState('')

  // A layout effect, so close() runs while the dialog is still in the page and focus goes back to where it was.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  useEffect(() => {
    let active = true
    request(`/admin/users/${user.id}/deletion-preview`)
      .then((result) => active && setPreview(result))
      .catch((failure) => active && setPreviewError(`Cannot check what would be deleted: ${failure.message}`))
    return () => {
      active = false
    }
  }, [user.id])

  const ready = preview != null && typed.trim().toLowerCase() === user.email && !pending

  function cancel() {
    if (!pending) onCancel()
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (ready) onConfirm()
  }

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-note"
      onCancel={(event) => {
        // Escape: let React unmount the dialog instead of the browser closing it.
        event.preventDefault()
        cancel()
      }}
      onClick={(event) => {
        // The form fills the dialog, so a click on the dialog itself is a click on the backdrop.
        if (event.target === event.currentTarget) cancel()
      }}
    >
      <form className="delete-form" onSubmit={handleSubmit}>
        <header className="delete-head">
          <p className="rail-label">Delete account</p>
          <h2 id="delete-dialog-title" className="delete-email">
            {user.email}
          </h2>
        </header>
        <p id="delete-dialog-note" className="delete-note">
          This can't be undone. They are logged out at once and can't log in again.
        </p>

        {previewError && <p className="ticker is-error">{previewError}</p>}
        {preview == null && !previewError && <p className="delete-note">Checking what will be deleted…</p>}
        {preview && <DeletionImpact preview={preview} />}

        {/* The first field in the dialog, so it gets the focus when the dialog opens. */}
        <label className="delete-confirm">
          <span className="rail-label">
            Type <b>{user.email}</b> to confirm
          </span>
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {error && <p className="ticker is-error">{error}</p>}

        <div className="actions">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger is-solid" disabled={!ready}>
            {pending ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function AdminPage({ currentUserId }) {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    request('/admin/users')
      .then((list) => active && setUsers(list))
      .catch((failure) => active && setError(`Cannot load accounts: ${failure.message}`))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  function openDeleteDialog(user) {
    setNotice('')
    setDeleteError('')
    setDeleteTarget(user)
  }

  async function deleteAccount() {
    const user = deleteTarget
    setDeleting(true)
    setDeleteError('')
    try {
      await request(`/admin/users/${user.id}`, { method: 'DELETE' })
      setUsers((list) => list.filter((item) => item.id !== user.id))
      setDeleteTarget(null)
      setNotice(`${user.email} was deleted.`)
    } catch (failure) {
      // The dialog stays open, so the admin can try again or cancel.
      setDeleteError(`Cannot delete this account: ${failure.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const needle = query.trim().toLowerCase()
  const shown = (users ?? []).filter((user) => user.email.includes(needle))
  const adminCount = (users ?? []).filter((user) => user.is_admin).length

  return (
    <section className="desk admin-desk">
      <header className="desk-head rise">
        <h1 className="desk-title">Users</h1>
        {users && (
          <ul className="tally" aria-label="Accounts">
            <li>
              <b>{users.length}</b> total
            </li>
            <li>
              <b>{adminCount}</b> {plural(adminCount, 'admin')}
            </li>
          </ul>
        )}
      </header>

      <div className="roster">
        <label className="roster-search rise" style={{ '--d': '100ms' }}>
          <span className="rail-label">Search by email</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="name@example.com"
            autoComplete="off"
          />
        </label>

        {notice && (
          <p className="ticker" role="status">
            {notice}
          </p>
        )}
        {error && <p className="ticker is-error">{error}</p>}
        {users == null && !error && <p className="log-loading">Loading accounts…</p>}
        {users && shown.length === 0 && <p className="rail-note">No accounts match “{query.trim()}”.</p>}

        <ol className="roster-list">
          {shown.map((user, index) => (
            <li key={user.id} className="roster-entry rise" style={{ '--d': `${160 + Math.min(index, 12) * 45}ms` }}>
              <div className="roster-who">
                <p className="roster-email">
                  <span className="roster-email-text">{user.email}</span>
                  {user.is_admin && <span className="roster-tag">Admin</span>}
                  {user.id === currentUserId && <span className="roster-tag is-self">You</span>}
                </p>
                <p className="roster-meta">
                  Registered {formatDate(user.created_at)} ·{' '}
                  {user.last_login_at ? `last login ${formatDateTime(user.last_login_at)}` : 'never logged in'}
                </p>
              </div>

              <p className="roster-count">
                <b>{user.workspaces}</b> {plural(user.workspaces, 'workspace')}
              </p>
              <p className="roster-count">
                <b>{user.inspections}</b> {plural(user.inspections, 'inspection')}
              </p>

              <div className="roster-action">
                {user.is_admin ? (
                  <span className="roster-note" title="Admins can't be deleted. Revoke admin rights first.">
                    Protected
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger"
                    aria-label={`Delete ${user.email}`}
                    aria-haspopup="dialog"
                    onClick={() => openDeleteDialog(user)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {deleteTarget && (
        <DeleteDialog
          user={deleteTarget}
          pending={deleting}
          error={deleteError}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteAccount}
        />
      )}
    </section>
  )
}
