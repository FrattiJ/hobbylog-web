'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase, authLinkError } from '@/lib/supabaseClient'
import { AUTH_ACCENT as ACCENT, AuthMessage, PasswordInput, authInput as inp, authLabel as label, authLink, authPrimaryButton } from './AuthShell'

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

const PROVIDER_NAME = { google: 'Google', discord: 'Discord' } as const

export type AuthMode = 'signin' | 'signup' | 'forgot'

// A reset link that had expired or was already used bounces back here with
// nothing but an error, so the form opens on "send me a new link" and says why.
export const initialAuthMode: AuthMode = authLinkError ? 'forgot' : 'signin'

// The id of the first field, so a call to action elsewhere on the page can send
// focus (and with it the scroll position) straight to the form.
export const AUTH_EMAIL_ID = 'auth-email'

// What a new account shares, said at the moment someone is deciding whether to
// make one. There is nothing to opt in or out of here, so it is a statement
// rather than a set of switches: closed by default, with the short answer
// ("private by default") readable without opening it.
function PrivacyDefaults() {
  return (
    <details className="auth-details">
      <summary>
        <ChevronDown size={16} aria-hidden="true" className="auth-details-chevron" />
        <span>What other people can see</span>
        <span className="auth-details-hint">Private by default</span>
      </summary>
      <ul>
        <li>Your library is visible only to friends you have accepted. Nobody else can open it.</li>
        <li>Any single entry can be marked private, which hides it from friends too.</li>
        <li>Once you pick a username, other members can find you by it. They see the username and your avatar, and nothing else, until you accept a friend request.</li>
        <li>Your email address is never shown to anyone. It is used to confirm the account and to reset your password.</li>
      </ul>
    </details>
  )
}

// Sign in, create an account, or ask for a password-reset link. One form whose
// primary action follows the mode; the mode is owned by the parent so that
// buttons outside the form ("Create an account" in a page header) can set it.
export function LoginForm({ mode, onModeChange }: { mode: AuthMode; onModeChange: (m: AuthMode) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(
    authLinkError ? { kind: 'error', text: `${authLinkError}. Request a new link below.` } : null,
  )

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMessage({ kind: 'error', text: error.message })
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
    // Send the email-confirmation link back to wherever they signed up (the live
    // site), not Supabase's localhost default.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setMessage({ kind: 'error', text: error.message })
    else if (!data.session) {
      setMessage({ kind: 'info', text: 'Account created. Check your email to confirm it, then sign in.' })
      onModeChange('signin')
    }
  }

  async function sendReset() {
    // The link comes back to wherever they asked from, where ClientLayout sees
    // the recovery session and shows the new-password screen.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    // Deliberately the same answer whether or not the address has an account:
    // anything else turns this form into a way to check who is signed up.
    if (error) setMessage({ kind: 'error', text: error.message })
    else setMessage({ kind: 'info', text: 'If that email has an account, a reset link is on its way. It can take a minute, and may land in spam.' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setMessage(null)
    try {
      if (mode === 'forgot') await sendReset()
      else if (mode === 'signup') await signUp()
      else await signIn()
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: AuthMode) {
    onModeChange(next); setMessage(null); setPassword('')
  }

  const oauthBtn: React.CSSProperties = {
    width: '100%', padding: '11px 13px', fontFamily: 'var(--font-body)', fontSize: 15,
    fontWeight: 600, color: 'var(--text-hi)', background: 'var(--bg-base)',
    border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
  }
  const heading = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'
  const primary = mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'
  const working = mode === 'signup' ? 'Creating Account…' : mode === 'forgot' ? 'Sending…' : 'Signing In…'

  return (
    <form onSubmit={submit} noValidate={false} aria-labelledby="auth-heading">
      <h2 id="auth-heading" style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, letterSpacing: 0, color: 'var(--text-hi)', margin: '0 0 6px' }}>{heading}</h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 0 20px' }}>
        {mode === 'signup' ? 'An email and a password is all it takes.'
          : mode === 'forgot' ? 'Enter your email and we will send you a link to choose a new one.'
          : 'Welcome back.'}
      </p>

      {mode !== 'forgot' && OAUTH_PROVIDERS.length > 0 && (
        <>
          {OAUTH_PROVIDERS.map((p) => (
            <button type="button" key={p} onClick={() => oauth(p)} disabled={busy} style={{ ...oauthBtn, marginBottom: 10 }}>
              Continue with {PROVIDER_NAME[p]}
            </button>
          ))}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 18px' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>or</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
          </div>
        </>
      )}

      <label htmlFor={AUTH_EMAIL_ID} style={{ ...label, display: 'block' }}>Email</label>
      <input id={AUTH_EMAIL_ID} name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com" autoComplete="email" spellCheck={false} autoCapitalize="none"
        style={{ ...inp, marginBottom: 16 }} />

      {mode !== 'forgot' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label htmlFor="auth-password" style={{ ...label, display: 'block' }}>Password</label>
            {mode === 'signin' && <button type="button" onClick={() => switchMode('forgot')} style={{ ...authLink, fontSize: 13 }}>Forgot password?</button>}
          </div>
          <PasswordInput id="auth-password" name="password" required minLength={mode === 'signup' ? 6 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            style={{ marginBottom: mode === 'signup' ? 6 : 20 }} />
          {mode === 'signup' && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: '0 0 16px' }}>At least 6 characters.</p>
          )}
          {mode === 'signup' && <PrivacyDefaults />}
        </>
      )}

      <AuthMessage message={message} />

      <div style={{ display: 'flex' }}>
        <button type="submit" aria-busy={busy} style={authPrimaryButton(busy, false)}>
          {busy ? working : primary}
        </button>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '16px 0 0', textAlign: 'center' }}>
        {mode === 'signin' && <>New here? <button type="button" onClick={() => switchMode('signup')} style={{ ...authLink, fontSize: 14, color: 'var(--text-hi)' }}>Create an account</button></>}
        {mode === 'signup' && <>Already have an account? <button type="button" onClick={() => switchMode('signin')} style={{ ...authLink, fontSize: 14, color: 'var(--text-hi)' }}>Sign in</button></>}
        {mode === 'forgot' && <button type="button" onClick={() => switchMode('signin')} style={{ ...authLink, fontSize: 14 }}>Back to sign in</button>}
      </p>
    </form>
  )
}
