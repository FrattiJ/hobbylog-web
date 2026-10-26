'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Which providers to offer, e.g. NEXT_PUBLIC_OAUTH_PROVIDERS="google,discord".
//
// A provider button cannot be trusted to fail politely: signInWithOAuth
// navigates straight to Supabase's authorize endpoint, so a provider that has
// not had its client id and secret pasted into the Supabase dashboard yet does
// not surface an error in the app at all -- it dumps the visitor on an
// "Unsupported provider" page on another domain. Enabling the provider and
// showing its button are therefore two halves of one change, and this is the
// switch that keeps them together.
const OAUTH_PROVIDERS = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter((p): p is 'google' | 'discord' => p === 'google' || p === 'discord')

const CLIP = 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)'
const ACCENT = '#7c3aed'

const gridBg: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
  backgroundSize: '40px 40px', opacity: 0.25,
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  async function signIn() {
    setBusy(true); setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMessage({ kind: 'error', text: error.message })
    setBusy(false)
  }
  // Signing in through a provider sends no email at all, which is the whole
  // point of offering it: the built-in auth mailer is rate-limited to a couple
  // of messages an hour across the entire project, so email + password is the
  // narrow door. This one also skips the round trip through an inbox.
  async function oauth(provider: 'google' | 'discord') {
    setBusy(true); setMessage(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    // On success the browser is already leaving, so there is no state worth
    // restoring -- an error is the only outcome that stays on this page.
    if (error) { setMessage({ kind: 'error', text: error.message }); setBusy(false) }
  }

  async function signUp() {
    setBusy(true); setMessage(null)
    // Send the email-confirmation link back to wherever they signed up (the live
    // site), not Supabase's localhost default.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setMessage({ kind: 'error', text: error.message })
    else if (!data.session) setMessage({ kind: 'info', text: 'Account created — check your email to confirm, then sign in.' })
    setBusy(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${ACCENT}66`, padding: '11px 13px', color: 'var(--text-hi)',
    fontSize: 15, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', outline: 'none',
  }
  const oauthBtn: React.CSSProperties = {
    width: '100%', padding: '11px 13px', fontFamily: 'var(--font-display)', fontSize: 13,
    fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-hi)', background: 'var(--bg-base)',
    border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
  }
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
    letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px',
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={gridBg} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.25em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'status-blink 1.5s ease-in-out infinite' }} />
            SYSTEM / ACCESS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.1em', margin: 0 }}>HOBBYLOG</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.7 }}>
            One backlog for games, movies, books, and everything else.
          </p>
        </div>

        <div style={{ padding: '1px', clipPath: CLIP, background: `${ACCENT}55` }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            {OAUTH_PROVIDERS.length > 0 && (
              <>
                {OAUTH_PROVIDERS.map((p) => (
                  <button key={p} onClick={() => oauth(p)} disabled={busy} style={{ ...oauthBtn, marginBottom: 10 }}>
                    CONTINUE WITH {p.toUpperCase()}
                  </button>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 20px' }}>
                  <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.2em' }}>OR</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
                </div>
              </>
            )}

            <p style={label}>EMAIL</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={{ ...inp, marginBottom: 16 }} />
            <p style={label}>PASSWORD</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter' && email && password) signIn() }} style={{ ...inp, marginBottom: 20 }} />
            {message && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, margin: '0 0 16px', color: message.kind === 'error' ? '#f87171' : '#22c55e' }}>
                {message.kind === 'error' ? '✗ ' : '✓ '}{message.text}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={signIn} disabled={busy || !email || !password}
                style={{ flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: busy ? 'wait' : 'pointer', opacity: busy || !email || !password ? 0.5 : 1 }}>
                {busy ? '…' : 'SIGN IN'}
              </button>
              <button onClick={signUp} disabled={busy || !email || !password}
                style={{ flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: busy ? 'wait' : 'pointer', opacity: busy || !email || !password ? 0.5 : 1 }}>
                CREATE ACCOUNT
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
