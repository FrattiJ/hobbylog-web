'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import EntryCard from '@/components/EntryCard'
import StatCard from '@/components/StatCard'
import MechCard from '@/components/MechCard'
import { getAllEntries, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import { STATUS_LABELS, HOBBY_PATHS } from '@/lib/hobbies'
import type { Entry } from '@/types/database'
import { useHobbies } from '@/components/HobbyContext'
import { calcHours } from '@/lib/hours'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'

type StatFilter = 'all' | 'in_progress' | 'completed' | 'backlog' | null
type SortField  = 'title' | 'rating' | 'updated' | 'hobby' | 'priority'
type SortDir    = 'asc' | 'desc'

function SortBtn({ field, label, sortField, sortDir, onToggle }: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir; onToggle: (f: SortField) => void
}) {
  const active = sortField === field
  return (
    <button
      onClick={() => onToggle(field)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 10px',
        fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '0.12em',
        background: active ? 'color-mix(in srgb, var(--text-dim) 20%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'var(--text-dim)' : 'var(--border-dim)'}`,
        color: active ? 'var(--text-mid)' : 'var(--text-dim)',
        cursor: 'pointer', transition: 'all 0.12s ease',
      }}
    >
      {label}
      {active
        ? (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />)
        : <ArrowUpDown size={9} style={{ opacity: 0.4 }} />}
    </button>
  )
}

function StatFilterCard({
  label, value, accent, index, active, onClick,
}: {
  label: string; value: number; accent: string; index: number
  active: boolean; onClick: () => void
}) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer' }}>
      <StatCard label={label} value={value} accent={accent} index={index} />
      {active && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
          <ChevronDown size={12} style={{ color: accent }} />
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { enabledHobbies } = useHobbies()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<StatFilter>(null)
  const [sortField, setSortField] = useState<SortField>('updated')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [hobbyFilter, setHobbyFilter] = useState<string>('all')

  useEffect(() => {
    const load = () => getAllEntries().then(setEntries).finally(() => setLoading(false))
    load()
    // Refresh when entries change anywhere (sidebar quick add, quick log, etc.)
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
  }, [])

  const inProgress = entries.filter((e) => e.status === 'in_progress')
  const completed  = entries.filter((e) => e.status === 'completed')
  const backlog    = entries.filter((e) => e.status === 'backlog')

  // Backlog = full remaining length; active = time actually spent (TV counts watched episodes)
  const backlogHours = calcHours(backlog, 'full')
  const activeHours = calcHours([...inProgress, ...completed], 'spent')

  // Stat card click: toggle or switch filter
  function handleStatClick(key: StatFilter) {
    setActiveFilter((prev) => prev === key ? null : key)
    setHobbyFilter('all')
    setSortField('updated')
    setSortDir('desc')
  }

  // Expanded list entries (derived from entries directly so the memo deps stay stable)
  const expandedEntries = useMemo(() => {
    let base = activeFilter === 'all' ? entries
             : activeFilter !== null  ? entries.filter((e) => e.status === activeFilter)
             : []

    if (hobbyFilter !== 'all') base = base.filter((e) => e.hobby_category === hobbyFilter)

    return [...base].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title')   cmp = a.title.localeCompare(b.title)
      if (sortField === 'rating')  cmp = (a.rating ?? 0) - (b.rating ?? 0)
      if (sortField === 'updated') cmp = a.updated_at.localeCompare(b.updated_at)
      if (sortField === 'hobby')   cmp = a.hobby_category.localeCompare(b.hobby_category)
      if (sortField === 'priority') cmp = (a.priority ?? 1e9) - (b.priority ?? 1e9)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [activeFilter, entries, sortField, sortDir, hobbyFilter])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="mech-skeleton"
              style={{ height: 110, clipPath: 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)', animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / STATUS</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>
          MISSION OVERVIEW
        </h1>
      </div>

      {/* ── Clickable stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatFilterCard label="Total Records"  value={entries.length}    accent="#7c3aed" index={0} active={activeFilter === 'all'}         onClick={() => handleStatClick('all')} />
        <StatFilterCard label="In Progress"    value={inProgress.length} accent="#0891b2" index={1} active={activeFilter === 'in_progress'} onClick={() => handleStatClick('in_progress')} />
        <StatFilterCard label="Completed"      value={completed.length}  accent="#22c55e" index={2} active={activeFilter === 'completed'}   onClick={() => handleStatClick('completed')} />
        <StatFilterCard label="Backlog"        value={backlog.length}    accent="var(--text-dim)" index={3} active={activeFilter === 'backlog'}     onClick={() => handleStatClick('backlog')} />
      </div>

      {/* ── Hours tracking ── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 8, opacity: 0.7 }}>
          (Games, Movies, Audiobooks, TV shows @ 22min/ep)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <StatCard label="Backlog Hours" value={Math.round(backlogHours * 10) / 10} accent="var(--text-dim)" index={4} />
          <StatCard label="In Progress + Completed" value={Math.round(activeHours * 10) / 10} accent="#0891b2" index={5} />
        </div>
      </div>

      {/* ── Expanded list panel ── */}
      {activeFilter !== null && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dim)',
            borderTop: `2px solid ${activeFilter === 'in_progress' ? '#0891b2' : activeFilter === 'completed' ? '#22c55e' : activeFilter === 'backlog' ? 'var(--text-dim)' : '#7c3aed'}`,
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: 0 }}>
                  {activeFilter === 'all' ? 'ALL RECORDS' : STATUS_LABELS[activeFilter].toUpperCase()} — {expandedEntries.length} ENTRIES
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Hobby filter pills */}
                <select
                  value={hobbyFilter}
                  onChange={(e) => setHobbyFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
                    color: 'var(--text-mid)', fontFamily: 'var(--font-mono)', fontSize: 14,
                    letterSpacing: '0.1em', padding: '4px 8px', cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">ALL CATEGORIES</option>
                  {enabledHobbies.map((h) => (
                    <option key={h.id} value={h.id}>{h.pluralLabel.toUpperCase()}</option>
                  ))}
                </select>

                {/* Sort buttons */}
                <SortBtn field="updated" label="RECENT" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="title"   label="TITLE"  sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="rating"  label="RATING" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="hobby"   label="TYPE"   sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                {activeFilter === 'backlog' && <SortBtn field="priority" label="PRIORITY" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />}
              </div>
            </div>

            {/* Entry grid */}
            <div style={{ padding: 12 }}>
              {expandedEntries.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mute)', letterSpacing: '0.14em', textAlign: 'center', padding: '24px 0' }}>
                  NO RECORDS MATCH FILTER
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {expandedEntries.map((e, i) => <EntryCard key={e.id} entry={e} index={i} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Category index ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 12 }}>
          CATEGORY INDEX
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${enabledHobbies.length}, 1fr)`, gap: 8 }}>
          {enabledHobbies.map((h, i) => {
            const count = entries.filter((e) => e.hobby_category === h.id).length
            return (
              <MechCard key={h.id} accent={h.accent} index={i + 4} hoverable onClick={() => router.push(HOBBY_PATHS[h.id])}>
                <div style={{ padding: '14px 10px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 24, color: h.accent, lineHeight: 1, marginBottom: 4 }}>{count}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.3 }}>
                    {h.pluralLabel}
                  </p>
                </div>
              </MechCard>
            )
          })}
        </div>
      </div>

      {/* ── In Progress ── */}
      {inProgress.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, background: '#0891b2', borderRadius: '50%', animation: 'status-blink 2s ease-in-out infinite', flexShrink: 0 }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: 0 }}>ACTIVE OPERATIONS</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {inProgress.slice(0, 6).map((e, i) => <EntryCard key={e.id} entry={e} index={i + 11} />)}
          </div>
        </div>
      )}

      {/* ── Recent ── */}
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 12 }}>RECENT ACTIVITY</p>
        {entries.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', border: '1px solid var(--border-dim)', borderLeft: '3px solid #7c3aed', background: 'var(--bg-card)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>◈ NO RECORDS FOUND</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', marginBottom: 16 }}>DATABASE EMPTY</p>
            <button
              onClick={() => router.push('/games')}
              style={{ padding: '8px 20px', background: '#7c3aed22', border: '1px solid #7c3aed', color: '#7c3aed', fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.1em', cursor: 'pointer' }}
            >
              INITIALIZE FIRST RECORD
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {entries.slice(0, 6).map((e, i) => <EntryCard key={e.id} entry={e} index={i + 17} />)}
          </div>
        )}
      </div>
    </div>
  )
}
