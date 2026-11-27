import type { WallHint } from '../lib/types'

/** Degrees from vertical: negative = leans away from you (slab), positive = leans over you. */
export const MIN_DEG = -30
export const MAX_DEG = 90

interface Band {
  hint: WallHint
  name: string
  from: number
  to: number
  note: string
}

const BANDS: Band[] = [
  { hint: 'slab', name: 'Slab', from: MIN_DEG, to: -5, note: 'Leans away from you. Weight on your feet.' },
  { hint: 'vertical', name: 'Vertical', from: -4, to: 4, note: 'Straight up and down.' },
  { hint: 'overhang', name: 'Slight overhang', from: 5, to: 24, note: 'Leans over you a little.' },
  { hint: 'overhang', name: 'Overhang', from: 25, to: 49, note: 'Steep. Keep your hips close to the wall.' },
  { hint: 'overhang', name: 'Steep overhang', from: 50, to: 69, note: 'Very steep. Toes pull to keep feet on.' },
  { hint: 'roof', name: 'Roof', from: 70, to: MAX_DEG, note: 'Almost flat above you.' },
]

// eslint-disable-next-line react-refresh/only-export-components
export function bandFor(deg: number): Band {
  return BANDS.find((b) => deg >= b.from && deg <= b.to) ?? BANDS[1]
}

// Each label sits at a typical angle of its band.
const TICKS: [string, number][] = [
  ['Slab', MIN_DEG],
  ['Vertical', 0],
  ['Overhang', 35],
  ['Roof', MAX_DEG],
]

interface Props {
  value: number | null
  onChange: (deg: number | null) => void
  disabled?: boolean
}

/** Wall angle as a degree slider. Untouched (null) = let the app guess. */
export function WallAngle({ value, onChange, disabled }: Props) {
  const deg = value ?? 0
  const band = bandFor(deg)
  // Wall drawing: the wall pivots around its middle; the climber (COG dot) sits on the climbing side.
  // 0° = vertical, +90° = roof (wall flat above the climber), negative = slab.
  const rad = (deg * Math.PI) / 180
  const mx = 60
  const my = 44
  const half = 34
  const tx = mx + half * Math.sin(rad)
  const ty = my - half * Math.cos(rad)
  const bx = mx - half * Math.sin(rad)
  const by = my + half * Math.cos(rad)
  const cx = mx + 16 * Math.cos(rad)
  const cy = my + 16 * Math.sin(rad)
  return (
    <div className="wall-angle">
      <div className="row between">
        <label htmlFor="wall-deg" className="field-label">Wall angle</label>
        {value == null ? (
          <span className="muted small">Optional</span>
        ) : (
          <button type="button" className="link-btn" disabled={disabled} onClick={() => onChange(null)}>
            Let the app guess
          </button>
        )}
      </div>
      <div className={'wall-readout' + (value == null ? ' unset' : '')} aria-live="polite">
        <svg viewBox="0 0 120 92" width="96" height="74" aria-hidden className="wall-pic">
          <line x1={bx} y1={by} x2={tx} y2={ty} className="wall-line" />
          <line x1={cx} y1={cy + 5} x2={cx} y2={88} className="wall-plumb" />
          <circle cx={cx} cy={cy} r="5" className="wall-cog" />
        </svg>
        <div>
          <p className="wall-name">{value == null ? 'Let the app guess' : band.name}</p>
          <p className="wall-deg">
            {value == null ? 'Drag to set the angle' : `${deg > 0 ? '+' : ''}${deg}° ${deg === 0 ? '' : deg < 0 ? 'past vertical, away' : 'past vertical, over you'}`}
          </p>
          {value != null && <p className="muted small">{band.note}</p>}
        </div>
      </div>
      <input
        id="wall-deg"
        type="range"
        min={MIN_DEG}
        max={MAX_DEG}
        step={1}
        value={deg}
        disabled={disabled}
        aria-valuetext={value == null ? 'Not set' : `${deg} degrees, ${band.name}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className={'range' + (value == null ? ' unset' : '')}
      />
      <div className="range-ticks small muted" aria-hidden>
        {TICKS.map(([label, at]) => (
          <span key={label} style={{ left: `${((at - MIN_DEG) / (MAX_DEG - MIN_DEG)) * 100}%` }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
