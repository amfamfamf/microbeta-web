import { useRef } from 'react'
/** A cue marker: `index` = the cue's position in the cue list (shown as its number). */
export interface Marker {
  index: number
  time: number
  title: string
}

interface Props {
  time: number
  /** Play window in seconds (the auto-trim, or the whole clip). Times shown are clip times. */
  start: number
  end: number
  /** Only markers inside start..end are drawn. */
  markers: Marker[]
  fallTime: number | null
  activeCue: number
  onSeek: (t: number) => void
  onCue: (index: number, time: number) => void
}

function pctIn(t: number, start: number, end: number) {
  const d = end - start
  return d > 0 ? Math.max(0, Math.min(100, ((t - start) / d) * 100)) : 0
}

function fmt(t: number) {
  const s = Math.max(0, t)
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

export function Scrubber({ time, start, end, markers, fallTime, activeCue, onSeek, onCue }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const duration = end - start
  const pct = (t: number) => pctIn(t, start, end)
  const dragging = useRef(false)
  const shown = markers.filter((m) => m.time >= start - 0.01 && m.time <= end + 0.01)

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    onSeek(start + f * duration)
  }

  return (
    <div className="scrubber">
      <div className="scrubber-markers" aria-label="Cue markers">
        {shown.map((m) => (
          <button
            key={`${m.index}@${m.time}`}
            type="button"
            className={'cue-marker' + (m.index === activeCue ? ' active' : '')}
            style={{ left: `clamp(16px, ${pct(m.time)}%, calc(100% - 16px))` }}
            onClick={() => onCue(m.index, m.time)}
            aria-label={`Cue ${m.index + 1}: ${m.title}, at ${fmt(m.time)}`}
          >
            {m.index + 1}
          </button>
        ))}
      </div>
      <div
        ref={trackRef}
        className="scrubber-track"
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={Math.round(start * 10) / 10}
        aria-valuemax={Math.round(end * 10) / 10}
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
          if (e.key === 'ArrowRight') onSeek(Math.min(end, time + step))
          if (e.key === 'ArrowLeft') onSeek(Math.max(start, time - step))
        }}
      >
        <div className="scrubber-rail" />
        <div className="scrubber-fill" style={{ width: `${pct(time)}%` }} />
        {fallTime != null && fallTime >= start && fallTime <= end && (
          <div className="scrubber-fall" style={{ left: `${pct(fallTime)}%` }} title="Fall" />
        )}
        {shown.map((m) => (
          <div key={`${m.index}@${m.time}`} className="scrubber-tick" style={{ left: `${pct(m.time)}%` }} />
        ))}
        <div className="scrubber-thumb" style={{ left: `${pct(time)}%` }} />
      </div>
      <div className="scrubber-times">
        <span>{fmt(time)}</span>
        {fallTime != null && <span className="fall-label">▼ fall {fmt(fallTime)}</span>}
        <span>{fmt(end)}</span>
      </div>
    </div>
  )
}
