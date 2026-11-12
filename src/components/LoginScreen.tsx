'use client'

import { useState } from 'react'
import { supabase, authLinkError } from '@/lib/supabaseClient'
import AuthShell, { AUTH_ACCENT as ACCENT, AuthMessage, authInput as inp, authLabel as label, authLink, authPrimaryButton } from './AuthShell'

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

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // 'forgot' swaps the password field for a single "send me a link" action.
  const [mode, setMode] = useState<'signin' | 'forgot'>(authLinkError ? 'forgot' : 'signin')
  // A reset link that had expired or was already used bounces back here with
  // nothing but an error, so say why instead of showing a bare sign-in form.
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(
    authLinkError ? { kind: 'error', text: `${authLinkError}. Request a new link below.` } : null,
  )

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

  async function sendReset() {
    setBusy(true); setMessage(null)
    // The link comes back to wherever they asked from, where ClientLayout sees
    // the recovery session and shows the new-password screen.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    // Deliberately the same answer whether or not the address has an account:
    // anything else turns this form into a way to check who is signed up.
    if (error) setMessage({ kind: 'error', text: error.message })
    else setMessage({ kind: 'info', text: 'If that email has an account, a reset link is on its way. It can take a minute, and may land in spam.' })
    setBusy(false)
  }

  function switchMode(next: 'signin' | 'forgot') {
    setMode(next); setMessage(null); setPassword('')
  }

  const oauthBtn: React.CSSProperties = {
    width: '100%', padding: '11px 13px', fontFamily: 'var(--font-display)', fontSize: 13,
    fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-hi)', background: 'var(--bg-base)',
    border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
  }
  if (mode === 'forgot') {
    return (
      <AuthShell tagline="Enter your email and we will send you a link to choose a new password.">
        <p style={label}>EMAIL</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && email && !busy) sendReset() }} style={{ ...inp, marginBottom: 20 }} />
        <AuthMessage message={message} />
        <div style={{ display: 'flex' }}>
          <button onClick={sendReset} disabled={busy || !email} style={authPrimaryButton(busy, busy || !email)}>
            {busy ? '…' : 'SEND RESET LINK'}
          </button>
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button onClick={() => switchMode('signin')} style={authLink}>Back to sign in</button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell tagline="One backlog for games, movies, books, and everything else.">
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={label}>PASSWORD</p>
        <button onClick={() => switchMode('forgot')} style={{ ...authLink, fontSize: 11 }}>Forgot password?</button>
      </div>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
        onKeyDown={(e) => { if (e.key === 'Enter' && email && password) signIn() }} style={{ ...inp, marginBottom: 20 }} />
      <AuthMessage message={message} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={signIn} disabled={busy || !email || !password} style={authPrimaryButton(busy, busy || !email || !password)}>
          {busy ? '…' : 'SIGN IN'}
        </button>
        <button onClick={signUp} disabled={busy || !email || !password}
          style={{ flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: busy ? 'wait' : 'pointer', opacity: busy || !email || !password ? 0.5 : 1 }}>
          CREATE ACCOUNT
        </button>
      </div>
    </AuthShell>
  )
}
