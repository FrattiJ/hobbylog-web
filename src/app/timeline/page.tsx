'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { Entry, HobbyCategory } from '@/types/database'
import { HOBBIES, HOBBY_MAP, BOOK_SUBTYPE_MAP, statusLabelFor } from '@/lib/hobbies'
import { getAllEntries, getSessionLog, ENTRIES_CHANGED_EVENT, type SessionLogRow } from '@/lib/db'
import { getWorkoutLog, FITNESS_CHANGED_EVENT } from '@/lib/fitness/db'
import { useHobbies } from '@/components/HobbyContext'
import { readParam, readParamOneOf, useUrlParams } from '@/lib/urlState'
import { useProgressive } from '@/lib/useProgressive'
import ListFooter from '@/components/ListFooter'
import { fmtDuration } from '@/lib/windows'
import { ordinal } from '@/lib/finishes'
import {
  buildMoments, filterMoments, groupAdditions, monthSummaries,
  type Moment, type MomentKind, type ShowFilter,
} from '@/lib/timeline'

// Everything you started, finished and logged, newest first, across every
// hobby. The Shelf is the record of what got done; this is the order it all
// happened in, with what you wrote along the way.

const ACCENT = '#099bbe'

const SHOW: Array<{ id: ShowFilter; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'finished', label: 'Finishes' },
  { id: 'started', label: 'Starts' },
  { id: 'session', label: 'Sessions' },
  { id: 'notes', label: 'Notes only' },
  { id: 'added', label: 'Added' },
]

const KIND_COLOR: Record<MomentKind, string> = {
  finished: '#22c55e', started: '#4f8ef7', session: '#099bbe', workout: '#f25b0c', added: 'var(--text-dim)',
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
// Dates here are plain days; build them from the parts so they do not slip a
// day in time zones west of Greenwich.
const localDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1) }

function kindLabel(m: Moment): string {
  const hobby = HOBBY_MAP[m.hobby]
  const again = m.nth != null && m.nth > 1
  if (m.kind === 'finished') {
    if (hobby?.recipe) return 'First made'
    return again ? `${statusLabelFor(hobby, 'completed')}, ${ordinal(m.nth!)} time` : statusLabelFor(hobby, 'completed')
  }
  if (m.kind === 'started') return again ? 'Started again' : 'Started'
  if (m.kind === 'session') return hobby?.recipe ? 'Cooked' : 'Session'
  if (m.kind === 'workout') return 'Workout'
  return 'Added'
}

function progressText(m: Moment): string | null {
  const e = m.entry
  if (!e || !m.progress || m.progress <= 0) return null
  const hobby = HOBBY_MAP[e.hobby_category]
  // A game session's progress is its length again, and a cook is one cook.
  if (e.hobby_category === 'games' || hobby?.recipe || hobby?.percentBased) return null
  // Films and audiobooks count minutes, which the duration already says.
  if (e.hobby_category === 'movies' || e.book_subtype === 'audiobook') return null
  const unit = (e.hobby_category === 'books' && e.book_subtype ? BOOK_SUBTYPE_MAP[e.book_subtype]?.progressUnit : hobby?.progressUnit) ?? ''
  return `+${m.progress} ${unit}`.trim()
}

function Thumb({ entry, accent }: { entry: Entry | null; accent: string }) {
  return (
    <span aria-hidden="true" style={{ width: 38, height: 56, flexShrink: 0, background: 'var(--bg-base)', border: `1px solid ${accent}55`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {entry?.cover_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={entry.cover_url} alt="" width={38} height={56} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: accent }}>{(entry?.title ?? '+')[0]}</span>}
    </span>
  )
}

function Row({ m }: { m: Moment }) {
  const hobby = HOBBY_MAP[m.hobby]
  const accent = hobby?.accent ?? ACCENT
  const color = KIND_COLOR[m.kind]
  const chip: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color }
  const dim: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)' }

  // A day's worth of additions, shown as one line that opens.
  if (m.entries) {
    const shown = m.entries.slice(0, 40)
    return (
      <li className="tl-row">
        <Thumb entry={null} accent="var(--text-dim)" />
        <div style={{ minWidth: 0 }}>
          <details>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>
              Added {m.entries.length.toLocaleString()} entries
            </summary>
            <p style={{ ...dim, margin: '6px 0 0', lineHeight: 1.6 }}>
              {shown.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && ', '}
                  <Link href={`/entry?id=${e.id}`} style={{ color: 'var(--text-mid)' }}>{e.title}</Link>
                </span>
              ))}
              {m.entries.length > shown.length && `, and ${(m.entries.length - shown.length).toLocaleString()} more`}
            </p>
          </details>
        </div>
      </li>
    )
  }

  const bits = [
    m.minutes && m.minutes > 0 ? fmtDuration(m.minutes) : null,
    progressText(m),
  ].filter(Boolean)

  return (
    <li className="tl-row">
      <Thumb entry={m.entry} accent={accent} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: '2px 10px', flexWrap: 'wrap' }}>
          <span style={chip}>{kindLabel(m)}</span>
          {bits.length > 0 && <span style={dim}>{bits.join(', ')}</span>}
          {m.kind === 'finished' && m.entry?.rating != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#f59e0b' }}>
              <Star size={11} aria-hidden="true" style={{ fill: '#f59e0b' }} />
              <span><span className="sr-only">Rated </span>{m.entry.rating}</span>
            </span>
          )}
        </p>
        {m.entry ? (
          <Link href={`/entry?id=${m.entry.id}`} style={{ display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-hi)', textDecoration: 'none', overflowWrap: 'anywhere', marginTop: 1 }}>
            {m.entry.title}
          </Link>
        ) : (
          <Link href="/fitness" style={{ display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)', textDecoration: 'none', marginTop: 1 }}>
            Fitness
          </Link>
        )}
        {m.entry && <span style={{ ...dim, color: accent, marginLeft: 8 }}>{hobby?.label}</span>}
        {m.note && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-mid)', margin: '6px 0 0', paddingLeft: 10, borderLeft: `2px solid ${color}66`, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', maxWidth: '75ch' }}>
            {m.note}
          </p>
        )}
      </div>
    </li>
  )
}

export default function TimelinePage() {
  const { enabledIds } = useHobbies()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [sessions, setSessions] = useState<SessionLogRow[]>([])
  const [workouts, setWorkouts] = useState<Array<{ date: string; minutes: number }>>([])

  const [hobby, setHobby] = useState<HobbyCategory | 'all'>(() => readParamOneOf('hobby', HOBBIES.map((h) => h.id)) ?? 'all')
  const [show, setShow] = useState<ShowFilter>(() => readParamOneOf('show', SHOW.map((s) => s.id)) ?? 'all')
  const [query, setQuery] = useState(() => readParam('q') ?? '')
  const [upTo, setUpTo] = useState(() => { const m = readParam('month'); return m && /^\d{4}-\d{2}$/.test(m) ? m : '' })
  useUrlParams({ hobby: hobby === 'all' ? null : hobby, show: show === 'all' ? null : show, month: upTo || null })
  useUrlParams({ q: query.trim() || null }, 300)

  useEffect(() => {
    const load = () => {
      getAllEntries().then(setEntries).catch(() => setEntries([]))
      getSessionLog().then(setSessions).catch(() => {})
    }
    const loadWorkouts = () => getWorkoutLog().then(setWorkouts).catch(() => {})
    load(); loadWorkouts()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    window.addEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    return () => {
      window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
      window.removeEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    }
  }, [])

  // Only the hobbies that are switched on, so a hobby turned off in Settings
  // leaves the timeline as it leaves everything else.
  const all = useMemo(() => {
    const on = new Set(enabledIds)
    return buildMoments(entries ?? [], sessions, on.has('fitness') ? workouts : []).filter((m) => on.has(m.hobby))
  }, [entries, sessions, workouts, enabledIds])

  const hobbyTabs = useMemo(() => {
    const counts = new Map<HobbyCategory, number>()
    for (const m of all) counts.set(m.hobby, (counts.get(m.hobby) ?? 0) + 1)
    return HOBBIES.filter((h) => (counts.get(h.id) ?? 0) > 0).map((h) => ({ hobby: h, count: counts.get(h.id)! }))
  }, [all])

  const filtered = useMemo(() => filterMoments(all, { hobby, show, query, upToMonth: upTo || null }), [all, hobby, show, query, upTo])
  const summaries = useMemo(() => monthSummaries(filtered), [filtered])
  const rows = useMemo(() => groupAdditions(filtered), [filtered])
  const paged = useProgressive(rows.length, [hobby, show, query, upTo].join('|'), 80)

  // The mounted slice, as months of days.
  const months: Array<{ key: string; days: Array<{ date: string; moments: Moment[] }> }> = []
  for (const m of rows.slice(0, paged.shown)) {
    const key = m.date.slice(0, 7)
    let month = months[months.length - 1]
    if (!month || month.key !== key) { month = { key, days: [] }; months.push(month) }
    let day = month.days[month.days.length - 1]
    if (!day || day.date !== m.date) { day = { date: m.date, moments: [] }; month.days.push(day) }
    day.moments.push(m)
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
    height: 38, padding: '0 10px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
    background: 'var(--bg-card)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)',
  }
  const filtering = hobby !== 'all' || show !== 'all' || !!query.trim() || !!upTo
  const earliest = all.length ? all[all.length - 1].date : null

  return (
    <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0 }}>TIMELINE</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          {entries === null
            ? 'Loading…'
            : all.length === 0
              ? 'What you start, finish and log shows up here, in the order it happened.'
              : `${all.length.toLocaleString()} moments since ${monthLong.format(localDate(earliest!))}`}
        </p>
      </div>

      {entries === null ? (
        <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="mech-skeleton" style={{ height: 64, animationDelay: `${i * 80}ms` }} />)}
        </div>
      ) : all.length === 0 ? (
        <div style={{ padding: '56px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>Nothing on the timeline yet</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0, maxWidth: '52ch', marginInline: 'auto', lineHeight: 1.55 }}>
            Add something, start it, log a session with a note, or finish it. Each of those becomes a line here with its date.
          </p>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 20, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>
            Go to your dashboard
          </Link>
        </div>
      ) : (
        <>
          {hobbyTabs.length > 1 && (
            <div className="tab-row" role="tablist" aria-label="Filter by hobby" style={{ marginBottom: 10 }}>
              <button role="tab" aria-selected={hobby === 'all'} onClick={() => setHobby('all')} style={tab(hobby === 'all', ACCENT)}>
                All <span style={tabCount}>{all.length.toLocaleString()}</span>
              </button>
              {hobbyTabs.map(({ hobby: h, count }) => (
                <button key={h.id} role="tab" aria-selected={hobby === h.id}
                  onClick={() => setHobby(hobby === h.id ? 'all' : h.id)} style={tab(hobby === h.id, h.accent)}>
                  {h.pluralLabel} <span style={tabCount}>{count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0 26px' }}>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              placeholder="Search titles and notes…" aria-label="Search titles and notes"
              style={{ ...tool, flex: '1 1 200px', maxWidth: 340, padding: '0 14px', color: 'var(--text-hi)', borderLeft: `2px solid ${ACCENT}66`, outline: 'none' }} />
            <select value={show} aria-label="Show" onChange={(e) => setShow(e.target.value as ShowFilter)}
              style={{ ...tool, cursor: 'pointer', ...(show !== 'all' ? { borderColor: ACCENT, color: 'var(--text-hi)' } : {}) }}>
              {SHOW.map((s) => <option key={s.id} value={s.id}>Show: {s.label}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>
              Go back to
              <input type="month" value={upTo} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setUpTo(e.target.value)}
                style={{ ...tool, color: 'var(--text-hi)', ...(upTo ? { borderColor: ACCENT } : {}) }} />
            </label>
            {filtering && (
              <button onClick={() => { setHobby('all'); setShow('all'); setQuery(''); setUpTo('') }}
                style={{ ...tool, fontWeight: 600, color: 'var(--text-hi)', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>Nothing matches</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>Try a different search, or clear the filters.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {months.map((month) => {
                const s = summaries.get(month.key)
                const facts = s ? [
                  s.finished ? `${s.finished} finished` : null,
                  s.started ? `${s.started} started` : null,
                  s.sessions ? `${s.sessions} ${s.sessions === 1 ? 'session' : 'sessions'}` : null,
                  s.minutes ? `${fmtDuration(s.minutes)} logged` : null,
                  s.added ? `${s.added.toLocaleString()} added` : null,
                ].filter(Boolean) : []
                const name = monthLong.format(localDate(`${month.key}-01`))
                return (
                  <section key={month.key} aria-label={name}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 14px', flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', margin: 0 }}>{name.toUpperCase()}</h2>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>{facts.join(', ')}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {month.days.map((day) => {
                        const d = localDate(day.date)
                        return (
                          <div key={day.date} className="tl-day">
                            <h3 className="tl-date">
                              <span style={{ color: 'var(--text-hi)' }}>{dayLabel.format(d)}</span>{' '}
                              <span>{weekday.format(d)}</span>
                            </h3>
                            <ul className="tl-list">
                              {day.moments.map((m) => <Row key={m.key} m={m} />)}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
              <ListFooter sentinel={paged.sentinel} shown={paged.shown} total={rows.length} done={paged.done} more={paged.more} noun="moments" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
