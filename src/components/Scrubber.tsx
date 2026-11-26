import { useRef } from 'react'
import type { Cue } from '../lib/types'

interface Props {
  time: number
  duration: number
  cues: Cue[]
  fallTime: number | null
  activeCue: number
  onSeek: (t: number) => void
  onCue: (index: number) => void
}

function pct(t: number, d: number) {
  return d > 0 ? Math.max(0, Math.min(100, (t / d) * 100)) : 0
}

function fmt(t: number) {
  const s = Math.max(0, t)
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

export function Scrubber({ time, duration, cues, fallTime, activeCue, onSeek, onCue }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    onSeek(f * duration)
  }

  return (
    <div className="scrubber">
      <div className="scrubber-markers" aria-label="Cue markers">
        {cues.map((c, i) => (
          <button
            key={i}
            type="button"
            className={'cue-marker' + (i === activeCue ? ' active' : '')}
            style={{ left: `clamp(16px, ${pct(c.time, duration)}%, calc(100% - 16px))` }}
            onClick={() => onCue(i)}
            aria-label={`Cue ${i + 1}: ${c.title}, at ${fmt(c.time)}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div
        ref={trackRef}
        className="scrubber-track"
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(time * 10) / 10}
        aria-valuetext={fmt(time)}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && seekFromEvent(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 1 / 30
          if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + step))
          if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - step))
        }}
      >
        <div className="scrubber-rail" />
        <div className="scrubber-fill" style={{ width: `${pct(time, duration)}%` }} />
        {fallTime != null && (
          <div className="scrubber-fall" style={{ left: `${pct(fallTime, duration)}%` }} title="Fall" />
        )}
        {cues.map((c, i) => (
          <div key={i} className="scrubber-tick" style={{ left: `${pct(c.time, duration)}%` }} />
        ))}
        <div className="scrubber-thumb" style={{ left: `${pct(time, duration)}%` }} />
      </div>
      <div className="scrubber-times">
        <span>{fmt(time)}</span>
        {fallTime != null && <span className="fall-label">▼ fall {fmt(fallTime)}</span>}
        <span>{fmt(duration)}</span>
      </div>
    </div>
  )
}
