import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ErrorBox, NotConfigured, Spinner } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/env'

export function Login() {
  const { ready, session, invite, inviteError, recheckInvite, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!isConfigured) return <NotConfigured />
  if (!ready) return <Spinner />
  if (session) {
    if (invite === 'invited') return <Navigate to="/jobs" replace />
    if (invite === 'not_invited') return <Navigate to="/waitlisted" replace />
    if (invite === 'error') return <ErrorBox message={inviteError ?? 'Could not check your invite.'} onRetry={recheckInvite} />
    return <Spinner label="Checking your invite…" />
  }

  return (
    <div className="stack narrow">
      <h1>Sign in</h1>
      <p className="muted">Use the Google account your invite was sent to.</p>
      <button
        type="button"
        className="btn google"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await signIn()
          } catch (e) {
            setError((e as Error).message)
            setBusy(false)
          }
        }}
      >
        <span className="g" aria-hidden>G</span> {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {error && <ErrorBox message={error} />}
      <p className="muted small">
        No invite? <Link to="/#waitlist">Join the waitlist</Link>.
      </p>
    </div>
  )
}

export function Waitlisted() {
  const { session, signOut } = useAuth()
  return (
    <div className="stack narrow">
      <h1>You’re on the waitlist</h1>
      <p>
        {session?.user.email ? <strong>{session.user.email}</strong> : 'This account'} is not invited yet. This is a
        small private test. We will email you when a spot opens.
      </p>
      <p className="muted">
        Got an invite on a different Google account? Sign out, then sign in with that account.
      </p>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => signOut()}>
          Sign out
        </button>
        <Link className="btn ghost" to="/demo">See a demo</Link>
      </div>
    </div>
  )
}
