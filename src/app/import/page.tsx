'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { getAllEntries, bulkInsertEntries, getProfile, linkSteam, unlinkSteam, setSteamPrefs } from '@/lib/db'
import { backfillCovers } from '@/lib/entries'
import { syncSteamPlaytime, importSteamLibrary } from '@/lib/steam'
import {
  parseMAL, parseLetterboxd, parseGoodreads, enrichMALWithJikan, type PreviewEntry,
} from '@/lib/importParsers'

const ACCENT = '#7c3aed'
const STEAM_CYAN = '#0891b2'

const STEAM_ERRORS: Record<string, string> = {
  verify: 'Steam sign-in could not be verified. Please try again.',
  noid: 'Steam did not return an account id. Please try again.',
  network: 'Could not reach Steam. Please try again in a moment.',
}

type ImportTab = 'mal' | 'letterboxd' | 'goodreads' | 'steam'

const TABS: { id: ImportTab; label: string; accent: string; accept?: string; hint?: string; blurb: string }[] = [
  { id: 'steam', label: 'STEAM', accent: STEAM_CYAN, blurb: 'Your game library + playtime, one click' },
  { id: 'mal', label: 'MY ANIME LIST', accent: '#2e51a2', accept: '.xml', blurb: 'Anime → TV Shows, manga → Books',
    hint: 'Export from MyAnimeList → Account → Export Data → Export Anime/Manga List, then unzip it. Imports anime as TV Shows and manga as Books.' },
  { id: 'goodreads', label: 'GOODREADS', accent: '#d97706', accept: '.csv', blurb: 'Your books across every shelf',
    hint: 'Export from Goodreads → My Books → Import and Export → Export Library. Imports all shelves (to-read, reading, read).' },
  { id: 'letterboxd', label: 'LETTERBOXD', accent: '#00c030', accept: '.csv', blurb: 'Your films + ratings',
    hint: 'Export from Letterboxd → Settings → Import & Export → Export Your Data. Upload watchlist.csv (→ Backlog), ratings.csv, or diary.csv (→ Completed).' },
]

export default function ImportPage() {
  // Service-file importer state
  const [tab, setTab] = useState<ImportTab>('steam')
  const [stage, setStage] = useState<'idle' | 'parsed' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [enrich, setEnrich] = useState(true)
  const [enrichStatus, setEnrichStatus] = useState<{ current: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Steam state
  const [steamId, setSteamId] = useState<string | null>(null)
  const [steamPersona, setSteamPersona] = useState<string | null>(null)
  const [steamBusy, setSteamBusy] = useState(false)
  const [steamMsg, setSteamMsg] = useState<string | null>(null)
  const [steamProgress, setSteamProgress] = useState<{ done: number; total: number } | null>(null)
  const [steamSyncPref, setSteamSyncPref] = useState(true)
  const [steamImportPref, setSteamImportPref] = useState(false)

  // Cover-backfill state
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    getProfile().then((p) => { setSteamId(p.steam_id); setSteamPersona(p.steam_persona); setSteamSyncPref(p.steam_sync_playtime); setSteamImportPref(p.steam_auto_import) }).catch(() => {})
    // Handle the redirect back from "Sign in through Steam".
    const q = new URLSearchParams(window.location.search)
    const linked = q.get('steam_linked')
    const err = q.get('steam_error')
    if (linked && /^\d{17}$/.test(linked)) {
      const persona = q.get('steam_name')
      setTab('steam')
      linkSteam(linked, persona).then(() => {
        setSteamId(linked); setSteamPersona(persona)
        setSteamMsg(`Steam connected${persona ? ` as ${persona}` : ''}. Sync your playtime below.`)
      })
    } else if (err) {
      setTab('steam'); setSteamMsg(STEAM_ERRORS[err] ?? 'Steam sign-in failed. Please try again.')
    }
    if (linked || err) window.history.replaceState(null, '', '/import')
  }, [])

  const active = TABS.find((t) => t.id === tab)!

  function reset() {
    setStage('idle'); setPreview([]); setError(null); setResult(null); setProgress(0); setEnrichStatus(null)
    if (fileRef.current) fileRef.current.value = ''
  }
  function switchTab(t: ImportTab) { setTab(t); reset() }

  async function handleFile(file: File) {
    setError(null)
    try {
      const text = await file.text()
      let parsed: PreviewEntry[] = []
      if (tab === 'mal') parsed = parseMAL(text)
      if (tab === 'letterboxd') parsed = parseLetterboxd(text)
      if (tab === 'goodreads') parsed = parseGoodreads(text)
      if (!parsed.length) { setError('No entries found — check the file format.'); return }
      setPreview(parsed); setStage('parsed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.')
    }
  }

  async function handleImport() {
    setStage('importing'); setProgress(0)
    const existing = await getAllEntries()
    const seen = new Set(existing.map((e) => `${e.hobby_category}::${e.title.toLowerCase()}`))
    let toInsert = preview.filter((e) => !seen.has(`${e.hobby_category}::${e.title.toLowerCase()}`))
    const skipped = preview.length - toInsert.length
    if (tab === 'mal' && enrich) {
      toInsert = await enrichMALWithJikan(toInsert, (current, total) => setEnrichStatus({ current, total }))
      setEnrichStatus(null)
    }
    const imported = await bulkInsertEntries(toInsert, (n) => setProgress(Math.round((n / Math.max(1, toInsert.length)) * 100)))
    setResult({ imported, skipped }); setStage('done')
  }

  async function toggleSyncPref(v: boolean) { setSteamSyncPref(v); try { await setSteamPrefs({ sync_playtime: v }) } catch { setSteamSyncPref(!v) } }
  async function toggleImportPref(v: boolean) { setSteamImportPref(v); try { await setSteamPrefs({ auto_import: v }) } catch { setSteamImportPref(!v) } }

  function connectSteam() { window.location.href = '/api/steam/login' }
  async function disconnectSteam() {
    await unlinkSteam(); setSteamId(null); setSteamPersona(null); setSteamMsg('Steam disconnected.')
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

  async function runBackfill() {
    setBusy(true); setNote(null); setCoverProgress({ done: 0, total: 0 })
    try {
      const n = await backfillCovers((done, total) => setCoverProgress({ done, total }))
      setNote(n > 0 ? `Fetched artwork for ${n} entr${n === 1 ? 'y' : 'ies'}.` : 'No missing covers found (or no matches).')
    } catch (e) { setNote(`Backfill failed: ${(e as Error).message}`) }
    setCoverProgress(null); setBusy(false)
  }

  const byCat = preview.reduce<Record<string, number>>((acc, e) => { acc[e.hobby_category] = (acc[e.hobby_category] ?? 0) + 1; return acc }, {})
  const panel: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderTop: `2px solid ${active.accent}`, padding: 20, marginBottom: 16 }
  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16 }
  const steamBtn = (filled: boolean): React.CSSProperties => ({ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: STEAM_CYAN, background: filled ? `${STEAM_CYAN}22` : 'transparent', border: `1px solid ${filled ? STEAM_CYAN : STEAM_CYAN + '88'}`, borderLeft: filled ? `3px solid ${STEAM_CYAN}` : `1px solid ${STEAM_CYAN}88`, cursor: steamBusy ? 'wait' : 'pointer', opacity: steamBusy ? 0.6 : 1 })

  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / IMPORT</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>IMPORT DATABASE</h1>
      </div>

      {/* Source picker */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 24 }}>
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => switchTab(t.id)}
              style={{ textAlign: 'left', padding: '12px 14px', background: on ? `${t.accent}18` : 'var(--bg-card)', border: `1px solid ${on ? t.accent : 'var(--border-dim)'}`, borderLeft: `3px solid ${on ? t.accent : 'var(--border-dim)'}`, cursor: 'pointer', transition: 'all 0.12s ease' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: on ? t.accent : 'var(--text-hi)' }}>{t.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.4 }}>{t.blurb}</div>
            </button>
          )
        })}
      </div>

      {/* ── Steam tab ── */}
      {tab === 'steam' && (
        <div style={panel}>
          {steamId ? (
            <>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STEAM_CYAN, display: 'inline-block' }} />
                Connected{steamPersona ? ` as ${steamPersona}` : ''}
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px' }}>SteamID {steamId}</p>
              {/* Persisted prefs — these control the "Sync Steam" button on the Games page. */}
              <div style={{ border: '1px solid var(--border-dim)', borderLeft: `3px solid ${STEAM_CYAN}`, padding: '14px', marginBottom: 14 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', margin: '0 0 12px' }}>WHAT THE SYNC BUTTON DOES</p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={steamSyncPref} onChange={(e) => toggleSyncPref(e.target.checked)} style={{ accentColor: STEAM_CYAN, width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                  <span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)' }}>Keep playtimes in sync</span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.5 }}>Updates hours on games you already track. Adds nothing new.</span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={steamImportPref} onChange={(e) => toggleImportPref(e.target.checked)} style={{ accentColor: STEAM_CYAN, width: 15, height: 15, marginTop: 2, flexShrink: 0 }} />
                  <span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)' }}>Auto-import new purchases</span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.5 }}>Adds Steam games you don&apos;t track yet (played → In Progress, rest → Backlog).</span>
                  </span>
                </label>
              </div>

              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', margin: '0 0 8px' }}>OR RUN ONCE NOW</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <button onClick={runSteamSync} disabled={steamBusy} style={steamBtn(true)}>⟳ SYNC PLAYTIME</button>
                <button onClick={runSteamImport} disabled={steamBusy} style={steamBtn(false)}>⬇ IMPORT FULL LIBRARY</button>
              </div>
              <button onClick={disconnectSteam} disabled={steamBusy} style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: steamBusy ? 'wait' : 'pointer' }}>DISCONNECT</button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', margin: '0 0 6px', lineHeight: 1.7 }}>
                Link your Steam account to pull in your library and keep game playtime in sync — one click, no setup.
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.7, opacity: 0.85 }}>
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
      )}

      {/* ── File upload ── */}
      {tab !== 'steam' && stage === 'idle' && (
        <div style={panel}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7, margin: '0 0 18px' }}>{active.hint}</p>
          {tab === 'mal' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} style={{ accentColor: active.accent, width: 14, height: 14 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>FETCH COVER ART FROM MYANIMELIST (slower)</span>
            </label>
          )}
          <input ref={fileRef} type="file" accept={active.accept} style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '36px 20px', background: `${active.accent}08`, border: `1px dashed ${active.accent}55`, color: active.accent, fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.12em', cursor: 'pointer' }}>
            <Upload size={16} /> SELECT {active.accept?.replace('.', '').toUpperCase()} FILE
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444410', border: '1px solid #ef4444', borderLeft: '3px solid #ef4444', marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444', letterSpacing: '0.06em', margin: 0 }}>✗ {error}</p>
        </div>
      )}

      {/* Preview */}
      {tab !== 'steam' && stage === 'parsed' && (
        <div style={panel}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 10 }}>PREVIEW</p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: active.accent, letterSpacing: '0.06em', marginBottom: 14, lineHeight: 1 }}>
            {preview.length}<span style={{ fontSize: 16, marginLeft: 10, color: 'var(--text-dim)' }}>ENTRIES FOUND</span>
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            {Object.entries(byCat).map(([cat, count]) => (
              <div key={cat}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)' }}>{count}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', marginLeft: 6 }}>{cat.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleImport}
              style={{ padding: '10px 24px', background: `${active.accent}22`, border: `1px solid ${active.accent}`, borderLeft: `3px solid ${active.accent}`, color: active.accent, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}>
              IMPORT {preview.length} ENTRIES
            </button>
            <button onClick={reset}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {tab !== 'steam' && stage === 'importing' && (
        <div style={panel}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 14 }}>
            {enrichStatus ? 'FETCHING ARTWORK FROM MYANIMELIST…' : 'IMPORTING…'}
          </p>
          <div style={{ height: 4, background: 'var(--bg-base)', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${enrichStatus ? Math.round((enrichStatus.current / enrichStatus.total) * 100) : progress}%`, background: active.accent, transition: 'width 0.1s ease' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: active.accent, letterSpacing: '0.1em' }}>
            {enrichStatus ? `${enrichStatus.current} / ${enrichStatus.total}` : `${progress}%`}
          </p>
        </div>
      )}

      {/* Done */}
      {tab !== 'steam' && stage === 'done' && result && (
        <div style={{ ...panel, borderTopColor: '#22c55e' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 10 }}>IMPORT COMPLETE</p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: '#22c55e', letterSpacing: '0.06em', marginBottom: 6, lineHeight: 1 }}>{result.imported} RECORDS ADDED</p>
          {result.skipped > 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 16 }}>{result.skipped} skipped — already in database</p>}
          <button onClick={reset}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer', marginTop: result.skipped > 0 ? 0 : 16 }}>
            IMPORT ANOTHER
          </button>
        </div>
      )}

      {/* Utility tools */}
      <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 24, marginTop: 12 }}>
        <div style={card}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 6px' }}>FETCH MISSING COVERS</h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 14px' }}>
            Looks up cover art for any entry still missing one, via the built-in catalog search.
          </p>
          <button onClick={runBackfill} disabled={busy}
            style={{ padding: '10px 18px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>✦ FETCH COVERS</button>
          {coverProgress && <span style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: ACCENT }}>{coverProgress.done}/{coverProgress.total}…</span>}
        </div>
        {note && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', letterSpacing: '0.04em' }}>{note}</p>}
      </div>
    </div>
  )
}
