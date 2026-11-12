'use client'

// The frame and field styles shared by the signed-out screens: sign in, request
// a reset link, and choose a new password.

export const AUTH_ACCENT = '#955ff0'
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
  fontSize: 16, fontFamily: 'var(--font-body)',
}

export const authLabel: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, color: 'var(--text-mid)',
  margin: '0 0 6px',
}

export const authLink: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
}

export function authPrimaryButton(busy: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '12px', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 700,
    color: '#fff', background: '#6d3fd6',
    border: '1px solid #955ff0',
    cursor: busy ? 'wait' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
}

export function AuthMessage({ message }: { message: { kind: 'error' | 'info'; text: string } | null }) {
  if (!message) return null
  return (
    <p role={message.kind === 'error' ? 'alert' : 'status'}
      style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, margin: '0 0 16px', padding: '10px 12px', color: message.kind === 'error' ? '#fca5a5' : '#86efac', background: message.kind === 'error' ? '#ef444418' : '#22c55e14', borderLeft: `3px solid ${message.kind === 'error' ? '#ef4444' : '#22c55e'}` }}>
      {message.text}
    </p>
  )
}

// The chamfered panel the auth forms sit in, on its own so the landing page can
// place a form without the full-screen shell around it.
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '1px', clipPath: CLIP, background: `${AUTH_ACCENT}55` }}>
      <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24, position: 'relative' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: AUTH_ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
        {children}
      </div>
    </div>
  )
}

// Full-screen frame for an auth step that stands alone (choosing a new password
// after a reset link).
export default function AuthShell({ tagline, children }: { tagline: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div aria-hidden="true" style={gridBg} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 translate="no" style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>HOBBYLOG</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', margin: '8px 0 0', lineHeight: 1.5 }}>
            {tagline}
          </p>
        </div>
        <AuthCard>{children}</AuthCard>
      </div>
    </main>
  )
}
