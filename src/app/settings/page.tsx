'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun, Check, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { clearAllData, getProfile, linkSteam, unlinkSteam } from '@/lib/db'
import { syncSteamPlaytime, importSteamLibrary } from '@/lib/steam'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from '@/components/hobbyIcons'
import { useHobbies } from '@/components/HobbyContext'

const ACCENT = '#7c3aed'
const STEAM_CYAN = '#0891b2'

const STEAM_ERRORS: Record<string, string> = {
  verify: 'Steam sign-in could not be verified. Please try again.',
  noid: 'Steam did not return an account id. Please try again.',
  network: 'Could not reach Steam. Please try again in a moment.',
}

export default function SettingsPage() {
  const { enabledIds, setEnabledIds } = useHobbies()
  const [email, setEmail] = useState('')
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [clearConfirm, setClearConfirm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [steamId, setSteamId] = useState<string | null>(null)
  const [steamPersona, setSteamPersona] = useState<string | null>(null)
  const [steamBusy, setSteamBusy] = useState(false)
  const [steamMsg, setSteamMsg] = useState<string | null>(null)
  const [steamProgress, setSteamProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    getProfile().then((p) => { setSteamId(p.steam_id); setSteamPersona(p.steam_persona) }).catch(() => {})

    // Handle the redirect back from "Sign in through Steam".
    const q = new URLSearchParams(window.location.search)
    const linked = q.get('steam_linked')
    const err = q.get('steam_error')
    if (linked && /^\d{17}$/.test(linked)) {
      const persona = q.get('steam_name')
      linkSteam(linked, persona).then(() => {
        setSteamId(linked); setSteamPersona(persona)
        setSteamMsg(`Steam connected${persona ? ` as ${persona}` : ''}. Sync your playtime below.`)
      })
    } else if (err) {
      setSteamMsg(STEAM_ERRORS[err] ?? 'Steam sign-in failed. Please try again.')
    }
    if (linked || err) window.history.replaceState(null, '', '/settings')
  }, [])

  function connectSteam() { window.location.href = '/api/steam/login' }

  async function disconnectSteam() {
    await unlinkSteam()
    setSteamId(null); setSteamPersona(null); setSteamMsg('Steam disconnected.')
  }

  async function runSteamSync() {
    if (!steamId) return
    setSteamBusy(true); setSteamMsg(null)
    try {
      const n = await syncSteamPlaytime(steamId)
      setSteamMsg(n > 0 ? `Updated playtime on ${n} game${n === 1 ? '' : 's'}.` : 'Everything already up to date.')
    } catch (e) { setSteamMsg((e as Error).message) }
    setSteamBusy(false)
  }

  async function runSteamImport() {
    if (!steamId) return
    setSteamBusy(true); setSteamMsg(null); setSteamProgress({ done: 0, total: 0 })
    try {
      const n = await importSteamLibrary(steamId, (done, total) => setSteamProgress({ done, total }))
      setSteamMsg(n > 0 ? `Imported ${n} new game${n === 1 ? '' : 's'} from Steam.` : 'No new games — your Steam library is already here.')
    } catch (e) { setSteamMsg((e as Error).message) }
    setSteamProgress(null); setSteamBusy(false)
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
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 14px' }}>{email}</p>
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

      {/* Steam */}
      <div style={{ ...card, borderLeftColor: STEAM_CYAN }}>
        <h2 style={h2}>STEAM</h2>
        {steamId ? (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STEAM_CYAN, display: 'inline-block' }} />
              Connected{steamPersona ? ` as ${steamPersona}` : ''}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '0 0 14px', letterSpacing: '0.04em' }}>SteamID {steamId}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={runSteamSync} disabled={steamBusy}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: STEAM_CYAN, background: `${STEAM_CYAN}22`, border: `1px solid ${STEAM_CYAN}`, borderLeft: `3px solid ${STEAM_CYAN}`, cursor: steamBusy ? 'wait' : 'pointer', opacity: steamBusy ? 0.6 : 1 }}>
                ⟳ SYNC PLAYTIME
              </button>
              <button onClick={runSteamImport} disabled={steamBusy}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: STEAM_CYAN, background: 'transparent', border: `1px solid ${STEAM_CYAN}88`, cursor: steamBusy ? 'wait' : 'pointer', opacity: steamBusy ? 0.6 : 1 }}>
                ⬇ IMPORT NEW GAMES
              </button>
              <button onClick={disconnectSteam} disabled={steamBusy}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: steamBusy ? 'wait' : 'pointer' }}>
                DISCONNECT
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', margin: '0 0 6px', lineHeight: 1.7 }}>
              Link your Steam account to pull in your library and keep game playtime in sync — one click, no setup.
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '0 0 14px', lineHeight: 1.7, opacity: 0.8 }}>
              Your Steam <span style={{ color: 'var(--text-mid)' }}>Game Details</span> privacy must be set to Public (Profile → Edit Profile → Privacy Settings) for playtime to be readable.
            </p>
            <button onClick={connectSteam}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: STEAM_CYAN, background: `${STEAM_CYAN}22`, border: `1px solid ${STEAM_CYAN}`, borderLeft: `3px solid ${STEAM_CYAN}`, cursor: 'pointer' }}>
              ▶ CONNECT STEAM
            </button>
          </>
        )}
        {steamProgress && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: STEAM_CYAN, marginTop: 12 }}>{steamProgress.done}/{steamProgress.total}…</p>}
        {steamMsg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', marginTop: 12, lineHeight: 1.6 }}>{steamMsg}</p>}
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
