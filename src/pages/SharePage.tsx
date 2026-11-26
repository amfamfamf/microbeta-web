import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, NotConfigured, Spinner } from '../components/Layout'
import { ResultView } from '../components/ResultView'
import { ApiError, fetchJson, fetchShare } from '../lib/api'
import { isConfigured } from '../lib/env'
import type { FeaturesJson, ResultJson } from '../lib/types'

export function SharePage() {
  const { token = '' } = useParams()
  const [data, setData] = useState<{ result: ResultJson; features: FeaturesJson; videoUrl: string } | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    ;(async () => {
      const share = await fetchShare(token)
      const features = await fetchJson<FeaturesJson>(share.features_url, 'overlay data')
      if (!cancelled) setData({ result: share.result, features, videoUrl: share.video_url })
    })().catch((e: Error) => {
      if (!cancelled) setError({ status: e instanceof ApiError ? e.status : 0, message: e.message })
    })
    return () => {
      cancelled = true
    }
  }, [token, nonce])

  if (!isConfigured) return <NotConfigured />
  if (error) {
    const gone = error.status === 404 || error.status === 410
    return (
      <div className="stack narrow">
        <h1>{error.status === 410 ? 'Link expired' : error.status === 404 ? 'Link not found' : 'Could not load'}</h1>
        <ErrorBox message={error.message} onRetry={
            gone
              ? undefined
              : () => {
                  setError(null)
                  setNonce((n) => n + 1)
                }
          } />
        <Link className="btn ghost" to="/">What is Micro-Beta?</Link>
      </div>
    )
  }
  if (!data) return <Spinner label="Loading shared result…" />
  return (
    <div className="stack">
      <p className="muted small">Shared result · read-only</p>
      <ResultView result={data.result} features={data.features} videoUrl={data.videoUrl} />
      <Link className="btn ghost" to="/">Analyze your own fall</Link>
    </div>
  )
}
