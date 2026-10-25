import { useState } from 'react'
import { postJson, request, setToken } from './api.js'
import { Drone } from './CityScene.jsx'
import { followLink } from './router.js'

// The drone hovers over the form and holds it in its beam; the corner brackets around the card
// show the state (cyan at rest, sodium while typing, red on a failed attempt).
export default function AuthPage({ mode, notice, onLoggedIn }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isRegister = mode === 'register'
  const word = isRegister ? 'Sign up' : 'Log in'

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = form.get('email')
    const password = form.get('password')

    setBusy(true)
    setError('')
    try {
      if (isRegister) await postJson('/auth/register', { email, password })
      // /auth/token is an OAuth2 password form: the email goes in "username".
      const { access_token: accessToken } = await request('/auth/token', {
        method: 'POST',
        body: new URLSearchParams({ username: email, password }),
      })
      setToken(accessToken)
      onLoggedIn(await request('/auth/me'))
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return (
    <main className="auth-page" data-state={error ? 'error' : busy ? 'busy' : undefined}>
      <a className="auth-back" href="/" onClick={followLink}>
        <span aria-hidden="true">←</span> Urban Inspection
      </a>

      <div className="auth-sky" aria-hidden="true">
        <div className="auth-drone">
          <Drone />
        </div>
        <span className="auth-beam" />
        <span className="auth-word">{word}</span>
        <span className="auth-word auth-word-lit">{word}</span>
        <span className="auth-spot" />
      </div>

      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth-title">
          {isRegister ? 'Create an account' : 'Log in'}
        </h1>

        {notice && !error && <p className="auth-notice">{notice}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" name="email" autoComplete="email" required />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              aria-describedby={isRegister ? 'auth-password-hint' : undefined}
              required
            />
            {isRegister && <small id="auth-password-hint">At least 8 characters.</small>}
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Checking...' : isRegister ? 'Register' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account? ' : 'No account yet? '}
          <a href={isRegister ? '/login' : '/register'} onClick={followLink}>
            {isRegister ? 'Log in' : 'Register'}
          </a>
        </p>
      </section>
    </main>
  )
}
