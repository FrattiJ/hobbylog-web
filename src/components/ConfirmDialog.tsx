'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// An in-app replacement for window.confirm(). The browser's own box cannot be
// styled, says nothing about what will be lost beyond one line of text, and is
// silently suppressed inside sandboxed frames, where it returns false and makes
// the button look dead.
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete this entry?', body: '…', confirmLabel: 'Delete', danger: true }))) return

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  // A destructive action: the confirm button is red, and focus starts on
  // Cancel so that a stray Enter keeps things as they are.
  danger?: boolean
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask>(async () => false)

export function useConfirm(): Ask {
  return useContext(ConfirmContext)
}

const CLIP = 'polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)'
const RED = '#c62828'
const VIOLET = '#6d3fd6'

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Whatever had focus before the dialog opened gets it back when it closes.
  const returnTo = useRef<HTMLElement | null>(null)

  const ask = useCallback<Ask>((options) => new Promise<boolean>((resolve) => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen({ ...options, resolve })
  }), [])

  const close = useCallback((ok: boolean) => {
    setOpen((cur) => { cur?.resolve(ok); return null })
    returnTo.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    ;(open.danger ? cancelRef : confirmRef).current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false) }
      // Two buttons, so trapping focus is just bouncing between them.
      if (e.key === 'Tab') {
        e.preventDefault()
        const next = document.activeElement === cancelRef.current ? confirmRef : cancelRef
        next.current?.focus()
      }
    }
    // Capture, so Escape closes this and not a dialog underneath it.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close])

  const tone = open?.danger ? RED : VIOLET
  const button: React.CSSProperties = {
    minHeight: 42, padding: '0 18px', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && (
        <div
          onClick={(e) => { if (e.currentTarget === e.target) close(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overscrollBehavior: 'contain' }}
        >
          <div
            role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={open.body ? 'confirm-body' : undefined}
            style={{ width: '100%', maxWidth: 440, padding: 1, clipPath: CLIP, background: open.danger ? '#ef444488' : '#a577f288' }}
          >
            <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24 }}>
              <h2 id="confirm-title" style={{ fontFamily: 'var(--font-body)', fontSize: 19, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3, color: 'var(--text-hi)', margin: 0 }}>
                {open.title}
              </h2>
              {open.body && (
                <p id="confirm-body" style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.55, color: 'var(--text-mid)', margin: '10px 0 0' }}>
                  {open.body}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 24 }}>
                <button ref={cancelRef} type="button" onClick={() => close(false)}
                  style={{ ...button, color: 'var(--text-hi)', background: 'transparent', border: '1px solid var(--border-dim)' }}>
                  {open.cancelLabel ?? 'Cancel'}
                </button>
                <button ref={confirmRef} type="button" onClick={() => close(true)}
                  style={{ ...button, color: '#fff', background: tone, border: `1px solid ${tone}` }}>
                  {open.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
