'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Trash2, Pencil, Save, X } from 'lucide-react'
import type { Exercise, WorkoutDetail, WorkoutSet } from '@/types/fitness'
import {
  deleteWorkout, evaluateGoals, getBodyweightOn, getWorkoutNotes, listExercises, listWorkouts,
  replaceWorkoutSets, setWorkoutNotes, updateWorkout,
} from '@/lib/fitness/db'
import { fmtSet, setsVolume } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import SetGrid, { draftHasData, draftToSet, type DraftSet } from './SetGrid'
import { Button, Input, TextArea, Label, Empty, Confirm, Rule, ACCENT } from './ui'

// Sets belonging to one exercise within a workout, in the order they were logged.
interface Group { exercise: Exercise | undefined; sets: WorkoutSet[] }

function groupSets(sets: WorkoutSet[], exercises: Map<string, Exercise>): Group[] {
  const groups: Group[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.sets[0].exercise_id === s.exercise_id) last.sets.push(s)
    else groups.push({ exercise: exercises.get(s.exercise_id), sets: [s] })
  }
  return groups
}

export default function HistoryTab() {
  const { success, error: toastError } = useToast()
  const [workouts, setWorkouts] = useState<WorkoutDetail[]>([])
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<WorkoutDetail | null>(null)
  // Keyed 'workoutId:exerciseId' -- the setup note left on that exercise that day.
  const [notes, setNotes] = useState<Map<string, string>>(new Map())
  // The weigh-in recorded on each workout's date, if there was one. Bodyweight
  // is its own log now, so it is looked up by date rather than read off the row.
  const [weights, setWeights] = useState<Map<string, number>>(new Map())

  const reload = () => Promise.all([listWorkouts(), listExercises(true)])
    .then(async ([w, e]) => {
      setWorkouts(w)
      setExercises(new Map(e.map((x) => [x.id, x])))
      const [n, bw] = await Promise.all([
        getWorkoutNotes(w.map((x) => x.id)).catch(() => new Map<string, string>()),
        getBodyweightOn([...new Set(w.map((x) => x.date))]).catch(() => new Map<string, number>()),
      ])
      setNotes(n)
      setWeights(bw)
    })
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { reload() }, [])

  async function remove(w: WorkoutDetail) {
    setConfirming(null)
    try {
      await deleteWorkout(w.id)
      success('Workout deleted')
      reload()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete that workout')
    }
  }

  if (loading) return <Label>Loading…</Label>

  if (workouts.length === 0) {
    return <Empty title="No workouts logged" hint="Once you finish a session on the Today tab it shows up here." />
  }

  return (
    <>
      <Label style={{ marginBottom: 12 }}>{workouts.length} workout{workouts.length === 1 ? '' : 's'}</Label>
      {workouts.map((w) => {
        const expanded = open === w.id
        const isEditing = editing === w.id
        const volume = setsVolume(w.sets)
        const groups = groupSets(w.sets, exercises)

        return (
          <div key={w.id} style={{
            border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
            background: 'var(--bg-card)', marginBottom: 8,
          }}>
            <button
              onClick={() => {
                if (isEditing) return // don't collapse an open editor by accident
                setOpen(expanded ? null : w.id)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                cursor: isEditing ? 'default' : 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: 'var(--text-hi)', fontWeight: 500 }}>
                  {w.routine_name ?? 'Freestyle'}
                </div>
                <Label style={{ marginTop: 3 }}>
                  {[
                    formatDate(w.date),
                    `${w.sets.length} Sets`,
                    volume > 0 ? `${Math.round(volume).toLocaleString()} lbs` : null,
                    w.duration_minutes ? `${w.duration_minutes} min` : null,
                    weights.get(w.date) ? `${weights.get(w.date)} lbs BW` : null,
                  ].filter(Boolean).join(' · ')}
                </Label>
              </div>
              {!isEditing && (
                <ChevronDown
                  size={16}
                  style={{
                    color: 'var(--text-dim)', flexShrink: 0,
                    transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease',
                  }}
                />
              )}
            </button>

            {expanded && isEditing && (
              <WorkoutEditor
                workout={w}
                groups={groups}
                notes={notes}
                onCancel={() => setEditing(null)}
                onSaved={(hit) => {
                  setEditing(null)
                  success(hit.length > 0
                    ? `Workout updated — goal reached: ${hit.join(', ')}`
                    : 'Workout updated')
                  reload()
                }}
              />
            )}

            {expanded && !isEditing && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-dim)' }}>
                {groups.map((g, i) => (
                  <div key={i} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 4 }}>
                      {g.exercise?.name ?? 'Deleted exercise'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.sets.map((s, j) => (
                        <span key={s.id} style={{
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: s.is_warmup ? 'var(--text-mute)' : 'var(--text-hi)',
                          border: '1px solid var(--border-dim)', padding: '3px 8px',
                        }}>
                          <span style={{ color: 'var(--text-dim)' }}>{s.is_warmup ? 'W' : j + 1}</span>{' '}
                          {g.exercise ? fmtSet(g.exercise.tracking_type, s) : '--'}
                        </span>
                      ))}
                    </div>
                    {g.exercise && notes.get(`${w.id}:${g.exercise.id}`) && (
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
                        marginTop: 5, lineHeight: 1.5, fontStyle: 'italic',
                      }}>
                        {notes.get(`${w.id}:${g.exercise.id}`)}
                      </p>
                    )}
                  </div>
                ))}

                {w.notes && (
                  <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 12, lineHeight: 1.6, fontStyle: 'italic' }}>
                    {w.notes}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Label>{weights.get(w.date) ? `Bodyweight ${weights.get(w.date)} lbs` : ''}</Label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button variant="ghost" onClick={() => setEditing(w.id)}><Pencil size={13} /> Edit</Button>
                    <Button variant="quiet" onClick={() => setConfirming(w)}><Trash2 size={13} /> Delete</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {confirming && (
        <Confirm
          title="Delete workout"
          body={`Delete the workout logged on ${formatDate(confirming.date)}? Its sets go with it, and this can't be undone.`}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

// -- Editing a logged workout ------------------------------------------------

interface EditGroup {
  exercise: Exercise
  sets: DraftSet[]
  note: string
}

// Numbers become strings here for the same reason the logger does it: a half-typed
// value shouldn't be thrown away mid-keystroke.
function toDraft(s: WorkoutSet): DraftSet {
  return {
    key: s.id,
    reps: s.reps != null ? String(s.reps) : '',
    weight: s.weight != null ? String(s.weight) : '',
    duration: s.seconds != null ? secondsToText(s.seconds) : '',
    distance: s.distance != null ? String(s.distance) : '',
    warmup: s.is_warmup,
  }
}

function secondsToText(total: number): string {
  const m = Math.floor(total / 60)
  const sec = Math.round(total % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function WorkoutEditor({ workout, groups, notes, onCancel, onSaved }: {
  workout: WorkoutDetail
  groups: Group[]
  notes: Map<string, string>
  onCancel: () => void
  onSaved: (hitGoals: string[]) => void
}) {
  const { error: toastError } = useToast()
  const [date, setDate] = useState(workout.date)
  const [duration, setDuration] = useState(workout.duration_minutes != null ? String(workout.duration_minutes) : '')
  const [sessionNotes, setSessionNotes] = useState(workout.notes ?? '')
  const [saving, setSaving] = useState(false)

  // A set logged against an exercise that was since hard-deleted has nothing to
  // edit against -- no name, no tracking type -- so those groups are left alone
  // and preserved untouched on save.
  const [rows, setRows] = useState<EditGroup[]>(() =>
    groups.filter((g): g is Group & { exercise: Exercise } => !!g.exercise).map((g) => ({
      exercise: g.exercise,
      sets: g.sets.map(toDraft),
      note: notes.get(`${workout.id}:${g.exercise.id}`) ?? '',
    })),
  )

  const orphanSets = groups.filter((g) => !g.exercise).flatMap((g) => g.sets)

  async function save() {
    const kept = rows.flatMap((r) =>
      r.sets.filter(draftHasData).map((s) => ({
        exercise_id: r.exercise.id,
        ...draftToSet(r.exercise.tracking_type, s),
      })),
    )
    // Orphans carry through as-is: they're real logged work, just no longer
    // attached to an exercise this UI can render.
    const orphans = orphanSets.map((s) => ({
      exercise_id: s.exercise_id,
      reps: s.reps, weight: s.weight, seconds: s.seconds,
      distance: s.distance, rpe: s.rpe, is_warmup: s.is_warmup,
    }))

    if (kept.length + orphans.length === 0) {
      toastError('A workout needs at least one set — delete it instead if that\'s what you meant')
      return
    }

    setSaving(true)
    try {
      await updateWorkout(workout.id, {
        date,
        duration_minutes: duration.trim() ? Math.round(Number(duration)) || null : null,
        notes: sessionNotes.trim() || null,
      })
      await replaceWorkoutSets(workout.id, [...kept, ...orphans])
      await setWorkoutNotes(workout.id, rows.map((r) => ({ exercise_id: r.exercise.id, note: r.note })))

      // A correction can satisfy a goal as readily as a new session can —
      // fixing a mistyped bodyweight is the obvious case.
      const progress = await evaluateGoals().catch(() => [])
      onSaved(progress.filter((g) => g.met && !g.goal.achieved_at).map((g) => g.goal.name))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save those changes')
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-dim)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '12px 0 4px' }}>
        <Label>Editing This Session</Label>
        <Button variant="quiet" onClick={onCancel}><X size={13} /> Cancel</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 8 }}>
        <div>
          <Label style={{ marginBottom: 5 }}>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label style={{ marginBottom: 5 }}>Duration (min)</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" inputMode="numeric" />
        </div>
      </div>

      {/* Bodyweight is edited where it is logged -- the weigh-in card on Today,
          or the Progress tab for any past date. Repeating the field here would
          be a second way to write one value, and blanking it would have to mean
          deleting a weigh-in you may have recorded that morning independently. */}
      <Label style={{ marginTop: 10, color: 'var(--text-dim)' }}>
        Bodyweight is logged separately. Use the weigh-in card on Today, or Progress for an older day.
      </Label>

      <Rule>Sets</Rule>

      {rows.map((r, i) => (
        <div key={r.exercise.id} style={{
          border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
          background: 'var(--bg-base)', padding: 12, marginBottom: 8,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text-hi)', marginBottom: 8 }}>{r.exercise.name}</div>
          {/* No ghosts and no PR badges here: this is a correction, not a session
              being logged, so "what to beat" would be noise. */}
          <SetGrid
            exercise={r.exercise}
            sets={r.sets}
            lastSets={[]}
            records={[]}
            onChange={(sets) => setRows(rows.map((x, j) => (j === i ? { ...x, sets } : x)))}
          />
          <div style={{ marginTop: 10 }}>
            <Label style={{ marginBottom: 5 }}>Setup Notes</Label>
            <TextArea
              value={r.note}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              placeholder="Seat position, incline, grip width…"
              style={{ minHeight: 40, fontSize: 13 }}
            />
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <Empty title="Nothing editable" hint="Every set here belongs to an exercise that has since been deleted." />
      )}

      {orphanSets.length > 0 && (
        <Label style={{ marginBottom: 8 }}>
          {orphanSets.length} set{orphanSets.length === 1 ? '' : 's'} from a deleted exercise {orphanSets.length === 1 ? 'is' : 'are'} kept as-is
        </Label>
      )}

      <div style={{ marginTop: 4 }}>
        <Label style={{ marginBottom: 5 }}>Session Notes</Label>
        <TextArea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="How did it feel?" />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
        <Button variant="solid" onClick={save} disabled={saving}>
          <Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
