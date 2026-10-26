import { useId, useLayoutEffect, useRef } from 'react'

/**
 * A modal dialog that asks before an action; Escape, Cancel and a click outside close it.
 * The "danger" tone is for actions that destroy something, "primary" for the others.
 */
export default function ConfirmDialog({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = 'danger',
  canConfirm = true,
  pending = false,
  error = '',
  onCancel,
  onConfirm,
  children,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  // A layout effect, so close() runs while the dialog is still in the page and focus goes back to where it was.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  function cancel() {
    if (!pending) onCancel()
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (canConfirm && !pending) onConfirm()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      data-tone={tone}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape: let React unmount the dialog instead of the browser closing it.
        event.preventDefault()
        cancel()
      }}
      onClick={(event) => {
        // The form fills the dialog, so a click on the dialog itself is a click on the backdrop.
        if (event.target === event.currentTarget) cancel()
      }}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <header className="modal-head">
          <p className="rail-label">{label}</p>
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
        </header>
        <p id={descriptionId} className="modal-note">
          {description}
        </p>

        {children}

        {error && <p className="ticker is-error">{error}</p>}

        <div className="actions">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={cancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={tone === 'danger' ? 'btn btn-danger is-solid' : 'btn btn-primary'}
            disabled={!canConfirm || pending}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
