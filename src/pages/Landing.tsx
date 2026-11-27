import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/env'
import { supabase } from '../lib/supabase'

export function Landing() {
  const { session, invite } = useAuth()
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#waitlist') document.getElementById('waitlist')?.scrollIntoView()
  }, [hash])
  if (session && invite === 'invited') return <Navigate to="/jobs" replace />

  return (
    <div className="stack">
      <section className="hero-block">
        <h1>Fell off? Find out why.</h1>
        <p className="lead">
          Upload a phone video of your fall. Micro-Beta tracks your body and gives you one clear body-position cue to
          try next go.
        </p>
        <div className="row">
          <Link className="btn" to="/login">Sign in with Google</Link>
          <Link className="btn ghost" to="/demo">See a demo</Link>
        </div>
        <p className="muted small">Private test, invite only. Free.</p>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="steps">
          <li>Film your attempt from a steady spot.</li>
          <li>Upload the clip (up to 60 seconds).</li>
          <li>Get your top cue, with the moment marked on the video.</li>
        </ol>
      </section>

      <Waitlist />
    </div>
  )
}

function Waitlist() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setState('error')
      setMsg('That email does not look right. Check it and try again.')
      return
    }
    if (!supabase) {
      setState('error')
      setMsg('The waitlist is not connected yet. Try again later.')
      return
    }
    setState('sending')
    const { error } = await supabase.from('waitlist').insert({ email: clean })
    // 23505 = unique violation: the email is already on the list. That is a success for the user.
    if (!error || error.code === '23505') {
      setState('done')
      setMsg('You are on the waitlist. We will email you when a spot opens.')
    } else {
      setState('error')
      setMsg('We could not add you. Check your connection, then tap “Join” again.')
    }
  }

  return (
    <section className="card" id="waitlist">
      <h2>Join the waitlist</h2>
      <p className="muted">Not invited yet? Leave your email.</p>
      {state === 'done' ? (
        <p className="ok" role="status">{msg}</p>
      ) : (
        <form className="form-row" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="wl-email">Email</label>
          <input
            id="wl-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn ghost" type="submit" disabled={state === 'sending' || !isConfigured}>
            {state === 'sending' ? 'Joining…' : 'Join'}
          </button>
        </form>
      )}
      {state === 'error' && <p className="err" role="alert">{msg}</p>}
      {!isConfigured && <p className="muted small">Waitlist is offline in this build.</p>}
    </section>
  )
}
