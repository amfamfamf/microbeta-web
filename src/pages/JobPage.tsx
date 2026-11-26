import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, Spinner } from '../components/Layout'
import { ResultView } from '../components/ResultView'
import { ShareButton } from '../components/ShareButton'
import { fetchJson, startJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useJob } from '../lib/jobs'
import { objectPath, requireSupabase } from '../lib/supabase'
import type { CueFeedbackRow, FeaturesJson, FeedbackApi, Job, ResultJson, ResultsRow } from '../lib/types'
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
      {job.status === 'analyzing' && (
        <p className="muted">
          Tracking your body and finding the fall. This usually takes 1–3 minutes. You can leave this page; the result
          shows up in “My videos”.
        </p>
      )}
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
      {job.status === 'failed' && (
        <div className="banner error">
          <p>{job.error || 'The analysis failed.'}</p>
          <p className="small">
            Try again with a new upload. <Link to="/guide">Filming tips</Link> can help.
          </p>
          <Link className="btn small" to="/upload">Upload again</Link>
        </div>
      )}
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
