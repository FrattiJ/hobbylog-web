'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun, Check, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { clearAllData, getProfile, setUsername } from '@/lib/db'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from '@/components/hobbyIcons'
import { useHobbies } from '@/components/HobbyContext'

const ACCENT = '#7c3aed'

export default function SettingsPage() {
  const { enabledIds, setEnabledIds } = useHobbies()
  const [email, setEmail] = useState('')
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [clearConfirm, setClearConfirm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [username, setUsernameState] = useState('')
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    getProfile().then((p) => setUsernameState(p.username ?? '')).catch(() => {})
  }, [])

  async function saveUsername() {
    setSavingName(true); setUsernameMsg(null)
    try {
      await setUsername(username)
      setUsernameMsg('Username saved — friends can find you by this handle.')
    } catch (e) { setUsernameMsg((e as Error).message) }
    setSavingName(false)
  }

  function changeTheme(t: Theme) { setTheme(t); setThemeState(t) }

  async function toggleHobby(id: typeof HOBBIES[number]['id']) {
    const next = enabledIds.includes(id) ? enabledIds.filter((x) => x !== id) : [...enabledIds, id]
    if (next.length === 0) return
    await setEnabledIds(next)
  }

  async function clearData() {
    if (!clearConfirm) { setClearConfirm(true); return }
    await clearAllData()
    setClearConfirm(false); setMsg('All entries cleared.')
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 12px' }

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / SETTINGS</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>SETTINGS</h1>
      </div>

      {/* Account */}
      <div style={card}>
        <h2 style={h2}>ACCOUNT</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 16px' }}>{email}</p>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: '0 0 6px' }}>USERNAME</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: usernameMsg ? 8 : 16, flexWrap: 'wrap' }}>
          <input value={username} onChange={(e) => setUsernameState(e.target.value)} placeholder="pick_a_handle" spellCheck={false}
            style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`, padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }} />
          <button onClick={saveUsername} disabled={savingName}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, cursor: savingName ? 'wait' : 'pointer', opacity: savingName ? 0.6 : 1 }}>SAVE</button>
        </div>
        {usernameMsg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', margin: '0 0 16px', lineHeight: 1.6 }}>{usernameMsg}</p>}

        <button onClick={() => supabase.auth.signOut()}
          style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>SIGN OUT</button>
      </div>

      {/* Theme */}
      <div style={card}>
        <h2 style={h2}>THEME</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['dark', Moon], ['light', Sun]] as const).map(([t, Icon]) => {
            const active = theme === t
            return (
              <button key={t} onClick={() => changeTheme(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', background: active ? `${ACCENT}22` : 'transparent', border: `1px solid ${active ? ACCENT : 'var(--border-dim)'}`, color: active ? ACCENT : 'var(--text-dim)', cursor: 'pointer' }}>
                <Icon size={14} /> {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tracked hobbies */}
      <div style={card}>
        <h2 style={h2}>TRACKED HOBBIES</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {HOBBIES.map((h) => {
            const Icon = HOBBY_ICON_MAP[h.icon]
            const active = enabledIds.includes(h.id)
            return (
              <button key={h.id} onClick={() => toggleHobby(h.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: active ? `${h.accent}18` : 'transparent', border: `1px solid ${active ? h.accent : 'var(--border-dim)'}`, borderLeft: active ? `3px solid ${h.accent}` : '1px solid var(--border-dim)', color: active ? h.accent : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em' }}>
                {Icon && <Icon size={14} />}
                <span style={{ flex: 1, textAlign: 'left' }}>{h.pluralLabel}</span>
                {active && <Check size={12} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Danger */}
      <div style={{ ...card, borderLeftColor: '#ef4444' }}>
        <h2 style={h2}>DANGER ZONE</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 14px', lineHeight: 1.6 }}>Permanently deletes all your entries from the cloud. Cannot be undone.</p>
        <button onClick={clearData}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid #ef444455', cursor: 'pointer' }}>
          <Trash2 size={13} /> {clearConfirm ? 'CLICK AGAIN TO CONFIRM' : 'CLEAR ALL DATA'}
        </button>
        {msg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  )
}
