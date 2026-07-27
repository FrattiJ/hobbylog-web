'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, notFound } from 'next/navigation'
import EntryCard from '@/components/EntryCard'
import { HOBBY_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { getEntriesByHobby, insertEntry, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import type { Entry, HobbyCategory, EntryStatus } from '@/types/database'

const STATUSES: (EntryStatus | 'all')[] = ['all', 'backlog', 'in_progress', 'completed', 'dropped']

export default function HobbyPage() {
  const params = useParams()
  const hobbyId = params.hobby as HobbyCategory
  const hobby = HOBBY_MAP[hobbyId]

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!hobby) return
    setLoading(true)
    getEntriesByHobby(hobbyId).then(setEntries).finally(() => setLoading(false))
  }, [hobbyId, hobby])

  useEffect(() => {
    load()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
  }, [load])

  if (!hobby) return notFound()

  async function add() {
    if (!newTitle.trim()) return
    setBusy(true)
    await insertEntry({
      hobby_category: hobbyId, title: newTitle.trim(), status: 'backlog',
      rating: null, notes: null, progress_current: 0, progress_total: null, cover_url: null,
      external_id: null, external_source: null, metadata: { added_via: 'web' },
      book_subtype: hobbyId === 'books' ? 'book' : null, current_season: null, current_episode: null,
      priority: null, date_started: null, date_completed: null,
    })
    setNewTitle(''); setBusy(false)
  }

  const filtered = statusFilter === 'all' ? entries : entries.filter((e) => e.status === statusFilter)

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / {hobby.pluralLabel.toUpperCase()}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>{hobby.pluralLabel.toUpperCase()}</h1>
      </div>

      {/* Add bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder={`Add a ${hobby.label.toLowerCase()}…`}
          style={{ flex: '1 1 240px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${hobby.accent}66`, padding: '10px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }} />
        <button onClick={add} disabled={busy || !newTitle.trim()}
          style={{ padding: '10px 22px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: hobby.accent, background: `${hobby.accent}22`, border: `1px solid ${hobby.accent}`, borderLeft: `3px solid ${hobby.accent}`, cursor: 'pointer', opacity: busy || !newTitle.trim() ? 0.5 : 1 }}>ADD</button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {STATUSES.map((s) => {
          const active = statusFilter === s
          const c = s === 'all' ? hobby.accent : STATUS_COLORS[s]
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', background: active ? `${c}22` : 'transparent', border: `1px solid ${active ? c : 'var(--border-dim)'}`, borderLeft: active ? `3px solid ${c}` : '1px solid var(--border-dim)', color: active ? c : 'var(--text-dim)', cursor: 'pointer' }}>
              {s === 'all' ? 'ALL' : STATUS_LABELS[s].toUpperCase()}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>LOADING…</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mute)', letterSpacing: '0.1em', border: '1px dashed var(--border-dim)' }}>
          {entries.length === 0 ? 'NO ENTRIES YET — ADD ONE ABOVE' : 'NONE MATCH FILTER'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((e, i) => <EntryCard key={e.id} entry={e} index={i} />)}
        </div>
      )}
    </div>
  )
}
