import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddVideo } from '../components/AddVideo'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBox, Spinner } from '../components/Layout'
import { ResultView } from '../components/ResultView'
import { ShareButton } from '../components/ShareButton'
import { fetchJson, startJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useJob } from '../lib/jobs'
import { objectPath, requireSupabase } from '../lib/supabase'
import { deleteJob } from '../lib/thumbs'
import type { CueFeedbackRow, FeaturesJson, FeedbackApi, Job, QualityReport, ResultJson, ResultsRow } from '../lib/types'
import { StatusPill } from './Jobs'

const STEPS: Job['status'][] = ['uploaded', 'analyzing', 'ready']

export function JobPage() {
  const { id = '' } = useParams()
  const { job, error, retry } = useJob(id)

  if (error) return <ErrorBox message={error} onRetry={retry} />
  if (!job) return <Spinner />

  return (
    <div className="stack">
      <div className="row between">
        <Link to="/jobs" className="link-btn">‹ My videos</Link>
        <StatusPill status={job.status} />
      </div>
      {job.status !== 'ready' && <StatusSteps job={job} />}
      {job.status === 'ready' && <ReadyResult job={job} />}
      <DeleteVideo job={job} />
    </div>
  )
}

function DeleteVideo({ job }: { job: Job }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const analyzing = job.status === 'analyzing'

  const confirm = async () => {
    setBusy(true)
    setErr(null)
    try {
      await deleteJob(job)
      nav('/jobs', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="delete-zone">
      <button type="button" className="btn small destructive" disabled={analyzing} onClick={() => setOpen(true)}>
        <span aria-hidden>🗑</span> Delete video
      </button>
      {analyzing && <p className="muted small">You can delete this video when the analysis finishes.</p>}
      <ConfirmDialog
        open={open}
        title="Delete this video?"
        confirmLabel="Delete"
        busy={busy}
        error={err}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false)
          setErr(null)
        }}
      >
        <p>This deletes the video, its analysis and any share links. You cannot undo this.</p>
      </ConfirmDialog>
    </div>
  )
}

function StatusSteps({ job }: { job: Job }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const idx = job.status === 'failed' ? 1 : STEPS.indexOf(job.status)

  return (
    <div className="card">
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i < idx ? 'done' : i === idx ? (job.status === 'failed' ? 'failed' : 'current') : ''}>
            {s === 'uploaded' ? 'Uploaded' : s === 'analyzing' ? (job.status === 'failed' ? 'Failed' : 'Analyzing') : 'Ready'}
          </li>
        ))}
      </ol>
      {job.status === 'analyzing' && <AnalysisProgress since={job.updated_at} durationS={job.duration_s} />}
      {job.status === 'uploaded' && (
        <>
          <p className="muted">The video is uploaded but analysis has not started.</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
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
            }}
          >
            {busy ? 'Starting…' : 'Start analysis'}
          </button>
          {err && <p className="err">{err}</p>}
        </>
      )}
      {job.status === 'failed' && job.quality && !job.quality.passed && <QualityFailed report={job.quality} />}
      {job.status === 'failed' && !(job.quality && !job.quality.passed) && (
        <div className="banner error">
          <p>{job.error || 'The analysis failed.'}</p>
          <p className="small">Try again with a new video.</p>
          <AddVideo size="small" />
        </div>
      )}
    </div>
  )
}

/**
 * Estimated analysis time on the GPU worker (contract v1.2): a fixed part (start-up, download,
 * convert, cue writing) plus a part per second of video (pose tracking runs on every frame).
 * Starting values; tune them from result.timings. The bar is an estimate, not real progress.
 */
const EST_FIXED_S = 20
const EST_PER_VIDEO_S = 1.2
const EST_UNKNOWN_S = 45

function expectedSeconds(durationS: number | null | undefined): number {
  return durationS && durationS > 0 ? EST_FIXED_S + EST_PER_VIDEO_S * durationS : EST_UNKNOWN_S
}
const STAGES = [
  { until: 0.12, label: 'Checking your video' },
  { until: 0.7, label: 'Tracking your body' },
  { until: 1, label: 'Finding the fall and writing your cue' },
]

/** Estimated progress: close to 90% at the expected time, then creeps toward 95%. Never claims to be done. */
function estimateProgress(elapsedS: number, est: number): number {
  const t = Math.max(0, elapsedS)
  return Math.min(0.95, 0.95 * (1 - Math.exp((-2.3 * t) / est)) + 0.02)
}

function AnalysisProgress({ since, durationS }: { since: string; durationS?: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  const [mounted] = useState(() => Date.now())
  const parsed = Date.parse(since)
  const start = Number.isFinite(parsed) ? parsed : mounted
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const elapsed = (now - start) / 1000
  const est = expectedSeconds(durationS)
  const p = estimateProgress(elapsed, est)
  const pct = Math.round(p * 100)
  const stage = STAGES.findIndex((s) => p < s.until)
  const step = stage === -1 ? STAGES.length - 1 : stage
  const left = Math.round(est - elapsed)
  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="row between small">
        <span>
          <strong>{STAGES[step].label}</strong>
          <span className="muted"> · Step {step + 1} of {STAGES.length}</span>
        </span>
        <span className="muted">{pct}%</span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Analysis progress (estimate)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        {left > 5 ? `About ${left} s left.` : 'Almost done — a long clip can take a bit more.'} You can leave this page; the
        result shows up in “My videos”.
      </p>
    </div>
  )
}

/** The only place filming tips appear: one per failed check (contract v1.2). */
function QualityFailed({ report }: { report: QualityReport }) {
  const failed = report.checks.filter((c) => !c.ok)
  return (
    <div className="quality-fail" role="alert">
      <h2>This video needs a retake</h2>
      <p className="muted">We checked it before the analysis. Fix {failed.length === 1 ? 'this' : 'these'}, then add a new video.</p>
      <ul className="qc-list">
        {failed.map((c) => (
          <li key={c.id} className="qc-item">
            <p className="qc-msg">{c.message}</p>
            {c.tip && <p className="qc-tip small">{c.tip}</p>}
          </li>
        ))}
      </ul>
      <AddVideo size="wide" />
    </div>
  )
}

interface Loaded {
  result: ResultJson
  features: FeaturesJson
  videoUrl: string
}

function ReadyResult({ job }: { job: Job }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const feedback = useCueFeedback(job)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = requireSupabase()
      const { data: row, error: e } = await sb.from('results').select('*').eq('job_id', job.id).maybeSingle()
      if (e) throw new Error('We could not load the result. Check your connection, then tap “Try again”.')
      if (!row) throw new Error('The result is not saved yet. Wait a few seconds, then tap “Try again”.')
      const r = row as ResultsRow
      const base = `${job.user_id}/${job.id}`
      const videoPath = r.video_path ? objectPath(r.video_path, 'results') : `${base}/video.mp4`
      const featuresPath = r.features_path ? objectPath(r.features_path, 'results') : `${base}/features.json`
      const { data: signed, error: se } = await sb.storage.from('results').createSignedUrls([videoPath, featuresPath], 3600)
      const videoUrl = signed?.[0]?.signedUrl
      const featuresUrl = signed?.[1]?.signedUrl
      if (se || !videoUrl || !featuresUrl) {
        throw new Error('We could not open the result files. Reload the page; if it keeps failing, upload the video again.')
      }
      const features = await fetchJson<FeaturesJson>(featuresUrl, 'overlay data')
      if (!cancelled) setData({ result: r.result, features, videoUrl })
    })().catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [job.id, job.user_id, nonce])

  if (error) {
    const retry = () => {
      setError(null)
      setNonce((n) => n + 1)
    }
    return <ErrorBox message={error} onRetry={retry} />
  }
  if (!data) return <Spinner label="Loading your result…" />
  return (
    <ResultView
      result={data.result}
      features={data.features}
      videoUrl={data.videoUrl}
      feedback={feedback}
      actions={<ShareButton job={job} />}
    />
  )
}

/** Read and write `cue_feedback` (one row per cue per user). */
function useCueFeedback(job: Job): FeedbackApi {
  const { session } = useAuth()
  const [rows, setRows] = useState<Record<number, CueFeedbackRow>>({})
  const rowsRef = useRef(rows)
  const inflight = useRef<Record<number, Promise<void> | undefined>>({})

  useEffect(() => {
    requireSupabase()
      .from('cue_feedback')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const map: Record<number, CueFeedbackRow> = {}
        for (const r of (data ?? []) as CueFeedbackRow[]) map[r.cue_index] = r
        rowsRef.current = map
        setRows(map)
      })
  }, [job.id])

  const save = useCallback<FeedbackApi['save']>(
    async (cueIndex, patch) => {
      await inflight.current[cueIndex]
      const run = (async () => {
        const sb = requireSupabase()
        const existing = rowsRef.current[cueIndex]
        const q = existing
          ? sb.from('cue_feedback').update(patch).eq('id', existing.id).select().single()
          : sb
              .from('cue_feedback')
              .insert({ job_id: job.id, user_id: session!.user.id, cue_index: cueIndex, ...patch })
              .select()
              .single()
        const { data, error } = await q
        if (error || !data) throw new Error('save failed')
        setRows((prev) => ({ ...prev, [cueIndex]: data as CueFeedbackRow }))
        rowsRef.current = { ...rowsRef.current, [cueIndex]: data as CueFeedbackRow }
      })()
      inflight.current[cueIndex] = run.catch(() => undefined)
      await run
    },
    [job.id, session],
  )

  return useMemo(() => ({ get: (i: number) => rows[i], save }), [rows, save])
}
