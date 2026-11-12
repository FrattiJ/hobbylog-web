'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Moon, Sun, Check, Trash2, Camera, Download, MessageSquare, Inbox, RefreshCw, Bug, Lightbulb } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { clearAllData, getProfile, setUsername, setAvatar, submitFeedback, deleteMyAccount, isAdminUser, getFeedbackInbox, type FeedbackItem } from '@/lib/db'
import { cropSquareAvatarBlob } from '@/lib/image'
import { getTheme, setTheme, getDisplaySize, setDisplaySize, type Theme, type DisplaySize } from '@/lib/theme'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from '@/components/hobbyIcons'
import { useHobbies } from '@/components/HobbyContext'
import ExportPanel from '@/components/ExportPanel'
import TimeWindowsPanel from '@/components/TimeWindowsPanel'
import NewPasswordForm from '@/components/NewPasswordForm'

const ACCENT = '#a577f2'

export default function SettingsPage() {
  const { enabledIds, setEnabledIds } = useHobbies()
  const [email, setEmail] = useState('')
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [displaySize, setDisplaySizeState] = useState<DisplaySize>(() => getDisplaySize())
  const [clearConfirm, setClearConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [fbKind, setFbKind] = useState<'bug' | 'feature'>('bug')
  const [fbText, setFbText] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbMsg, setFbMsg] = useState<string | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)
  const [inbox, setInbox] = useState<FeedbackItem[] | null>(null)
  const [inboxBusy, setInboxBusy] = useState(false)

  const [username, setUsernameState] = useState('')
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [avatar, setAvatarState] = useState<string | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''))
    getProfile().then((p) => { setUsernameState(p.username ?? ''); setAvatarState(p.avatar_url) }).catch(() => {})
    isAdminUser().then((admin) => { setIsAdmin(admin); if (admin) loadInbox() }).catch(() => {})
  }, [])

  async function loadInbox() {
    setInboxBusy(true)
    try { setInbox(await getFeedbackInbox()) } catch { /* non-admin or transient */ }
    setInboxBusy(false)
  }

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
      setAvatarState(await setAvatar(await cropSquareAvatarBlob(file)))
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

  async function deleteAccount() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleteBusy(true)
    try {
      await deleteMyAccount()
      await supabase.auth.signOut()
    } catch { setMsg('Could not delete account — please try again.'); setDeleteBusy(false); setDeleteConfirm(false) }
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: '0 0 12px' }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>SETTINGS</h1>
      </div>

      {/* Account */}
      <div style={card}>
        <h2 style={h2}>ACCOUNT</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `2px solid ${ACCENT}66`, background: 'linear-gradient(135deg, #a577f2, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
              : <span style={{ fontFamily: 'var(--font-body)', fontSize: 26, fontWeight: 700, color: '#fff' }}>{(username || email || 'O')[0]?.toUpperCase()}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f) }} />
            <button onClick={() => avatarRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, cursor: 'pointer' }}>
              <Camera size={13} /> {avatar ? 'Change Photo' : 'Upload Photo'}
            </button>
            {avatar && <button onClick={removeAvatar} style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.02em' }}>Remove</button>}
          </div>
        </div>

        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 16px' }}>{email}</p>

        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }}>Username</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: usernameMsg ? 8 : 16, flexWrap: 'wrap' }}>
          <input value={username} onChange={(e) => setUsernameState(e.target.value)} placeholder="pick_a_handle" spellCheck={false}
            style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`, padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }} aria-label="pick_a_handle" />
          <button onClick={saveUsername} disabled={savingName}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, cursor: savingName ? 'wait' : 'pointer', opacity: savingName ? 0.6 : 1 }}>Save</button>
        </div>
        {usernameMsg && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', margin: '0 0 16px', lineHeight: 1.6 }}>{usernameMsg}</p>}

        {pwOpen && (
          <div style={{ maxWidth: 360, margin: '0 0 16px' }}>
            <NewPasswordForm submitLabel="Update Password" onDone={() => { setPwOpen(false); setPwMsg('Password updated.') }} />
          </div>
        )}
        {pwMsg && <p role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', margin: '0 0 16px', lineHeight: 1.6 }}>{pwMsg}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setPwOpen((o) => !o); setPwMsg(null) }}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>{pwOpen ? 'Cancel' : 'Change Password'}</button>
          <button onClick={() => supabase.auth.signOut()}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Import & sync */}
      <Link href="/import" style={{ ...card, borderLeftColor: '#099bbe', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', cursor: 'pointer' }}>
        <Download size={20} style={{ color: '#099bbe', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ ...h2, margin: 0 }}>IMPORT &amp; SYNC</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '4px 0 0', lineHeight: 1.5 }}>Connect Steam, or import from MyAnimeList, Goodreads &amp; Letterboxd.</p>
        </div>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: '#099bbe' }}>→</span>
      </Link>

      {/* Hobby time windows */}
      <TimeWindowsPanel />

      {/* Export */}
      <ExportPanel />

      {/* Feedback */}
      <div style={{ ...card, borderLeftColor: '#099bbe' }}>
        <h2 style={{ ...h2, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={15} style={{ color: '#099bbe' }} /> Feedback</h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>Found a bug or have an idea? Send it straight to the developer.</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['bug', 'feature'] as const).map((k) => (
            <button key={k} onClick={() => setFbKind(k)}
              aria-pressed={fbKind === k}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, background: fbKind === k ? '#099bbe22' : 'transparent', border: `1px solid ${fbKind === k ? '#099bbe' : 'var(--border-dim)'}`, color: fbKind === k ? '#099bbe' : 'var(--text-dim)', cursor: 'pointer' }}>
              {k === 'bug' ? <><Bug size={13} /> Bug</> : <><Lightbulb size={13} /> Idea</>}
            </button>
          ))}
        </div>
        <textarea aria-label="Your feedback" value={fbText} onChange={(e) => setFbText(e.target.value)} rows={3}
          placeholder={fbKind === 'bug' ? 'What happened, and what did you expect?' : 'What would you like to see?'}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: '2px solid #099bbe66', padding: '10px 12px', color: 'var(--text-hi)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical', marginBottom: 10 }} />
        <button onClick={sendFeedback} disabled={fbBusy || !fbText.trim()}
          style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#099bbe', background: '#099bbe22', border: '1px solid #099bbe', borderLeft: '3px solid #099bbe', cursor: fbBusy ? 'wait' : 'pointer', opacity: fbBusy || !fbText.trim() ? 0.5 : 1 }}>
          {fbBusy ? 'Sending…' : 'Send'}
        </button>
        {fbMsg && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', margin: '12px 0 0' }}>{fbMsg}</p>}
      </div>

      {/* Admin: feedback inbox — only rendered for the admin account. */}
      {isAdmin && (
        <div style={{ ...card, borderLeftColor: '#d97706' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <h2 style={{ ...h2, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Inbox size={15} style={{ color: '#d97706' }} /> Feedback Inbox
              {inbox && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>· {inbox.length}</span>}
            </h2>
            <button onClick={loadInbox} disabled={inboxBusy} title="Refresh"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', color: '#d97706', background: 'transparent', border: '1px solid #d9770666', cursor: inboxBusy ? 'wait' : 'pointer' }} aria-label="Refresh">
              <RefreshCw size={12} /> {inboxBusy ? '…' : 'Refresh'}
            </button>
          </div>
          {inbox && inbox.length === 0 && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>No feedback yet.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(inbox ?? []).map((f) => (
              <div key={f.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${f.kind === 'bug' ? '#f15959' : '#099bbe'}`, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', color: f.kind === 'bug' ? '#f15959' : '#099bbe' }}>{f.kind === 'bug' ? 'Bug' : 'Idea'}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-hi)' }}>{f.username || f.email || 'unknown'}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>{new Date(f.created_at).toLocaleString()}</span>
                </div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{f.message}</p>
                {f.page && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '6px 0 0' }}>on {f.page}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tracked hobbies */}
      <div style={card}>
        <h2 style={h2}>TRACKED HOBBIES</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {HOBBIES.map((h) => {
            const Icon = HOBBY_ICON_MAP[h.icon]
            const active = enabledIds.includes(h.id)
            return (
              <button key={h.id} onClick={() => toggleHobby(h.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: active ? `${h.accent}18` : 'transparent', border: `1px solid ${active ? h.accent : 'var(--border-dim)'}`, borderLeft: active ? `3px solid ${h.accent}` : '1px solid var(--border-dim)', color: active ? h.accent : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em' }}>
                {Icon && <Icon size={14} />}
                <span style={{ flex: 1, textAlign: 'left' }}>{h.pluralLabel}</span>
                {active && <Check size={12} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Appearance (theme + display size) */}
      <div style={card}>
        <h2 style={h2}>APPEARANCE</h2>

        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 8px' }}>Theme</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['dark', Moon], ['light', Sun]] as const).map(([t, Icon]) => {
            const active = theme === t
            return (
              <button key={t} onClick={() => changeTheme(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: '0.05em', background: active ? `${ACCENT}22` : 'transparent', border: `1px solid ${active ? ACCENT : 'var(--border-dim)'}`, color: active ? ACCENT : 'var(--text-dim)', cursor: 'pointer' }}>
                <Icon size={14} /> {t}
              </button>
            )
          })}
        </div>

        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }}>Display Size</p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 10px', lineHeight: 1.5 }}>Scales the whole interface — compact to fit more, or larger for readability.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['compact', 'normal', 'large', 'xl'] as DisplaySize[]).map((s) => {
            const active = displaySize === s
            return (
              <button key={s} onClick={() => changeDisplaySize(s)}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: '0.05em', background: active ? `${ACCENT}22` : 'transparent', border: `1px solid ${active ? ACCENT : 'var(--border-dim)'}`, color: active ? ACCENT : 'var(--text-dim)', cursor: 'pointer' }}>
                {s === 'xl' ? 'X-Large' : s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Delete account */}
      <div style={{ ...card, borderLeftColor: '#f15959' }}>
        <h2 style={h2}>DELETE ACCOUNT</h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Clear just your entries, or permanently delete your entire account — profile, logs, friends, everything. Neither can be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={clearData}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#f87171', background: 'transparent', border: '1px solid #f1595955', cursor: 'pointer' }}>
            <Trash2 size={13} /> {clearConfirm ? 'Click Again to Confirm' : 'Clear All Data'}
          </button>
          <button onClick={deleteAccount} disabled={deleteBusy}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#fff', background: '#c62828', border: '1px solid #c62828', cursor: deleteBusy ? 'wait' : 'pointer', opacity: deleteBusy ? 0.6 : 1 }}>
            <Trash2 size={13} /> {deleteBusy ? 'Deleting…' : deleteConfirm ? 'Click Again to Confirm' : 'Delete Account'}
          </button>
        </div>
        {msg && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  )
}
