'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowUp, ArrowDown, ListOrdered, GripVertical, ChevronUp, ChevronDown, CheckSquare, Trash2, X, LayoutGrid, List } from 'lucide-react'
import EntryCard from './EntryCard'
import CoverTile from './CoverTile'
import ShelfWall from './ShelfWall'
import AddEntryModal from './AddEntryModal'
import SteamSync from './SteamSync'
import { useToast } from './Toast'
import type { Entry, HobbyCategory, EntryStatus, BookSubtype } from '@/types/database'
import { HOBBY_MAP, BOOK_SUBTYPES, STATUS_COLORS, statusesFor, statusLabelFor } from '@/lib/hobbies'
import { MEAL_TAGS, readRecipe } from '@/lib/recipe'
import { getEntriesByHobby, setEntryPriorities, bulkDeleteEntries, bulkSetStatus, bulkSetCompletedDate, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import { todayIso, formatDay } from '@/lib/format'
import { useConfirm } from '@/components/ConfirmDialog'
import { readParam, readParamOneOf, useUrlParams } from '@/lib/urlState'
import { useProgressive } from '@/lib/useProgressive'
import ListFooter from '@/components/ListFooter'


type SortOption = 'recent' | 'name' | 'release' | 'ttb' | 'rank' | 'added' | 'finished'

const SORT_OPTIONS: { id: SortOption; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { id: 'recent',  label: 'Recent',       defaultDir: 'desc' },
  { id: 'name',    label: 'Name',         defaultDir: 'asc'  },
  { id: 'release', label: 'Release Date', defaultDir: 'desc' },
  { id: 'ttb',     label: 'Time to Beat', defaultDir: 'asc'  },
  { id: 'rank',    label: 'Rank',         defaultDir: 'asc'  },
  { id: 'added',   label: 'Date Added',   defaultDir: 'asc'  },
  { id: 'finished', label: 'Date Finished', defaultDir: 'desc' },
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
  if (by === 'finished') return e.date_completed
  return e.updated_at // recent
}

// Filters survive navigating away and back during a session (cleared on app restart)
interface SavedFilters {
  status?: EntryStatus | 'all'
  subtype?: BookSubtype | 'all'
  mealTag?: string
  sortBy?: SortOption
  sortDir?: 'asc' | 'desc'
}

function loadSavedFilters(hobbyId: string): SavedFilters {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(`hobby-filters:${hobbyId}`) ?? '{}') } catch { return {} }
}

// Covers or compact rows. A reading preference rather than a filter, so it is
// remembered across hobbies and visits, not per page.
type ViewMode = 'grid' | 'list'
const VIEW_KEY = 'hobbylog-library-view'
function loadView(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

export default function HobbyPage({ hobbyId }: { hobbyId: HobbyCategory }) {
  const hobby = HOBBY_MAP[hobbyId]
  const [entries, setEntries] = useState<Entry[]>([])
  // A URL that names any filter is taken as the whole story: a shared link to
  // ?status=completed should not also pick up the sort order this browser
  // happened to use last. Session memory only fills in for a bare URL.
  const [saved] = useState<SavedFilters>(() =>
    ['status', 'type', 'meal', 'sort', 'dir', 'q'].some((k) => readParam(k) !== null) ? {} : loadSavedFilters(hobbyId))
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  // Each filter starts from the URL if it names one, otherwise from `saved`,
  // otherwise from the default.
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>(() =>
    readParamOneOf('status', statusesFor(hobby)) ?? saved.status ?? 'all')
  const [subtypeFilter, setSubtypeFilter] = useState<BookSubtype | 'all'>(() =>
    readParamOneOf('type', BOOK_SUBTYPES.map((s) => s.id)) ?? saved.subtype ?? 'all')
  const [mealTag, setMealTag] = useState<string>(() =>
    readParamOneOf('meal', MEAL_TAGS.map((t) => t.id)) ?? saved.mealTag ?? 'all')
  const [search, setSearch] = useState(() => readParam('q') ?? '')
  const [view, setViewState] = useState<ViewMode>(loadView)
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }
  const [rankMode, setRankMode] = useState(false)
  const isRecipe = !!hobby.recipe
  const statusOptions: (EntryStatus | 'all')[] = ['all', ...statusesFor(hobby)]
  // Time-to-Beat only makes sense for games, and a recipe has no release date.
  const sortOptions = SORT_OPTIONS.filter((o) => (o.id !== 'ttb' || hobbyId === 'games') && !(isRecipe && o.id === 'release'))
  const savedSort = readParamOneOf('sort', SORT_OPTIONS.map((o) => o.id)) ?? saved.sortBy
  const [sortBy, setSortBy] = useState<SortOption>(() => (savedSort === 'ttb' && hobbyId !== 'games' ? 'recent' : savedSort) ?? 'recent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() =>
    readParamOneOf('dir', ['asc', 'desc'] as const) ?? saved.sortDir ?? 'desc')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draftPos, setDraftPos] = useState<{ id: string; val: string } | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()

  const loadEntries = useCallback(() => {
    getEntriesByHobby(hobbyId).then(setEntries).finally(() => setLoading(false))
  }, [hobbyId])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Persist filters so they survive navigating to an entry and back
  useEffect(() => {
    sessionStorage.setItem(
      `hobby-filters:${hobbyId}`,
      JSON.stringify({ status: statusFilter, subtype: subtypeFilter, mealTag, sortBy, sortDir })
    )
  }, [hobbyId, statusFilter, subtypeFilter, mealTag, sortBy, sortDir])

  // The same state, mirrored into the URL. Anything at its default is left out.
  useUrlParams({
    status: statusFilter === 'all' ? null : statusFilter,
    type: subtypeFilter === 'all' ? null : subtypeFilter,
    meal: mealTag === 'all' ? null : mealTag,
    sort: sortBy === 'recent' ? null : sortBy,
    dir: sortDir === (SORT_OPTIONS.find((o) => o.id === sortBy)?.defaultDir ?? 'desc') ? null : sortDir,
  })
  useUrlParams({ q: search.trim() || null }, 300)

  // Refresh when entries change anywhere (sidebar quick add, quick log, etc.)
  useEffect(() => {
    window.addEventListener(ENTRIES_CHANGED_EVENT, loadEntries)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, loadEntries)
  }, [loadEntries])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function exitSelect() { setSelectMode(false); setSelectedIds(new Set()) }
  async function bulkDelete(ids: string[]) {
    if (ids.length === 0 || bulkBusy) return
    const what = ids.length === 1 ? 'this entry' : `these ${ids.length} entries`
    if (!(await confirm({
      title: `Delete ${what}?`,
      body: 'Their sessions, photos and notes go with them. This cannot be undone.',
      confirmLabel: ids.length === 1 ? 'Delete Entry' : `Delete ${ids.length} Entries`,
      danger: true,
    }))) return
    setBulkBusy(true)
    try { await bulkDeleteEntries(ids); toastSuccess(`Deleted ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}`); exitSelect(); loadEntries() }
    catch { toastError('Could not delete — try again') }
    setBulkBusy(false)
  }
  // Imports and older logs often mark things completed with no date, which
  // leaves them undated on the Shelf. This fills the date in for a selection.
  const [bulkDate, setBulkDate] = useState('')
  async function bulkFinishDate(ids: string[]) {
    if (ids.length === 0 || !bulkDate || bulkBusy) return
    setBulkBusy(true)
    try {
      await bulkSetCompletedDate(ids, bulkDate)
      toastSuccess(`Finish date set to ${formatDay(bulkDate)} for ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}`)
      exitSelect(); loadEntries()
    } catch { toastError('Could not set the date. Try again.') }
    setBulkBusy(false)
  }
  async function bulkStatus(ids: string[], status: EntryStatus) {
    if (ids.length === 0 || bulkBusy) return
    setBulkBusy(true)
    try { await bulkSetStatus(ids, status); toastSuccess(`Moved ${ids.length} to ${statusLabelFor(hobby, status)}`); exitSelect(); loadEntries() }
    catch { toastError('Could not update — try again') }
    setBulkBusy(false)
  }

  const byPriority = (a: Entry, b: Entry) => (a.priority ?? 1e9) - (b.priority ?? 1e9)

  // Parsed once per render rather than once per entry per pill.
  const mealTagsOf = new Map(isRecipe ? entries.map((e) => [e.id, readRecipe(e.metadata).meal_tags]) : [])

  const filtered = entries.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (hobbyId === 'books' && subtypeFilter !== 'all' && e.book_subtype !== subtypeFilter) return false
    if (isRecipe && mealTag !== 'all' && !mealTagsOf.get(e.id)?.includes(mealTag)) return false
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

  // Mount the visible list in batches; any change to what is listed restarts it.
  const paged = useProgressive(display.length, [hobbyId, statusFilter, subtypeFilter, mealTag, sortBy, sortDir, search, view].join('|'))
  const visible = display.slice(0, paged.shown)

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
    fontFamily: 'var(--font-body)',
    letterSpacing: '0.02em',
    outline: 'none',
    width: '100%',
  }

  if (loading) {
    return (
      <div className="page" aria-busy="true" aria-label="Loading">
        <div className="cover-grid">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="mech-skeleton" style={{ aspectRatio: '2 / 3', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  const tab = (active: boolean, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px',
    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: active ? 600 : 500,
    background: active ? `${color}1f` : 'transparent',
    border: `1px solid ${active ? color : 'var(--border-dim)'}`,
    color: active ? color : 'var(--text-mid)', cursor: 'pointer', transition: 'var(--t-fast)',
  })
  const tabCount: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }
  const tool: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 38, padding: '0 12px',
    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
    background: 'var(--bg-card)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', cursor: 'pointer',
  }
  const finished = entries.filter((e) => e.status === 'completed').length

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0 }}>
            {hobby.pluralLabel.toUpperCase()}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}{finished > 0 ? `, ${finished} ${statusLabelFor(hobby, 'completed').toLowerCase()}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {hobbyId === 'games' && <SteamSync accent={hobby.accent} onSynced={loadEntries} />}
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
              background: `${hobby.accent}22`, border: `1px solid ${hobby.accent}88`, borderLeft: `3px solid ${hobby.accent}`,
              color: hobby.accent, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add {hobby.label}
          </button>
        </div>
      </div>

      {/* Status tabs, each with how many it holds */}
      <div className="tab-row" role="tablist" aria-label="Filter by status" style={{ marginBottom: 10 }}>
        {statusOptions.map((s) => {
          const active = statusFilter === s
          const color = s === 'all' ? hobby.accent : STATUS_COLORS[s]
          const count = s === 'all' ? entries.length : entries.filter((e) => e.status === s).length
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStatusFilter(s)
                if (s === 'backlog') { setSortBy('rank'); setSortDir('asc') }
                else { setRankMode(false); if (sortBy === 'rank') handleSortChange('recent') }
              }}
              style={tab(active, color)}
            >
              {s === 'all' ? 'All' : statusLabelFor(hobby, s)}
              <span style={tabCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Book sub-types */}
      {hobbyId === 'books' && entries.length > 0 && (
        <div className="tab-row" role="tablist" aria-label="Filter by type" style={{ marginBottom: 10 }}>
          {[{ id: 'all' as const, label: 'All types', count: entries.length },
            ...BOOK_SUBTYPES.map((st) => ({
              id: st.id, label: st.label,
              count: entries.filter((e) => e.book_subtype === st.id).length,
            })).filter((st) => st.count > 0),
          ].map((st) => {
            const active = subtypeFilter === st.id
            return (
              <button key={st.id} role="tab" aria-selected={active}
                onClick={() => setSubtypeFilter(st.id === 'all' ? 'all' : active ? 'all' : st.id)}
                style={tab(active, hobby.accent)}>
                {st.label}
                <span style={tabCount}>{st.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Meal / course tabs */}
      {isRecipe && entries.length > 0 && (
        <div className="tab-row" role="tablist" aria-label="Filter by meal or course" style={{ marginBottom: 10 }}>
          {[{ id: 'all', label: 'All meals', count: entries.length },
            ...MEAL_TAGS.map((t) => ({
              id: t.id, label: t.label,
              count: entries.filter((e) => mealTagsOf.get(e.id)?.includes(t.id)).length,
            })).filter((t) => t.count > 0 || t.id === mealTag),
          ].map((t) => {
            const active = mealTag === t.id
            return (
              <button key={t.id} role="tab" aria-selected={active}
                onClick={() => setMealTag(active ? 'all' : t.id)}
                style={tab(active, hobby.accent)}>
                {t.label}
                <span style={tabCount}>{t.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar: search, sort, view, bulk tools */}
      <div style={{ display: 'flex', gap: 8, margin: '6px 0 22px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${hobby.pluralLabel}…`}
          aria-label={`Search ${hobby.pluralLabel}`}
          autoComplete="off"
          style={{ ...inp, flex: '1 1 200px', maxWidth: 340, width: 'auto', height: 38, padding: '0 14px' }}
        />

        <select
          value={sortBy}
          aria-label="Sort by"
          onChange={(e) => handleSortChange(e.target.value as SortOption)}
          style={{ ...tool, padding: '0 10px' }}
        >
          {sortOptions.map((o) => (
            <option key={o.id} value={o.id}>Sort: {o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDir === 'asc' ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          style={{ ...tool, width: 38, padding: 0 }}
        >
          {sortDir === 'asc' ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>

        {!rankMode && (
          <div role="group" aria-label="View" style={{ display: 'inline-flex' }}>
            {([['grid', LayoutGrid, 'Covers'], ['list', List, 'List']] as const).map(([id, Icon, label]) => {
              const active = view === id
              return (
                <button key={id} onClick={() => setView(id)} aria-pressed={active} aria-label={`${label} view`} title={`${label} view`}
                  style={{ ...tool, width: 38, padding: 0, marginLeft: id === 'list' ? -1 : 0, background: active ? `${hobby.accent}22` : 'var(--bg-card)', borderColor: active ? hobby.accent : 'var(--border-dim)', color: active ? hobby.accent : 'var(--text-mid)', position: 'relative', zIndex: active ? 1 : 0 }}>
                  <Icon size={16} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        )}

        <span style={{ flex: 1 }} />

        {statusFilter === 'backlog' && (
          <button
            onClick={() => setRankMode((v) => !v)}
            aria-pressed={rankMode}
            style={{ ...tool, fontWeight: 600, background: rankMode ? '#d97706' : '#d9770622', borderColor: '#d97706', color: rankMode ? 'var(--bg-base)' : '#f59e0b' }}
          >
            <ListOrdered size={16} aria-hidden="true" />
            {rankMode ? 'Done Ranking' : isRecipe ? 'Rank To-Try List' : 'Rank Backlog'}
          </button>
        )}
        {!rankMode && entries.length > 0 && (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            aria-pressed={selectMode}
            style={{ ...tool, fontWeight: 600, background: selectMode ? hobby.accent : 'var(--bg-card)', borderColor: selectMode ? hobby.accent : 'var(--border-dim)', color: selectMode ? 'var(--bg-base)' : 'var(--text-mid)' }}
          >
            <CheckSquare size={16} aria-hidden="true" />
            {selectMode ? 'Done' : 'Select'}
          </button>
        )}
      </div>

      {/* Rank mode — ordered backlog list with reorder controls */}
      {rankMode && statusFilter === 'backlog' ? (
        ranked.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.08em', textAlign: 'center', padding: 32 }}>
            Your backlog is empty, so there is nothing to rank yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: 0 }}>
              Drag rows, type a position number, or use the arrows
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
                    contentVisibility: 'auto', containIntrinsicSize: 'auto 66px',
                    cursor: 'grab',
                    transition: 'background 0.12s ease, opacity 0.12s ease',
                  } as React.CSSProperties
                })()}
              >
                <GripVertical size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
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
                    fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 900,
                    color: i === 0 ? '#d97706' : 'var(--text-mid)',
                    outline: 'none',
                  }}
                />
                {e.cover_url && (
                  <img src={e.cover_url} alt="" draggable={false} style={{ width: 32, height: 44, objectFit: 'cover', flexShrink: 0, border: `1px solid ${hobby.accent}33` }} loading="lazy" decoding="async" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.title}
                  </p>
                  {i === 0 && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#d97706', letterSpacing: '0.08em' }}>Up Next</span>
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
                        transition: 'var(--t-fast)',
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
        <div style={{ padding: '56px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>
            {entries.length === 0 ? `Nothing in ${hobby.pluralLabel} yet` : 'No matches'}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>
            {entries.length === 0 ? 'Add your first one to get started.' : 'Try a different search or filter.'}
          </p>
          {entries.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: `${hobby.accent}22`, border: `1px solid ${hobby.accent}`, color: hobby.accent, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={16} aria-hidden="true" /> Add {hobby.label}
            </button>
          )}
        </div>
      ) : (
        <>
          {selectMode && (() => {
            const allIds = display.map((e) => e.id)
            const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
            const sel = allIds.filter((id) => selectedIds.has(id))
            const barBtn = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em', background: sel.length ? `${color}18` : 'transparent', border: `1px solid ${sel.length ? color : 'var(--border-dim)'}`, color: sel.length ? color : 'var(--text-mute)', cursor: sel.length && !bulkBusy ? 'pointer' : 'not-allowed' })
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 14px', marginBottom: 14, background: 'var(--bg-card)', border: `1px solid ${hobby.accent}66`, borderLeft: `3px solid ${hobby.accent}`, position: 'sticky', top: 8, zIndex: 5 }}>
                <button onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em', background: 'transparent', border: `1px solid ${hobby.accent}66`, color: hobby.accent, cursor: 'pointer' }}>
                  <CheckSquare size={13} /> {allSelected ? 'Clear All' : `Select All (${allIds.length})`}
                </button>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)' }}>{sel.length} selected</span>
                <span style={{ flex: 1 }} />
                {(['in_progress', 'completed', 'backlog', 'wishlist'] as const).filter((s) => statusesFor(hobby).includes(s)).map((s) => (
                  <button key={s} disabled={!sel.length || bulkBusy} onClick={() => bulkStatus(sel, s)} style={barBtn(STATUS_COLORS[s])}>→ {statusLabelFor(hobby, s)}</button>
                ))}
                {statusFilter === 'completed' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" aria-label="Finish date for the selected entries" max={todayIso()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
                      style={{ height: 32, padding: '0 8px', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', color: 'var(--text-hi)' }} />
                    <button disabled={!sel.length || !bulkDate || bulkBusy} onClick={() => bulkFinishDate(sel)} style={barBtn('#22c55e')}>Set Finish Date</button>
                  </span>
                )}
                <button disabled={!sel.length || bulkBusy} onClick={() => bulkDelete(sel)} style={barBtn('#f15959')}><Trash2 size={12} /> Delete</button>
                <button onClick={exitSelect} aria-label="Exit select mode" style={{ display: 'flex', padding: 7, background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={13} /></button>
              </div>
            )
          })()}
          {view === 'list' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
              {visible.map((entry, i) => (
                <EntryCard key={entry.id} entry={entry} index={i} showType={hobbyId === 'books'}
                  selectable={selectMode} selected={selectedIds.has(entry.id)} onToggleSelect={toggleSelect} />
              ))}
            </div>
          ) : statusFilter === 'completed' && sortBy === 'recent' && !selectMode && !isRecipe ? (
            // Finished things get the shelf: by year, newest first. It pages itself.
            <ShelfWall entries={display} />
          ) : (
            <div className="cover-grid">
              {visible.map((entry) => (
                <CoverTile key={entry.id} entry={entry} showStatus={statusFilter === 'all'}
                  selectable={selectMode} selected={selectedIds.has(entry.id)} onToggleSelect={toggleSelect} />
              ))}
            </div>
          )}
          {!(view === 'grid' && statusFilter === 'completed' && sortBy === 'recent' && !selectMode && !isRecipe) && (
            <ListFooter sentinel={paged.sentinel} shown={paged.shown} total={display.length} done={paged.done} more={paged.more} />
          )}
        </>
      )}

      {showModal && (
        <AddEntryModal hobbyId={hobbyId} onClose={() => setShowModal(false)} onAdded={loadEntries} />
      )}
    </div>
  )
}
