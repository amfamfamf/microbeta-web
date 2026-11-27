import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** "Are you sure?" modal on the native <dialog>: focus trap, Esc to close, and a backdrop. */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel() // tap on the backdrop
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div className="muted">{children}</div>
      {error && <p className="err small" role="alert">⚠ {error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn destructive" disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
