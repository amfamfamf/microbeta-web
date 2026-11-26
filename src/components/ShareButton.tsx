import { useState } from 'react'
import { siteRoot } from '../lib/env'
import { requireSupabase } from '../lib/supabase'
import { randomToken } from '../lib/token'
import type { Job } from '../lib/types'

const WEEK_MS = 7 * 24 * 3600 * 1000

export function ShareButton({ job }: { job: Job }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setMsg('Link copied. It works for 7 days.')
    } catch {
      setMsg('Copy the link below. It works for 7 days.')
    }
  }

  const create = async () => {
    if (url) return copy(url)
    setBusy(true)
    setErr(null)
    try {
      const token = randomToken(32)
      const { error } = await requireSupabase().from('share_links').insert({
        token,
        job_id: job.id,
        user_id: job.user_id,
        expires_at: new Date(Date.now() + WEEK_MS).toISOString(),
      })
      if (error) throw error
      const link = `${siteRoot()}#/s/${token}`
      setUrl(link)
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My climbing fall, analyzed', url: link })
          setMsg('Shared. The link works for 7 days.')
          return
        } catch {
          /* user closed the share sheet: fall back to copy */
        }
      }
      await copy(link)
    } catch {
      setErr('We could not make a share link. Check your connection, then tap “Share” again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share">
      <button type="button" className="btn ghost" disabled={busy} onClick={create}>
        {busy ? 'Making link…' : url ? 'Copy link' : '🔗 Share'}
      </button>
      {url && <input className="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />}
      {msg && <p className="muted small" role="status">{msg}</p>}
      {err && <p className="err small" role="alert">{err}</p>}
      {!url && !err && <p className="muted small">Anyone with the link can watch this result for 7 days.</p>}
    </div>
  )
}
