'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Target, Check, Search } from 'lucide-react'
import type { Exercise, GoalMetric } from '@/types/fitness'
import { createGoal, deleteGoal, evaluateGoals, isBodyweightMetric, setGoalAchieved, type GoalProgress } from '@/lib/fitness/db'
import { PR_KINDS, bodyweightGoalPct, fmtPrValue, parseDuration, type PrKind } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import { Button, Input, Select, Label, Empty, Modal, ACCENT } from './ui'
import ExercisePicker from './ExercisePicker'

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
  bodyweight_at_most: 'Bodyweight — get down to (lbs)',
  bodyweight_at_least: 'Bodyweight — get up to (lbs)',
}

function metricsFor(exercise: Exercise | null): GoalMetric[] {
  // With no exercise attached a goal measures the whole practice: a workout
  // tally, a bodyweight, or a plain intention you tick off yourself.
  if (!exercise) return ['manual', 'workout_count', 'bodyweight_at_most', 'bodyweight_at_least']
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
        <Label>Goals</Label>
        <Button variant="ghost" onClick={() => setAdding(true)}><Plus size={12} /> New Goal</Button>
      </div>

      {loading ? <Label>Loading…</Label> : goals.length === 0 ? (
        <Empty
          title="No goals set"
          hint="Set a number to chase — a 225 bench, a sub-8:00 mile, 100 workouts logged, a goal bodyweight — and it ticks over the moment a workout hits it. Or add a plain reminder like “work out today” and check it off yourself."
        />
      ) : (
        goals.map(({ goal, current, met, baseline }) => {
          const exercise = goal.exercise_id ? byId.get(goal.exercise_id) : null
          // Pace counts down toward the target, so its bar fills the other way.
          // Bodyweight is measured from where you started instead: 200 lbs with a
          // 175 target would otherwise read as 87% full before a pound had moved.
          const pct = isBodyweightMetric(goal.metric)
            ? bodyweightGoalPct(baseline ?? null, current, goal.target, met)
            : current == null ? 0 : Math.max(0, Math.min(100,
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
                      METRIC_LABELS[goal.metric],
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
                  <Check size={12} /> {done ? 'Done · Undo' : 'Mark Done'}
                </Button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>
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
  if (isBodyweightMetric(metric)) return `${Math.round(value * 10) / 10} lbs`
  return fmtPrValue(metric as PrKind, value)
}

function AddGoal({ exercises, onClose, onSaved }: {
  exercises: Exercise[]
  onClose: () => void
  onSaved: () => void
}) {
  const { error: toastError } = useToast()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Exercise | null>(null)
  const [picking, setPicking] = useState(false)
  const [metric, setMetric] = useState<GoalMetric>('manual')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const metrics = metricsFor(picked)

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
        exercise_id: picked?.id ?? null,
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
      <Label style={{ marginBottom: 5 }}>Name</Label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bench 225" />

      {/* A bodyweight goal measures you, not a lift, so the picker would only
          confuse things — choosing one swaps the metric out from under it. */}
      {!isBodyweightMetric(metric) && (<>
      <Label style={{ margin: '14px 0 5px' }}>Exercise</Label>
      {/* The picker searches the whole catalog, not just your library. A goal is
          something you haven't hit yet, so requiring you to have already logged
          the lift was backwards -- picking a new one creates it, ready to track. */}
      <Button
        variant="ghost" style={{ width: '100%', justifyContent: 'flex-start' }}
        onClick={() => setPicking(true)}
      >
        <Search size={13} />
        {picked ? picked.name : 'Any exercise (search the catalog)'}
      </Button>
      {picked && (
        <Button variant="quiet" style={{ marginTop: 4 }} onClick={() => setPicked(null)}>
          Clear (make it a whole-practice goal)
        </Button>
      )}
      </>)}

      <Label style={{ margin: '14px 0 5px' }}>Measure</Label>
      <Select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)} style={{ width: '100%' }}>
        {metrics.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
      </Select>

      <div style={{ display: 'grid', gridTemplateColumns: metric === 'manual' ? '1fr' : '1fr 1fr', gap: 10, marginTop: 14 }}>
        {metric !== 'manual' && (
          <div>
            <Label style={{ marginBottom: 5 }}>Target</Label>
            <Input
              value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder={isTimeMetric(metric) ? 'mm:ss' : isBodyweightMetric(metric) ? '175' : '225'}
              inputMode={isTimeMetric(metric) ? 'text' : 'decimal'}
            />
          </div>
        )}
        <div>
          <Label style={{ marginBottom: 5 }}>By (Optional)</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
        <Button variant="solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Goal'}</Button>
      </div>

      {picking && (
        <ExercisePicker
          mine={exercises}
          onPick={(e) => { setPicked(e); setPicking(false) }}
          onClose={() => setPicking(false)}
        />
      )}
    </Modal>
  )
}
