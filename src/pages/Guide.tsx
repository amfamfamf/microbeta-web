import { useNavigate } from 'react-router-dom'

const KEY = 'mb.guideSeen'

// eslint-disable-next-line react-refresh/only-export-components
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function Guide() {
  const nav = useNavigate()
  const done = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: show the guide again next time */
    }
    nav('/upload')
  }
  return (
    <div className="stack narrow">
      <h1>How to film</h1>
      <p className="muted">Good video = better cues. Takes 10 seconds to set up.</p>
      <ul className="guide">
        <li>
          <span className="gi" aria-hidden>📱</span>
          <div>
            <strong>Keep the phone still.</strong> Use a tripod, a bag or a friend with steady hands. No panning or zoom.
          </div>
        </li>
        <li>
          <span className="gi" aria-hidden>📐</span>
          <div>
            <strong>Head-on is fine. 45° is better.</strong> Stand off to one side so the app sees how far your hips are
            from the wall.
          </div>
        </li>
        <li>
          <span className="gi" aria-hidden>🧍</span>
          <div>
            <strong>Whole body and the target hold in frame.</strong> Feet to fingertips, and the hold you fell going
            for.
          </div>
        </li>
        <li>
          <span className="gi" aria-hidden>💡</span>
          <div>
            <strong>Good light.</strong> Avoid filming into bright windows or lamps.
          </div>
        </li>
        <li>
          <span className="gi" aria-hidden>⏱️</span>
          <div>
            <strong>Short clip.</strong> Up to 60 seconds. Start just before the hard move.
          </div>
        </li>
      </ul>
      <button type="button" className="btn" onClick={done}>
        Got it — upload a video
      </button>
    </div>
  )
}
