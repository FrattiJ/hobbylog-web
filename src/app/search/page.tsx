'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import EntryCard from '@/components/EntryCard'
import type { Entry, HobbyCategory, EntryStatus } from '@/types/database'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { getAllEntries, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import { useHobbies } from '@/components/HobbyContext'

const STATUS_OPTIONS: (EntryStatus | 'all')[] = ['all', 'wishlist', 'backlog', 'in_progress', 'completed', 'dropped']

type SortKey = 'recent' | 'name' | 'rating' | 'added'

export default function SearchPage() {
  const { enabledHobbies } = useHobbies()
  const [entries, setEntries] = useState<Entry[]>([])
  const [query, setQuery] = useState('')
  const [hobbyFilter, setHobbyFilter] = useState<HobbyCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')
  const [minRating, setMinRating] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  useEffect(() => {
    const load = () => getAllEntries().then(setEntries)
    load()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
  }, [])

  const filtered = entries
    .filter((e) => {
      if (query && !e.title.toLowerCase().includes(query.toLowerCase())) return false
      if (hobbyFilter !== 'all' && e.hobby_category !== hobbyFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (minRating && (e.rating == null || e.rating < parseFloat(minRating))) return false
      return true
    })
    .sort((a, b) => {
      if (sort === 'recent') return b.updated_at.localeCompare(a.updated_at)
      if (sort === 'name')   return a.title.localeCompare(b.title)
      if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1)
      if (sort === 'added')  return b.created_at.localeCompare(a.created_at)
      return 0
    })

  function pill(
    label: string,
    active: boolean,
    onClick: () => void,
    accent = '#955ff0',
  ) {
    return (
      <button
        onClick={onClick}
        style={{
          padding: '4px 12px',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          letterSpacing: '0.05em',
          background: active ? `${accent}22` : 'transparent',
          border: `1px solid ${active ? accent : 'var(--border-dim)'}`,
          borderLeft: active ? `2px solid ${accent}` : '1px solid var(--border-dim)',
          color: active ? accent : 'var(--text-dim)',
          cursor: 'pointer',
          transition: 'var(--t-fast)',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>
          SEARCH
        </h1>
      </div>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Titles…"
          autoFocus
          style={{
            width: '100%',
            paddingLeft: 40, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dim)',
            borderLeft: '2px solid #955ff0',
            color: 'var(--text-hi)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            letterSpacing: '0.02em',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Filters row */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dim)',
        borderTop: '2px solid #955ff0',
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
      }}>
        {/* Category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.08em', width: 64, flexShrink: 0 }}>
            Category
          </span>
          {pill('All', hobbyFilter === 'all', () => setHobbyFilter('all'))}
          {enabledHobbies.map((h) =>
            pill(h.pluralLabel, hobbyFilter === h.id, () => setHobbyFilter(hobbyFilter === h.id ? 'all' : h.id), h.accent)
          )}
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.08em', width: 64, flexShrink: 0 }}>
            Status
          </span>
          {STATUS_OPTIONS.map((s) => {
            const accent = s === 'all' ? '#955ff0' : STATUS_COLORS[s]
            const label = s === 'all' ? 'All' : STATUS_LABELS[s]
            return pill(label, statusFilter === s, () => setStatusFilter(s), accent)
          })}
        </div>

        {/* Min rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.08em', width: 64, flexShrink: 0 }}>
            Min Score
          </span>
          <input
            type="number" min={1} max={10} step={0.5}
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            placeholder="—"
            style={{
              width: 64,
              padding: '4px 8px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-dim)',
              borderLeft: minRating ? '2px solid #d97706' : '1px solid var(--border-dim)',
              color: 'var(--text-hi)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              letterSpacing: '0.02em',
              outline: 'none',
            }}
          />
          {minRating && (
            <button
              onClick={() => setMinRating('')}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
                background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, borderTop: '1px solid var(--border-dim)', paddingTop: 10, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.08em', width: 64, flexShrink: 0 }}>
            Sort
          </span>
          {pill('Recent',     sort === 'recent', () => setSort('recent'))}
          {pill('Name',       sort === 'name',   () => setSort('name'))}
          {pill('Rating',     sort === 'rating', () => setSort('rating'),  '#d97706')}
          {pill('Date Added', sort === 'added',  () => setSort('added'),   '#0891b2')}
        </div>
      </div>

      {/* Result count */}
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 14 }}>
        {filtered.length} Record{filtered.length !== 1 ? 'S' : ''} Found
      </p>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '48px 32px', textAlign: 'center',
          border: '1px solid var(--border-dim)',
          borderLeft: '3px solid #955ff0',
          background: 'var(--bg-card)',
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 6 }}>
            No entries match
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-hi)', margin: 0 }}>
            Try different filters or another search term.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((e, i) => <EntryCard key={e.id} entry={e} index={i} />)}
        </div>
      )}
    </div>
  )
}
