import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AddVideo } from '../components/AddVideo'
import { bandFor, WallAngle } from '../components/WallAngle'
import { ErrorBox } from '../components/Layout'
import { startJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { MAX_BYTES, MAX_SECONDS } from '../lib/env'
import { requireSupabase } from '../lib/supabase'
import { TargetPicker } from '../components/TargetPicker'
import type { HoldColor, TargetHint } from '../lib/types'
import { extensionFor, readDuration, UploadAborted, uploadResumable } from '../lib/upload'

type Phase = 'pick' | 'creating' | 'uploading' | 'starting' | 'error'


// Swatch colors are for the picker only (hold colors, not brand colors). Every chip also has its name.
const HOLD_COLORS: { value: HoldColor; label: string; swatch: string }[] = [
  { value: 'red', label: 'Red', swatch: '#D7263D' },
  { value: 'orange', label: 'Orange', swatch: '#F28C28' },
  { value: 'yellow', label: 'Yellow', swatch: '#F5D000' },
  { value: 'green', label: 'Green', swatch: '#2FA84F' },
  { value: 'blue', label: 'Blue', swatch: '#2563EB' },
  { value: 'purple', label: 'Purple', swatch: '#7C3AED' },
  { value: 'pink', label: 'Pink', swatch: '#EC4899' },
  { value: 'black', label: 'Black', swatch: '#111111' },
  { value: 'white', label: 'White', swatch: '#FFFFFF' },
  { value: 'grey', label: 'Grey', swatch: '#8A8F98' },
]

export function Upload() {
  const { session } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [file, setFile] = useState<File | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [wallDeg, setWallDeg] = useState<number | null>(null)
  const [holdColor, setHoldColor] = useState<HoldColor | null>(null)
  const [target, setTarget] = useState<TargetHint | null>(null)
  const [targetSkipped, setTargetSkipped] = useState(false)
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
    setTargetSkipped(false)
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

  const run = async () => {
    if (!file || !session) return
    const sb = requireSupabase()
    setError(null)
    try {
      // 1. Create the job row (once; a retry reuses it).
      if (!jobRef.current) {
        setPhase('creating')
        const id = crypto.randomUUID()
        const path = `${session.user.id}/${id}/original.${extensionFor(file)}`
        const { error: insErr } = await sb.from('jobs').insert({
          id,
          user_id: session.user.id,
          status: 'uploaded',
          video_path: path,
          wall_hint: wallDeg == null ? null : bandFor(wallDeg).hint,
          wall_angle_deg: wallDeg,
          target_hint: target,
          hold_color: holdColor,
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

  return (
    <div className="stack narrow">
      <h1>Upload a fall</h1>

      <div className="card">
        <AddVideo
          onPick={pick}
          label={file ? 'Change video' : 'Add video'}
          variant={file ? 'ghost' : 'primary'}
          disabled={busy || hasJob}
        />
        <p className="muted small">Up to 60 seconds and 200 MB.</p>
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
        <div className="card">
          <div className="row between">
            <span className="field-label">Tap the hold you were going for</span>
            <span className="muted small">Optional</span>
          </div>
          {targetSkipped ? (
            <p className="muted small">
              Skipped — the app will find the hold itself.{' '}
              <button type="button" className="link-btn" disabled={busy || hasJob} onClick={() => setTargetSkipped(false)}>
                Tap it instead
              </button>
            </p>
          ) : (
            <>
              <p className="muted small">This helps the app find the right hold and its color. Tap again to move it.</p>
              <TargetPicker file={file} value={target} onChange={setTarget} disabled={busy || hasJob} />
              <div className="row">
                {target && (
                  <button type="button" className="btn small ghost" disabled={busy || hasJob} onClick={() => setTarget(null)}>
                    Clear
                  </button>
                )}
                {!target && (
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy || hasJob}
                    onClick={() => {
                      setTarget(null)
                      setTargetSkipped(true)
                    }}
                  >
                    Skip
                  </button>
                )}
                {target && <span className="ok small">✓ Hold marked</span>}
              </div>
            </>
          )}
        </div>
      )}

      <fieldset className="card hold-colors" disabled={busy || hasJob}>
        <div className="row between">
          <legend className="field-label">Hold color</legend>
          <span className="muted small">Optional</span>
        </div>
        <p className="muted small">The color of the holds on your problem. It helps the app find them.</p>
        <div className="chip-row" role="radiogroup" aria-label="Hold color">
          {HOLD_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={holdColor === c.value}
              className={'chip color-chip' + (holdColor === c.value ? ' on' : '')}
              onClick={() => setHoldColor(holdColor === c.value ? null : c.value)}
            >
              <i className="swatch" style={{ background: c.swatch }} aria-hidden />
              {c.label}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={holdColor === null}
            className={'chip' + (holdColor === null ? ' on' : '')}
            onClick={() => setHoldColor(null)}
          >
            Not sure
          </button>
        </div>
      </fieldset>

      <div className="card">
        <WallAngle value={wallDeg} onChange={setWallDeg} disabled={busy || hasJob} />
      </div>

      <p className="privacy small">
        🔒 Your video is private. Only you can see it, unless you share a link. We use it only to make your results.
        The raw video is deleted after 30 days.
      </p>

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

      {file && (
        <button type="button" className="btn wide" disabled={busy} onClick={run}>
          {phase === 'error' ? 'Try again' : 'Upload and analyze'}
        </button>
      )}
      {hasJob && phase === 'error' && (
        <p className="muted small">
          Your job is saved. You can also retry from <Link to="/jobs">My videos</Link>.
        </p>
      )}
    </div>
  )
}
