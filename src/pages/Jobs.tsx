import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBox, Spinner } from '../components/Layout'
import { startJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { STATUS_LABEL, useJobs } from '../lib/jobs'
import { requireSupabase } from '../lib/supabase'
import type { Job } from '../lib/types'

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function Jobs() {
  const { session } = useAuth()
  const { jobs, error, retry } = useJobs(session!.user.id)

  return (
    <div className="stack">
      <div className="row between">
        <h1>My videos</h1>
        <Link className="btn small" to="/upload">+ Upload</Link>
      </div>
      {error && <ErrorBox message={error} onRetry={retry} />}
      {!jobs && !error && <Spinner />}
      {jobs && jobs.length === 0 && (
        <div className="card center-text">
          <p>No videos yet.</p>
          <Link className="btn" to="/upload">Upload your first fall</Link>
        </div>
      )}
      {jobs && jobs.length > 0 && (
        <ul className="job-list">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function StatusPill({ status }: { status: Job['status'] }) {
  return (
    <span className={`pill ${status}`}>
      {status === 'analyzing' && <span className="pulse" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function JobRow({ job }: { job: Job }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    setErr(null)
    try {
      const { data } = await requireSupabase().auth.getSession()
      await startJob(job.id, data.session?.access_token ?? '')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="job-row">
      <Link to={`/jobs/${job.id}`} className="job-link">
        <div>
          <div className="job-title">{when(job.created_at)}</div>
          <div className="muted small">{job.wall_hint ? `Wall: ${job.wall_hint}` : 'Wall: app guesses'}</div>
        </div>
        <StatusPill status={job.status} />
      </Link>
      {job.status === 'failed' && job.error && <p className="err small">{job.error}</p>}
      {job.status === 'uploaded' && (
        <div className="job-extra">
          <p className="muted small">Not started yet. If the upload finished, start the analysis.</p>
          <button type="button" className="btn small" disabled={busy} onClick={start}>
            {busy ? 'Starting…' : 'Start analysis'}
          </button>
          {err && <p className="err small">{err}</p>}
        </div>
      )}
    </li>
  )
}
