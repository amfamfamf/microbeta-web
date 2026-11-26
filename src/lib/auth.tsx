import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { siteRoot } from './env'

type InviteState = 'unknown' | 'checking' | 'invited' | 'not_invited' | 'error'

interface AuthValue {
  ready: boolean
  session: Session | null
  invite: InviteState
  inviteError: string | null
  recheckInvite: () => void
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Remove `?code=` / `?error=` left by the OAuth redirect, keep the hash route. */
function cleanAuthParams() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return
  ;['code', 'error', 'error_code', 'error_description', 'state'].forEach((k) => url.searchParams.delete(k))
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [inviteNonce, setInviteNonce] = useState(0)
  // Result of the last check, tagged with the user + attempt it belongs to.
  const [checked, setChecked] = useState<{ key: string; state: InviteState } | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
      cleanAuthParams()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const key = `${userId}:${inviteNonce}`
  const invite: InviteState = !userId ? 'unknown' : checked?.key === key ? checked.state : 'checking'
  const inviteError = invite === 'error' ? 'We could not check your invite. Check your connection, then tap “Try again”.' : null

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    const k = `${userId}:${inviteNonce}`
    // RLS only returns the signed-in user's own row, so "any row" means invited.
    supabase
      .from('invites')
      .select('email')
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setChecked({ key: k, state: 'error' })
        else setChecked({ key: k, state: data && data.length > 0 ? 'invited' : 'not_invited' })
      })
    return () => {
      cancelled = true
    }
  }, [userId, inviteNonce])

  const signIn = useCallback(async () => {
    if (!supabase) throw new Error('The app is not set up yet.')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: siteRoot() },
    })
    if (error) throw new Error('Google sign-in did not start. Reload the page and try again.')
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const recheckInvite = useCallback(() => setInviteNonce((n) => n + 1), [])

  return (
    <AuthContext.Provider value={{ ready, session, invite, inviteError, recheckInvite, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
