import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBox, Spinner } from '../components/Layout'
import { TargetPicker } from '../components/TargetPicker'
import type { TargetHint } from '../lib/types'

/** The upload screen's target-hold tap step on the demo clip, without a backend. */
export function DemoTap() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<TargetHint | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}demo/video.mp4`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.blob()
      })
      .then((b) => !cancelled && setFile(new File([b], 'demo.mp4', { type: 'video/mp4' })))
      .catch(() => !cancelled && setError('Could not load the demo video. Reload the page.'))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorBox message={error} />
  if (!file) return <Spinner label="Loading demo video…" />
  return (
    <div className="stack narrow">
      <div className="banner info">
        Demo of the upload screen’s “tap the hold” step. <Link to="/demo">Back to the demo result</Link>
      </div>
      <div className="card">
        <span className="field-label">Tap the hold you were going for</span>
        <TargetPicker file={file} value={target} onChange={setTarget} />
        <p className="muted small" data-testid="target-hint">
          target_hint = {target ? JSON.stringify(target) : 'null'}
        </p>
        {target && (
          <button type="button" className="btn small ghost" onClick={() => setTarget(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
