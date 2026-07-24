'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HOBBIES, HOBBY_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { listEntries, addEntry, setEntryStatus, deleteEntry, importFromDesktop, backfillCovers, type WebEntry } from '@/lib/entries'
import { searchCatalog, searchTypeFor, type CatalogHit } from '@/lib/search'

const CLIP = 'polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)'
const ACCENT = '#7c3aed'
const STATUSES = ['backlog', 'in_progress', 'completed', 'dropped']

const gridBg: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
  backgroundSize: '40px 40px', opacity: 0.25,
}

function chip(active: boolean, accent: string): React.CSSProperties {
  return {
    padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em',
    background: active ? `${accent}22` : 'transparent',
    border: `1px solid ${active ? accent : 'var(--border-dim)'}`,
    borderLeft: active ? `3px solid ${accent}` : `1px solid var(--border-dim)`,
    color: active ? accent : 'var(--text-dim)', cursor: 'pointer', transition: 'all 0.12s ease',
  }
}

function Cover({ url, title, accent, w = 34, h = 50 }: { url: string | null; title: string; accent: string; w?: number; h?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={title} style={{ width: w, height: h, objectFit: 'cover', flexShrink: 0, background: 'var(--bg-base)' }} />
  }
  return (
    <div style={{ width: w, height: h, flexShrink: 0, background: 'var(--bg-base)', border: `1px solid ${accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: w * 0.5, color: `${accent}88` }}>
      {title[0]?.toUpperCase()}
    </div>
  )
}

export default function Backlog({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [entries, setEntries] = useState<WebEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hobbyFilter, setHobbyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newHobby, setNewHobby] = useState('games')
  const [newStatus, setNewStatus] = useState('backlog')
  const [results, setResults] = useState<CatalogHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)

  const userId = session.user.id

  const load = useCallback(() => {
    setLoading(true)
    listEntries().then(setEntries).catch((e) => setNote(`Load failed: ${e.message}`)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Debounced catalog search as you type (games/movies/tv/books only)
  useEffect(() => {
    const type = searchTypeFor(newHobby)
    const q = newTitle.trim()
    if (!type || q.length < 2) { setResults([]); setSearching(false); return }
    const seq = ++searchSeq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const hits = await searchCatalog(type, q)
      if (seq === searchSeq.current) { setResults(hits); setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [newTitle, newHobby])

  async function handleImport() {
    setBusy(true); setNote(null)
    try {
      const n = await importFromDesktop(userId)
      setNote(n > 0 ? `Imported ${n} entr${n === 1 ? 'y' : 'ies'} from your desktop.` : 'Nothing new to import.')
      load()
    } catch (e) { setNote(`Import failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function handleBackfill() {
    setBusy(true); setNote(null); setBackfill({ done: 0, total: 0 })
    try {
      const n = await backfillCovers((done, total) => setBackfill({ done, total }))
      setNote(n > 0 ? `Fetched artwork for ${n} entr${n === 1 ? 'y' : 'ies'}.` : 'No missing covers found (or no matches).')
      load()
    } catch (e) { setNote(`Backfill failed: ${(e as Error).message}`) }
    setBackfill(null); setBusy(false)
  }

  async function addManual() {
    if (!newTitle.trim()) return
    setBusy(true); setNote(null)
    try {
      await addEntry(userId, { title: newTitle.trim(), hobby_category: newHobby, status: newStatus })
      setNewTitle(''); setResults([])
      load()
    } catch (e) { setNote(`Add failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function addFromHit(hit: CatalogHit) {
    setBusy(true); setNote(null)
    try {
      await addEntry(userId, {
        title: hit.title, hobby_category: newHobby, status: newStatus,
        cover_url: hit.cover_url, external_id: hit.external_id, external_source: hit.external_source,
        progress_total: hit.progress_total, metadata: hit.metadata,
      })
      setNewTitle(''); setResults([])
      load()
    } catch (e) { setNote(`Add failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  const filtered = entries.filter((e) =>
    (hobbyFilter === 'all' || e.hobby_category === hobbyFilter) &&
    (statusFilter === 'all' || e.status === statusFilter)
  )
  const shownHobbies = HOBBIES.filter((h) => entries.some((e) => e.hobby_category === h.id))
  const missingCovers = entries.filter((e) => !e.cover_url && searchTypeFor(e.hobby_category)).length

  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase',
  }
  const canSearch = searchTypeFor(newHobby) !== null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
      <div style={gridBg} />

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 60px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p style={{ ...label, color: ACCENT, margin: '0 0 2px' }}>SYSTEM ONLINE</p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.1em', margin: 0 }}>HOBBYLOG</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.email}</span>
            <button onClick={onSignOut} style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>SIGN OUT</button>
          </div>
        </header>

        {/* Import / backfill / add card */}
        <div style={{ padding: '1px', clipPath: CLIP, background: `${ACCENT}44`, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleImport} disabled={busy}
                style={{ padding: '8px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e', borderLeft: '3px solid #22c55e', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                ⬇ IMPORT FROM DESKTOP
              </button>
              {missingCovers > 0 && (
                <button onClick={handleBackfill} disabled={busy}
                  style={{ padding: '8px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                  ✦ FETCH COVERS ({missingCovers})
                </button>
              )}
              {backfill && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ACCENT }}>{backfill.done}/{backfill.total}…</span>}
              {note && !backfill && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{note}</span>}
            </div>

            <p style={{ ...label, margin: '0 0 6px' }}>ADD ENTRY {canSearch && <span style={{ color: 'var(--text-mute)' }}>· type to search</span>}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={canSearch ? 'Search a title…' : 'Title…'}
                onKeyDown={(e) => { if (e.key === 'Enter') addManual() }}
                style={{ flex: '2 1 180px', minWidth: 120, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`, padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }}
              />
              <select value={newHobby} onChange={(e) => setNewHobby(e.target.value)}
                style={{ flex: '1 1 120px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '9px 8px', cursor: 'pointer', outline: 'none' }}>
                {HOBBIES.map((h) => <option key={h.id} value={h.id}>{h.pluralLabel}</option>)}
              </select>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                style={{ flex: '1 1 110px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '9px 8px', cursor: 'pointer', outline: 'none' }}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button onClick={addManual} disabled={busy || !newTitle.trim()}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', opacity: busy || !newTitle.trim() ? 0.5 : 1 }}>ADD</button>
            </div>

            {/* Search results dropdown */}
            {canSearch && (searching || results.length > 0) && (
              <div style={{ marginTop: 8, border: '1px solid var(--border-dim)', background: 'var(--bg-base)', maxHeight: 300, overflowY: 'auto' }}>
                {searching && results.length === 0 && (
                  <div style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>SEARCHING…</div>
                )}
                {results.map((r) => (
                  <button key={`${r.external_source}-${r.external_id}`} onClick={() => addFromHit(r)} disabled={busy}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 8, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dim)', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <Cover url={r.cover_url} title={r.title} accent={HOBBY_MAP[newHobby]?.accent ?? ACCENT} w={30} h={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{r.year ?? ''}{r.metadata.author ? ` · ${r.metadata.author}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <button onClick={() => setHobbyFilter('all')} style={chip(hobbyFilter === 'all', ACCENT)}>ALL</button>
          {shownHobbies.map((h) => (
            <button key={h.id} onClick={() => setHobbyFilter(h.id)} style={chip(hobbyFilter === h.id, h.accent)}>{h.pluralLabel.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          <button onClick={() => setStatusFilter('all')} style={chip(statusFilter === 'all', 'var(--text-dim)')}>ALL STATUS</button>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={chip(statusFilter === s, STATUS_COLORS[s])}>{STATUS_LABELS[s].toUpperCase()}</button>
          ))}
        </div>

        <p style={{ ...label, margin: '0 0 10px' }}>{loading ? 'LOADING…' : `${filtered.length} ENTR${filtered.length === 1 ? 'Y' : 'IES'}`}</p>

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mute)', letterSpacing: '0.1em', border: '1px dashed var(--border-dim)' }}>
            {entries.length === 0 ? 'NO ENTRIES YET — IMPORT FROM DESKTOP OR ADD ONE ABOVE' : 'NONE MATCH FILTER'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((e) => {
            const hobby = HOBBY_MAP[e.hobby_category]
            const accent = hobby?.accent ?? ACCENT
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px 8px 8px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${accent}` }}>
                <Cover url={e.cover_url} title={e.title} accent={accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
                    {(hobby?.pluralLabel ?? e.hobby_category).toUpperCase()}
                    {e.priority != null ? ` · #${e.priority}` : ''}
                    {e.progress_total ? ` · ${e.progress_current ?? 0}/${e.progress_total}` : ''}
                  </div>
                </div>
                <select value={e.status} onChange={async (ev) => { await setEntryStatus(e.id, ev.target.value); load() }}
                  style={{ flexShrink: 0, background: 'var(--bg-base)', border: `1px solid ${STATUS_COLORS[e.status]}55`, color: STATUS_COLORS[e.status], fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 6px', cursor: 'pointer', outline: 'none' }}>
                  {STATUSES.map((s) => <option key={s} value={s} style={{ color: 'var(--text-hi)', background: 'var(--bg-card)' }}>{STATUS_LABELS[s]}</option>)}
                </select>
                <button onClick={async () => { if (confirm(`Delete "${e.title}"?`)) { await deleteEntry(e.id); load() } }}
                  style={{ flexShrink: 0, padding: '5px 9px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', background: 'transparent', border: '1px solid #ef444455', cursor: 'pointer' }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
