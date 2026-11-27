import type { WallHint } from '../lib/types'

/** Degrees from vertical: negative = leans away from you (slab), positive = leans over you. */
export const MIN_DEG = -30
export const MAX_DEG = 90
export const STEP_DEG = 5

/** The user's answer: an angle, or 'guess' (let AI guess). null = not answered yet (required). */
export type WallAnswer = number | 'guess' | null

interface Band {
  hint: WallHint
  name: string
  from: number
  to: number
}

const BANDS: Band[] = [
  { hint: 'slab', name: 'Slab', from: MIN_DEG, to: -5 },
  { hint: 'vertical', name: 'Vertical', from: -4, to: 4 },
  { hint: 'overhang', name: 'Slight overhang', from: 5, to: 24 },
  { hint: 'overhang', name: 'Overhang', from: 25, to: 49 },
  { hint: 'overhang', name: 'Steep overhang', from: 50, to: 69 },
  { hint: 'roof', name: 'Roof', from: 70, to: MAX_DEG },
]

// eslint-disable-next-line react-refresh/only-export-components
export function bandFor(deg: number): Band {
  return BANDS.find((b) => deg >= b.from && deg <= b.to) ?? BANDS[1]
}

/** The "Let AI guess" choice, shared by wall angle and hold color. */
export function GuessChip({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={'chip guess-chip' + (on ? ' on' : '')}
      disabled={disabled}
      onClick={onClick}
    >
      Let AI guess <span className="guess-cost">(decreases accuracy)</span>
    </button>
  )
}

interface Props {
  value: WallAnswer
  onChange: (v: WallAnswer) => void
  disabled?: boolean
  /** Shown under the band name when the value came from the user's last upload. */
  remembered?: boolean
}

const DEFAULT_DEG = 10 // where the slider sits before the first answer
const LAST_KEY = 'mb.lastWallDeg'

/** The user's last wall angle on this device, or null. */
// eslint-disable-next-line react-refresh/only-export-components
export function readLastWallDeg(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_KEY))
    return localStorage.getItem(LAST_KEY) != null && Number.isFinite(v) && v >= MIN_DEG && v <= MAX_DEG ? v : null
  } catch {
    return null
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function saveLastWallDeg(deg: number) {
  try {
    localStorage.setItem(LAST_KEY, String(deg))
  } catch {
    /* private mode: nothing to remember */
  }
}

/** Wall angle in 5° steps, drawn like a board-angle picker. Required: an angle or "Let AI guess". */
export function WallAngle({ value, onChange, disabled, remembered }: Props) {
  const set = typeof value === 'number'
  const guess = value === 'guess'
  const deg = set ? value : DEFAULT_DEG
  const band = bandFor(deg)

  // Drawing: floor, a short kicker, then the wall panel hinged at the kicker's top.
  // 0° = straight up; +90° = flat above (roof); negative = leaning back (slab).
  const rad = (deg * Math.PI) / 180
  const px = 70
  const py = 110 // kicker top (hinge)
  const fy = 128 // floor
  const len = 96
  const ex = px + len * Math.sin(rad)
  const ey = py - len * Math.cos(rad)
  const pct = ((deg - MIN_DEG) / (MAX_DEG - MIN_DEG)) * 100
  const ticks = (MAX_DEG - MIN_DEG) / STEP_DEG + 1

  return (
    <div className={'wall-angle' + (set ? '' : ' unset')}>
      <div className="row between">
        <label htmlFor="wall-deg" className="field-label">Wall angle</label>
        <span className="req small">Required</span>
      </div>

      <svg viewBox="0 0 220 140" className="wall-pic" aria-hidden>
        <line x1={px} y1={fy} x2={px} y2={14} className="wall-ref" />
        <line x1={px - 30} y1={fy} x2={208} y2={fy} className="wall-floor" />
        <polyline points={`${px},${fy} ${px},${py} ${ex},${ey}`} className="wall-line" />
      </svg>

      <p className="wall-deg-big" aria-live="polite">
        {guess ? 'AI' : set ? `${deg}°` : '—'}
      </p>
      <p className="wall-name">{guess ? 'AI will guess the angle' : set ? band.name : 'Drag to set the angle'}</p>
      {set && remembered && <p className="muted small center-text">Same as your last video</p>}

      <input
        id="wall-deg"
        type="range"
        min={MIN_DEG}
        max={MAX_DEG}
        step={STEP_DEG}
        value={deg}
        disabled={disabled}
        aria-valuetext={set ? `${deg} degrees, ${band.name}` : 'Not set'}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => !set && onChange(deg)}
        className="range-dots"
        style={{ ['--pct' as string]: `${set ? pct : 0}%`, ['--ticks' as string]: ticks }}
      />
      <div className="range-ends small muted" aria-hidden>
        <span>−30° slab</span>
        <span>90° roof</span>
      </div>

      <div role="radiogroup" aria-label="Or">
        <GuessChip on={guess} disabled={disabled} onClick={() => onChange(guess ? null : 'guess')} />
      </div>
    </div>
  )
}
