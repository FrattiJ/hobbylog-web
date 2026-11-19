import type { SupabaseClient } from '@supabase/supabase-js'
import type { Exercise, Goal, WorkoutSet } from '@/types/fitness'
import { personalRecords } from '@/lib/fitness/calc'

// Goal progress for the OS endpoint, read-only.
//
// This is evaluateGoals() in lib/fitness/db.ts with two differences only: it
// queries through the server's service-role client for one given user, and it
// never ticks a goal achieved. The current value of each metric is worked out
// the same way, with the same calc helpers, so the OS shows the number hobbylog
// shows. Change one, change the other.

export interface OsGoal {
  name: string
  metric: string
  target: number
  targetDate: string | null
  achievedAt: string | null
  current?: number
}

function isBodyweightMetric(m: string): boolean {
  return m === 'bodyweight_at_most' || m === 'bodyweight_at_least'
}

function embeddedDate(rel: unknown): string {
  if (!rel) return ''
  const row = Array.isArray(rel) ? rel[0] : rel
  const date = (row as { date?: unknown } | undefined)?.date
  return typeof date === 'string' ? date : ''
}

export async function osGoals(admin: SupabaseClient, userId: string): Promise<OsGoal[]> {
  const { data: goalRows, error } = await admin
    .from('web_goals').select('*').eq('user_id', userId)
    .order('achieved_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  const goals = (goalRows ?? []) as Goal[]
  if (goals.length === 0) return []

  const needs = (pred: (g: Goal) => boolean) => goals.some(pred)
  const exerciseIds = [...new Set(goals.map((g) => g.exercise_id).filter((id): id is string => !!id))]

  const [countRes, weightRes, exRes, setRes] = await Promise.all([
    needs((g) => g.metric === 'workout_count')
      ? admin.from('web_workouts').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      : null,
    needs((g) => isBodyweightMetric(g.metric))
      ? admin.from('web_bodyweight').select('date, weight').eq('user_id', userId).order('date', { ascending: true })
      : null,
    exerciseIds.length > 0
      ? admin.from('web_exercises').select('*').eq('user_id', userId).in('id', exerciseIds)
      : null,
    exerciseIds.length > 0
      ? admin.from('web_workout_sets').select('*, workout:web_workouts!inner(date)')
          .eq('user_id', userId).in('exercise_id', exerciseIds)
      : null,
  ])

  const workoutCount = countRes?.count ?? 0
  // evaluateGoals tolerates a missing bodyweight table; so does this.
  const weights = weightRes && !weightRes.error
    ? ((weightRes.data ?? []) as { date: string; weight: number }[]).map((r) => Number(r.weight))
    : []
  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null

  const exById = new Map(((exRes?.data ?? []) as Exercise[]).map((e) => [e.id, e]))
  const setsByExercise = new Map<string, (WorkoutSet & { date: string })[]>()
  for (const r of (setRes?.data ?? []) as unknown as (WorkoutSet & { workout: unknown })[]) {
    const row = { ...r, date: embeddedDate(r.workout) }
    const list = setsByExercise.get(row.exercise_id) ?? []
    list.push(row)
    setsByExercise.set(row.exercise_id, list)
  }

  return goals.map((goal) => {
    let current: number | null = null
    if (goal.metric === 'manual') {
      current = null
    } else if (goal.metric === 'workout_count') {
      current = workoutCount
    } else if (isBodyweightMetric(goal.metric)) {
      current = latestWeight
    } else if (goal.exercise_id) {
      const ex = exById.get(goal.exercise_id)
      if (ex) {
        const sets = setsByExercise.get(ex.id) ?? []
        const prs = personalRecords(ex, sets, (s) => (s as WorkoutSet & { date: string }).date)
        current = prs.find((p) => p.kind === goal.metric)?.value ?? null
      }
    }
    const out: OsGoal = {
      name: goal.name,
      metric: goal.metric,
      target: Number(goal.target),
      targetDate: goal.target_date,
      achievedAt: goal.achieved_at,
    }
    if (current != null) out.current = current
    return out
  })
}
