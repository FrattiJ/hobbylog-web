'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Trophy } from 'lucide-react'
import type { Exercise } from '@/types/fitness'
import { getSetHistory, listExercises, listWorkoutDates, type DatedSet } from '@/lib/fitness/db'
import {
  PR_KINDS, PR_LABELS, LOWER_IS_BETTER, dayStreak, heatmapDays, personalRecords,
  fmtPrValue, e1rm, pace, type PrKind, type PrValue,
} from '@/lib/fitness/calc'
import StatCard from '../StatCard'
import GoalsPanel from './GoalsPanel'
import { Select, Label, Rule, Empty, ACCENT } from './ui'

export default function ProgressTab() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listExercises(), listWorkoutDates()])
      .then(([e, d]) => { setExercises(e); setDates(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const streak = useMemo(() => dayStreak(dates), [dates])
  const thisWeek = useMemo(() => {
    const now = new Date()
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    return dates.filter((d) => {
      const [y, m, day] = d.split('-').map(Number)
      return new Date(y, m - 1, day) >= sunday
    }).length
  }, [dates])

  if (loading) return <Label>LOADING…</Label>

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label="WORKOUTS" value={dates.length} accent={ACCENT} index={0} />
        <StatCard label="CURRENT STREAK" value={streak.current} sub="DAYS" accent="#eab308" index={1} />
        <StatCard label="LONGEST STREAK" value={streak.longest} sub="DAYS" accent="#22c55e" index={2} />
        <StatCard label="THIS WEEK" value={thisWeek} sub="SESSIONS" accent="#0891b2" index={3} />
      </div>

      <Rule>CONSISTENCY</Rule>
      {dates.length === 0
        ? <Empty title="NOTHING LOGGED YET" hint="The heatmap fills in as you log workouts." />
        : <Heatmap dates={dates} />}

      <Rule>EXERCISE PROGRESS</Rule>
      {exercises.length === 0
        ? <Empty title="NO EXERCISES YET" hint="Log a workout and your lifts show up here with charts and records." />
        : <ExerciseProgress exercises={exercises} />}

      <Rule>TARGETS</Rule>
      <GoalsPanel exercises={exercises} />
    </>
  )
}

// -- Consistency heatmap -----------------------------------------------------

function Heatmap({ dates }: { dates: string[] }) {
  const days = useMemo(() => heatmapDays(dates, 26), [dates])
  // The generator starts on a Sunday, so straight chunks of 7 are calendar weeks.
  const weeks = useMemo(() => {
    const out: { date: string; count: number }[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [days])

  const shade = (n: number) =>
    n === 0 ? 'var(--bg-base)' : n === 1 ? `${ACCENT}66` : n === 2 ? `${ACCENT}aa` : ACCENT

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', gap: 3, minWidth: 'min-content' }}>
        {weeks.map((week, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((d) => (
              <div
                key={d.date}
                title={`${d.date} — ${d.count} workout${d.count === 1 ? '' : 's'}`}
                style={{
                  width: 11, height: 11, background: shade(d.count),
                  border: '1px solid var(--border-dim)',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <Label style={{ marginTop: 8 }}>LAST 26 WEEKS</Label>
    </div>
  )
}

// -- Per-exercise chart + records --------------------------------------------

function ExerciseProgress({ exercises }: { exercises: Exercise[] }) {
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '')
  const [history, setHistory] = useState<DatedSet[]>([])
  const [metric, setMetric] = useState<PrKind>('weight')
  const [loading, setLoading] = useState(true)

  const exercise = exercises.find((e) => e.id === exerciseId) ?? exercises[0]
  const metrics = exercise ? PR_KINDS[exercise.tracking_type] : []

  useEffect(() => {
    if (!exerciseId) return
    setLoading(true)
    getSetHistory(exerciseId).then(setHistory).catch(() => setHistory([])).finally(() => setLoading(false))
  }, [exerciseId])

  useEffect(() => {
    if (metrics.length && !metrics.includes(metric)) setMetric(metrics[0])
  }, [metrics, metric])

  const records: PrValue[] = useMemo(
    () => (exercise ? personalRecords(exercise, history, (s) => (s as DatedSet).date) : []),
    [exercise, history],
  )

  // One point per session: the best value that day, so the line reads as progress
  // rather than noise from warm-ups and back-off sets.
  const series = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const s of history) {
      if (s.is_warmup) continue
      const v = valueOf(metric, s)
      if (v == null || v <= 0) continue
      const prev = byDate.get(s.date)
      const better = prev == null || (LOWER_IS_BETTER[metric] ? v < prev : v > prev)
      if (better) byDate.set(s.date, v)
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date: date.slice(5), value: Math.round(value * 10) / 10 }))
  }, [history, metric])

  if (!exercise) return null

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} style={{ flex: '1 1 200px' }}>
          {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <Select value={metric} onChange={(e) => setMetric(e.target.value as PrKind)}>
          {metrics.map((m) => <option key={m} value={m}>{PR_LABELS[m]}</option>)}
        </Select>
      </div>

      {records.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {records.map((r) => (
            <div key={r.kind} style={{
              border: '1px solid var(--border-dim)', borderLeft: '3px solid #eab308',
              background: 'var(--bg-card)', padding: '8px 12px', minWidth: 120,
            }}>
              <Label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Trophy size={10} style={{ color: '#eab308' }} /> {PR_LABELS[r.kind]}
              </Label>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: 'var(--text-hi)', marginTop: 4 }}>
                {fmtPrValue(r.kind, r.value)}
              </div>
              {r.date && <Label style={{ marginTop: 2, fontSize: 10 }}>{r.date}</Label>}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Label>LOADING…</Label>
      ) : series.length < 2 ? (
        <Empty
          title="NOT ENOUGH DATA"
          hint="Log this exercise on at least two different days and the trend line appears here."
        />
      ) : (
        <div style={{ height: 240, border: '1px solid var(--border-dim)', background: 'var(--bg-card)', padding: '16px 8px 8px 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', fontSize: 12 }}
                labelStyle={{ color: 'var(--text-dim)' }}
                formatter={(v) => [fmtPrValue(metric, Number(v)), PR_LABELS[metric]]}
              />
              <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

function valueOf(kind: PrKind, s: DatedSet): number | null {
  switch (kind) {
    case 'weight': return s.weight ?? null
    case 'e1rm': return s.weight && s.reps ? e1rm(s.weight, s.reps) : null
    case 'volume': return s.weight && s.reps ? s.weight * s.reps : null
    case 'reps': return s.reps ?? null
    case 'seconds': return s.seconds ?? null
    case 'distance': return s.distance ?? null
    case 'pace': return s.seconds && s.distance ? pace(s.seconds, s.distance) : null
  }
}
