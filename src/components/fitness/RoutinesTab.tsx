'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Save } from 'lucide-react'
import type { Exercise, Routine, RoutineDetail } from '@/types/fitness'
import {
  createRoutine, deleteRoutine, getRoutine, listExercises, listRoutines,
  setRoutineExercises, updateRoutine, type RoutineExerciseDraft,
} from '@/lib/fitness/db'
import { fmtDuration, parseDuration } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import ExercisePicker, { TRACKING_LABELS } from './ExercisePicker'
import { Button, Input, TextArea, Label, Rule, Empty, ACCENT } from './ui'

// One row of the routine being edited: the exercise plus its targets.
interface EditRow extends RoutineExerciseDraft {
  exercise: Exercise
}

export default function RoutinesTab() {
  const { success, error: toastError } = useToast()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RoutineDetail | 'new' | null>(null)

  const reload = () => Promise.all([listRoutines(), listExercises()])
    .then(([r, e]) => { setRoutines(r); setAllExercises(e) })
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { reload() }, [])

  async function remove(r: Routine) {
    if (!confirm(`Delete the routine "${r.name}"? Workouts you already logged with it are kept.`)) return
    try {
      await deleteRoutine(r.id)
      success('Routine deleted')
      reload()
    } catch {
      toastError('Could not delete that routine')
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
        routines.map((r) => <RoutineCard key={r.id} routine={r} onEdit={async () => setEditing((await getRoutine(r.id)) ?? 'new')} onDelete={() => remove(r)} />)
      )}
    </>
  )
}

function RoutineCard({ routine, onEdit, onDelete }: { routine: Routine; onEdit: () => void; onDelete: () => void }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => { getRoutine(routine.id).then((r) => setCount(r?.exercises.length ?? 0)).catch(() => {}) }, [routine.id])

  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
      background: 'var(--bg-card)', padding: '13px 15px', marginBottom: 9,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, color: 'var(--text-hi)', fontWeight: 500 }}>{routine.name}</div>
        <Label style={{ marginTop: 3 }}>
          {count == null ? '…' : `${count} EXERCISE${count === 1 ? '' : 'S'}`}
          {routine.notes ? ` · ${routine.notes}` : ''}
        </Label>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <Button variant="quiet" onClick={onEdit} title="Edit"><Pencil size={14} /></Button>
        <Button variant="quiet" onClick={onDelete} title="Delete"><Trash2 size={14} /></Button>
      </div>
    </div>
  )
}

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
        ? (await updateRoutine(routine.id, { name: name.trim(), notes: notes.trim() || null }), routine.id)
        : (await createRoutine(name, notes.trim() || null)).id
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

      <Label style={{ margin: '12px 0 5px' }}>NOTES</Label>
      <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" style={{ minHeight: 48 }} />

      <Rule>EXERCISES</Rule>

      {rows.length === 0 && (
        <Empty title="NOTHING ADDED YET" hint="Search the catalog or type your own exercise name." />
      )}

      {rows.map((r, i) => {
        const timed = r.exercise.tracking_type === 'time' || r.exercise.tracking_type === 'time_distance'
        return (
          <div key={r.exercise_id} style={{
            border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
            background: 'var(--bg-card)', padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--text-hi)' }}>{r.exercise.name}</div>
                <Label style={{ marginTop: 2 }}>{TRACKING_LABELS[r.exercise.tracking_type].toUpperCase()}</Label>
              </div>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <Button variant="quiet" onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={14} /></Button>
                <Button variant="quiet" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down"><ChevronDown size={14} /></Button>
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
