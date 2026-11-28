import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { drawOverlay, frameAt, layersFor, type Layer } from '../lib/overlay'
import type { FeaturesJson, FeedbackApi, ResultJson } from '../lib/types'
import { CueCard } from './CueCard'
import { Scrubber } from './Scrubber'

interface Props {
  result: ResultJson
  features: FeaturesJson
  videoUrl: string
  /** Absent = read-only (share page, demo). */
  feedback?: FeedbackApi
  /** Extra actions under the video, e.g. the Share button. */
  actions?: ReactNode
}

type VideoWithVfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const FALL_KIND: Record<string, string> = {
  hand_off: 'Hand came off',
  foot_cut_then_off: 'Feet cut, then hands came off',
  swing_off: 'Swung off',
  barn_door: 'Barn-door',
  short_reach: 'Came up short on the reach',
}

export function ResultView({ result, features, videoUrl, feedback, actions }: Props) {
  const videoRef = useRef<VideoWithVfc>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(result.duration || features.keypoints.length / features.fps)
  const [playing, setPlaying] = useState(false)
  const [overlayOn, setOverlayOn] = useState(true)
  const [activeCue, setActiveCue] = useState(0)
  const [videoError, setVideoError] = useState(false)
  // Auto-trim (v1.4): play only from just before leaving the ground to just after landing, unless "Show full video".
  const [full, setFull] = useState(false)
  const trim = result.trim
  const trimmed = Boolean(trim && (trim.start > 0.05 || trim.end < duration - 0.05))
  const lo = trimmed && !full ? trim!.start : 0
  const hi = trimmed && !full ? Math.min(trim!.end, duration) : duration

  // Latest values for the paint loop without re-subscribing it.
  const layers = useMemo(() => layersFor(result.cues[activeCue]), [result, activeCue])
  const live = useRef({ result, features, overlayOn, layers, lo, hi })
  useEffect(() => {
    live.current = { result, features, overlayOn, layers, lo, hi }
  })

  const paint = useCallback((t: number) => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const { features: f, result: r, overlayOn: on, layers: ls } = live.current
    const dpr = window.devicePixelRatio || 1
    const cssW = box.clientWidth
    const cssH = box.clientHeight
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!on || !cssW) return
    ctx.setTransform((w / f.width), 0, 0, (h / f.height), 0, 0)
    drawOverlay(ctx, f, r, frameAt(t, f), f.width / cssW, ls)
  }, [])

  // Frame-accurate sync: repaint once per video frame (see the two clocks below).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let stopped = false
    let vfc = 0
    let raf = 0
    let lastFrame = -1
    const fpsOf = () => live.current.features.fps || 30
    // Stop at the end of the play window (the file itself is not cut). If a slow timer let it run past, step back.
    const atEnd = (t: number) => {
      const { hi } = live.current
      if (v.paused || hi >= v.duration - 0.05 || t < hi - 0.01) return false
      v.pause()
      if (t > hi + 0.02) v.currentTime = hi
      return t > hi + 0.02
    }
    const onTimeUpdate = () => atEnd(v.currentTime)
    const tick = (t: number, force = false) => {
      if (atEnd(t)) return
      const frame = Math.floor(t * fpsOf() + 0.01)
      if (!force && frame === lastFrame) return
      lastFrame = frame
      paint(t)
      setTime(t)
    }
    // Two clocks. requestVideoFrameCallback gives the exact time of each frame the browser shows. Some phones
    // (iPhone Safari, Low Power Mode) skip those callbacks, which left the skeleton still on every other frame,
    // so an animation-frame loop also repaints whenever the frame under currentTime changes.
    if (typeof v.requestVideoFrameCallback === 'function') {
      const cb = (_now: number, meta: { mediaTime: number }) => {
        if (stopped) return
        tick(meta.mediaTime)
        vfc = v.requestVideoFrameCallback!(cb)
      }
      vfc = v.requestVideoFrameCallback(cb)
    }
    const loop = () => {
      if (stopped) return
      if (!v.paused) tick(v.currentTime)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onSeeked = () => tick(v.currentTime, true)
    const onLoaded = () => {
      if (v.currentTime < live.current.lo) v.currentTime = live.current.lo
      tick(v.currentTime, true)
    }
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('loadeddata', onLoaded)
    const ro = new ResizeObserver(() => paint(v.currentTime))
    if (boxRef.current) ro.observe(boxRef.current)
    return () => {
      stopped = true
      if (vfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfc)
      cancelAnimationFrame(raf)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('loadeddata', onLoaded)
      ro.disconnect()
    }
  }, [paint, videoUrl])

  useEffect(() => {
    paint(videoRef.current?.currentTime ?? 0)
  }, [overlayOn, layers, paint])

  const seek = (t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(lo, Math.min(t, hi))
    setTime(v.currentTime)
  }

  // Switching between trimmed and full: keep the playhead inside the new window.
  useEffect(() => {
    const v = videoRef.current
    if (v && (v.currentTime < lo || v.currentTime > hi)) v.currentTime = lo
  }, [lo, hi])

  const showCue = (i: number) => {
    setActiveCue(i)
    videoRef.current?.pause()
    const t = result.cues[i].time
    if (t < lo || t > hi) {
      setFull(true) // a cue outside the trimmed window: show the whole clip
      if (videoRef.current) videoRef.current.currentTime = t
    } else seek(t)
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.ended || v.currentTime >= hi - 0.02 || v.currentTime < lo) v.currentTime = lo
      v.play().catch(() => setVideoError(true))
    } else v.pause()
  }

  const [top, ...rest] = result.cues
  const aspect = `${features.width} / ${features.height}`

  return (
    <div className="result">
      {result.safety_note && (
        <div className="banner warn" role="note">
          <strong>Safety:</strong> {result.safety_note}
        </div>
      )}

      {(result.warnings?.length ?? 0) > 0 && (
        <div className="banner info tips" role="note" aria-label="Filming tips">
          {result.warnings!.map((w, i) => (
            <p key={i} className="tip">
              <span aria-hidden>💡</span>
              <span>
                <strong>Filming tip:</strong> {w}
              </span>
            </p>
          ))}
        </div>
      )}

      {top ? (
        <CueCard cue={top} index={0} hero active={activeCue === 0} feedback={feedback} onShow={() => showCue(0)} />
      ) : (
        <article className="cue-card hero">
          <p className="eyebrow">No cue this time</p>
          <p className="cue-text">{result.no_cue_reason ?? 'The app did not find a clear fix in this clip.'}</p>
          <p className="muted small">Tip: film again with your whole body and the target hold in frame.</p>
        </article>
      )}

      <div className="player" style={{ maxWidth: `calc(62vh * ${features.width / features.height})` }}>
        <div className="video-box" ref={boxRef} style={{ aspectRatio: aspect }}>
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            muted
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
            onError={() => setVideoError(true)}
            onClick={togglePlay}
          />
          <canvas ref={canvasRef} className="overlay" aria-hidden />
          {videoError && (
            <div className="video-error">
              The video did not load. The link may have expired. Reload the page to get a new one.
            </div>
          )}
        </div>

        <div className="controls">
          <button type="button" className="btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <label className="toggle">
            <input type="checkbox" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} />
            <span>Overlay</span>
          </label>
        </div>

        <Scrubber
          time={time}
          start={lo}
          end={hi}
          cues={result.cues}
          fallTime={result.fall?.time ?? null}
          activeCue={activeCue}
          onSeek={(t) => {
            videoRef.current?.pause()
            seek(t)
          }}
          onCue={showCue}
        />
        {trimmed && (
          <button type="button" className="link-btn small trim-toggle" onClick={() => setFull((x) => !x)}>
            {full ? 'Show just the climb' : 'Show full video'}
          </button>
        )}
        {overlayOn && <Legend layers={layers} tapped={result.holds?.tapped_id != null && layers.has('reach')} />}
      </div>

      {actions && <div className="result-actions">{actions}</div>}

      {rest.length > 0 && (
        <section className="more-cues">
          <h3>Also worth trying</h3>
          {rest.map((c, j) => (
            <CueCard
              key={j + 1}
              cue={c}
              index={j + 1}
              active={activeCue === j + 1}
              feedback={feedback}
              onShow={() => showCue(j + 1)}
            />
          ))}
        </section>
      )}

      <details className="analysis-details">
        <summary>Analysis details</summary>
        <dl className="details">
          {result.fall ? (
            <>
              <dt>Fall</dt>
              <dd>{FALL_KIND[result.fall.kind] ?? result.fall.kind}</dd>
              <dt>Fall time</dt>
              <dd>{result.fall.time.toFixed(2)} s (frame {result.fall.frame}, drop {result.fall.drop_frame})</dd>
              <dt>Fall confidence</dt>
              <dd>{Math.round(result.fall.confidence * 100)}%</dd>
            </>
          ) : (
            <>
              <dt>Fall</dt>
              <dd>Not found</dd>
            </>
          )}
          <dt>Wall</dt>
          <dd>
            {result.wall.class} ({result.wall.source === 'inferred' ? `guessed, ${Math.round(result.wall.confidence * 100)}%` : 'from your choice'})
          </dd>
          <dt>Target hold</dt>
          <dd>
            {result.target_hold ? `#${result.target_hold.id}` : 'Not found'}
            {result.holds?.tapped_id != null && ` (you tapped #${result.holds.tapped_id})`}
          </dd>
          {result.camera && (
            <>
              <dt>Camera</dt>
              <dd>
                {result.camera.max_shift_px == null
                  ? 'Not checked (plain wall)'
                  : `${result.camera.moved ? 'Moved' : 'Steady'} (shift ${result.camera.max_shift_px.toFixed(1)} px)`}
              </dd>
            </>
          )}
        </dl>
      </details>
    </div>
  )
}

function Legend({ layers, tapped }: { layers: Set<Layer>; tapped: boolean }) {
  const angles = (['elbow', 'knee', 'hip'] as const).filter((j) => layers.has(j))
  const ANGLE_NAME = { elbow: 'Elbow', knee: 'Knee', hip: 'Hip (thigh to body)' }
  return (
    <ul className="legend" aria-label="Overlay legend">
      <li><i className="sw cog" />Center of gravity + last 1 s</li>
      {layers.has('plumb') && <li><i className="sw plumb" />Straight down from center</li>}
      {layers.has('reach') && <li><i className="sw reach" />Reach to target hold</li>}
      {tapped && <li><i className="sw tapped" />Hold you tapped</li>}
      {angles.length > 0 && (
        <li><i className="sw angle" />{angles.map((j) => ANGLE_NAME[j]).join(', ')} angle (180° = straight)</li>
      )}
    </ul>
  )
}
