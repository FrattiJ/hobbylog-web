'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Target, Check } from 'lucide-react'
import type { Exercise, GoalMetric } from '@/types/fitness'
import { createGoal, deleteGoal, evaluateGoals, setGoalAchieved, type GoalProgress } from '@/lib/fitness/db'
import { PR_KINDS, fmtPrValue, parseDuration, type PrKind } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import { Button, Input, Select, Label, Empty, Modal, ACCENT } from './ui'

// Goal metrics are the PR kinds you'd actually chase, plus a whole-practice count.
// 'volume' is a PR kind but a poor goal, so it isn't offered.
const METRIC_LABELS: Record<GoalMetric, string> = {
  weight: 'Heaviest lift (lbs)',
  e1rm: 'Estimated 1RM (lbs)',
  reps: 'Reps in one set',
  seconds: 'Longest hold (mm:ss)',
  distance: 'Distance in one go (mi)',
  pace: 'Pace per mile (mm:ss)',
  workout_count: 'Total workouts logged',
  manual: "Just something to do — I'll tick it off",
}

function metricsFor(exercise: Exercise | null): GoalMetric[] {
  // With no exercise attached a goal is either a workout tally or a plain
  // intention ("get back in the gym") that you tick off yourself.
  if (!exercise) return ['manual', 'workout_count']
  return PR_KINDS[exercise.tracking_type].filter((k): k is Exclude<PrKind, 'volume'> => k !== 'volume')
}

// Targets for time-based metrics are typed as mm:ss; everything else is a plain number.
function isTimeMetric(m: GoalMetric): boolean {
  return m === 'seconds' || m === 'pace'
}

export default function GoalsPanel({ exercises }: { exercises: Exercise[] }) {
  const { success, error: toastError } = useToast()
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const reload = () => evaluateGoals().then(setGoals).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { reload() }, [])

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  async function remove(id: string) {
    try { await deleteGoal(id); reload() } catch { toastError('Could not delete that goal') }
  }

  async function toggle(id: string, done: boolean) {
    try { await setGoalAchieved(id, done); reload() } catch { toastError('Could not update that goal') }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Label>GOALS</Label>
        <Button variant="ghost" onClick={() => setAdding(true)}><Plus size={12} /> NEW GOAL</Button>
      </div>

      {loading ? <Label>LOADING…</Label> : goals.length === 0 ? (
        <Empty
          title="NO GOALS SET"
          hint="Set a number to chase — a 225 bench, a sub-8:00 mile, 100 workouts logged — and it ticks over the moment a workout hits it. Or add a plain reminder like “work out today” and check it off yourself."
        />
      ) : (
        goals.map(({ goal, current, met }) => {
          const exercise = goal.exercise_id ? byId.get(goal.exercise_id) : null
          // Pace counts down toward the target, so its bar fills the other way.
          const pct = current == null ? 0 : Math.max(0, Math.min(100,
            goal.metric === 'pace'
              ? (goal.target / current) * 100
              : (current / goal.target) * 100))
          const done = met || !!goal.achieved_at
          const color = done ? '#22c55e' : ACCENT

          return (
            <div key={goal.id} style={{
              border: '1px solid var(--border-dim)', borderLeft: `3px solid ${color}`,
              background: 'var(--bg-card)', padding: '12px 14px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-hi)' }}>
                    {done ? <Check size={13} style={{ color: '#22c55e' }} /> : <Target size={13} style={{ color: ACCENT }} />}
                    {goal.name}
                  </div>
                  <Label style={{ marginTop: 4 }}>
                    {[
                      exercise?.name,
                      METRIC_LABELS[goal.metric].toUpperCase(),
                      goal.target_date ? `BY ${goal.target_date}` : null,
                    ].filter(Boolean).join(' · ')}
                  </Label>
                </div>
                <Button variant="quiet" onClick={() => remove(goal.id)} title="Delete goal"><Trash2 size={13} /></Button>
              </div>

              {goal.metric === 'manual' ? (
                <Button
                  variant={done ? 'ghost' : 'solid'}
                  accent={done ? '#22c55e' : ACCENT}
                  style={{ marginTop: 10 }}
                  onClick={() => toggle(goal.id, !done)}
                >
                  <Check size={12} /> {done ? 'DONE — UNDO' : 'MARK DONE'}
                </Button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>
                    {current == null ? '—' : fmtGoalValue(goal.metric, current)} / {fmtGoalValue(goal.metric, goal.target)}
                  </span>
                </div>
              )}
            </div>
          )
        })
      )}

      {adding && (
        <AddGoal
          exercises={exercises}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); success('Goal added'); reload() }}
        />
      )}
    </>
  )
}

function fmtGoalValue(metric: GoalMetric, value: number): string {
  if (metric === 'workout_count') return String(Math.round(value))
  return fmtPrValue(metric as PrKind, value)
}

function AddGoal({ exercises, onClose, onSaved }: {
  exercises: Exercise[]
  onClose: () => void
  onSaved: () => void
}) {
  const { error: toastError } = useToast()
  const [name, setName] = useState('')
  const [exerciseId, setExerciseId] = useState<string>('')
  const [metric, setMetric] = useState<GoalMetric>('manual')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const exercise = exercises.find((e) => e.id === exerciseId) ?? null
  const metrics = metricsFor(exercise)

  // Keep the metric valid whenever the exercise changes.
  useEffect(() => {
    if (!metrics.includes(metric)) setMetric(metrics[0])
  }, [metrics, metric])

  async function save() {
    if (!name.trim()) { toastError('Give the goal a name'); return }
    // Manual goals have nothing to measure — target is a placeholder 1.
    const value = metric === 'manual'
      ? 1
      : isTimeMetric(metric) ? parseDuration(target) : Number(target)
    if (value == null || isNaN(value) || value <= 0) { toastError('Enter a target value'); return }
    setSaving(true)
    try {
      await createGoal({
        name: name.trim(),
        exercise_id: exerciseId || null,
        metric,
        target: value,
        target_date: targetDate || null,
      })
      onSaved()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save goal')
      setSaving(false)
    }
  }

  return (
    <Modal title="New goal" onClose={onClose} width={460}>
      <Label style={{ marginBottom: 5 }}>NAME</Label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bench 225" />

      <Label style={{ margin: '14px 0 5px' }}>EXERCISE</Label>
      <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} style={{ width: '100%' }}>
        <option value="">None — a whole-practice goal</option>
        {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>

      <Label style={{ margin: '14px 0 5px' }}>MEASURE</Label>
      <Select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)} style={{ width: '100%' }}>
        {metrics.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
      </Select>

      <div style={{ display: 'grid', gridTemplateColumns: metric === 'manual' ? '1fr' : '1fr 1fr', gap: 10, marginTop: 14 }}>
        {metric !== 'manual' && (
          <div>
            <Label style={{ marginBottom: 5 }}>TARGET</Label>
            <Input
              value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder={isTimeMetric(metric) ? 'mm:ss' : '225'}
              inputMode={isTimeMetric(metric) ? 'text' : 'decimal'}
            />
          </div>
        )}
        <div>
          <Label style={{ marginBottom: 5 }}>BY (OPTIONAL)</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="quiet" onClick={onClose}>CANCEL</Button>
        <Button variant="solid" onClick={save} disabled={saving}>{saving ? 'SAVING…' : 'ADD GOAL'}</Button>
      </div>
    </Modal>
  )
}
