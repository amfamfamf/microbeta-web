import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { TargetHint } from '../lib/types'

interface Props {
  file: File
  value: TargetHint | null
  onChange: (v: TargetHint | null) => void
  disabled?: boolean
}

/**
 * Shows the clip's first frame and lets the user tap the target hold.
 * The canvas is sized to videoWidth × videoHeight and displayed at its own aspect ratio,
 * so the canvas box IS the frame: no letterboxing to correct for.
 */
export function TargetPicker({ file, value, onChange, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<{ file: File; status: 'loading' | 'ready' | 'error' }>({ file, status: 'loading' })
  const status = state.file === file ? state.status : 'loading'

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const url = URL.createObjectURL(file)
    let drawn = false
    const draw = () => {
      const c = canvasRef.current
      if (drawn || !c || !v.videoWidth || !v.videoHeight) return
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(v, 0, 0, c.width, c.height)
      drawn = true
      setState({ file, status: 'ready' })
    }
    const onMeta = () => {
      // Seeking (even to ~0) makes Safari decode a frame; plain loadedmetadata may not.
      v.currentTime = 0.001
    }
    const onError = () => setState({ file, status: 'error' })
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('seeked', draw)
    v.addEventListener('loadeddata', draw)
    v.addEventListener('error', onError)
    const timer = window.setTimeout(() => !drawn && setState({ file, status: 'error' }), 8000)
    v.src = url
    v.load()
    return () => {
      window.clearTimeout(timer)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('seeked', draw)
      v.removeEventListener('loadeddata', draw)
      v.removeEventListener('error', onError)
      v.removeAttribute('src')
      v.load()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const onTap = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || status !== 'ready') return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000
    onChange({ x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) })
  }

  return (
    <div className="target-picker">
      <video ref={videoRef} muted playsInline preload="auto" className="offscreen-video" aria-hidden />
      {status === 'loading' && <p className="muted small">Loading the first frame…</p>}
      {status === 'error' && (
        <p className="muted small">
          This browser cannot show a preview of this video. Tap “Skip” — the app will find the hold itself.
        </p>
      )}
      <div className="frame-wrap" hidden={status !== 'ready'}>
        <div className="frame">
          <canvas
            ref={canvasRef}
            className={'frame-canvas' + (disabled ? ' disabled' : '')}
            onPointerDown={onTap}
            role="img"
            aria-label="First frame of your video. Tap the hold you were going for."
          />
          {value && (
            <span
              className="tap-marker"
              style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  )
}
