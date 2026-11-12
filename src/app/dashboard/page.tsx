'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import EntryCard from '@/components/EntryCard'
import CoverTile from '@/components/CoverTile'
import StatCard from '@/components/StatCard'
import MechCard from '@/components/MechCard'
import { getAllEntries, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import { getWorkoutTotals, FITNESS_CHANGED_EVENT, type WorkoutTotals } from '@/lib/fitness/db'
import { STATUS_LABELS, HOBBY_PATHS } from '@/lib/hobbies'
import type { Entry, HobbyCategory } from '@/types/database'
import { useHobbies } from '@/components/HobbyContext'
import GettingStarted from '@/components/GettingStarted'
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
        fontFamily: 'var(--font-body)', fontSize: 14, letterSpacing: '0.05em',
        background: active ? 'color-mix(in srgb, var(--text-dim) 20%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'var(--text-dim)' : 'var(--border-dim)'}`,
        color: active ? 'var(--text-mid)' : 'var(--text-dim)',
        cursor: 'pointer', transition: 'var(--t-fast)',
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
  const [workouts, setWorkouts] = useState<WorkoutTotals>({ count: 0, minutes: 0 })

  useEffect(() => {
    const load = () => getAllEntries().then(setEntries).finally(() => setLoading(false))
    load()
    // Refresh when entries change anywhere (sidebar quick add, quick log, etc.)
    // Fitness isn't in web_entries, so its tile count comes from the workout log.
    const loadWorkouts = () => getWorkoutTotals().then(setWorkouts).catch(() => {})
    loadWorkouts()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    window.addEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    return () => {
      window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
      window.removeEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    }
  }, [])

  const inProgress = entries.filter((e) => e.status === 'in_progress')
  const completed  = entries.filter((e) => e.status === 'completed')
  const backlog    = entries.filter((e) => e.status === 'backlog')

  // What the category index counts. Fitness has no entries — its tile shows how
  // many workouts have been logged instead.
  const countFor = (id: HobbyCategory) =>
    id === 'fitness' ? workouts.count : entries.filter((e) => e.hobby_category === id).length

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
      <div className="page">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
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
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>
          DASHBOARD
        </h1>
      </div>

      <GettingStarted />

      {/* ── Clickable stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatFilterCard label="All Entries"    value={entries.length}    accent="#955ff0" index={0} active={activeFilter === 'all'}         onClick={() => handleStatClick('all')} />
        <StatFilterCard label="In Progress"    value={inProgress.length} accent="#0891b2" index={1} active={activeFilter === 'in_progress'} onClick={() => handleStatClick('in_progress')} />
        <StatFilterCard label="Completed"      value={completed.length}  accent="#22c55e" index={2} active={activeFilter === 'completed'}   onClick={() => handleStatClick('completed')} />
        <StatFilterCard label="Backlog"        value={backlog.length}    accent="var(--text-dim)" index={3} active={activeFilter === 'backlog'}     onClick={() => handleStatClick('backlog')} />
      </div>

      {/* ── Hours tracking ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <StatCard label="Hours Left in Backlog" sub="Estimated from the length of each item" value={Math.round(backlogHours * 10) / 10} accent="var(--text-dim)" index={4} />
          <StatCard label="Hours Spent" sub="On everything in progress or completed" value={Math.round(activeHours * 10) / 10} accent="#0891b2" index={5} />
        </div>
      </div>

      {/* ── Expanded list panel ── */}
      {activeFilter !== null && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dim)',
            borderTop: `2px solid ${activeFilter === 'in_progress' ? '#0891b2' : activeFilter === 'completed' ? '#22c55e' : activeFilter === 'backlog' ? 'var(--text-dim)' : '#955ff0'}`,
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)', margin: 0 }}>
                  {activeFilter === 'all' ? 'All entries' : STATUS_LABELS[activeFilter]}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 400, color: 'var(--text-dim)', marginLeft: 8 }}>{expandedEntries.length}</span>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Hobby filter pills */}
                <select
                  value={hobbyFilter}
                  onChange={(e) => setHobbyFilter(e.target.value)}
                  aria-label="Filter by hobby"
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
                    color: 'var(--text-mid)', fontFamily: 'var(--font-body)', fontSize: 14,
                    letterSpacing: '0.05em', padding: '4px 8px', cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">All hobbies</option>
                  {enabledHobbies.filter((h) => !h.customSection).map((h) => (
                    <option key={h.id} value={h.id}>{h.pluralLabel}</option>
                  ))}
                </select>

                {/* Sort buttons */}
                <SortBtn field="updated" label="Recent" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="title"   label="Title"  sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="rating"  label="Rating" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn field="hobby"   label="Type"   sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />
                {activeFilter === 'backlog' && <SortBtn field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} />}
              </div>
            </div>

            {/* Entry grid */}
            <div style={{ padding: 12 }}>
              {expandedEntries.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', textAlign: 'center', padding: '24px 0', margin: 0 }}>
                  No entries match this filter
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
<h2 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: 0, margin: '0 0 12px' }}>By hobby</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
          {(() => {
            const counts = new Map(enabledHobbies.map((h) => [h.id, countFor(h.id)]))
            const nonEmpty = enabledHobbies.filter((h) => (counts.get(h.id) ?? 0) > 0)
            // Auto-hide hobbies with nothing tracked; but if EVERYTHING is empty
            // (brand-new operator) show them all so the grid isn't blank.
            return (nonEmpty.length > 0 ? nonEmpty : enabledHobbies)
          })().map((h, i) => {
            const count = countFor(h.id)
            return (
              <MechCard key={h.id} accent={h.accent} index={i + 4} hoverable onClick={() => router.push(HOBBY_PATHS[h.id])}>
                <div style={{ padding: '14px 10px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 26, color: h.accent, lineHeight: 1, margin: '0 0 6px' }}>{count}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.3, margin: 0 }}>
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
          <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: 0, margin: '0 0 12px' }}>Pick up where you left off</h2>
          <div className="cover-grid">
            {inProgress.slice(0, 6).map((e) => <CoverTile key={e.id} entry={e} showStatus={false} showHobby />)}
          </div>
        </div>
      )}

      {/* ── Recent ── */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: 0, margin: '0 0 12px' }}>Recent activity</h2>
        {entries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>Nothing logged yet</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: '0 0 20px' }}>
              Use Add Entry in the sidebar to start your library with a game, a film, a book or anything else you track.
            </p>
            <button
              onClick={() => router.push('/games')}
              style={{ height: 40, padding: '0 18px', background: '#955ff022', border: '1px solid #955ff0', color: '#955ff0', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Open Video Games
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
