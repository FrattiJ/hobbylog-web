import { supabase } from '@/lib/supabaseClient'
import { currentUserId } from '@/lib/currentUser'
import type {
  Exercise, Goal, GoalMetric, Routine, RoutineDetail, RoutineExercise,
  LastNote, TrackingType, Workout, WorkoutDetail, WorkoutSet,
} from '@/types/fitness'
import type { CatalogExercise } from './catalog'
import { defaultTracking } from './catalog'
import { bodyweightGoalMet, latestNote, notesToPersist, personalRecords, type BodyweightMetric, type PrValue } from './calc'

// Anything that mutates fitness data fires this, mirroring ENTRIES_CHANGED_EVENT
// in lib/db.ts so open tabs/panels re-read rather than showing stale numbers.
export const FITNESS_CHANGED_EVENT = 'fitness-changed'

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FITNESS_CHANGED_EVENT))
}


// -- Exercises ---------------------------------------------------------------

export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const userId = await currentUserId()
  let q = supabase.from('web_exercises').select('*').eq('user_id', userId).order('name')
  if (!includeArchived) q = q.eq('archived', false)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Exercise[]
}

// Exercises are keyed by (user, name), so picking "Bench Press" from the catalog
// twice reuses the same row -- that continuity is what makes PR history work.
export async function findOrCreateExercise(input: {
  name: string
  tracking_type?: TrackingType
  catalog_id?: string | null
  muscle?: string | null
  equipment?: string | null
}): Promise<Exercise> {
  const user_id = await currentUserId()
  const name = input.name.trim()
  if (!name) throw new Error('Exercise needs a name')

  const { data: existing } = await supabase
    .from('web_exercises').select('*').eq('user_id', user_id).eq('name', name).maybeSingle()
  if (existing) {
    // Un-archive on re-add rather than creating a duplicate name.
    if ((existing as Exercise).archived) {
      await supabase.from('web_exercises').update({ archived: false }).eq('id', existing.id)
      return { ...(existing as Exercise), archived: false }
    }
    return existing as Exercise
  }

  const { data, error } = await supabase.from('web_exercises').insert({
    user_id,
    name,
    tracking_type: input.tracking_type ?? 'weight_reps',
    catalog_id: input.catalog_id ?? null,
    muscle: input.muscle ?? null,
    equipment: input.equipment ?? null,
  }).select().single()
  if (error) throw error
  notifyChanged()
  return data as Exercise
}

export async function exerciseFromCatalog(c: CatalogExercise): Promise<Exercise> {
  return findOrCreateExercise({
    name: c.name,
    tracking_type: defaultTracking(c),
    catalog_id: c.id,
    muscle: c.muscles[0] ?? null,
    equipment: c.equipment || null,
  })
}

export async function updateExercise(id: string, patch: Partial<Pick<Exercise, 'name' | 'tracking_type' | 'muscle' | 'equipment' | 'notes' | 'archived'>>): Promise<void> {
  const { error } = await supabase.from('web_exercises').update(patch).eq('id', id)
  if (error) throw error
  notifyChanged()
}

// Archive rather than delete: the sets already logged against it stay meaningful.
export async function archiveExercise(id: string): Promise<void> {
  await updateExercise(id, { archived: true })
}

// Which of these exercises you've actually logged a set against.
//
// An exercise row is created the moment you add it to a routine or pick it from
// the catalog, so the list of exercises you own is much longer than the list you
// have data for. Anywhere that's really asking "what can I chart?" wants this,
// not listExercises.
export async function exercisesWithHistory(): Promise<Set<string>> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_workout_sets').select('exercise_id').eq('user_id', userId)
  return new Set(((data ?? []) as { exercise_id: string }[]).map((r) => r.exercise_id))
}

// Remove an exercise from your library.
//
// web_workout_sets cascades on exercise_id, so a plain delete would silently take
// logged sets with it. An exercise you've trained is therefore archived (hidden
// everywhere, history intact) while one you never used is really deleted -- which
// is the case that matters, since those are the rows cluttering the pickers.
export type ExerciseRemoval = 'deleted' | 'archived'

export async function removeExercise(id: string): Promise<ExerciseRemoval> {
  const userId = await currentUserId()
  const { count } = await supabase
    .from('web_workout_sets').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('exercise_id', id)

  if ((count ?? 0) > 0) {
    await archiveExercise(id)
    return 'archived'
  }

  // .select() so a delete blocked by RLS surfaces as zero rows, not a silent no-op.
  const { data, error } = await supabase.from('web_exercises').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Nothing was deleted — the exercise may already be gone.')
  notifyChanged()
  return 'deleted'
}

// Bodyweight over time, oldest first. Logged per workout but, until now, only
// ever shown on a single expanded history card -- captured and then invisible.
export interface BodyweightPoint { date: string; weight: number }

export async function getBodyweightHistory(): Promise<BodyweightPoint[]> {
  const userId = await currentUserId()
  const { data } = await supabase
    .from('web_workouts').select('date, bodyweight')
    .eq('user_id', userId).not('bodyweight', 'is', null)
    .order('date', { ascending: true })
  return ((data ?? []) as { date: string; bodyweight: number | null }[])
    .filter((r) => r.bodyweight != null)
    .map((r) => ({ date: r.date, weight: Number(r.bodyweight) }))
}

// -- Routines ----------------------------------------------------------------

export async function listRoutines(): Promise<Routine[]> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('web_routines').select('*').eq('user_id', userId).eq('archived', false)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Routine[]
}

// Every routine scheduled for a given weekday. A day can hold more than one --
// e.g. a Monday home-gym session and a Monday school-gym session -- so the Today
// tab auto-loads only when there's exactly one and otherwise offers the choice.
export async function getRoutinesForDay(dayOfWeek: number): Promise<Routine[]> {
  const userId = await currentUserId()
  const { data } = await supabase
    .from('web_routines').select('*')
    .eq('user_id', userId).eq('archived', false).eq('day_of_week', dayOfWeek)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Routine[]
}

export async function getRoutine(id: string): Promise<RoutineDetail | null> {
  const { data: routine } = await supabase.from('web_routines').select('*').eq('id', id).maybeSingle()
  if (!routine) return null

  const { data: rows, error } = await supabase
    .from('web_routine_exercises')
    .select('*, exercise:web_exercises(*)')
    .eq('routine_id', id)
    .order('position')
  if (error) throw error

  return {
    ...(routine as Routine),
    exercises: ((rows ?? []) as (RoutineExercise & { exercise: Exercise })[]).filter((r) => r.exercise),
  }
}

export async function createRoutine(name: string, notes: string | null = null, dayOfWeek: number | null = null): Promise<Routine> {
  const user_id = await currentUserId()
  const { data, error } = await supabase
    .from('web_routines').insert({ user_id, name: name.trim(), notes, day_of_week: dayOfWeek }).select().single()
  if (error) throw error
  notifyChanged()
  return data as Routine
}

export async function updateRoutine(id: string, patch: Partial<Pick<Routine, 'name' | 'notes' | 'archived' | 'day_of_week'>>): Promise<void> {
  const { error } = await supabase
    .from('web_routines').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  notifyChanged()
}

export async function deleteRoutine(id: string): Promise<void> {
  // Logged workouts survive: web_workouts.routine_id is ON DELETE SET NULL and
  // routine_name keeps the label history already showed.
  // .select() so a delete blocked by RLS comes back as zero rows rather than a
  // silent success — without it a no-op is indistinguishable from a real delete.
  const { data, error } = await supabase.from('web_routines').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Nothing was deleted — the routine may already be gone.')
  notifyChanged()
}

export interface RoutineExerciseDraft {
  exercise_id: string
  target_sets: number | null
  target_reps: number | null
  target_seconds: number | null
  rest_seconds: number | null
  notes: string | null
}

// Replace a routine's exercise list wholesale. Simpler and less bug-prone than
// diffing, and the lists are a dozen rows at most.
export async function setRoutineExercises(routineId: string, list: RoutineExerciseDraft[]): Promise<void> {
  const user_id = await currentUserId()
  const { error: delErr } = await supabase.from('web_routine_exercises').delete().eq('routine_id', routineId)
  if (delErr) throw delErr

  if (list.length > 0) {
    const rows = list.map((r, i) => ({ ...r, user_id, routine_id: routineId, position: i }))
    const { error } = await supabase.from('web_routine_exercises').insert(rows)
    if (error) throw error
  }
  await supabase.from('web_routines').update({ updated_at: new Date().toISOString() }).eq('id', routineId)
  notifyChanged()
}

// -- Workouts ----------------------------------------------------------------

export async function listWorkouts(limit = 100): Promise<WorkoutDetail[]> {
  const userId = await currentUserId()
  const { data: workouts, error } = await supabase
    .from('web_workouts').select('*').eq('user_id', userId)
    .order('date', { ascending: false }).order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const list = (workouts ?? []) as Workout[]
  if (list.length === 0) return []

  const { data: sets } = await supabase
    .from('web_workout_sets').select('*').in('workout_id', list.map((w) => w.id)).order('position')

  const byWorkout = new Map<string, WorkoutSet[]>()
  for (const s of (sets ?? []) as WorkoutSet[]) {
    const arr = byWorkout.get(s.workout_id)
    if (arr) arr.push(s)
    else byWorkout.set(s.workout_id, [s])
  }
  return list.map((w) => ({ ...w, sets: byWorkout.get(w.id) ?? [] }))
}

// Just the dates, for streaks and the heatmap -- no need to pull every set.
export async function listWorkoutDates(): Promise<string[]> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_workouts').select('date').eq('user_id', userId)
  return ((data ?? []) as { date: string }[]).map((r) => r.date)
}

// Headline numbers for the dashboard and stats page. Fitness has no entries any
// more, so these are what it contributes to the cross-hobby totals.
export interface WorkoutTotals { count: number; minutes: number }

export async function getWorkoutTotals(): Promise<WorkoutTotals> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_workouts').select('duration_minutes').eq('user_id', userId)
  const rows = (data ?? []) as { duration_minutes: number | null }[]
  return {
    count: rows.length,
    minutes: rows.reduce((t, r) => t + (r.duration_minutes ?? 0), 0),
  }
}

export interface WorkoutSetDraft {
  exercise_id: string
  reps: number | null
  weight: number | null
  seconds: number | null
  distance: number | null
  rpe: number | null
  is_warmup: boolean
}

export interface WorkoutDraft {
  routine_id: string | null
  routine_name: string | null
  date: string
  duration_minutes: number | null
  bodyweight: number | null
  notes: string | null
  sets: WorkoutSetDraft[]
  // Per-exercise setup notes. Blank ones are dropped before insert.
  exerciseNotes?: { exercise_id: string; note: string }[]
}

export async function saveWorkout(draft: WorkoutDraft): Promise<Workout> {
  const user_id = await currentUserId()
  const { data: workout, error } = await supabase.from('web_workouts').insert({
    user_id,
    routine_id: draft.routine_id,
    routine_name: draft.routine_name,
    date: draft.date,
    duration_minutes: draft.duration_minutes,
    bodyweight: draft.bodyweight,
    notes: draft.notes,
  }).select().single()
  if (error) throw error

  if (draft.sets.length > 0) {
    const rows = draft.sets.map((s, i) => ({ ...s, user_id, workout_id: workout.id, position: i }))
    const { error: setErr } = await supabase.from('web_workout_sets').insert(rows)
    if (setErr) {
      // Don't leave a workout with no sets behind if the set insert fails.
      await supabase.from('web_workouts').delete().eq('id', workout.id)
      throw setErr
    }
  }

  // Only non-empty notes are stored: an empty one must not overwrite the note
  // being carried forward from an earlier session.
  const notes = notesToPersist(draft.exerciseNotes ?? [])
    .map((n) => ({ user_id, workout_id: workout.id, exercise_id: n.exercise_id, note: n.note }))
  if (notes.length > 0) {
    // A failed note shouldn't discard a logged workout, so this isn't fatal.
    await supabase.from('web_exercise_notes').insert(notes)
  }

  notifyChanged()
  return workout as Workout
}

// -- Editing a logged workout ------------------------------------------------

// Correcting a session had exactly one option: delete it and log it again. A
// mistyped bodyweight is not worth losing a workout over.
export async function updateWorkout(
  id: string,
  patch: Partial<Pick<Workout, 'date' | 'duration_minutes' | 'bodyweight' | 'notes'>>,
): Promise<void> {
  const { data, error } = await supabase.from('web_workouts').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Nothing was updated — the workout may already be gone.')
  notifyChanged()
}

// Replace a logged workout's sets wholesale, the way setRoutineExercises replaces
// a routine: simpler than diffing an edit down to inserts, updates and deletes,
// and a session is a few dozen rows at most. Set ids change, which nothing
// depends on -- records and charts are computed from the rows themselves.
export async function replaceWorkoutSets(workoutId: string, sets: WorkoutSetDraft[]): Promise<void> {
  const user_id = await currentUserId()
  const { error: delErr } = await supabase.from('web_workout_sets').delete().eq('workout_id', workoutId)
  if (delErr) throw delErr

  if (sets.length > 0) {
    const rows = sets.map((s, i) => ({ ...s, user_id, workout_id: workoutId, position: i }))
    const { error } = await supabase.from('web_workout_sets').insert(rows)
    if (error) throw error
  }
  notifyChanged()
}

// Setup notes for one logged session. A blank note is removed rather than stored,
// the same rule logging follows -- an empty row would otherwise become the newest
// note and shadow the one being carried forward.
export async function setWorkoutNotes(
  workoutId: string,
  notes: { exercise_id: string; note: string }[],
): Promise<void> {
  const user_id = await currentUserId()
  await supabase.from('web_exercise_notes').delete().eq('workout_id', workoutId)

  const keep = notesToPersist(notes).map((n) => ({
    user_id, workout_id: workoutId, exercise_id: n.exercise_id, note: n.note,
  }))
  if (keep.length > 0) {
    const { error } = await supabase.from('web_exercise_notes').insert(keep)
    if (error) throw error
  }
  notifyChanged()
}

export async function deleteWorkout(id: string): Promise<void> {
  const { data, error } = await supabase.from('web_workouts').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Nothing was deleted — the workout may already be gone.')
  notifyChanged()
}

// -- Set history, PRs --------------------------------------------------------

export interface DatedSet extends WorkoutSet { date: string }

// Every set ever logged for an exercise, newest first, each tagged with its
// workout's date. Feeds the progress chart, the PR list, and "last time" values.
// PostgREST returns an embedded to-one relation as an object, but the generated
// types (and some queries) present it as a one-element array. Normalise both so a
// shape surprise can't silently blank out every date.
function embeddedDate(rel: unknown): string {
  if (!rel) return ''
  const row = Array.isArray(rel) ? rel[0] : rel
  const date = (row as { date?: unknown } | undefined)?.date
  return typeof date === 'string' ? date : ''
}

export async function getSetHistory(exerciseId: string): Promise<DatedSet[]> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('web_workout_sets')
    .select('*, workout:web_workouts!inner(date)')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
  if (error) throw error

  return ((data ?? []) as unknown as (WorkoutSet & { workout: unknown })[])
    .map((r) => ({ ...r, date: embeddedDate(r.workout) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.position - b.position))
}

// Every set logged against a whole list of exercises, in ONE query.
//
// The logger needs two things per exercise: its full history (for PR badges) and
// just its last session (for the ghost placeholders). Asking for those separately
// meant getSetHistory and getLastSets each downloaded the same complete history,
// once per exercise -- so an eight-exercise routine issued dozens of requests and
// pulled every set twice. One query, split locally, covers both.
export interface ExerciseHistory {
  // Every set ever, newest session first.
  history: DatedSet[]
  // Only the most recent session's sets, back in the order they were logged.
  lastSets: DatedSet[]
}

export async function getHistories(exerciseIds: string[]): Promise<Map<string, ExerciseHistory>> {
  const out = new Map<string, ExerciseHistory>()
  if (exerciseIds.length === 0) return out
  const userId = await currentUserId()

  const { data, error } = await supabase
    .from('web_workout_sets')
    .select('*, workout:web_workouts!inner(date)')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds)
  if (error) throw error

  const byExercise = new Map<string, DatedSet[]>()
  for (const r of (data ?? []) as unknown as (WorkoutSet & { workout: unknown })[]) {
    const row: DatedSet = { ...r, date: embeddedDate(r.workout) }
    const arr = byExercise.get(row.exercise_id)
    if (arr) arr.push(row)
    else byExercise.set(row.exercise_id, [row])
  }

  for (const id of exerciseIds) {
    const history = byExercise.get(id) ?? []
    history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.position - b.position))
    // Sorted newest first, so the leading run sharing the newest date is the last session.
    const newest = history[0]?.date
    const lastSets = newest
      ? history.filter((r) => r.date === newest).sort((a, b) => a.position - b.position)
      : []
    out.set(id, { history, lastSets })
  }
  return out
}

// Exercise count per routine, in one query. The routine list shows a count on
// every card; fetching each routine in full just to take the length of its array
// cost two extra requests per card.
export async function getRoutineExerciseCounts(): Promise<Map<string, number>> {
  const userId = await currentUserId()
  const { data } = await supabase
    .from('web_routine_exercises').select('routine_id').eq('user_id', userId)
  const out = new Map<string, number>()
  for (const r of (data ?? []) as { routine_id: string }[]) {
    out.set(r.routine_id, (out.get(r.routine_id) ?? 0) + 1)
  }
  return out
}

// The newest note for each exercise, with the date it was written. Because blank
// notes are never stored, this is the last thing you actually typed -- sessions
// where you left it empty don't blank it out.
export async function getLastNotes(exerciseIds: string[]): Promise<Map<string, LastNote>> {
  const out = new Map<string, LastNote>()
  if (exerciseIds.length === 0) return out
  const userId = await currentUserId()

  const { data, error } = await supabase
    .from('web_exercise_notes')
    .select('note, exercise_id, workout:web_workouts!inner(date)')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds)
  if (error) throw error

  const byExercise = new Map<string, LastNote[]>()
  for (const r of (data ?? []) as unknown as { note: string; exercise_id: string; workout: unknown }[]) {
    const row = { note: r.note, date: embeddedDate(r.workout) }
    const arr = byExercise.get(r.exercise_id)
    if (arr) arr.push(row)
    else byExercise.set(r.exercise_id, [row])
  }
  for (const [exerciseId, rows] of byExercise) {
    const best = latestNote(rows)
    if (best) out.set(exerciseId, best)
  }
  return out
}

// Every note ever left on an exercise, newest first -- the history view.
export async function getNoteHistory(exerciseId: string): Promise<LastNote[]> {
  const userId = await currentUserId()
  const { data } = await supabase
    .from('web_exercise_notes')
    .select('note, workout:web_workouts!inner(date)')
    .eq('user_id', userId).eq('exercise_id', exerciseId)
  return ((data ?? []) as unknown as { note: string; workout: unknown }[])
    .map((r) => ({ note: r.note, date: embeddedDate(r.workout) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

// Notes attached to one logged workout, keyed by exercise -- for History.
export async function getWorkoutNotes(workoutIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (workoutIds.length === 0) return out
  const { data } = await supabase
    .from('web_exercise_notes').select('workout_id, exercise_id, note').in('workout_id', workoutIds)
  for (const r of (data ?? []) as { workout_id: string; exercise_id: string; note: string }[]) {
    out.set(`${r.workout_id}:${r.exercise_id}`, r.note)
  }
  return out
}

export async function getPersonalRecords(exercise: Exercise): Promise<PrValue[]> {
  const sets = await getSetHistory(exercise.id)
  return personalRecords(exercise, sets, (s) => (s as DatedSet).date)
}

// The most recent session's sets for each of the given exercises. These become
// the ghost placeholders in the logger, so you can see what to beat.
export async function getLastSets(exerciseIds: string[]): Promise<Map<string, DatedSet[]>> {
  const out = new Map<string, DatedSet[]>()
  if (exerciseIds.length === 0) return out
  const userId = await currentUserId()

  const { data, error } = await supabase
    .from('web_workout_sets')
    .select('*, workout:web_workouts!inner(date)')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds)
  if (error) throw error

  for (const r of (data ?? []) as unknown as (WorkoutSet & { workout: unknown })[]) {
    const row: DatedSet = { ...r, date: embeddedDate(r.workout) }
    const prev = out.get(row.exercise_id)
    if (!prev) out.set(row.exercise_id, [row])
    else if (row.date > prev[0].date) out.set(row.exercise_id, [row]) // newer session wins
    else if (row.date === prev[0].date) prev.push(row)
  }
  for (const arr of out.values()) arr.sort((a, b) => a.position - b.position)
  return out
}

// -- Goals -------------------------------------------------------------------

export async function listGoals(): Promise<Goal[]> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('web_goals').select('*').eq('user_id', userId)
    .order('achieved_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Goal[]
}

export async function createGoal(input: {
  name: string
  exercise_id: string | null
  metric: GoalMetric
  target: number
  target_date: string | null
}): Promise<Goal> {
  const user_id = await currentUserId()
  const { data, error } = await supabase.from('web_goals').insert({ user_id, ...input }).select().single()
  if (error) throw error
  notifyChanged()
  return data as Goal
}

export async function deleteGoal(id: string): Promise<void> {
  const { data, error } = await supabase.from('web_goals').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Nothing was deleted — the goal may already be gone.')
  notifyChanged()
}

export async function setGoalAchieved(id: string, achieved: boolean): Promise<void> {
  await supabase.from('web_goals').update({ achieved_at: achieved ? new Date().toISOString() : null }).eq('id', id)
  notifyChanged()
}

// Current value of every goal, and which unachieved ones have just been met.
// Run after saving a workout so a goal ticks over the moment you hit it.
export interface GoalProgress {
  goal: Goal
  current: number | null
  met: boolean
  // Where a bodyweight goal started from, so its bar can measure the distance
  // actually covered. Without it, "200 lbs, heading for 175" would read as 87%
  // before a single pound moved. Null for every other metric.
  baseline?: number | null
}

export function isBodyweightMetric(m: GoalMetric): boolean {
  return m === 'bodyweight_at_most' || m === 'bodyweight_at_least'
}

export async function evaluateGoals(): Promise<GoalProgress[]> {
  const [goals, exercises] = await Promise.all([listGoals(), listExercises(true)])
  if (goals.length === 0) return []
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const workoutCount = (await listWorkoutDates()).length

  // Only fetched when something actually asks for it.
  const weights = goals.some((g) => isBodyweightMetric(g.metric))
    ? await getBodyweightHistory().catch(() => [])
    : []
  const latestWeight = weights.length > 0 ? weights[weights.length - 1].weight : null

  const out: GoalProgress[] = []
  for (const goal of goals) {
    let current: number | null = null

    // Manual goals have nothing to measure — they're met only when ticked by hand.
    if (goal.metric === 'manual') {
      out.push({ goal, current: null, met: !!goal.achieved_at })
      continue
    }

    if (goal.metric === 'workout_count') {
      current = workoutCount
    } else if (isBodyweightMetric(goal.metric)) {
      // The most recent reading is where you are now; a session logged without
      // a bodyweight leaves the last real one standing.
      current = latestWeight
      // Baseline is the reading you were at when the goal was set, so the bar
      // measures ground covered rather than distance from zero. Goals set before
      // any weighing fall back to the earliest reading there is.
      const atCreation = weights.filter((w) => w.date <= goal.created_at.slice(0, 10))
      const base = atCreation.length > 0
        ? atCreation[atCreation.length - 1].weight
        : weights[0]?.weight ?? null

      const met = current != null && bodyweightGoalMet(goal.metric as BodyweightMetric, current, goal.target)
      if (met && !goal.achieved_at) await setGoalAchieved(goal.id, true)
      out.push({ goal, current, met, baseline: base })
      continue
    } else if (goal.exercise_id) {
      const ex = exById.get(goal.exercise_id)
      if (ex) {
        const prs = await getPersonalRecords(ex)
        current = prs.find((p) => p.kind === goal.metric)?.value ?? null
      }
    }

    // Pace is the one metric where beating the target means going lower.
    const met = current != null && (goal.metric === 'pace' ? current <= goal.target : current >= goal.target)
    if (met && !goal.achieved_at) await setGoalAchieved(goal.id, true)
    out.push({ goal, current, met })
  }
  return out
}
