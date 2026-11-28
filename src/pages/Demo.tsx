import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorBox, Spinner } from '../components/Layout'
import { ResultView } from '../components/ResultView'
import { fetchJson } from '../lib/api'
import type { FeaturesJson, ResultJson } from '../lib/types'

/**
 * Result view on a local fixture. `#/demo?empty=1` shows the no-cue state.
 * `#/demo?legacy=1` drops the v1.5 attempt fields to check the single-attempt path used by older results.
 */
export function Demo() {
  const [params] = useSearchParams()
  const empty = params.get('empty') === '1'
  const legacy = params.get('legacy') === '1'
  const [data, setData] = useState<{ result: ResultJson; features: FeaturesJson } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `${import.meta.env.BASE_URL}demo/`

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchJson<ResultJson>(`${base}${empty ? 'result-empty.json' : 'result.json'}`, 'demo result'),
      fetchJson<FeaturesJson>(`${base}features.json`, 'demo overlay data'),
    ])
      .then(([result, features]) => !cancelled && setData({ result: legacy ? stripV15(result) : result, features }))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [base, empty, legacy])

  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading demo…" />
  return (
    <div className="stack">
      <div className="banner info">
        Demo: a synthetic 6-second clip of a stick-figure climber with two attempts.{' '}
        {empty ? <Link to="/demo">Show the version with cues</Link> : <Link to="/demo?empty=1">Show the “no cue” version</Link>}{' · '}
        <Link to="/demo/tap">Try the tap-the-hold step</Link>
      </div>
      <ResultView result={data.result} features={data.features} videoUrl={`${base}video.mp4`} />
    </div>
  )
}

function stripV15(r: ResultJson): ResultJson {
  const top = r.attempts?.[r.cues[0]?.attempt ?? 0]
  return {
    ...r,
    attempts: undefined,
    cues: (top?.cues ?? r.cues).map((c) => ({ ...c, attempt: undefined, occurrences: undefined })),
  }
}
