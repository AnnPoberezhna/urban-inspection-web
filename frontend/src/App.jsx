import { useEffect, useState } from 'react'
import AdminPage from './AdminPage.jsx'
import AdminUserView from './AdminUserView.jsx'
import { clearToken, hasToken, request, setUnauthorizedHandler } from './api.js'
import AuthPage from './AuthPage.jsx'
import CityScene from './CityScene.jsx'
import InspectionMap from './InspectionMap.jsx'
import InspectionsPage from './InspectionsPage.jsx'
import { CameraIcon, Pitch } from './Pitch.jsx'
import { followLink, navigate, usePath } from './router.js'
import UploadPage from './UploadPage.jsx'

const AUTH_PAGES = { '/login': 'login', '/register': 'register' }
const INSPECTIONS_PATH = '/inspections'
const ADMIN_PATH = '/admin'
// One user's inspections, read-only, e.g. /admin/users/12.
const ADMIN_USER_PATH = /^\/admin\/users\/(\d+)$/

function isAdminPath(path) {
  return path === ADMIN_PATH || ADMIN_USER_PATH.test(path)
}

// Pages that only make sense when logged in; logged-out visitors are sent to /login.
function isPrivatePath(path) {
  return path === INSPECTIONS_PATH || isAdminPath(path)
}

/** The logged-in part of the app. Owns the workspace list, so both pages share the selected workspace. */
function Session({ user, path, uploadKey, setPhase }) {
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspacesError, setWorkspacesError] = useState('')

  useEffect(() => {
    let active = true
    request('/workspaces')
      .then((list) => {
        if (!active) return
        setWorkspaces(list)
        setWorkspaceId((current) => current || String(list[0]?.id ?? ''))
      })
      .catch((error) => active && setWorkspacesError(`Cannot load workspaces: ${error.message}`))
    return () => {
      active = false
    }
  }, [])

  function handleWorkspaceCreated(workspace) {
    setWorkspaces((list) => [...list, workspace])
    setWorkspaceId(String(workspace.id))
  }

  if (isAdminPath(path) && user.is_admin) {
    const viewedId = path.match(ADMIN_USER_PATH)?.[1]
    // Keyed, so opening another user starts from a clean page.
    if (viewedId) return <AdminUserView key={viewedId} userId={Number(viewedId)} />
    return <AdminPage currentUserId={user.id} />
  }

  const shared = { workspaces, workspaceId, workspacesError, onWorkspaceChange: setWorkspaceId }
  if (path === INSPECTIONS_PATH) {
    return <InspectionsPage {...shared} onWorkspaceCreated={handleWorkspaceCreated} />
  }
  // Keyed, so that the topbar's "New inspection" link can start over from a clean page.
  return <UploadPage key={uploadKey} {...shared} setPhase={setPhase} />
}

function App() {
  const path = usePath()
  // undefined while a stored token is being checked, null when logged out.
  const [user, setUser] = useState(() => (hasToken() ? undefined : null))
  const [notice, setNotice] = useState('')
  const [phase, setPhase] = useState('standby')
  const [uploadKey, setUploadKey] = useState(0)
  const authMode = AUTH_PAGES[path]

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setPhase('standby')
      setNotice('Your session has expired. Please log in again.')
      navigate('/login')
    })
  }, [])

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

  useEffect(() => {
    // Logged-in users have nothing to do on the auth pages; this also handles the redirect after login.
    if (authMode && user) navigate('/', { replace: true })
    if (isPrivatePath(path) && user === null) navigate('/login', { replace: true })
    if (isAdminPath(path) && user && !user.is_admin) navigate('/', { replace: true })
  }, [authMode, path, user])

  function handleLoggedIn(me) {
    setNotice('')
    setUser(me)
  }

  function handleLogout() {
    clearToken()
    setUser(null)
    setPhase('standby')
    setNotice('')
    navigate('/')
  }

  if (authMode) {
    if (user !== null) return null // still checking the stored token, or about to redirect
    // Keyed by mode, so switching between log in and register clears the form.
    return <AuthPage key={authMode} mode={authMode} notice={notice} onLoggedIn={handleLoggedIn} />
  }

  // On the upload page itself the link would navigate nowhere; a new key resets the page instead.
  function handleNewInspectionLink(event) {
    followLink(event)
    if (event.defaultPrevented) setUploadKey((key) => key + 1)
  }

  const onInspections = path === INSPECTIONS_PATH
  const onAdmin = isAdminPath(path)

  return (
    <div className="app" data-phase={phase}>
      <CityScene phase={phase} />

      <header className="topbar rise">
        <div className="brand">Urban Inspection</div>
        {user && (
          <>
            <nav className="nav" aria-label="Main">
              <a
                href="/"
                onClick={handleNewInspectionLink}
                aria-current={onInspections || onAdmin ? undefined : 'page'}
              >
                New inspection
              </a>
              <a href={INSPECTIONS_PATH} onClick={followLink} aria-current={onInspections ? 'page' : undefined}>
                History
              </a>
              {user.is_admin && (
                <a href={ADMIN_PATH} onClick={followLink} aria-current={onAdmin ? 'page' : undefined}>
                  Admin
                </a>
              )}
            </nav>
            <div className="account">
              <span className="account-email">{user.email}</span>
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </>
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

      {user === null && !isPrivatePath(path) && (
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
      {user && <Session key={user.id} user={user} path={path} uploadKey={uploadKey} setPhase={setPhase} />}
    </div>
  )
}

export default App
