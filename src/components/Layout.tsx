import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/env'

export function Layout({ children }: { children: ReactNode }) {
  const { session, invite, signOut } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to={session ? '/jobs' : '/'} className="brand">
          <span className="dot" aria-hidden /> Micro-Beta
        </Link>
        {session && (
          <nav className="nav">
            {invite === 'invited' && <Link to="/jobs">My videos</Link>}
            <button type="button" className="link-btn" onClick={() => signOut()}>
              Sign out
            </button>
          </nav>
        )}
      </header>
      <main className="page">{children}</main>
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-block" role="status">
      <div className="spinner" aria-hidden />
      <p className="muted">{label}</p>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="banner warn">
      <p>
        This copy of the site is not connected to a backend yet (missing <code>VITE_SUPABASE_URL</code>,{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> or <code>VITE_API_URL</code>). You can still try the{' '}
        <Link to="/demo">demo result</Link>.
      </p>
    </div>
  )
}

/** Only signed-in, invited users get through. */
export function RequireInvite({ children }: { children: ReactNode }) {
  const { ready, session, invite, inviteError, recheckInvite } = useAuth()
  const loc = useLocation()
  if (!isConfigured) return <NotConfigured />
  if (!ready) return <Spinner />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (invite === 'checking' || invite === 'unknown') return <Spinner label="Checking your invite…" />
  if (invite === 'error') return <ErrorBox message={inviteError ?? 'Could not check your invite.'} onRetry={recheckInvite} />
  if (invite === 'not_invited') return <Navigate to="/waitlisted" replace />
  return <>{children}</>
}
