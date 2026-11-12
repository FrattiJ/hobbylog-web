'use client'

// The frame and field styles shared by the signed-out screens: sign in, request
// a reset link, and choose a new password.

export const AUTH_ACCENT = '#7c3aed'
const CLIP = 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)'

const gridBg: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
  backgroundSize: '40px 40px', opacity: 0.25,
}

export const authInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
  borderLeft: `2px solid ${AUTH_ACCENT}66`, padding: '11px 13px', color: 'var(--text-hi)',
  fontSize: 15, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', outline: 'none',
}

export const authLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
  letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px',
}

export const authLink: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.06em',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
}

export function authPrimaryButton(busy: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
    letterSpacing: '0.12em', color: AUTH_ACCENT, background: `${AUTH_ACCENT}22`,
    border: `1px solid ${AUTH_ACCENT}`, borderLeft: `3px solid ${AUTH_ACCENT}`,
    cursor: busy ? 'wait' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
}

export function AuthMessage({ message }: { message: { kind: 'error' | 'info'; text: string } | null }) {
  if (!message) return null
  return (
    <p role={message.kind === 'error' ? 'alert' : 'status'}
      style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, margin: '0 0 16px', color: message.kind === 'error' ? '#f87171' : '#22c55e' }}>
      {message.kind === 'error' ? '✗ ' : '✓ '}{message.text}
    </p>
  )
}

export default function AuthShell({ tagline, children }: { tagline: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={gridBg} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: AUTH_ACCENT, letterSpacing: '0.25em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'status-blink 1.5s ease-in-out infinite' }} />
            SYSTEM / ACCESS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.1em', margin: 0 }}>HOBBYLOG</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.7 }}>
            {tagline}
          </p>
        </div>

        <div style={{ padding: '1px', clipPath: CLIP, background: `${AUTH_ACCENT}55` }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: AUTH_ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}
