'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import StatCard from '@/components/StatCard'
import { CLIP } from '@/components/MechCard'
import { HOBBIES } from '@/lib/hobbies'
import type { Entry } from '@/types/database'
import { getAllEntries, getGlobalStats, getFriendsStats, getLoggedMinutesByEntry, ENTRIES_CHANGED_EVENT, type GlobalStats } from '@/lib/db'
import { getWorkoutTotals, FITNESS_CHANGED_EVENT, type WorkoutTotals } from '@/lib/fitness/db'
import { useHobbies } from '@/components/HobbyContext'
import { calcHoursWithLogged } from '@/lib/hours'

export default function StatsPage() {
  const { enabledHobbies } = useHobbies()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [global, setGlobal] = useState<GlobalStats | null>(null)
  const [friendsStats, setFriendsStats] = useState<GlobalStats | null>(null)
  const [logged, setLogged] = useState<Map<string, number>>(new Map())
  const [compareTo, setCompareTo] = useState<'field' | 'friends'>('field')
  const [workouts, setWorkouts] = useState<WorkoutTotals>({ count: 0, minutes: 0 })

  useEffect(() => {
    const load = () => getAllEntries().then(setEntries).finally(() => setLoading(false))
    load()
    getGlobalStats().then(setGlobal).catch(() => {})
    getFriendsStats().then(setFriendsStats).catch(() => {})
    getLoggedMinutesByEntry().then(setLogged).catch(() => {})
    // Fitness lives outside web_entries, so its hours come in separately.
    const loadWorkouts = () => getWorkoutTotals().then(setWorkouts).catch(() => {})
    loadWorkouts()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    window.addEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    return () => {
      window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
      window.removeEventListener(FITNESS_CHANGED_EVENT, loadWorkouts)
    }
  }, [])

  if (loading) return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="mech-skeleton"
            style={{ height: 110, clipPath: CLIP, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  )

  const backlog   = entries.filter((e) => e.status === 'backlog')
  const completed = entries.filter((e) => e.status === 'completed')
  const ratedEntries = entries.filter((e) => e.rating != null)
  const avgRating = ratedEntries.length
    ? ratedEntries.reduce((sum, e) => sum + (e.rating ?? 0), 0) / ratedEntries.length
    : null

  const backlogHours  = calcHoursWithLogged(backlog, logged, 'full')
  const workoutHours = Math.round((workouts.minutes / 60) * 10) / 10
  // Entries only. The global/friends benchmarks are computed from entries, so the
  // comparison rows have to use this figure or they'd be apples to oranges.
  const finishedEntryHours = calcHoursWithLogged(completed, logged, 'full')
  // Logged training time is time already put in, so the headline adds it on.
  const finishedHours = Math.round((finishedEntryHours + workoutHours) * 10) / 10
  const hasFriends = !!friendsStats && friendsStats.user_count > 0
  const compareSource = compareTo === 'friends' ? friendsStats : global

  const entryHobbies = enabledHobbies.filter((h) => !h.customSection)

  const categoryData = entryHobbies.map((h) => ({
    name: h.pluralLabel,
    count: entries.filter((e) => e.hobby_category === h.id).length,
    color: h.accent,
  })).filter((d) => d.count > 0)

  const statusDist = [
    { name: 'Wishlist',    value: entries.filter((e) => e.status === 'wishlist').length,    color: '#ec4899' },
    { name: 'Backlog',     value: entries.filter((e) => e.status === 'backlog').length,     color: '#955ff0' },
    { name: 'In Progress', value: entries.filter((e) => e.status === 'in_progress').length, color: '#0891b2' },
    { name: 'Completed',   value: entries.filter((e) => e.status === 'completed').length,   color: '#22c55e' },
    { name: 'Dropped',     value: entries.filter((e) => e.status === 'dropped').length,     color: '#ef4444' },
  ].filter((d) => d.value > 0)

  const completionByCategory = entryHobbies.map((h) => {
    const cat = entries.filter((e) => e.hobby_category === h.id)
    const done = cat.filter((e) => e.status === 'completed').length
    const pct  = cat.length > 0 ? Math.round((done / cat.length) * 100) : 0
    return { id: h.id, label: h.pluralLabel, accent: h.accent, total: cat.length, done, pct }
  }).filter((d) => d.total > 0).sort((a, b) => b.pct - a.pct)

  const topRated = [...entries]
    .filter((e) => e.rating != null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5)

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 0,
      color: 'var(--text-hi)',
      fontFamily: 'var(--font-body)',
      fontSize: 12,
    },
  }

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>
          STATISTICS
        </h1>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Backlog Hours"   value={backlogHours}                              accent="#955ff0" sub="estimated time remaining" index={0} />
        <StatCard label="Hours Finished"  value={finishedHours}                             accent="#0891b2" sub={workoutHours > 0 ? `incl. ${workoutHours}h training` : 'across completed entries'}  index={1} />
        <StatCard label="Total Entries"   value={entries.length}                            accent="#4379ee" index={2} />
        <StatCard label="Avg Rating"      value={avgRating ? avgRating.toFixed(1) : '—'}   accent="#d97706" sub="out of 10" index={3} />
      </div>

      {/* ── You vs the field / friends ── */}
      {global && global.user_count > 0 && (
        <div style={{ marginBottom: 24, padding: '1px', clipPath: CLIP, background: '#22c55e55' }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#22c55e', clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 4px', letterSpacing: '0.05em' }}>YOU VS {compareTo === 'friends' ? 'Friends' : 'The Field'}</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: 0, letterSpacing: '0.05em' }}>
                  {compareTo === 'friends'
                    ? (hasFriends ? `across your ${friendsStats!.user_count} friend${friendsStats!.user_count === 1 ? '' : 's'}` : 'add friends to compare')
                    : `how you stack up against ${global.user_count} operator${global.user_count === 1 ? '' : 's'} on hobbylog`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['field', 'friends'] as const).map((t) => {
                  const on = compareTo === t
                  return (
                    <button key={t} onClick={() => setCompareTo(t)}
                      style={{ padding: '5px 12px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', background: on ? '#22c55e22' : 'transparent', border: `1px solid ${on ? '#22c55e' : 'var(--border-dim)'}`, color: on ? '#22c55e' : 'var(--text-dim)', cursor: 'pointer' }}>
                      {t === 'field' ? 'The Field' : 'Friends'}
                    </button>
                  )
                })}
              </div>
            </div>
            {compareTo === 'friends' && !hasFriends ? (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>You need friends to compare — add some on the Friends tab.</p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Hours Finished', mine: finishedEntryHours, avg: compareSource?.avg_finished_hours ?? 0, unit: 'h', accent: '#0891b2' },
                { label: 'Completed', mine: completed.length, avg: compareSource?.avg_completed ?? 0, unit: '', accent: '#22c55e' },
              ].map((m) => {
                const max = Math.max(m.mine, m.avg, 0.001)
                const delta = Math.round((m.mine - m.avg) * 10) / 10
                const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1)) + m.unit
                return (
                  <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.05em', width: 120, flexShrink: 0 }}>{m.label}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', width: 28, flexShrink: 0, letterSpacing: '0.05em' }}>You</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                          <div style={{ height: '100%', width: `${(m.mine / max) * 100}%`, background: m.accent, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-hi)', fontWeight: 700, width: 52, textAlign: 'right' }}>{fmt(m.mine)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', width: 28, flexShrink: 0, letterSpacing: '0.05em' }}>Avg</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                          <div style={{ height: '100%', width: `${(m.avg / max) * 100}%`, background: 'var(--text-dim)', opacity: 0.6, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', width: 52, textAlign: 'right' }}>{fmt(m.avg)}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, width: 56, textAlign: 'right', flexShrink: 0, color: delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'var(--text-dim)' }}>
                      {delta > 0 ? '+' : ''}{fmt(delta)}
                    </span>
                  </div>
                )
              })}
            </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 2: Category bar + Status donut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 24 }}>
        {/* Entries by category */}
        <div style={{ padding: '1px', clipPath: CLIP, background: '#955ff055' }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, width: '100%', padding: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#955ff0', clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, marginBottom: 16, letterSpacing: '0.05em' }}>
              ENTRIES BY CATEGORY
            </h2>
            {categoryData.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', padding: 24, margin: 0 }}>No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(200,200,200,0.04)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'var(--font-body)', fill: 'var(--text-dim)' }} />
                  <YAxis tick={{ fontSize: 12, fontFamily: 'var(--font-body)', fill: 'var(--text-dim)' }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" radius={0}>
                    {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status distribution */}
        <div style={{ padding: '1px', clipPath: CLIP, background: '#0891b255' }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, width: '100%', padding: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#0891b2', clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, marginBottom: 16, letterSpacing: '0.05em' }}>
              STATUS DISTRIBUTION
            </h2>
            {statusDist.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', padding: 24, margin: 0 }}>No data yet</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="55%" height={180}>
                  <PieChart>
                    <Pie data={statusDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                      {statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {statusDist.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, background: d.color, borderRadius: '50%', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', flex: 1, letterSpacing: '0.02em' }}>{d.name}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', fontWeight: 700 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Completion rate + Top rated ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        {/* Completion rate by category */}
        <div style={{ padding: '1px', clipPath: CLIP, background: '#d9770655' }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, width: '100%', padding: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#d97706', clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, marginBottom: 16, letterSpacing: '0.05em' }}>
              COMPLETION RATE
            </h2>
            {completionByCategory.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', padding: 24, margin: 0 }}>No data yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {completionByCategory.map((c) => (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 6, height: 6, background: c.accent, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                          {c.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
                          {c.done}/{c.total}
                        </span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: c.pct >= 50 ? c.accent : 'var(--text-dim)', fontWeight: 700, width: 36, textAlign: 'right' }}>
                          {c.pct}%
                        </span>
                      </div>
                    </div>
                    {/* Track */}
                    <div style={{ height: 4, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${c.pct}%`,
                        background: c.accent,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top rated */}
        <div style={{ padding: '1px', clipPath: CLIP, background: '#22c55e55' }}>
          <div style={{ background: 'var(--bg-card)', clipPath: CLIP, width: '100%', padding: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#22c55e', clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, marginBottom: 16, letterSpacing: '0.05em' }}>
              TOP RATED
            </h2>
            {topRated.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', padding: 24, margin: 0 }}>No rated entries</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topRated.map((e, i) => {
                  const hobby = HOBBIES.find((h) => h.id === e.hobby_category)
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', width: 22, flexShrink: 0 }}>
                        #{i + 1}
                      </span>
                      {e.cover_url && (
                        <img src={e.cover_url} alt="" style={{ width: 28, height: 38, objectFit: 'cover', flexShrink: 0, border: `1px solid color-mix(in srgb, var(--text-dim) 20%, transparent)` }} loading="lazy" decoding="async" />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.title}
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: 0, marginTop: 2, letterSpacing: '0.02em' }}>
                          {hobby?.label}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ color: '#d97706', fontSize: 12 }}>★</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', fontWeight: 700 }}>
                          {e.rating}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
