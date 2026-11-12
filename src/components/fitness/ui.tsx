'use client'

import { useState } from 'react'
import { useEscape } from '@/lib/useEscape'

// Shared bits for the fitness screens. The rest of the app styles inline against
// the theme vars; these just stop every tab from restating the same 12 rules.

export const ACCENT = '#ea580c' // matches HOBBY_MAP.fitness.accent

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.08em',
      color: 'var(--text-dim)', ...style,
    }}>
      {children}
    </div>
  )
}

export function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 10px' }}>
      <Label>{children}</Label>
      <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props
  return (
    <input
      {...rest}
      style={{
        background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
        color: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 15,
        padding: '8px 10px', width: '100%', outline: 'none', ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-dim)'; props.onBlur?.(e) }}
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, ...rest } = props
  return (
    <textarea
      {...rest}
      style={{
        background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
        color: 'var(--text-hi)', fontFamily: 'inherit', fontSize: 14,
        padding: '8px 10px', width: '100%', outline: 'none', resize: 'vertical',
        minHeight: 64, ...style,
      }}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, children, ...rest } = props
  return (
    <select
      {...rest}
      style={{
        background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
        color: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 13,
        padding: '8px 10px', outline: 'none', ...style,
      }}
    >
      {children}
    </select>
  )
}

export function Button({
  children, onClick, variant = 'ghost', accent = ACCENT, disabled, type = 'button', style, title,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'solid' | 'ghost' | 'quiet'
  accent?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  style?: React.CSSProperties
  title?: string
}) {
  const [hover, setHover] = useState(false)
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
    padding: '9px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1, transition: 'var(--t-fast)', whiteSpace: 'nowrap',
  }
  const variants: Record<string, React.CSSProperties> = {
    solid: {
      background: hover && !disabled ? accent : `${accent}22`,
      border: `1px solid ${accent}`, borderLeft: `3px solid ${accent}`,
      color: hover && !disabled ? '#0b0d12' : accent,
    },
    ghost: {
      background: hover && !disabled ? `${accent}18` : 'transparent',
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${hover && !disabled ? accent : 'var(--border-dim)'}`,
      color: hover && !disabled ? accent : 'var(--text-mid)',
    },
    quiet: {
      background: 'transparent', border: '1px solid transparent',
      color: hover && !disabled ? 'var(--text-hi)' : 'var(--text-dim)',
    },
  }
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}
 aria-label={title}>
      {children}
    </button>
  )
}

// Full-screen modal shell, matching AddEntryModal's overlay treatment.
export function Modal({ title, onClose, children, width = 620 }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  useEscape(onClose)
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label={title}
      style={{
        overscrollBehavior: 'contain',
        position: 'fixed', inset: 0, zIndex: 70, background: 'var(--overlay)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: `1px solid ${ACCENT}55`,
          borderTop: `3px solid ${ACCENT}`, width: '100%', maxWidth: width, marginTop: 12,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border-dim)',
        }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700,
            letterSpacing: '0.05em', color: 'var(--text-hi)',
          }}>
            {title}
          </span>
          <Button variant="quiet" onClick={onClose} style={{ padding: 4 }}>✕</Button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  )
}

// In-app confirmation. Deliberately not window.confirm(): that's suppressed in
// sandboxed iframes (it silently returns false, so the button appears dead) and
// it can't be styled to match the rest of the app.
export function Confirm({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }: {
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel} width={420}>
      <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
        <Button variant="solid" accent="#ef4444" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

// 0 = Sunday .. 6 = Saturday, matching Date.getDay().
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div style={{
      border: '1px dashed var(--border-dim)', padding: '40px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', letterSpacing: '0.05em' }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', maxWidth: 420, lineHeight: 1.6 }}>
          {hint}
        </div>
      )}
      {action}
    </div>
  )
}
