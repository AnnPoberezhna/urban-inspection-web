const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'urban-inspection-token'

// localStorage can be unavailable (private mode, blocked site data). The token is then kept
// in memory only, and the user has to log in again after a page reload.
function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let token = readStoredToken()
let onUnauthorized = () => {}

export function hasToken() {
  return token != null
}

export function setToken(value) {
  token = value
  try {
    localStorage.setItem(TOKEN_KEY, value)
  } catch {
    // Memory only; see readStoredToken.
  }
}

export function clearToken() {
  token = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing stored.
  }
}

/** Called when the API rejects the stored token (expired, or edited by hand). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

function errorMessage(detail, fallback) {
  if (typeof detail === 'string') return detail
  // FastAPI validation errors are a list of {loc, msg}.
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return JSON.stringify(detail ?? fallback)
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await response.json().catch(() => null)
  if (response.status === 401 && token) {
    clearToken()
    onUnauthorized()
  }
  if (!response.ok) throw new Error(errorMessage(body?.detail, response.statusText))
  return body
}

export function postJson(path, data) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
