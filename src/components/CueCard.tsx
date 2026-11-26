import { useState } from 'react'
import type { Cue, CueFlag, CueRating, FeedbackApi } from '../lib/types'

interface Props {
  cue: Cue
  index: number
  hero?: boolean
  active?: boolean
  feedback?: FeedbackApi
  onShow: () => void
}

function fmtValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function label(key: string) {
  return key.replace(/_/g, ' ')
}

export function CueCard({ cue, index, hero, active, feedback, onShow }: Props) {
  const [details, setDetails] = useState(false)
  const [askWhy, setAskWhy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const current = feedback?.get(index)

  const save = async (patch: { rating?: CueRating | null; flag?: CueFlag | null }) => {
    if (!feedback) return
    setStatus('saving')
    try {
      await feedback.save(index, patch)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <article className={'cue-card' + (hero ? ' hero' : '') + (active ? ' active' : '')}>
      <div className="cue-head">
        <span className="cue-num" aria-hidden>{index + 1}</span>
        <span className="cue-cat">{cue.category}</span>
        <button type="button" className="link-btn" onClick={onShow}>
          Show me ▸
        </button>
      </div>
      {hero && <p className="eyebrow">Your top fix</p>}
      <h2 className="cue-title">{cue.title}</h2>
      <p className="cue-text">{cue.text}</p>

      <button type="button" className="link-btn details-toggle" aria-expanded={details} onClick={() => setDetails(!details)}>
        {details ? 'Hide details' : 'Details'}
      </button>
      {details && (
        <dl className="details">
          <dt>Confidence</dt>
          <dd>{Math.round(cue.confidence * 100)}%</dd>
          <dt>At</dt>
          <dd>{cue.time.toFixed(2)} s (frame {cue.frame})</dd>
          {Object.entries(cue.evidence ?? {}).map(([k, v]) => (
            <div key={k} className="details-row">
              <dt>{label(k)}</dt>
              <dd>{fmtValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {feedback && (
        <div className="feedback">
          <div className="feedback-row">
            <span className="feedback-q">Helpful?</span>
            <button
              type="button"
              className={'icon-btn' + (current?.rating === 'up' ? ' on' : '')}
              aria-pressed={current?.rating === 'up'}
              aria-label="Thumbs up"
              onClick={() => save({ rating: current?.rating === 'up' ? null : 'up' })}
            >
              👍
            </button>
            <button
              type="button"
              className={'icon-btn' + (current?.rating === 'down' ? ' on' : '')}
              aria-pressed={current?.rating === 'down'}
              aria-label="Thumbs down"
              onClick={() => save({ rating: current?.rating === 'down' ? null : 'down' })}
            >
              👎
            </button>
            <button type="button" className="link-btn wrong-btn" aria-expanded={askWhy} onClick={() => setAskWhy(!askWhy)}>
              {current?.flag ? 'Marked wrong ✓' : 'This cue is wrong'}
            </button>
          </div>
          {askWhy && (
            <div className="feedback-why" role="group" aria-label="What is wrong?">
              <button
                type="button"
                className={'chip' + (current?.flag === 'wrong_cue' ? ' on' : '')}
                aria-pressed={current?.flag === 'wrong_cue'}
                onClick={() => save({ flag: current?.flag === 'wrong_cue' ? null : 'wrong_cue' })}
              >
                The advice is wrong
              </button>
              <button
                type="button"
                className={'chip' + (current?.flag === 'wrong_fall_frame' ? ' on' : '')}
                aria-pressed={current?.flag === 'wrong_fall_frame'}
                onClick={() => save({ flag: current?.flag === 'wrong_fall_frame' ? null : 'wrong_fall_frame' })}
              >
                It picked the wrong fall moment
              </button>
            </div>
          )}
          <p className="feedback-status" aria-live="polite">
            {status === 'saving' && 'Saving…'}
            {status === 'saved' && 'Thanks — saved.'}
            {status === 'error' && <span className="err">Could not save. Check your connection, then tap again.</span>}
          </p>
        </div>
      )}
    </article>
  )
}
