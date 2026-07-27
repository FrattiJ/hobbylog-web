'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowUp, ArrowDown, ListOrdered, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import EntryCard from './EntryCard'
import AddEntryModal from './AddEntryModal'
import type { Entry, HobbyCategory, EntryStatus, BookSubtype } from '@/types/database'
import { HOBBY_MAP, BOOK_SUBTYPES, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { getEntriesByHobby, setEntryPriorities, ENTRIES_CHANGED_EVENT } from '@/lib/db'

const STATUS_OPTIONS: (EntryStatus | 'all')[] = ['all', 'backlog', 'in_progress', 'completed', 'dropped']

type SortOption = 'recent' | 'name' | 'release' | 'ttb' | 'rank' | 'added'

const SORT_OPTIONS: { id: SortOption; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { id: 'recent',  label: 'RECENT',       defaultDir: 'desc' },
  { id: 'name',    label: 'NAME',         defaultDir: 'asc'  },
  { id: 'release', label: 'RELEASE DATE', defaultDir: 'desc' },
  { id: 'ttb',     label: 'TIME TO BEAT', defaultDir: 'asc'  },
  { id: 'rank',    label: 'RANK',         defaultDir: 'asc'  },
  { id: 'added',   label: 'DATE ADDED',   defaultDir: 'asc'  },
]

function sortValue(e: Entry, by: SortOption): string | number | null {
  if (by === 'name') return e.title.toLowerCase()
  if (by === 'release') {
    const m = e.metadata ?? {}
    if (typeof m.release_year === 'number') return m.release_year
    if (typeof m.year === 'number') return m.year
    if (typeof m.release_date === 'string' && m.release_date) return parseInt(String(m.release_date).slice(0, 4)) || null
    return null
  }
  if (by === 'ttb') {
    const ttb = e.metadata?.time_to_beat
    return ttb != null && !isNaN(Number(ttb)) ? Number(ttb) : null
  }
  if (by === 'rank') return e.priority
  if (by === 'added') return e.created_at
  return e.updated_at // recent
}

// Filters survive navigating away and back during a session (cleared on app restart)
interface SavedFilters {
  status?: EntryStatus | 'all'
  subtype?: BookSubtype | 'all'
  sortBy?: SortOption
  sortDir?: 'asc' | 'desc'
}

function loadSavedFilters(hobbyId: string): SavedFilters {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(`hobby-filters:${hobbyId}`) ?? '{}') } catch { return {} }
}

export default function HobbyPage({ hobbyId }: { hobbyId: HobbyCategory }) {
  const hobby = HOBBY_MAP[hobbyId]
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>(() => loadSavedFilters(hobbyId).status ?? 'all')
  const [subtypeFilter, setSubtypeFilter] = useState<BookSubtype | 'all'>(() => loadSavedFilters(hobbyId).subtype ?? 'all')
  const [search, setSearch] = useState('')
  const [rankMode, setRankMode] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>(() => loadSavedFilters(hobbyId).sortBy ?? 'recent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => loadSavedFilters(hobbyId).sortDir ?? 'desc')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draftPos, setDraftPos] = useState<{ id: string; val: string } | null>(null)

  const loadEntries = useCallback(() => {
    getEntriesByHobby(hobbyId).then(setEntries).finally(() => setLoading(false))
  }, [hobbyId])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Persist filters so they survive navigating to an entry and back
  useEffect(() => {
    sessionStorage.setItem(
      `hobby-filters:${hobbyId}`,
      JSON.stringify({ status: statusFilter, subtype: subtypeFilter, sortBy, sortDir })
    )
  }, [hobbyId, statusFilter, subtypeFilter, sortBy, sortDir])

  // Refresh when entries change anywhere (sidebar quick add, quick log, etc.)
  useEffect(() => {
    window.addEventListener(ENTRIES_CHANGED_EVENT, loadEntries)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, loadEntries)
  }, [loadEntries])

  const byPriority = (a: Entry, b: Entry) => (a.priority ?? 1e9) - (b.priority ?? 1e9)

  const filtered = entries.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (hobbyId === 'books' && subtypeFilter !== 'all' && e.book_subtype !== subtypeFilter) return false
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Sorted view: chosen field, nulls always last regardless of direction
  const display = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortBy)
    const bv = sortValue(b, sortBy)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function handleSortChange(by: SortOption) {
    setSortBy(by)
    setSortDir(SORT_OPTIONS.find((o) => o.id === by)?.defaultDir ?? 'desc')
  }

  // Rank mode ignores the search box so renumbering always covers the whole backlog
  const ranked = entries.filter((e) => e.status === 'backlog').sort(byPriority)

  async function applyOrder(list: Entry[]) {
    const ids = list.map((e) => e.id)
    // Optimistic local update so rows move instantly
    setEntries((prev) => prev.map((e) => {
      const idx = ids.indexOf(e.id)
      return idx >= 0 ? { ...e, priority: idx + 1 } : e
    }))
    await setEntryPriorities(ids)
  }

  function moveTo(from: number, to: number) {
    const clamped = Math.max(0, Math.min(ranked.length - 1, to))
    if (from === clamped) return
    const list = [...ranked]
    const [item] = list.splice(from, 1)
    list.splice(clamped, 0, item)
    applyOrder(list)
  }

  function commitDraftPos(index: number) {
    if (!draftPos) return
    const target = parseInt(draftPos.val)
    setDraftPos(null)
    if (!isNaN(target)) moveTo(index, target - 1)
  }

  const inp = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${hobby.accent}66`,
    padding: '8px 14px',
    color: 'var(--text-hi)',
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    outline: 'none',
    width: '100%',
  }

  if (loading) {
    return (
      <div style={{ padding: '32px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="mech-skeleton"
              style={{
                height: 120,
                clipPath: 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)',
                animationDelay: `${i * 120}ms`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>
            CATEGORY / {hobbyId.toUpperCase()}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 900,
            color: 'var(--text-hi)',
            letterSpacing: '0.08em',
            margin: 0,
          }}>
            {hobby.pluralLabel.toUpperCase()}
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.1em' }}>
            {entries.length} RECORDS INDEXED
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            background: `${hobby.accent}22`,
            border: `1px solid ${hobby.accent}88`,
            borderLeft: `3px solid ${hobby.accent}`,
            color: hobby.accent,
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${hobby.accent}44`; e.currentTarget.style.filter = `drop-shadow(0 0 6px ${hobby.accent}44)` }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${hobby.accent}22`; e.currentTarget.style.filter = 'none' }}
        >
          <Plus size={13} />
          ADD {hobby.label.toUpperCase()}
        </button>
      </div>

      {/* Book sub-type pills */}
      {hobbyId === 'books' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ id: 'all' as const, label: 'All', count: entries.length },
            ...BOOK_SUBTYPES.map((s) => ({
              id: s.id, label: s.label,
              count: entries.filter((e) => e.book_subtype === s.id).length,
            })).filter((s) => s.count > 0),
          ].map((s) => {
            const active = subtypeFilter === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSubtypeFilter(s.id === 'all' ? 'all' : active ? 'all' : s.id)}
                style={{
                  padding: '5px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: active ? `${hobby.accent}22` : 'transparent',
                  border: `1px solid ${active ? hobby.accent : 'var(--border-dim)'}`,
                  borderLeft: active ? `2px solid ${hobby.accent}` : '1px solid var(--border-dim)',
                  color: active ? hobby.accent : 'var(--text-dim)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {s.label} ({s.count})
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 240 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`SEARCH ${hobby.pluralLabel.toUpperCase()}…`}
            style={inp}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s
            const color = s === 'all' ? hobby.accent : STATUS_COLORS[s]
            return (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s)
                  if (s === 'backlog') { setSortBy('rank'); setSortDir('asc') }
                  else { setRankMode(false); if (sortBy === 'rank') handleSortChange('recent') }
                }}
                style={{
                  padding: '5px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: active ? `${color}22` : 'transparent',
                  border: `1px solid ${active ? color : 'var(--border-dim)'}`,
                  borderLeft: active ? `2px solid ${color}` : '1px solid var(--border-dim)',
                  color: active ? color : 'var(--text-dim)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {s === 'all' ? 'ALL' : STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>

        {/* Sort controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
              color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', fontSize: 14,
              letterSpacing: '0.1em', padding: '6px 10px', cursor: 'pointer', outline: 'none',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>SORT: {o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
              color: 'var(--text-mid)', cursor: 'pointer', transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-hi)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-mid)')}
          >
            {sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {statusFilter === 'backlog' && (
          <button
            onClick={() => setRankMode((r) => !r)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginLeft: 'auto',
              padding: '8px 18px',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.1em',
              background: rankMode ? '#d97706' : '#d9770622',
              border: '1px solid #d97706',
              borderLeft: '3px solid #d97706',
              color: rankMode ? 'var(--bg-base)' : '#d97706',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'drop-shadow(0 0 6px #d9770666)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            <ListOrdered size={14} />
            {rankMode ? 'DONE RANKING' : 'RANK BACKLOG'}
          </button>
        )}
      </div>

      {/* Rank mode — ordered backlog list with reorder controls */}
      {rankMode && statusFilter === 'backlog' ? (
        ranked.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mute)', letterSpacing: '0.14em', textAlign: 'center', padding: 32 }}>
            BACKLOG EMPTY — NOTHING TO RANK
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.14em', margin: 0 }}>
              DRAG ROWS, TYPE A POSITION NUMBER, OR USE THE ARROWS
            </p>
            {ranked.map((e, i) => (
              <div
                key={e.id}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData('text/plain', String(i))
                  ev.dataTransfer.effectAllowed = 'move'
                  setDragIndex(i)
                }}
                onDragOver={(ev) => {
                  ev.preventDefault()
                  ev.dataTransfer.dropEffect = 'move'
                  if (dragOverIndex !== i) setDragOverIndex(i)
                }}
                onDrop={(ev) => { ev.preventDefault(); if (dragIndex != null) moveTo(dragIndex, i); setDragIndex(null); setDragOverIndex(null) }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                style={(() => {
                  const isOver = dragOverIndex === i && dragIndex !== i
                  const edge = `1px solid ${isOver ? hobby.accent : 'var(--border-dim)'}`
                  return {
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    background: isOver ? `${hobby.accent}18` : 'var(--bg-card)',
                    borderTop: edge,
                    borderRight: edge,
                    borderBottom: edge,
                    borderLeft: `3px solid ${i === 0 ? '#d97706' : hobby.accent}`,
                    opacity: dragIndex === i ? 0.4 : 1,
                    cursor: 'grab',
                    transition: 'background 0.12s ease, opacity 0.12s ease',
                  } as React.CSSProperties
                })()}
              >
                <GripVertical size={14} style={{ color: 'var(--text-mute)', flexShrink: 0 }} />
                <input
                  type="number"
                  min={1}
                  max={ranked.length}
                  value={draftPos?.id === e.id ? draftPos.val : i + 1}
                  onFocus={() => setDraftPos({ id: e.id, val: String(i + 1) })}
                  onChange={(ev) => setDraftPos({ id: e.id, val: ev.target.value })}
                  onBlur={() => commitDraftPos(i)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                  onClick={(ev) => (ev.target as HTMLInputElement).select()}
                  style={{
                    width: 48, flexShrink: 0,
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-dim)',
                    padding: '6px 0',
                    textAlign: 'center',
                    fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900,
                    color: i === 0 ? '#d97706' : 'var(--text-mid)',
                    outline: 'none',
                  }}
                />
                {e.cover_url && (
                  <img src={e.cover_url} alt="" draggable={false} style={{ width: 32, height: 44, objectFit: 'cover', flexShrink: 0, border: `1px solid ${hobby.accent}33` }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-hi)', letterSpacing: '0.04em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.title}
                  </p>
                  {i === 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#d97706', letterSpacing: '0.14em' }}>▸ UP NEXT</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {([['up', -1, ArrowUp, i === 0], ['down', 1, ArrowDown, i === ranked.length - 1]] as const).map(([key, dir, Icon, disabled]) => (
                    <button key={key} onClick={() => moveTo(i, i + dir)} disabled={disabled}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30,
                        background: 'transparent',
                        border: '1px solid var(--border-dim)',
                        color: disabled ? 'var(--text-mute)' : hobby.accent,
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled ? 0.4 : 1,
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(ev) => { if (!disabled) ev.currentTarget.style.background = `${hobby.accent}22` }}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                    >
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : /* Grid */ filtered.length === 0 ? (
        <div
          style={{
            padding: '64px 32px',
            textAlign: 'center',
            border: `1px solid ${hobby.accent}33`,
            borderLeft: `3px solid ${hobby.accent}`,
            background: 'var(--bg-card)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: hobby.accent, letterSpacing: '0.2em', marginBottom: 8 }}>
            ◈ NO DATA FOUND
          </p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', marginBottom: 4 }}>
            {entries.length === 0 ? `${hobby.pluralLabel.toUpperCase()} LIBRARY EMPTY` : 'NO MATCHES'}
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 20 }}>
            {entries.length === 0 ? 'INITIALIZE FIRST RECORD' : 'ADJUST QUERY PARAMETERS'}
          </p>
          {entries.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '8px 20px',
                background: `${hobby.accent}22`,
                border: `1px solid ${hobby.accent}`,
                color: hobby.accent,
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              ADD FIRST RECORD
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {display.map((entry, i) => <EntryCard key={entry.id} entry={entry} index={i} />)}
        </div>
      )}

      {showModal && (
        <AddEntryModal hobbyId={hobbyId} onClose={() => setShowModal(false)} onAdded={loadEntries} />
      )}
    </div>
  )
}
