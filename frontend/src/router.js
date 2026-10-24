import { useEffect, useState } from 'react'

// A minimal client-side router: the app has only a few pages, so no routing library is needed.
// The Vite dev server answers every path with index.html, so /login also works after a reload.

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** The current path; re-renders on navigate() and on the browser's back and forward buttons. */
export function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  return path
}

/** onClick for in-app <a href> links: switches the page without a reload. Ctrl/Cmd-click still opens a tab. */
export function followLink(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(event.currentTarget.getAttribute('href'))
}
