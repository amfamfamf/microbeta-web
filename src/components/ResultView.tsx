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

const RATES = [1, 0.5, 0.25]

export function ResultView({ result, features, videoUrl, feedback, actions }: Props) {
  const videoRef = useRef<VideoWithVfc>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(result.duration || features.keypoints.length / features.fps)
  const [playing, setPlaying] = useState(false)
  const [overlayOn, setOverlayOn] = useState(true)
  const [rateIdx, setRateIdx] = useState(0)
  const [activeCue, setActiveCue] = useState(0)
  const [videoError, setVideoError] = useState(false)

  // Latest values for the paint loop without re-subscribing it.
  const layers = useMemo(() => layersFor(result.cues[activeCue]), [result, activeCue])
  const live = useRef({ result, features, overlayOn, layers })
  useEffect(() => {
    live.current = { result, features, overlayOn, layers }
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

  // Frame-accurate sync: requestVideoFrameCallback when available, else requestAnimationFrame.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let stopped = false
    let vfc = 0
    let raf = 0
    const tick = (t: number) => {
      paint(t)
      setTime(t)
    }
    if (typeof v.requestVideoFrameCallback === 'function') {
      const cb = (_now: number, meta: { mediaTime: number }) => {
        if (stopped) return
        tick(meta.mediaTime)
        vfc = v.requestVideoFrameCallback!(cb)
      }
      vfc = v.requestVideoFrameCallback(cb)
    } else {
      const loop = () => {
        if (stopped) return
        tick(v.currentTime)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    const onSeeked = () => tick(v.currentTime)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('loadeddata', onSeeked)
    const ro = new ResizeObserver(() => paint(v.currentTime))
    if (boxRef.current) ro.observe(boxRef.current)
    return () => {
      stopped = true
      if (vfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfc)
      cancelAnimationFrame(raf)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('loadeddata', onSeeked)
      ro.disconnect()
    }
  }, [paint, videoUrl])

  useEffect(() => {
    paint(videoRef.current?.currentTime ?? 0)
  }, [overlayOn, layers, paint])

  const seek = (t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(t, duration))
    setTime(v.currentTime)
  }

  const showCue = (i: number) => {
    setActiveCue(i)
    videoRef.current?.pause()
    seek(result.cues[i].time)
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.ended) v.currentTime = 0
      v.play().catch(() => setVideoError(true))
    } else v.pause()
  }

  const cycleRate = () => {
    const next = (rateIdx + 1) % RATES.length
    setRateIdx(next)
    if (videoRef.current) videoRef.current.playbackRate = RATES[next]
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
          <button type="button" className="btn small ghost" onClick={cycleRate} aria-label="Playback speed">
            {RATES[rateIdx]}×
          </button>
          <label className="toggle">
            <input type="checkbox" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} />
            <span>Overlay</span>
          </label>
        </div>

        <Scrubber
          time={time}
          duration={duration}
          cues={result.cues}
          fallTime={result.fall?.time ?? null}
          activeCue={activeCue}
          onSeek={(t) => {
            videoRef.current?.pause()
            seek(t)
          }}
          onCue={showCue}
        />
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
