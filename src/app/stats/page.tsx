'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import StatCard from '@/components/StatCard'
import { CLIP } from '@/components/MechCard'
import { Panel } from '@/components/suggestions/ui'
import ChartCard, { ChartEmpty } from '@/components/stats/ChartCard'
import Columns from '@/components/stats/Columns'
import { MeterList, RankedBars } from '@/components/stats/Rows'
import { HOBBY_MAP } from '@/lib/hobbies'
import type { Entry } from '@/types/database'
import {
  getAllEntries, getGlobalStats, getFriendsStats, getSessionLog, activityFromLog, loggedMinutesFromLog,
  ENTRIES_CHANGED_EVENT, type GlobalStats, type SessionLogRow,
} from '@/lib/db'
import { getWorkoutLog, FITNESS_CHANGED_EVENT } from '@/lib/fitness/db'
import { useHobbies } from '@/components/HobbyContext'
import { calcHoursWithLogged } from '@/lib/hours'
import { buildTasteProfile } from '@/lib/taste'
import { RANGES, ageLabel, libraryStats, periodStats, type Range } from '@/lib/stats'
import { useChartPalette } from '@/lib/chartColors'
import { readParamOneOf, useUrlParams } from '@/lib/urlState'

// The page is in two halves, and the split is the point of it.
//
// "Over time" is about a period you choose: what you finished, what you added,
// where the hours went. It answers whether you are keeping up.
//
// "Your library" is the collection as it stands today: how much of it is
// finished, how you rate things, what has waited longest. A date range would
// mean nothing there, so the period control sits above the first half only.
//
// Totals that the dashboard already shows (how many entries, how they split by
// hobby and status) are deliberately not repeated here.

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-hi)', margin: 0,
}

export default function StatsPage() {
  const { enabledHobbies } = useHobbies()
  const colors = useChartPalette()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionLogRow[]>([])
  const [workouts, setWorkouts] = useState<Array<{ date: string; minutes: number }>>([])
  const [global, setGlobal] = useState<GlobalStats | null>(null)
  const [friendsStats, setFriendsStats] = useState<GlobalStats | null>(null)
  const [compareTo, setCompareTo] = useState<'everyone' | 'friends'>('everyone')
  const [range, setRange] = useState<Range>(() => readParamOneOf('range', RANGES.map((r) => r.id)) ?? '12m')
  useUrlParams({ range: range === '12m' ? null : range })

  useEffect(() => {
    const load = () => {
      getAllEntries().then(setEntries).finally(() => setLoading(false))
      getSessionLog().then(setSessions).catch(() => {})
    }
    load()
    getGlobalStats().then(setGlobal).catch(() => {})
    getFriendsStats().then(setFriendsStats).catch(() => {})
    // Fitness lives outside the entries table, so its time comes in separately.
    const loadWorkouts = () => getWorkoutLog().then(setWorkouts).catch(() => {})
    loadWorkouts()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    window.addEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    return () => {
      window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
      window.removeEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    }
  }, [])

  const entryHobbies = useMemo(() => enabledHobbies.filter((h) => !h.customSection).map((h) => h.id), [enabledHobbies])
  const period = useMemo(() => periodStats(range, entries, sessions, workouts), [range, entries, sessions, workouts])
  const library = useMemo(() => libraryStats(entries, entryHobbies), [entries, entryHobbies])
  const profile = useMemo(() => buildTasteProfile(entries, activityFromLog(sessions)), [entries, sessions])

  if (loading) return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }} aria-busy="true" aria-label="Loading">
      <div className="kpi-row">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="mech-skeleton" style={{ height: 110, clipPath: CLIP, animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  )

  const rangeLabel = RANGES.find((r) => r.id === range)!.label
  const inRange = range === 'all' ? 'since you started' : range === 'year' ? 'this year' : 'in the last 12 months'
  const unit = range === 'all' ? 'year' : 'month'

  // For the comparison. Entries only: the benchmarks are computed from entries,
  // so adding training time to "mine" would compare apples to oranges.
  const completed = entries.filter((e) => e.status === 'completed')
  const finishedEntryHours = calcHoursWithLogged(completed, loggedMinutesFromLog(sessions), 'full')
  const hasFriends = !!friendsStats && friendsStats.user_count > 0
  const compareSource = compareTo === 'friends' ? friendsStats : global

  const topRated = [...entries].filter((e) => e.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5)
  const pace = profile.pace.hoursPerWeek

  if (entries.length === 0) return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: '0 0 20px' }}>STATS</h1>
      <div style={{ padding: '56px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>Nothing to count yet</p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>
          Add a few entries and log some time against them, and this page fills in.
        </p>
      </div>
    </div>
  )

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: '0 0 22px' }}>STATS</h1>

      {/* ── Over time ── */}
      <section aria-labelledby="over-time" style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 id="over-time" style={sectionHeading}>OVER TIME</h2>
          {/* One period control, above everything it scopes. */}
          <div role="group" aria-label="Period" className="tab-row" style={{ margin: 0 }}>
            {RANGES.map((r) => {
              const on = range === r.id
              return (
                <button key={r.id} onClick={() => setRange(r.id)} aria-pressed={on}
                  style={{ minHeight: 36, padding: '0 12px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: on ? 600 : 500, background: on ? '#a577f222' : 'transparent', border: `1px solid ${on ? '#a577f2' : 'var(--border-dim)'}`, color: on ? '#a577f2' : 'var(--text-mid)', cursor: 'pointer' }}>
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="kpi-row">
          <StatCard label="Finished" value={period.finished} accent="#22c55e" sub={inRange} index={0} />
          <StatCard label="Added" value={period.added} accent="#a577f2" sub={inRange} index={1} />
          <StatCard
            label={period.net > 0 ? 'Pile grew by' : period.net < 0 ? 'Pile shrank by' : 'Pile held steady'}
            value={Math.abs(period.net)} accent={period.net > 0 ? '#d97706' : '#22c55e'}
            sub={period.net > 0 ? 'more added than finished' : period.net < 0 ? 'more finished than added' : 'added as many as you finished'} index={2} />
          <StatCard label="Hours logged" value={period.hours} accent="#099bbe"
            sub={period.hours > 0 ? `${period.hoursPerWeek} a week, over ${period.activeDays} ${period.activeDays === 1 ? 'day' : 'days'}` : 'from sessions and workouts'} index={3} />
        </div>

        <div className="stat-grid">
          <ChartCard accent={colors.finished} title="Finished" sub={`Entries you completed each ${unit}, by finish date.`}
            table={{ columns: [unit === 'year' ? 'Year' : 'Month', 'Finished'], rows: period.buckets.map((b) => [b.longLabel, b.finished]) }}>
            {period.finished === 0
              ? <ChartEmpty>Nothing with a finish date {inRange}.</ChartEmpty>
              : <Columns data={period.buckets.map((b) => ({ label: b.label, longLabel: b.longLabel, value: b.finished }))} color={colors.finished} noun="finished" />}
            {period.undatedFinishes > 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)', margin: '12px 0 0' }}>
                {period.undatedFinishes.toLocaleString()} completed {period.undatedFinishes === 1 ? 'entry has' : 'entries have'} no finish date, so {period.undatedFinishes === 1 ? 'it is' : 'they are'} not counted here.{' '}
                <Link href="/shelf" style={{ color: 'var(--text-hi)' }}>Add dates on your Shelf</Link>.
              </p>
            )}
          </ChartCard>

          <ChartCard accent={colors.added} title="Added" sub={`Entries added to your library each ${unit}. An import shows up as one tall column.`}
            table={{ columns: [unit === 'year' ? 'Year' : 'Month', 'Added'], rows: period.buckets.map((b) => [b.longLabel, b.added]) }}>
            {period.added === 0
              ? <ChartEmpty>Nothing added {inRange}.</ChartEmpty>
              : <Columns data={period.buckets.map((b) => ({ label: b.label, longLabel: b.longLabel, value: b.added }))} color={colors.added} noun="added" />}
          </ChartCard>
        </div>

        <div className="stat-grid">
          <ChartCard accent={colors.hours} title="Hours logged" sub={`Time from your logged sessions and workouts each ${unit}.`}
            table={{ columns: [unit === 'year' ? 'Year' : 'Month', 'Hours'], rows: period.buckets.map((b) => [b.longLabel, b.hours]) }}>
            {period.hours === 0
              ? <ChartEmpty>No time logged {inRange}. Use Log Session in the sidebar, or log a workout, and it shows up here.</ChartEmpty>
              : <Columns data={period.buckets.map((b) => ({ label: b.label, longLabel: b.longLabel, value: b.hours }))} color={colors.hours} noun="hours" wholeNumbers={false} />}
          </ChartCard>

          <ChartCard accent={colors.hours} title="Where the time went" sub={`Logged hours by hobby, ${rangeLabel.toLowerCase()}.`}
            table={{ columns: ['Hobby', 'Hours'], rows: period.byHobby.map((h) => [HOBBY_MAP[h.hobby]?.pluralLabel ?? h.hobby, h.hours]) }}>
            {period.byHobby.length === 0
              ? <ChartEmpty>No time logged {inRange}.</ChartEmpty>
              : <RankedBars rows={period.byHobby} color={colors.hours} />}
          </ChartCard>
        </div>
      </section>

      {/* ── The library as it stands ── */}
      <section aria-labelledby="your-library" style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 id="your-library" style={sectionHeading}>YOUR LIBRARY</h2>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>As it stands today</span>
        </div>

        <div className="kpi-row">
          <StatCard label="Backlog at your pace" value={profile.backlogMonths ?? '—'} suffix=" mo" accent="#a577f2"
            sub={pace > 0 ? `${profile.backlogHours.toLocaleString()} h left, at ${pace} h a week` : `${profile.backlogHours.toLocaleString()} h left. Log sessions to get a pace`} index={0} />
          <StatCard label="Typical time to finish" value={library.medianDaysToFinish ?? '—'} suffix={library.medianDaysToFinish === 1 ? ' day' : ' days'} accent="#099bbe"
            sub={library.timedFinishes > 0 ? `median of ${library.timedFinishes} with a start and finish date` : 'needs a start and a finish date'} index={1} />
          <StatCard label="Finish rate" value={library.finishRate ?? '—'} suffix="%" accent="#22c55e"
            sub={library.finishRate != null ? `${library.finished.toLocaleString()} finished, ${library.dropped.toLocaleString()} dropped` : 'nothing finished or dropped yet'} index={2} />
          <StatCard label="Average rating" value={library.averageRating ?? '—'} accent="#d97706"
            sub={library.rated > 0 ? `across ${library.rated.toLocaleString()} rated` : 'nothing rated yet'} index={3} />
        </div>

        <div className="stat-grid">
          <ChartCard accent={colors.finished} title="How much is finished" sub="The share of each hobby's library you have completed."
            table={{ columns: ['Hobby', 'Finished', 'Total', 'Dropped'], rows: library.byHobby.map((h) => [HOBBY_MAP[h.hobby]?.pluralLabel ?? h.hobby, h.finished, h.total, h.dropped]) }}>
            {library.byHobby.length === 0 ? <ChartEmpty>No entries yet.</ChartEmpty> : <MeterList rows={library.byHobby} color={colors.finished} />}
          </ChartCard>

          <ChartCard accent={colors.rating} title="How you rate things" sub="How many entries you gave each score out of 10. Half points count toward the next whole number."
            table={{ columns: ['Rating', 'Entries'], rows: library.ratingCounts.map((n, i) => [String(i + 1), n]) }}>
            {library.rated === 0
              ? <ChartEmpty>Rate something you have finished and the spread shows up here.</ChartEmpty>
              : <Columns data={library.ratingCounts.map((n, i) => ({ label: String(i + 1), longLabel: `Rated ${i + 1} out of 10`, value: n }))} color={colors.rating} noun={'entries'} />}
          </ChartCard>
        </div>

        <div className="stat-grid">
          <Panel accent="#a577f2" title="Longest in your backlog" sub="What has been waiting the longest since you added it.">
            {library.oldestBacklog.length === 0 ? <ChartEmpty>Your backlog is empty.</ChartEmpty> : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {library.oldestBacklog.map(({ entry, days }) => (
                  <li key={entry.id}>
                    <EntryRow entry={entry} right={<span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>{ageLabel(days)}</span>} />
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel accent="#d97706" title="Top rated" sub="Your five highest scores.">
            {topRated.length === 0 ? <ChartEmpty>Nothing rated yet.</ChartEmpty> : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topRated.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow entry={entry} right={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>
                        <Star size={13} aria-hidden="true" style={{ fill: colors.rating, color: colors.rating }} />
                        <span className="sr-only">Rated </span>{entry.rating}
                      </span>
                    } />
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </section>

      {/* ── Against other people ── */}
      {global && global.user_count > 0 && (
        <section aria-labelledby="compared">
          <Panel accent="#22c55e"
            title={compareTo === 'friends' ? 'You and your friends' : 'You and everyone'}
            sub={compareTo === 'friends'
              ? (hasFriends ? `Your totals beside the average across your ${friendsStats!.user_count} ${friendsStats!.user_count === 1 ? 'friend' : 'friends'}.` : 'Add friends to compare with them.')
              : `Your totals beside the average across ${global.user_count} ${global.user_count === 1 ? 'person' : 'people'} on Hobbylog.`}
            right={
              <div role="group" aria-label="Compare with" style={{ display: 'flex', gap: 6 }}>
                {(['everyone', 'friends'] as const).map((t) => {
                  const on = compareTo === t
                  return (
                    <button key={t} onClick={() => setCompareTo(t)} aria-pressed={on}
                      style={{ minHeight: 34, padding: '0 12px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: on ? 600 : 500, background: on ? '#22c55e22' : 'transparent', border: `1px solid ${on ? '#22c55e' : 'var(--border-dim)'}`, color: on ? '#22c55e' : 'var(--text-mid)', cursor: 'pointer' }}>
                      {t === 'everyone' ? 'Everyone' : 'Friends'}
                    </button>
                  )
                })}
              </div>
            }>
            <span id="compared" className="sr-only">Compared with others</span>
            {compareTo === 'friends' && !hasFriends ? (
              <ChartEmpty>You have no friends added yet. <Link href="/friends" style={{ color: 'var(--text-hi)' }}>Find people on the Friends page</Link>.</ChartEmpty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  { label: 'Hours finished', mine: finishedEntryHours, avg: compareSource?.avg_finished_hours ?? 0, unit: ' h', color: colors.hours },
                  { label: 'Entries completed', mine: completed.length, avg: compareSource?.avg_completed ?? 0, unit: '', color: colors.finished },
                ].map((m) => {
                  const max = Math.max(m.mine, m.avg, 0.001)
                  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)) + m.unit
                  const delta = Math.round((m.mine - m.avg) * 10) / 10
                  return (
                    <div key={m.label}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>{m.label}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)' }}>
                          {delta === 0 ? 'Level with the average' : `${fmt(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'} the average`}
                        </span>
                      </div>
                      {[{ who: 'You', v: m.mine, fill: m.color }, { who: 'Average', v: m.avg, fill: 'var(--text-mute)' }].map((row) => (
                        <div key={row.who} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 72px', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)' }}>{row.who}</span>
                          <span aria-hidden="true" style={{ display: 'block', height: 10 }}>
                            <span style={{ display: 'block', height: '100%', width: `${Math.max(1.5, (row.v / max) * 100)}%`, background: row.fill, borderRadius: '0 4px 4px 0' }} />
                          </span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: row.who === 'You' ? 600 : 400, color: row.who === 'You' ? 'var(--text-hi)' : 'var(--text-mid)', textAlign: 'right' }}>{fmt(row.v)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </section>
      )}
    </div>
  )
}

// One entry as a row in a short list: cover, title, hobby, and something on the right.
function EntryRow({ entry, right }: { entry: Entry; right: React.ReactNode }) {
  const hobby = HOBBY_MAP[entry.hobby_category]
  return (
    <Link href={`/entry?id=${entry.id}`} className="press"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', textDecoration: 'none', color: 'inherit' }}>
      <span style={{ width: 30, height: 44, flexShrink: 0, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {entry.cover_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={entry.cover_url} alt="" width={30} height={44} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: hobby?.accent }}>{entry.title[0]}</span>}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
        <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)' }}>{hobby?.label}</span>
      </span>
      {right}
    </Link>
  )
}
