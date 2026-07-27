'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { getAllEntries, bulkInsertEntries } from '@/lib/db'
import { importFromDesktop, backfillCovers } from '@/lib/entries'
import {
  parseMAL, parseLetterboxd, parseGoodreads, enrichMALWithJikan, type PreviewEntry,
} from '@/lib/importParsers'

const ACCENT = '#7c3aed'

type ImportTab = 'mal' | 'letterboxd' | 'goodreads'

const TABS: { id: ImportTab; label: string; accent: string; accept: string; hint: string }[] = [
  { id: 'mal', label: 'MY ANIME LIST', accent: '#2e51a2', accept: '.xml',
    hint: 'Export from MyAnimeList → Account → Export Data → Export Anime/Manga List, then unzip it. Imports anime as TV Shows and manga as Books.' },
  { id: 'letterboxd', label: 'LETTERBOXD', accent: '#00c030', accept: '.csv',
    hint: 'Export from Letterboxd → Settings → Import & Export → Export Your Data. Upload watchlist.csv (→ Backlog), ratings.csv, or diary.csv (→ Completed).' },
  { id: 'goodreads', label: 'GOODREADS', accent: '#d97706', accept: '.csv',
    hint: 'Export from Goodreads → My Books → Import and Export → Export Library. Imports all shelves (to-read, reading, read).' },
]

export default function ImportPage() {
  const [userId, setUserId] = useState<string | null>(null)

  // Service-file importer state
  const [tab, setTab] = useState<ImportTab>('mal')
  const [stage, setStage] = useState<'idle' | 'parsed' | 'importing' | 'done'>('idle')
  const [preview, setPreview] = useState<PreviewEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [enrich, setEnrich] = useState(true)
  const [enrichStatus, setEnrichStatus] = useState<{ current: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Utility-card state (desktop final sync + cover backfill)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
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
    // Enrich after dedupe so re-imports don't burn Jikan quota on skipped entries
    if (tab === 'mal' && enrich) {
      toInsert = await enrichMALWithJikan(toInsert, (current, total) => setEnrichStatus({ current, total }))
      setEnrichStatus(null)
    }
    const imported = await bulkInsertEntries(toInsert, (n) => setProgress(Math.round((n / Math.max(1, toInsert.length)) * 100)))
    setResult({ imported, skipped }); setStage('done')
  }

  async function runDesktopSync() {
    if (!userId) return
    setBusy(true); setNote(null)
    try {
      const n = await importFromDesktop(userId)
      setNote(n > 0 ? `Synced ${n} entr${n === 1 ? 'y' : 'ies'} from your desktop (new + backfilled).` : 'Nothing new — your library is already up to date.')
    } catch (e) { setNote(`Sync failed: ${(e as Error).message}`) }
    setBusy(false)
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
  const utilBtn = (color: string): React.CSSProperties => ({ padding: '10px 18px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color, background: `${color}22`, border: `1px solid ${color}`, borderLeft: `3px solid ${color}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 })

  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / IMPORT</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>IMPORT DATABASE</h1>
      </div>

      {/* Source tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            style={{ padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', background: tab === t.id ? `${t.accent}22` : 'transparent', border: `1px solid ${tab === t.id ? t.accent : 'var(--border-dim)'}`, borderLeft: tab === t.id ? `3px solid ${t.accent}` : '1px solid var(--border-dim)', color: tab === t.id ? t.accent : 'var(--text-dim)', cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload */}
      {stage === 'idle' && (
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
            <Upload size={16} /> SELECT {active.accept.replace('.', '').toUpperCase()} FILE
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444410', border: '1px solid #ef4444', borderLeft: '3px solid #ef4444', marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444', letterSpacing: '0.06em', margin: 0 }}>✗ {error}</p>
        </div>
      )}

      {/* Preview */}
      {stage === 'parsed' && (
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
      {stage === 'importing' && (
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
      {stage === 'done' && result && (
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

      {/* Steam pointer */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '4px 2px 28px' }}>
        Bringing in your Steam games? Connect your account in <span style={{ color: '#0891b2' }}>Settings → Steam</span> for one-click playtime sync.
      </p>

      {/* Utility tools */}
      <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 24 }}>
        <div style={{ ...card, borderLeftColor: '#d97706' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 6px' }}>FINAL SYNC FROM DESKTOP</h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 14px' }}>
            <span style={{ color: '#d97706' }}>⚠ One-time:</span> if you&apos;re sunsetting the desktop app, run this once to pull everything —
            ratings, reviews, notes, covers, times. Open the desktop app (v0.3.3+) first so it uploads the latest.
          </p>
          <button onClick={runDesktopSync} disabled={busy} style={utilBtn('#d97706')}>⬇ RUN FINAL DESKTOP SYNC</button>
        </div>

        <div style={card}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 6px' }}>FETCH MISSING COVERS</h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 14px' }}>
            Looks up cover art for any entry still missing one, via the built-in catalog search.
          </p>
          <button onClick={runBackfill} disabled={busy} style={utilBtn(ACCENT)}>✦ FETCH COVERS</button>
          {coverProgress && <span style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: ACCENT }}>{coverProgress.done}/{coverProgress.total}…</span>}
        </div>

        {note && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', letterSpacing: '0.04em' }}>{note}</p>}
      </div>
    </div>
  )
}
