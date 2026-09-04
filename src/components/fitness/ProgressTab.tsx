'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Trophy, Scale } from 'lucide-react'
import type { Exercise } from '@/types/fitness'
import {
  exercisesWithHistory, getProgressTotals, getSetHistory, listBodyweight, listExercises,
  type BodyweightPoint, type DatedSet, type ProgressTotals,
} from '@/lib/fitness/db'
import {
  PR_KINDS, PR_LABELS, LOWER_IS_BETTER, dayStreak, heatmapDays, personalRecords,
  fmtPrValue, e1rm, pace, type PrKind, type PrValue,
} from '@/lib/fitness/calc'
import StatCard from '../StatCard'
import GoalsPanel from './GoalsPanel'
import { Select, Label, Rule, Empty, Button, ACCENT } from './ui'
import { WeighInModal } from './WeighIn'

export default function ProgressTab() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  // Only the exercises you've actually logged a set against. Adding one to a
  // routine (or deleting the workouts that used it) leaves the exercise row
  // behind, which is why the chart picker used to list lifts with no data.
  const [trained, setTrained] = useState<Set<string>>(new Set())
  const [totals, setTotals] = useState<ProgressTotals>({ dates: [], minutes: 0, volume: 0 })
  const [bodyweight, setBodyweight] = useState<BodyweightPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [loggingWeight, setLoggingWeight] = useState(false)

  useEffect(() => {
    Promise.all([listExercises(), getProgressTotals(), exercisesWithHistory(), listBodyweight()])
      .then(([e, t, trainedIds, bw]) => { setExercises(e); setTotals(t); setTrained(trainedIds); setBodyweight(bw) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const dates = totals.dates
  const streak = useMemo(() => dayStreak(dates), [dates])

  // Under an hour of logging, hours would just read "0" -- show the minutes
  // instead until there are enough of them to be worth rounding.
  const timeTrained = totals.minutes < 60
    ? { value: totals.minutes, unit: 'MINUTES' }
    : { value: Math.round(totals.minutes / 60), unit: 'HOURS' }

  const charted = useMemo(() => exercises.filter((e) => trained.has(e.id)), [exercises, trained])

  if (loading) return <Label>LOADING…</Label>

  const reloadWeights = () => listBodyweight().then(setBodyweight).catch(() => {})

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label="WORKOUTS" value={dates.length} accent={ACCENT} index={0} />
        <StatCard label="CURRENT STREAK" value={streak.current} sub="DAYS" accent="#eab308" index={1} />
        {/* Longest streak and this-week were both restating what the heatmap
            directly below already shows. Volume and time trained are the two
            totals nothing else on the page adds up. */}
        <StatCard label="VOLUME LIFTED" value={Math.round(totals.volume)} sub="LBS" accent="#22c55e" index={2} />
        <StatCard label="TIME TRAINED" value={timeTrained.value} sub={timeTrained.unit} accent="#0891b2" index={3} />
      </div>

      <Rule>CONSISTENCY</Rule>
      {dates.length === 0
        ? <Empty title="NOTHING LOGGED YET" hint="The heatmap fills in as you log workouts." />
        : <Heatmap dates={dates} />}

      <Rule>BODYWEIGHT</Rule>
      <Bodyweight points={bodyweight} onLog={() => setLoggingWeight(true)} />

      <Rule>EXERCISE PROGRESS</Rule>
      {charted.length === 0
        ? <Empty title="NO EXERCISES LOGGED YET" hint="Log a workout and your lifts show up here with charts and records." />
        : <ExerciseProgress exercises={charted} />}

      {/* Goals get the full list: you should be able to aim at a lift you haven't
          done yet, which is the whole point of setting a target. */}
      <Rule>TARGETS</Rule>
      <GoalsPanel exercises={exercises} />

      {loggingWeight && (
        <WeighInModal
          existing={bodyweight}
          onClose={() => setLoggingWeight(false)}
          onSaved={() => { setLoggingWeight(false); reloadWeights() }}
        />
      )}
    </>
  )
}

// -- Consistency heatmap -----------------------------------------------------

const CELL = 11
const GAP = 3
const COL = CELL + GAP

function Heatmap({ dates }: { dates: string[] }) {
  const days = useMemo(() => heatmapDays(dates, 26), [dates])
  // The generator starts on a Sunday, so straight chunks of 7 are calendar weeks.
  const weeks = useMemo(() => {
    const out: { date: string; count: number }[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [days])

  const scroller = useRef<HTMLDivElement>(null)

  // Today is the last column, so the strip opens scrolled to the far left --
  // six months ago. Centre today instead, before paint, so the section never
  // flashes the wrong end of the year.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const todayCentre = (weeks.length - 0.5) * COL
    el.scrollLeft = Math.max(0, todayCentre - el.clientWidth / 2)
  }, [weeks.length])

  const shade = (n: number) =>
    n === 0 ? 'var(--bg-base)' : n === 1 ? `${ACCENT}66` : n === 2 ? `${ACCENT}aa` : ACCENT

  return (
    <div>
      <div
        ref={scroller}
        className="scroll-hide"
        style={{ overflowX: 'auto', paddingBottom: 4 }}
      >
        {/* Trailing space equal to half the strip lets the newest column sit in
            the middle rather than jammed against the right edge. */}
        <div style={{ display: 'flex', gap: GAP, width: 'max-content', paddingRight: '50%' }}>
          {weeks.map((week, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {week.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date} — ${d.count} workout${d.count === 1 ? '' : 's'}`}
                  style={{
                    width: CELL, height: CELL, background: shade(d.count),
                    border: '1px solid var(--border-dim)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <Label style={{ marginTop: 8 }}>LAST 26 WEEKS · SWIPE BACK IN TIME</Label>
    </div>
  )
}

// -- Bodyweight --------------------------------------------------------------

// Bodyweight is captured on every workout but was only ever visible on a single
// expanded history card. One point per day (the last reading of that day wins).
function Bodyweight({ points, onLog }: { points: BodyweightPoint[]; onLog: () => void }) {
  const series = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const p of points) byDate.set(p.date, p.weight)
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date: date.slice(5), value: Math.round(value * 10) / 10 }))
  }, [points])

  if (series.length === 0) {
    return (
      <Empty
        title="NO BODYWEIGHT LOGGED"
        hint="Weigh in whenever suits you — first thing in the morning, on a rest day, whenever. It charts here."
        action={<Button variant="ghost" onClick={onLog}><Scale size={13} /> LOG A WEIGH-IN</Button>}
      />
    )
  }

  const latest = series[series.length - 1].value
  const first = series[0].value
  const change = Math.round((latest - first) * 10) / 10

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Stat label="CURRENT" value={`${latest} lbs`} />
        <Stat label="READINGS" value={String(series.length)} />
        {series.length > 1 && (
          <Stat
            label="CHANGE"
            value={`${change > 0 ? '+' : ''}${change} lbs`}
            color={change === 0 ? undefined : change > 0 ? '#eab308' : '#22c55e'}
          />
        )}
        <Button variant="ghost" onClick={onLog} style={{ marginLeft: 'auto' }}>
          <Scale size={13} /> LOG A WEIGH-IN
        </Button>
      </div>

      {series.length < 2 ? (
        <Label>LOG IT ON ONE MORE SESSION AND THE TREND LINE APPEARS.</Label>
      ) : (
        <div style={{ height: 200, border: '1px solid var(--border-dim)', background: 'var(--bg-card)', padding: '16px 8px 8px 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', fontSize: 12 }}
                labelStyle={{ color: 'var(--text-dim)' }}
                formatter={(v) => [`${v} lbs`, 'BODYWEIGHT']}
              />
              <Line type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} dot={{ r: 3, fill: '#0891b2' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${color ?? '#0891b2'}`,
      background: 'var(--bg-card)', padding: '8px 12px', minWidth: 110,
    }}>
      <Label>{label}</Label>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color: color ?? 'var(--text-hi)', marginTop: 4 }}>
        {value}
      </div>
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
