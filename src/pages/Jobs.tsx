import { Link } from 'react-router-dom'
import { AddVideo } from '../components/AddVideo'
import { ErrorBox, Spinner } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { STATUS_LABEL, useJobs } from '../lib/jobs'
import { useTiles, type Tile } from '../lib/thumbs'
import type { Job } from '../lib/types'

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function Jobs() {
  const { session } = useAuth()
  const { jobs, error, retry } = useJobs(session!.user.id)
  const tiles = useTiles(jobs)

  return (
    <div className="stack">
      <div className="row between">
        <h1>My videos</h1>
        <AddVideo size="small" />
      </div>
      {error && <ErrorBox message={error} onRetry={retry} />}
      {!jobs && !error && <Spinner />}
      {jobs && jobs.length === 0 && (
        <div className="card center-text">
          <p>No videos yet.</p>
          <AddVideo variant="ghost" />
        </div>
      )}
      {jobs && jobs.length > 0 && (
        <ul className="video-grid">
          {jobs.map((j) => (
            <JobTile key={j.id} job={j} tile={tiles[j.id]} />
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

function dur(s: number) {
  const r = Math.round(s)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

function JobTile({ job, tile }: { job: Job; tile?: Tile }) {
  return (
    <li>
      <Link
        to={`/jobs/${job.id}`}
        className="tile"
        aria-label={`Video from ${when(job.created_at)}, ${STATUS_LABEL[job.status]}`}
      >
        {tile?.img ? (
          <img src={tile.img} alt="" loading="lazy" />
        ) : tile?.video ? (
          <video src={`${tile.video}#t=0.5`} muted playsInline preload="metadata" tabIndex={-1} />
        ) : null}
        {job.status !== 'ready' && (
          <span className={`tile-badge ${job.status}`}>
            {job.status === 'analyzing' && <span className="pulse" aria-hidden />}
            {job.status === 'failed' && <span aria-hidden>✕ </span>}
            {STATUS_LABEL[job.status]}
          </span>
        )}
        {job.duration_s != null && job.duration_s > 0 && <span className="tile-dur">{dur(job.duration_s)}</span>}
      </Link>
    </li>
  )
}
