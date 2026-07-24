'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import Backlog from '@/components/Backlog'

const CLIP = 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)'
const ACCENT = '#7c3aed'

const gridBg: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
  backgroundSize: '40px 40px', opacity: 0.25,
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn() {
    setBusy(true); setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMessage({ kind: 'error', text: error.message })
    setBusy(false)
  }

  async function signUp() {
    setBusy(true); setMessage(null)
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) setMessage({ kind: 'error', text: error.message })
    else if (!data.session) setMessage({ kind: 'info', text: 'Account created — check your email to confirm, then sign in.' })
    setBusy(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setEmail(''); setPassword(''); setMessage(null)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${ACCENT}66`, padding: '11px 13px', color: 'var(--text-hi)',
    fontSize: 15, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', outline: 'none',
  }
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
    letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px',
  }

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={gridBg} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.2em', zIndex: 1 }}>
          INITIALIZING…
        </span>
      </main>
    )
  }

  // Logged in → the real backlog app
  if (session) {
    return <Backlog session={session} onSignOut={signOut} />
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={gridBg} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ACCENT, letterSpacing: '0.25em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'status-blink 1.5s ease-in-out infinite' }} />
            SYSTEM / ACCESS
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.1em', margin: 0 }}>
            HOBBYLOG
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.7 }}>
            One backlog for games, movies, books, and everything else.
          </p>
        </div>

        {/* Card */}
        <div style={{ padding: '1px', clipPath: CLIP, background: `${ACCENT}55` }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />

            <p style={label}>EMAIL</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={{ ...inp, marginBottom: 16 }} />
            <p style={label}>PASSWORD</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter' && email && password) signIn() }}
              style={{ ...inp, marginBottom: 20 }} />

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

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.1em', textAlign: 'center', margin: '18px 0 0' }}>
          HOBBYLOG WEB
        </p>
      </div>
    </main>
  )
}
