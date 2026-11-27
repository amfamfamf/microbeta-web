import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  /** Called with the chosen file. Without it, the button opens the upload screen with the file. */
  onPick?: (file: File) => void
  label?: string
  variant?: 'primary' | 'ghost'
  size?: 'small' | 'medium' | 'wide'
  disabled?: boolean
}

/** The one way to start an upload: "Add video" opens a menu with Record and Pick a video. */
export function AddVideo({ onPick, label = 'Add video', variant = 'primary', size = 'medium', disabled }: Props) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const chosen = (f: File | undefined) => {
    setOpen(false)
    if (!f) return
    if (onPick) onPick(f)
    else nav('/upload', { state: { file: f } })
  }

  const cls = ['btn', variant === 'ghost' ? 'ghost' : '', size === 'small' ? 'small' : '', size === 'wide' ? 'wide' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={'add-video' + (size === 'wide' ? ' wide' : '')} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={cls}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          // Open the menu toward the side with room, so it never leaves the screen.
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setAlignRight(r.left + 220 > window.innerWidth - 16)
          setOpen((o) => !o)
        }}
      >
        {label} <span aria-hidden className="caret">▾</span>
      </button>
      {/* The inputs stay mounted so a tap on a menu item opens the camera or library directly. */}
      <input
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        id={`${id}-record`}
        tabIndex={-1}
        onChange={(e) => {
          chosen(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        id={`${id}-pick`}
        tabIndex={-1}
        onChange={(e) => {
          chosen(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {open && (
        <div className={'menu' + (alignRight ? ' right' : '')} role="menu" id={id}>
          <label role="menuitem" tabIndex={0} htmlFor={`${id}-record`} className="menu-item"
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.currentTarget as HTMLLabelElement).click()}>
            <span aria-hidden>🎥</span> Record
          </label>
          <label role="menuitem" tabIndex={0} htmlFor={`${id}-pick`} className="menu-item"
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.currentTarget as HTMLLabelElement).click()}>
            <span aria-hidden>📁</span> Pick a video
          </label>
        </div>
      )}
    </div>
  )
}
