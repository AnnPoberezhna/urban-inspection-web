import { useEffect, useState } from 'react'
import { postJson, request } from './api.js'

function initials(email) {
  return email.slice(0, 2).toUpperCase()
}

function Members({ workspace }) {
  const [members, setMembers] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const isOwner = workspace.role === 'owner'
  const inputId = `add-member-${workspace.id}`

  useEffect(() => {
    let active = true
    request(`/workspaces/${workspace.id}/members`)
      .then((list) => active && setMembers(list))
      .catch((failure) => active && setMessage({ text: failure.message, isError: true }))
    return () => {
      active = false
    }
  }, [workspace.id])

  async function handleAdd(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    try {
      const member = await postJson(`/workspaces/${workspace.id}/members`, {
        email: new FormData(form).get('email'),
      })
      setMembers((list) => [...list, member])
      form.reset()
      setMessage({ text: `${member.email} can now see this workspace.`, isError: false })
    } catch (failure) {
      setMessage({ text: failure.message, isError: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rail-block">
      <p className="rail-label">Members · {members.length}</p>
      <ul className="crew">
        {members.map((member) => (
          <li key={member.user_id}>
            <span className="crew-badge" data-role={member.role} aria-hidden="true">
              {initials(member.email)}
            </span>
            <span className="crew-email">{member.email}</span>
            <span className="crew-role">{member.role}</span>
          </li>
        ))}
      </ul>

      {isOwner && (
        <form className="inline-form" onSubmit={handleAdd}>
          <label className="rail-label" htmlFor={inputId}>
            Add member by email
          </label>
          <input id={inputId} type="email" name="email" placeholder="colleague@example.com" required />
          <button type="submit" className="inline-submit" disabled={busy}>
            Add
          </button>
        </form>
      )}
      {message && <p className={`ticker ${message.isError ? 'is-error' : ''}`}>{message.text}</p>}
    </div>
  )
}

function NewWorkspaceForm({ onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    try {
      const workspace = await postJson('/workspaces', { name: new FormData(form).get('name') })
      form.reset()
      onCreated(workspace)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="rail-block inline-form" onSubmit={handleCreate}>
      <label className="rail-label" htmlFor="new-workspace">
        New team workspace
      </label>
      <input id="new-workspace" type="text" name="name" maxLength={255} placeholder="Bridge team" required />
      <button type="submit" className="inline-submit" disabled={busy}>
        Create
      </button>
      {error && <p className="ticker is-error">{error}</p>}
    </form>
  )
}

/** With readOnly, only the list to switch between workspaces, as admins see another user's. */
export default function WorkspacePanel({ workspaces, workspaceId, onSelect, onCreated, readOnly = false }) {
  const selected = workspaces.find((workspace) => String(workspace.id) === workspaceId)

  return (
    <aside className="rail rise" style={{ '--d': '100ms' }} aria-label="Workspaces">
      <div>
        <p className="rail-label">Workspaces</p>
        <ul className="channel-list">
          {workspaces.map((workspace, index) => {
            const isActive = String(workspace.id) === workspaceId
            return (
              <li key={workspace.id}>
                <button
                  type="button"
                  className={`channel ${isActive ? 'is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => onSelect(String(workspace.id))}
                >
                  <span className="channel-code" aria-hidden="true">
                    CH-{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="channel-name">{workspace.is_personal ? 'Personal' : workspace.name}</span>
                  <span className="channel-role">
                    {workspace.is_personal ? (readOnly ? 'personal' : 'only you') : workspace.role}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {!readOnly && (
        <>
          {/* Keyed by workspace, so switching workspaces clears the member list and messages. */}
          {selected && !selected.is_personal && <Members key={selected.id} workspace={selected} />}
          {selected?.is_personal && (
            <p className="rail-block rail-note">
              Only you can see the inspections in your personal workspace. Admins can view them, read-only, to
              help with problems.
            </p>
          )}

          <NewWorkspaceForm onCreated={onCreated} />
        </>
      )}
    </aside>
  )
}
