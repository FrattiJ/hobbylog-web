'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { AuthMessage, authInput, authLabel, authPrimaryButton } from './AuthShell'

// Supabase's default floor. The server enforces whatever the project is really
// set to, and its message is shown as-is if that is stricter.
const MIN_LENGTH = 6

// Sets a new password for whoever is signed in. Used by the screen a reset
// email opens and by Settings; in both cases the session is the proof of
// identity, so the old password is never asked for.
export default function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incomplete = !password || !confirm

  async function save() {
    if (busy || incomplete) return
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(error.message); return }
    setPassword(''); setConfirm('')
    onDone()
  }

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save() }

  return (
    <>
      <p style={authLabel}>NEW PASSWORD</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter}
        placeholder="••••••••" autoComplete="new-password" aria-label="New password" style={{ ...authInput, marginBottom: 16 }} />
      <p style={authLabel}>CONFIRM PASSWORD</p>
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={onEnter}
        placeholder="••••••••" autoComplete="new-password" aria-label="Confirm password" style={{ ...authInput, marginBottom: 20 }} />
      <AuthMessage message={error ? { kind: 'error', text: error } : null} />
      <div style={{ display: 'flex' }}>
        <button onClick={save} disabled={busy || incomplete} style={authPrimaryButton(busy, busy || incomplete)}>
          {busy ? '…' : submitLabel}
        </button>
      </div>
    </>
  )
}
