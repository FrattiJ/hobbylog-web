'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Save, GripVertical } from 'lucide-react'
import type { Exercise, Routine, RoutineDetail, TrackingType } from '@/types/fitness'
import {
  createRoutine, deleteRoutine, getRoutine, getRoutineExerciseCounts, listExercises, listRoutines,
  removeExercise, setRoutineExercises, updateExercise, updateRoutine, type RoutineExerciseDraft,
} from '@/lib/fitness/db'
import { fmtDuration, parseDuration } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import ExercisePicker, { TRACKING_LABELS } from './ExercisePicker'
import { Button, Input, Select, TextArea, Label, Rule, Empty, Confirm, Modal, DAY_NAMES, DAY_FULL, ACCENT } from './ui'

// One row of the routine being edited: the exercise plus its targets.
interface EditRow extends RoutineExerciseDraft {
  exercise: Exercise
}

export default function RoutinesTab() {
  const { success, error: toastError } = useToast()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RoutineDetail | 'new' | null>(null)
  const [confirming, setConfirming] = useState<Routine | null>(null)

  // One query for every card's exercise count, instead of re-fetching each
  // routine in full just to take the length of its array.
  const reload = () => Promise.all([listRoutines(), listExercises(), getRoutineExerciseCounts()])
    .then(([r, e, c]) => { setRoutines(r); setAllExercises(e); setCounts(c) })
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { reload() }, [])

  async function remove(r: Routine) {
    setConfirming(null)
    try {
      await deleteRoutine(r.id)
      success(`Deleted "${r.name}"`)
      reload()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete that routine')
    }
  }

  if (editing) {
    return (
      <RoutineEditor
        routine={editing === 'new' ? null : editing}
        allExercises={allExercises}
        onExerciseCreated={(e) => setAllExercises((p) => (p.some((x) => x.id === e.id) ? p : [...p, e]))}
        onDone={() => { setEditing(null); reload() }}
      />
    )
  }

  if (loading) return <Label>LOADING…</Label>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Label>{routines.length} ROUTINE{routines.length === 1 ? '' : 'S'}</Label>
        <Button variant="solid" onClick={() => setEditing('new')}><Plus size={13} /> NEW ROUTINE</Button>
      </div>

      {routines.length === 0 ? (
        <Empty
          title="NO ROUTINES YET"
          hint="A routine is just an ordered list of exercises with target sets and reps. Build one here, then load it on the Today tab to log against it."
          action={<Button variant="ghost" onClick={() => setEditing('new')}><Plus size={13} /> BUILD ONE</Button>}
        />
      ) : (
        routines.map((r) => (
          <RoutineCard
            key={r.id}
            routine={r}
            count={counts.get(r.id) ?? 0}
            onEdit={async () => setEditing((await getRoutine(r.id)) ?? 'new')}
            onDelete={() => setConfirming(r)}
          />
        ))
      )}

      <ExerciseLibrary exercises={allExercises} onChanged={reload} />

      {confirming && (
        <Confirm
          title="Delete routine"
          body={`Delete "${confirming.name}"? Workouts you already logged with it are kept.`}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

function RoutineCard({ routine, count, onEdit, onDelete }: {
  routine: Routine; count: number; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
      background: 'var(--bg-card)', padding: '13px 15px', marginBottom: 9,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, color: 'var(--text-hi)', fontWeight: 500 }}>{routine.name}</div>
        <Label style={{ marginTop: 3 }}>
          {[
            routine.day_of_week != null ? DAY_NAMES[routine.day_of_week] : null,
            `${count} EXERCISE${count === 1 ? '' : 'S'}`,
            routine.notes || null,
          ].filter(Boolean).join(' · ')}
        </Label>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <Button variant="quiet" onClick={onEdit} title="Edit"><Pencil size={14} /></Button>
        <Button variant="quiet" onClick={onDelete} title="Delete"><Trash2 size={14} /></Button>
      </div>
    </div>
  )
}

// -- Exercise library --------------------------------------------------------

// Every exercise you own, with a way to rename one, change how it's measured, or
// get rid of it. Custom exercises in particular were previously write-once: a
// typo in the name was permanent, and nothing ever left the pickers.
function ExerciseLibrary({ exercises, onChanged }: { exercises: Exercise[]; onChanged: () => void }) {
  const { success, error: toastError } = useToast()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [confirming, setConfirming] = useState<Exercise | null>(null)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const shown = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises

  async function remove(e: Exercise) {
    setConfirming(null)
    try {
      const how = await removeExercise(e.id)
      success(how === 'deleted'
        ? `Deleted "${e.name}"`
        : `Archived "${e.name}" — the sets you logged against it are kept`)
      onChanged()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not remove that exercise')
    }
  }

  return (
    <>
      <Rule>YOUR EXERCISES</Rule>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Label>{exercises.length} IN YOUR LIBRARY</Label>
        <Button variant="ghost" onClick={() => setOpen(!open)}>
          {open ? 'HIDE' : 'MANAGE'}
        </Button>
      </div>

      {open && (
        exercises.length === 0 ? (
          <Empty title="NOTHING YET" hint="Exercises appear here once you add them to a routine or log one." />
        ) : (
          <>
            {exercises.length > 8 && (
              <Input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter your exercises…" style={{ marginBottom: 8 }}
              />
            )}
            {shown.map((e) => (
              <div key={e.id} style={{
                border: '1px solid var(--border-dim)', background: 'var(--bg-card)',
                padding: '10px 12px', marginBottom: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-hi)' }}>{e.name}</div>
                  <Label style={{ marginTop: 2 }}>
                    {[
                      TRACKING_LABELS[e.tracking_type],
                      e.catalog_id ? null : 'CUSTOM',
                      e.muscle,
                    ].filter(Boolean).join(' · ')}
                  </Label>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <Button variant="quiet" onClick={() => setEditing(e)} title="Edit"><Pencil size={13} /></Button>
                  <Button variant="quiet" onClick={() => setConfirming(e)} title="Remove"><Trash2 size={13} /></Button>
                </div>
              </div>
            ))}
          </>
        )
      )}

      {editing && (
        <EditExercise
          exercise={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); success('Exercise updated'); onChanged() }}
        />
      )}

      {confirming && (
        <Confirm
          title="Remove exercise"
          confirmLabel="REMOVE"
          body={`Remove "${confirming.name}" from your library? If you've logged sets against it, it's hidden instead of deleted so your history and records stay intact.`}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

function EditExercise({ exercise, onClose, onSaved }: {
  exercise: Exercise; onClose: () => void; onSaved: () => void
}) {
  const { error: toastError } = useToast()
  const [name, setName] = useState(exercise.name)
  const [tracking, setTracking] = useState<TrackingType>(exercise.tracking_type)
  const [saving, setSaving] = useState(false)

  const trackingChanged = tracking !== exercise.tracking_type

  async function save() {
    if (!name.trim()) { toastError('Give the exercise a name'); return }
    setSaving(true)
    try {
      await updateExercise(exercise.id, { name: name.trim(), tracking_type: tracking })
      onSaved()
    } catch (e) {
      // The (user, name) unique index is what keeps PR history continuous, so a
      // rename onto an existing name has to be refused rather than merged.
      const msg = e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505'
        ? 'You already have an exercise with that name.'
        : e instanceof Error ? e.message : 'Could not save that exercise'
      toastError(msg)
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit exercise" onClose={onClose} width={460}>
      <Label style={{ marginBottom: 6 }}>NAME</Label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />

      <Label style={{ margin: '16px 0 6px' }}>HOW IS IT MEASURED?</Label>
      <Select value={tracking} onChange={(e) => setTracking(e.target.value as TrackingType)} style={{ width: '100%' }}>
        {(Object.keys(TRACKING_LABELS) as TrackingType[]).map((t) => (
          <option key={t} value={t}>{TRACKING_LABELS[t]}</option>
        ))}
      </Select>

      {trackingChanged && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#f59e0b', marginTop: 8, lineHeight: 1.6 }}>
          Sets you already logged keep the numbers they were logged with. Changing
          how this is measured changes which of those columns are read, so old
          records may look different.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="quiet" onClick={onClose}>CANCEL</Button>
        <Button variant="solid" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'SAVING…' : 'SAVE'}
        </Button>
      </div>
    </Modal>
  )
}

// -- Routine editor ----------------------------------------------------------

function RoutineEditor({ routine, allExercises, onExerciseCreated, onDone }: {
  routine: RoutineDetail | null
  allExercises: Exercise[]
  onExerciseCreated: (e: Exercise) => void
  onDone: () => void
}) {
  const { success, error: toastError } = useToast()
  const [name, setName] = useState(routine?.name ?? '')
  const [notes, setNotes] = useState(routine?.notes ?? '')
  const [rows, setRows] = useState<EditRow[]>(
    routine?.exercises.map((re) => ({
      exercise: re.exercise,
      exercise_id: re.exercise_id,
      target_sets: re.target_sets,
      target_reps: re.target_reps,
      target_seconds: re.target_seconds,
      rest_seconds: re.rest_seconds,
      notes: re.notes,
    })) ?? [],
  )
  const [day, setDay] = useState<number | null>(routine?.day_of_week ?? null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  function addExercise(e: Exercise) {
    setPicking(false)
    onExerciseCreated(e)
    if (rows.some((r) => r.exercise_id === e.id)) return
    setRows((p) => [...p, {
      exercise: e, exercise_id: e.id,
      target_sets: 3,
      target_reps: e.tracking_type === 'weight_reps' || e.tracking_type === 'reps' ? 8 : null,
      target_seconds: null, rest_seconds: null, notes: null,
    }])
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
  }

  const patch = (i: number, p: Partial<EditRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  async function save() {
    if (!name.trim()) { toastError('Give the routine a name'); return }
    setSaving(true)
    try {
      const id = routine
        ? (await updateRoutine(routine.id, { name: name.trim(), notes: notes.trim() || null, day_of_week: day }), routine.id)
        : (await createRoutine(name, notes.trim() || null, day)).id
      await setRoutineExercises(id, rows.map(({ exercise, ...r }) => { void exercise; return r }))
      success(routine ? 'Routine updated' : 'Routine created')
      onDone()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save routine')
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Label>{routine ? 'EDIT ROUTINE' : 'NEW ROUTINE'}</Label>
        <Button variant="quiet" onClick={onDone}><X size={14} /> CANCEL</Button>
      </div>

      <Label style={{ marginBottom: 5 }}>NAME</Label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" />

      <Label style={{ margin: '12px 0 5px' }}>SCHEDULE</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {DAY_NAMES.map((d, i) => {
          const on = day === i
          return (
            <button
              key={d} type="button"
              onClick={() => setDay(on ? null : i)}
              title={on ? `Unschedule from ${DAY_FULL[i]}` : `Schedule for ${DAY_FULL[i]}`}
              style={{
                flex: '1 1 52px', padding: '7px 4px', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
                background: on ? `${ACCENT}22` : 'transparent',
                border: `1px solid ${on ? ACCENT : 'var(--border-dim)'}`,
                color: on ? ACCENT : 'var(--text-dim)',
                transition: 'all 0.12s ease',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
        {day == null
          ? 'Not scheduled — load it by hand from the Today tab.'
          : `Loads automatically on the Today tab every ${DAY_FULL[day]}. Tap again to unschedule.`}
      </p>

      <Label style={{ margin: '12px 0 5px' }}>NOTES</Label>
      <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" style={{ minHeight: 48 }} />

      <Rule>EXERCISES</Rule>

      {rows.length === 0 && (
        <Empty title="NOTHING ADDED YET" hint="Search the catalog or type your own exercise name." />
      )}

      {/* The order here is the order the Today tab logs them in, so say so — the
          arrows were previously quiet icons nobody found. */}
      {rows.length > 1 && (
        <p style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
          margin: '0 0 10px', lineHeight: 1.6,
        }}>
          <GripVertical size={12} style={{ color: ACCENT, flexShrink: 0 }} />
          You&apos;ll log these top to bottom — use the ↑ ↓ buttons to reorder them.
        </p>
      )}

      {rows.map((r, i) => {
        const timed = r.exercise.tracking_type === 'time' || r.exercise.tracking_type === 'time_distance'
        return (
          <div key={r.exercise_id} style={{
            border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
            background: 'var(--bg-card)', padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {/* Position badge: makes the ordering itself visible, so the
                    reorder buttons next to it read as what they are. */}
                <span style={{
                  flexShrink: 0, width: 24, height: 24, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: ACCENT, border: `1px solid ${ACCENT}66`, background: `${ACCENT}14`,
                }}>
                  {i + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-hi)' }}>{r.exercise.name}</div>
                  <Label style={{ marginTop: 2 }}>{TRACKING_LABELS[r.exercise.tracking_type].toUpperCase()}</Label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <Button
                  variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}
                  title="Move up" style={{ padding: '7px 9px' }}
                >
                  <ChevronUp size={15} />
                </Button>
                <Button
                  variant="ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                  title="Move down" style={{ padding: '7px 9px' }}
                >
                  <ChevronDown size={15} />
                </Button>
                <Button variant="quiet" onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Remove"><Trash2 size={14} /></Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
              <NumField label="SETS" value={r.target_sets} onChange={(v) => patch(i, { target_sets: v })} />
              {timed ? (
                <TimeField label="TARGET TIME" value={r.target_seconds} onChange={(v) => patch(i, { target_seconds: v })} />
              ) : (
                <NumField label="REPS" value={r.target_reps} onChange={(v) => patch(i, { target_reps: v })} />
              )}
              <TimeField label="REST" value={r.rest_seconds} onChange={(v) => patch(i, { rest_seconds: v })} />
            </div>
          </div>
        )
      })}

      <Button variant="ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => setPicking(true)}>
        <Plus size={13} /> ADD EXERCISE
      </Button>

      <Button variant="solid" style={{ width: '100%', marginTop: 16, padding: 12 }} onClick={save} disabled={saving}>
        <Save size={14} /> {saving ? 'SAVING…' : 'SAVE ROUTINE'}
      </Button>

      {picking && <ExercisePicker mine={allExercises} onPick={addExercise} onClose={() => setPicking(false)} />}
    </>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <Label style={{ marginBottom: 4 }}>{label}</Label>
      <Input
        value={value ?? ''} inputMode="numeric" placeholder="—"
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          onChange(e.target.value.trim() && !isNaN(n) ? n : null)
        }}
        style={{ padding: '7px 8px', textAlign: 'center' }}
      />
    </div>
  )
}

// Rest and target holds are entered as mm:ss but stored as seconds.
function TimeField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? fmtDuration(value) : '')
  return (
    <div>
      <Label style={{ marginBottom: 4 }}>{label}</Label>
      <Input
        value={text} placeholder="mm:ss"
        onChange={(e) => { setText(e.target.value); onChange(parseDuration(e.target.value)) }}
        style={{ padding: '7px 8px', textAlign: 'center' }}
      />
    </div>
  )
}
