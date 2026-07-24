'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HOBBIES, HOBBY_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { listEntries, addEntry, setEntryStatus, deleteEntry, importFromDesktop, type WebEntry } from '@/lib/entries'

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

export default function Backlog({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [entries, setEntries] = useState<WebEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hobbyFilter, setHobbyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newHobby, setNewHobby] = useState('games')
  const [newStatus, setNewStatus] = useState('backlog')

  const userId = session.user.id

  const load = useCallback(() => {
    setLoading(true)
    listEntries().then(setEntries).catch((e) => setNote(`Load failed: ${e.message}`)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleImport() {
    setBusy(true); setNote(null)
    try {
      const n = await importFromDesktop(userId)
      setNote(n > 0 ? `Imported ${n} entr${n === 1 ? 'y' : 'ies'} from your desktop.` : 'Nothing new to import — you already have everything.')
      load()
    } catch (e) { setNote(`Import failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function handleAdd() {
    if (!newTitle.trim()) return
    setBusy(true); setNote(null)
    try {
      await addEntry(userId, { title: newTitle.trim(), hobby_category: newHobby, status: newStatus })
      setNewTitle('')
      load()
    } catch (e) { setNote(`Add failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  const filtered = entries.filter((e) =>
    (hobbyFilter === 'all' || e.hobby_category === hobbyFilter) &&
    (statusFilter === 'all' || e.status === statusFilter)
  )
  const shownHobbies = HOBBIES.filter((h) => entries.some((e) => e.hobby_category === h.id))

  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase',
  }

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

        {/* Import + Add card */}
        <div style={{ padding: '1px', clipPath: CLIP, background: `${ACCENT}44`, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleImport} disabled={busy}
                style={{ padding: '8px 14px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e', borderLeft: '3px solid #22c55e', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                ⬇ IMPORT FROM DESKTOP
              </button>
              {note && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{note}</span>}
            </div>

            <p style={{ ...label, margin: '0 0 6px' }}>ADD ENTRY</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title…"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
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
              <button onClick={handleAdd} disabled={busy || !newTitle.trim()}
                style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', opacity: busy || !newTitle.trim() ? 0.5 : 1 }}>ADD</button>
            </div>
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

        {/* Count */}
        <p style={{ ...label, margin: '0 0 10px' }}>{loading ? 'LOADING…' : `${filtered.length} ENTR${filtered.length === 1 ? 'Y' : 'IES'}`}</p>

        {/* Entry list */}
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
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${accent}` }}>
                {e.priority != null && (
                  <span style={{ flexShrink: 0, minWidth: 30, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: accent }}>#{e.priority}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
                    {(hobby?.pluralLabel ?? e.hobby_category).toUpperCase()}
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
