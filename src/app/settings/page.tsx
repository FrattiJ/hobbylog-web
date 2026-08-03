'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Moon, Sun, Check, Trash2, Camera, Download, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { clearAllData, getProfile, setUsername, setAvatar, submitFeedback } from '@/lib/db'
import { cropSquareAvatar } from '@/lib/image'
import { getTheme, setTheme, getDisplaySize, setDisplaySize, type Theme, type DisplaySize } from '@/lib/theme'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from '@/components/hobbyIcons'
import { useHobbies } from '@/components/HobbyContext'

const ACCENT = '#7c3aed'

export default function SettingsPage() {
  const { enabledIds, setEnabledIds } = useHobbies()
  const [email, setEmail] = useState('')
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [displaySize, setDisplaySizeState] = useState<DisplaySize>(() => getDisplaySize())
  const [clearConfirm, setClearConfirm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [fbKind, setFbKind] = useState<'bug' | 'feature'>('bug')
  const [fbText, setFbText] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbMsg, setFbMsg] = useState<string | null>(null)

  const [username, setUsernameState] = useState('')
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [avatar, setAvatarState] = useState<string | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    getProfile().then((p) => { setUsernameState(p.username ?? ''); setAvatarState(p.avatar_url) }).catch(() => {})
  }, [])

  async function saveUsername() {
    setSavingName(true); setUsernameMsg(null)
    try {
      await setUsername(username)
      setUsernameMsg('Username saved — friends can find you by this handle.')
    } catch (e) { setUsernameMsg((e as Error).message) }
    setSavingName(false)
  }

  async function pickAvatar(file: File) {
    try {
      const dataUrl = await cropSquareAvatar(file)
      await setAvatar(dataUrl)
      setAvatarState(dataUrl)
    } catch { /* ignore bad image */ }
    if (avatarRef.current) avatarRef.current.value = ''
  }

  async function removeAvatar() {
    await setAvatar(null); setAvatarState(null)
  }

  function changeTheme(t: Theme) { setTheme(t); setThemeState(t) }
  function changeDisplaySize(s: DisplaySize) { setDisplaySize(s); setDisplaySizeState(s) }

  async function sendFeedback() {
    if (!fbText.trim()) return
    setFbBusy(true); setFbMsg(null)
    try {
      await submitFeedback(fbKind, fbText)
      setFbText(''); setFbMsg('Thanks! Your feedback was sent.')
    } catch { setFbMsg('Could not send — please try again.') }
    setFbBusy(false)
  }

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `2px solid ${ACCENT}66`, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: '#fff' }}>{(username || email || 'O')[0]?.toUpperCase()}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f) }} />
            <button onClick={() => avatarRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, cursor: 'pointer' }}>
              <Camera size={13} /> {avatar ? 'CHANGE PHOTO' : 'UPLOAD PHOTO'}
            </button>
            {avatar && <button onClick={removeAvatar} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.06em' }}>Remove</button>}
          </div>
        </div>

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

      {/* Import & sync */}
      <Link href="/import" style={{ ...card, borderLeftColor: '#0891b2', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', cursor: 'pointer' }}>
        <Download size={20} style={{ color: '#0891b2', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ ...h2, margin: 0 }}>IMPORT &amp; SYNC</h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '4px 0 0', lineHeight: 1.5 }}>Connect Steam, or import from MyAnimeList, Goodreads &amp; Letterboxd.</p>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: '#0891b2' }}>→</span>
      </Link>

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

      {/* Display size */}
      <div style={card}>
        <h2 style={h2}>DISPLAY SIZE</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>Scales the whole interface — go compact to fit more, or larger for readability.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['compact', 'normal', 'large', 'xl'] as DisplaySize[]).map((s) => {
            const active = displaySize === s
            return (
              <button key={s} onClick={() => changeDisplaySize(s)}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', background: active ? `${ACCENT}22` : 'transparent', border: `1px solid ${active ? ACCENT : 'var(--border-dim)'}`, color: active ? ACCENT : 'var(--text-dim)', cursor: 'pointer' }}>
                {s === 'xl' ? 'X-Large' : s}
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

      {/* Feedback */}
      <div style={{ ...card, borderLeftColor: '#0891b2' }}>
        <h2 style={{ ...h2, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={15} style={{ color: '#0891b2' }} /> FEEDBACK</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>Found a bug or have an idea? Send it straight to the developer.</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['bug', 'feature'] as const).map((k) => (
            <button key={k} onClick={() => setFbKind(k)}
              style={{ padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', background: fbKind === k ? '#0891b222' : 'transparent', border: `1px solid ${fbKind === k ? '#0891b2' : 'var(--border-dim)'}`, color: fbKind === k ? '#0891b2' : 'var(--text-dim)', cursor: 'pointer' }}>
              {k === 'bug' ? '🐛 Bug' : '✦ Idea'}
            </button>
          ))}
        </div>
        <textarea value={fbText} onChange={(e) => setFbText(e.target.value)} rows={3}
          placeholder={fbKind === 'bug' ? 'What happened, and what did you expect?' : 'What would you like to see?'}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: '2px solid #0891b266', padding: '10px 12px', color: 'var(--text-hi)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical', marginBottom: 10 }} />
        <button onClick={sendFeedback} disabled={fbBusy || !fbText.trim()}
          style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#0891b2', background: '#0891b222', border: '1px solid #0891b2', borderLeft: '3px solid #0891b2', cursor: fbBusy ? 'wait' : 'pointer', opacity: fbBusy || !fbText.trim() ? 0.5 : 1 }}>
          {fbBusy ? 'SENDING…' : 'SEND'}
        </button>
        {fbMsg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', margin: '12px 0 0' }}>{fbMsg}</p>}
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
