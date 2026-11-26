import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorBox, Spinner } from '../components/Layout'
import { ResultView } from '../components/ResultView'
import { fetchJson } from '../lib/api'
import type { FeaturesJson, ResultJson } from '../lib/types'

/** Result view on a local fixture. `#/demo?empty=1` shows the no-cue state. */
export function Demo() {
  const [params] = useSearchParams()
  const empty = params.get('empty') === '1'
  const [data, setData] = useState<{ result: ResultJson; features: FeaturesJson } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `${import.meta.env.BASE_URL}demo/`

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchJson<ResultJson>(`${base}${empty ? 'result-empty.json' : 'result.json'}`, 'demo result'),
      fetchJson<FeaturesJson>(`${base}features.json`, 'demo overlay data'),
    ])
      .then(([result, features]) => !cancelled && setData({ result, features }))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [base, empty])

  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading demo…" />
  return (
    <div className="stack">
      <div className="banner info">
        Demo: a synthetic 3-second clip of a stick-figure climber.{' '}
        {empty ? <Link to="/demo">Show the version with cues</Link> : <Link to="/demo?empty=1">Show the “no cue” version</Link>}
      </div>
      <ResultView result={data.result} features={data.features} videoUrl={`${base}video.mp4`} />
    </div>
  )
}
