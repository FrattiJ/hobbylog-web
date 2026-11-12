'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

type ToastKind = 'error' | 'success' | 'info'
interface Toast { id: number; message: string; kind: ToastKind }

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
  error: (message: string) => void
  success: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

// useToast is safe to call anywhere under <ToastProvider>. If somehow used
// outside one, it degrades to no-ops rather than throwing.
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { toast: () => {}, error: () => {}, success: () => {} }
}

const KINDS: Record<ToastKind, { color: string; Icon: typeof Info }> = {
  error: { color: '#ef4444', Icon: AlertTriangle },
  success: { color: '#22c55e', Icon: CheckCircle2 },
  info: { color: '#0891b2', Icon: Info },
}

function ToastRow({ t, onClose }: { t: Toast; onClose: () => void }) {
  const { color, Icon } = KINDS[t.kind]
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    timer.current = setTimeout(onClose, 4500)
    return () => clearTimeout(timer.current)
  }, [onClose])
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 240, maxWidth: 'min(92vw, 380px)',
        padding: '11px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
        borderLeft: `3px solid ${color}`, boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        animation: 'mech-enter 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <Icon size={15} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-hi)', lineHeight: 1.45, wordBreak: 'break-word' }}>{t.message}</span>
      <button onClick={onClose} aria-label="Dismiss" style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, display: 'flex' }}>
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => setToasts((cur) => cur.filter((t) => t.id !== id)), [])
  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++
    setToasts((cur) => [...cur, { id, message, kind }])
  }, [])

  const api = useRef<ToastApi>({
    toast: push,
    error: (m: string) => push(m, 'error'),
    success: (m: string) => push(m, 'success'),
  })
  // keep closures pointing at the latest push (push identity is stable anyway)
  api.current.toast = push
  api.current.error = (m: string) => push(m, 'error')
  api.current.success = (m: string) => push(m, 'success')

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div style={{ position: 'fixed', zIndex: 100, right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastRow t={t} onClose={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
