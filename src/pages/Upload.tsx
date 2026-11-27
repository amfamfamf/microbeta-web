import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AddVideo } from '../components/AddVideo'
import {
  bandFor,
  GuessButton,
  readLastWallDeg,
  saveLastWallDeg,
  WallAngle,
  type WallAnswer,
} from '../components/WallAngle'
import { ErrorBox } from '../components/Layout'
import { startJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { MAX_BYTES, MAX_SECONDS } from '../lib/env'
import { requireSupabase } from '../lib/supabase'
import { TargetPicker } from '../components/TargetPicker'
import type { TargetHint } from '../lib/types'
import { extensionFor, readDuration, UploadAborted, uploadResumable } from '../lib/upload'

type Phase = 'pick' | 'creating' | 'uploading' | 'starting' | 'error'


export function Upload() {
  const { session } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [file, setFile] = useState<File | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  // Start from the user's last wall angle (this device first, then their last job), else unanswered at 10°.
  const [wall, setWallRaw] = useState<WallAnswer>(() => readLastWallDeg())
  const [wallRemembered, setWallRemembered] = useState(() => readLastWallDeg() != null)
  const wallTouched = useRef(false)
  const setWall = (v: WallAnswer) => {
    wallTouched.current = true
    setWallRemembered(false)
    setWallRaw(v)
  }

  // Another device: take the angle from the user's last job that has one.
  useEffect(() => {
    if (!session || readLastWallDeg() != null) return
    let cancelled = false
    requireSupabase()
      .from('jobs')
      .select('wall_angle_deg')
      .eq('user_id', session.user.id)
      .not('wall_angle_deg', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const deg = (data?.[0] as { wall_angle_deg?: number } | undefined)?.wall_angle_deg
        if (!cancelled && !wallTouched.current && typeof deg === 'number') {
          setWallRaw(deg)
          setWallRemembered(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [session])
  // Required answers: a value, or 'guess' (let AI guess). null = not answered yet.
  const [target, setTarget] = useState<TargetHint | 'guess' | null>(null)
  // Three screens: 1 add video, 2 select the hold, 3 wall angle (then upload).
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const go = (n: 1 | 2 | 3) => {
    setStep(n)
    window.scrollTo({ top: 0 })
  }
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const jobRef = useRef<{ id: string; path: string; uploaded: boolean } | null>(null)
  const [hasJob, setHasJob] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const pick = async (f: File | undefined) => {
    setFile(null)
    setDuration(null)
    setFileErr(null)
    jobRef.current = null
    setHasJob(false)
    setTarget(null)
    if (!f) return
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(f.name)) {
      setFileErr('That file is not a video. Pick a video file (MP4 or MOV).')
      return
    }
    if (f.size > MAX_BYTES) {
      setFileErr(`This video is ${(f.size / 1048576).toFixed(0)} MB. The limit is 200 MB. Trim it to the hard move, or film at a lower resolution.`)
      return
    }
    try {
      const d = await readDuration(f)
      if (d > MAX_SECONDS + 0.5) {
        setFileErr(`This video is ${Math.round(d)} s long. The limit is 60 s. Trim it to just before and after the fall, then pick it again.`)
        return
      }
      setDuration(d)
    } catch {
      // Some browsers cannot read some formats (e.g. HEVC .mov on desktop). The server checks length again.
      setDuration(null)
    }
    setFile(f)
    go(2)
  }

  // A file chosen from "Add video" on another screen arrives in the navigation state.
  const handedFile = (location.state as { file?: File } | null)?.file
  const pickRef = useRef(pick)
  useEffect(() => {
    pickRef.current = pick
  })
  useEffect(() => {
    // Deferred so the state updates run after this render, once per handed file.
    if (handedFile instanceof File) void Promise.resolve().then(() => pickRef.current(handedFile))
  }, [handedFile])

  /** `wallOverride`: the secondary "Let AI guess" button answers the wall angle and uploads in one tap. */
  const run = async (wallOverride?: WallAnswer) => {
    const wall_ = wallOverride !== undefined ? wallOverride : wall
    if (!file || !session) return
    const sb = requireSupabase()
    setError(null)
    try {
      // 1. Create the job row (once; a retry reuses it).
      if (!jobRef.current) {
        setPhase('creating')
        if (typeof wall_ === 'number') saveLastWallDeg(wall_)
        const id = crypto.randomUUID()
        const path = `${session.user.id}/${id}/original.${extensionFor(file)}`
        const { error: insErr } = await sb.from('jobs').insert({
          id,
          user_id: session.user.id,
          status: 'uploaded',
          video_path: path,
          wall_hint: typeof wall_ === 'number' ? bandFor(wall_).hint : null,
          wall_angle_deg: typeof wall_ === 'number' ? wall_ : null,
          target_hint: target === 'guess' ? null : target,
          ...(duration != null && duration > 0 ? { duration_s: Math.min(61, Math.round(duration * 10) / 10) } : {}),
        })
        if (insErr) throw new Error('We could not create the job. Check your connection, then tap “Upload” again.')
        jobRef.current = { id, path, uploaded: false }
        setHasJob(true)
      }
      const job = jobRef.current

      // 2. Resumable upload (skipped on retry if it already finished).
      if (!job.uploaded) {
        setPhase('uploading')
        setProgress(0)
        const { data: s1 } = await sb.auth.getSession()
        const upToken = s1.session?.access_token
        if (!upToken) throw new Error('Your sign-in expired. Sign out, sign in again, then upload again.')
        const up = uploadResumable({
          file,
          bucket: 'videos',
          objectName: job.path,
          accessToken: upToken,
          onProgress: setProgress,
        })
        abortRef.current = up.abort
        try {
          await up.promise
        } catch (err) {
          abortRef.current = null
          if (err instanceof UploadAborted) {
            throw new Error('Upload cancelled. Tap “Try again” to continue where it stopped.', { cause: err })
          }
          throw new Error('The upload stopped. Check your connection, then tap “Try again” — it continues where it left off.', {
            cause: err,
          })
        }
        abortRef.current = null
        job.uploaded = true
      }
      const { data } = await sb.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your sign-in expired. Sign out, sign in again, then tap “Try again”.')

      // 3. Start analysis.
      setPhase('starting')
      await startJob(job.id, token)
      nav(`/jobs/${job.id}`, { replace: true })
    } catch (e) {
      setPhase('error')
      setError((e as Error).message)
    }
  }

  const busy = phase === 'creating' || phase === 'uploading' || phase === 'starting'

  const back = (n: 1 | 2) => (
    <button type="button" className="link-btn" disabled={busy || hasJob} onClick={() => go(n)}>
      ‹ Back
    </button>
  )

  return (
    <div className="stack narrow upload-flow">
      <div className="row between step-head">
        <span className="eyebrow">Step {step} of 3</span>
        <ol className="step-dots" aria-hidden>
          {[1, 2, 3].map((n) => (
            <li key={n} className={n === step ? 'on' : n < step ? 'done' : ''} />
          ))}
        </ol>
      </div>

      {step === 1 && (
        <>
          <h1>Add your video</h1>
          <p className="muted">Up to 60 seconds and 200 MB. Start just before the hard move.</p>
          <div className="card">
            <AddVideo
              onPick={pick}
              label={file ? 'Change video' : 'Add video'}
              variant={file ? 'ghost' : 'primary'}
              size="wide"
              disabled={busy || hasJob}
            />
            {fileErr && <p className="err" role="alert">{fileErr}</p>}
            {file && (
              <p className="file-info">
                <strong>{file.name}</strong>
                <br />
                {(file.size / 1048576).toFixed(1)} MB{duration != null && ` · ${duration.toFixed(1)} s`}
              </p>
            )}
          </div>
          {file && (
            <button type="button" className="btn wide" onClick={() => go(2)}>
              Next
            </button>
          )}
        </>
      )}

      {step === 2 && file && (
        <>
          {back(1)}
          <h1>Select the hold where you fell</h1>
          <p className="muted">AI will use the color to identify the route.</p>
          <div className="card">
            <TargetPicker
              file={file}
              value={target === 'guess' ? null : target}
              onChange={setTarget}
              disabled={busy || hasJob || target === 'guess'}
            />
            {target && target !== 'guess' && (
              <div className="row">
                <span className="ok small">✓ Hold selected · tap again to move it</span>
                <button type="button" className="btn small ghost" disabled={busy || hasJob} onClick={() => setTarget(null)}>
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="cta-pair">
            <button type="button" className="btn wide" disabled={target === null || target === 'guess'} onClick={() => go(3)}>
              Next
            </button>
            <GuessButton
              onClick={() => {
                setTarget('guess')
                go(3)
              }}
            />
          </div>
        </>
      )}

      {step === 3 && file && (
        <>
          {back(2)}
          <h1>Wall angle</h1>
          <div className="card">
            <WallAngle value={wall} onChange={setWall} disabled={busy || hasJob} remembered={wallRemembered} hideLabel />
          </div>

          {busy && (
            <div className="progress-wrap" role="status" aria-live="polite">
              <div className="progress">
                <div className="progress-bar" style={{ width: `${phase === 'uploading' ? Math.round(progress * 100) : phase === 'starting' ? 100 : 2}%` }} />
              </div>
              <p className="muted small">
                {phase === 'creating' && 'Getting ready…'}
                {phase === 'uploading' && `Uploading… ${Math.round(progress * 100)}% — keep this page open.`}
                {phase === 'starting' && 'Starting analysis…'}
              </p>
              {phase === 'uploading' && (
                <button type="button" className="link-btn" onClick={() => abortRef.current?.()}>
                  Cancel upload
                </button>
              )}
            </div>
          )}

          {error && <ErrorBox message={error} />}

          <div className="cta-pair">
            <button
              type="button"
              className="btn wide"
              disabled={busy || (typeof wall !== 'number' && !(hasJob && phase === 'error'))}
              onClick={() => run()}
            >
              {phase === 'error' ? 'Try again' : 'Analyze'}
            </button>
            {!hasJob && (
              <GuessButton
                disabled={busy}
                onClick={() => {
                  setWall('guess')
                  run('guess')
                }}
              />
            )}
          </div>
        </>
      )}
      {hasJob && phase === 'error' && (
        <p className="muted small">
          Your job is saved. You can also retry from <Link to="/jobs">My videos</Link>.
        </p>
      )}
    </div>
  )
}
