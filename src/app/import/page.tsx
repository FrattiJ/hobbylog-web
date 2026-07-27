'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { importFromDesktop, backfillCovers } from '@/lib/entries'

const ACCENT = '#7c3aed'

export default function ImportPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  async function runImport() {
    if (!userId) return
    setBusy(true); setNote(null)
    try {
      const n = await importFromDesktop(userId)
      setNote(n > 0 ? `Synced ${n} entr${n === 1 ? 'y' : 'ies'} from your desktop (new + backfilled).` : 'Nothing new — your library is already up to date.')
    } catch (e) { setNote(`Import failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function runBackfill() {
    setBusy(true); setNote(null); setProgress({ done: 0, total: 0 })
    try {
      const n = await backfillCovers((done, total) => setProgress({ done, total }))
      setNote(n > 0 ? `Fetched artwork for ${n} entr${n === 1 ? 'y' : 'ies'}.` : 'No missing covers found (or no matches).')
    } catch (e) { setNote(`Backfill failed: ${(e as Error).message}`) }
    setProgress(null); setBusy(false)
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16 }
  const btn = (color: string): React.CSSProperties => ({ padding: '10px 18px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color, background: `${color}22`, border: `1px solid ${color}`, borderLeft: `3px solid ${color}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 })

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / IMPORT</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>IMPORT</h1>
      </div>

      <div style={{ ...card, borderLeftColor: '#d97706' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 6px' }}>FINAL SYNC FROM DESKTOP</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 14px' }}>
          <span style={{ color: '#d97706' }}>⚠ One-time:</span> if you&apos;re sunsetting the desktop app, run this once to pull everything —
          ratings, reviews, notes, covers, times. Open the desktop app (v0.3.3+) first so it uploads the latest.
          Once you&apos;ve got everything, this can be removed.
        </p>
        <button onClick={runImport} disabled={busy} style={btn('#d97706')}>⬇ RUN FINAL DESKTOP SYNC</button>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 6px' }}>FETCH MISSING COVERS</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 14px' }}>
          Looks up cover art for any entry still missing one, via the built-in catalog search.
        </p>
        <button onClick={runBackfill} disabled={busy} style={btn(ACCENT)}>✦ FETCH COVERS</button>
        {progress && <span style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: ACCENT }}>{progress.done}/{progress.total}…</span>}
      </div>

      {note && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', letterSpacing: '0.04em' }}>{note}</p>}
    </div>
  )
}
