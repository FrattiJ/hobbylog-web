// How a given exercise is measured. This is the spine of the whole feature: it
// decides which columns the set grid shows, and what counts as a personal record.
//   weight_reps   — barbell/dumbbell/machine work: lbs × reps
//   reps          — bodyweight work: reps, with optional added lbs (weighted pull-ups)
//   time          — holds and stretches: a duration, longer is better
//   time_distance — running/rowing/cycling: a duration plus how far you went
export type TrackingType = 'weight_reps' | 'reps' | 'time' | 'time_distance'

export interface Exercise {
  id: string
  name: string
  tracking_type: TrackingType
  // Slug from the bundled free-exercise-db catalog, or null for a custom exercise.
  catalog_id: string | null
  muscle: string | null
  equipment: string | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface Routine {
  id: string
  name: string
  notes: string | null
  // 0 = Sunday .. 6 = Saturday, matching Date.getDay(). Null = not tied to a day.
  // A routine scheduled for today pre-loads on the Today tab.
  day_of_week: number | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  position: number
  target_sets: number | null
  target_reps: number | null
  // Seconds, for time / time_distance exercises.
  target_seconds: number | null
  rest_seconds: number | null
  notes: string | null
}

export interface Workout {
  id: string
  routine_id: string | null
  // Routine name captured at log time, so history survives renaming or deleting a routine.
  routine_name: string | null
  date: string
  duration_minutes: number | null
  bodyweight: number | null
  notes: string | null
  created_at: string
}

export interface WorkoutSet {
  id: string
  workout_id: string
  exercise_id: string
  position: number
  // Only the fields relevant to the exercise's tracking_type are filled.
  reps: number | null
  weight: number | null      // lbs
  seconds: number | null
  distance: number | null    // miles
  rpe: number | null
  is_warmup: boolean
}

export type GoalMetric =
  | 'weight'         // heaviest single lift
  | 'e1rm'           // estimated one-rep max
  | 'reps'           // most reps in a set
  | 'seconds'        // longest hold
  | 'distance'       // farthest in one go
  | 'pace'           // fastest min/mile — lower is better
  | 'workout_count'  // total workouts logged (no exercise attached)
  | 'manual'         // free-text intention with nothing to measure; you tick it off

export interface Goal {
  id: string
  name: string
  // Null for whole-practice goals like "log 100 workouts".
  exercise_id: string | null
  metric: GoalMetric
  target: number
  target_date: string | null
  achieved_at: string | null
  created_at: string
}

// A setup note for one exercise on one workout: seat position, incline, grip.
// Blank notes are never persisted, so the newest row is always the newest thing
// actually typed -- that's what lets it carry forward across blank sessions.
export interface ExerciseNote {
  id: string
  workout_id: string
  exercise_id: string
  note: string
}

// The note to show as a ghost, plus when it was written.
export interface LastNote {
  note: string
  date: string
}

// A routine with its exercise list resolved — what the editor and the logger both want.
export interface RoutineDetail extends Routine {
  exercises: (RoutineExercise & { exercise: Exercise })[]
}

// A logged workout with its sets resolved.
export interface WorkoutDetail extends Workout {
  sets: WorkoutSet[]
}
