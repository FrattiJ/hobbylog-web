'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, X, Save, Trophy, RotateCcw, CalendarCheck } from 'lucide-react'
import type { Exercise, LastNote, Routine } from '@/types/fitness'
import { getLastNotes, getLastSets, getRoutine, getRoutinesForDay, listExercises, listRoutines, saveWorkout, evaluateGoals, getSetHistory, type DatedSet } from '@/lib/fitness/db'
import { personalRecords, isoDay, fmtPrValue, PR_LABELS, type PrValue } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import ExercisePicker, { TRACKING_LABELS } from './ExercisePicker'
import SetGrid, { emptySet, draftHasData, draftToSet, type DraftSet } from './SetGrid'
import { Button, Input, TextArea, Label, Rule, Empty, DAY_NAMES, DAY_FULL, ACCENT } from './ui'

interface DraftExercise {
  exercise: Exercise
  sets: DraftSet[]
  lastSets: DatedSet[]
  records: PrValue[]
  // Setup note for this session, and the last one you actually wrote (which may
  // be several sessions back, since blank notes are never stored).
  note: string
  lastNote: LastNote | null
}

// A workout in progress survives a refresh or a tab close — losing half a
// session to a stray reload is the fastest way to make someone stop logging.
const DRAFT_KEY = 'fitness-draft-v1'

interface StoredDraft {
  routineId: string | null
  routineName: string | null
  date: string
  duration: string
  bodyweight: string
  notes: string
  exercises: { exerciseId: string; sets: DraftSet[]; note?: string }[]
}

export default function TodayTab() {
  const { success, error: toastError } = useToast()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  const [routineId, setRoutineId] = useState<string | null>(null)
  const [routineName, setRoutineName] = useState<string | null>(null)
  const [date, setDate] = useState(() => isoDay(new Date()))
  const [duration, setDuration] = useState('')
  const [bodyweight, setBodyweight] = useState('')
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<DraftExercise[]>([])
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  // Auto-load runs at most once per mount, so finishing a workout (which clears
  // the draft) doesn't immediately repopulate the form underneath you.
  const autoLoaded = useRef(false)
  const todayDow = new Date().getDay()

  // Pull an exercise's history once, so the grid can show ghosts and PR badges.
  const hydrate = useCallback(async (exercise: Exercise): Promise<DraftExercise> => {
    const [lastMap, history, noteMap] = await Promise.all([
      getLastSets([exercise.id]),
      getSetHistory(exercise.id),
      getLastNotes([exercise.id]),
    ])
    return {
      exercise,
      sets: [emptySet(), emptySet(), emptySet()],
      lastSets: lastMap.get(exercise.id) ?? [],
      records: personalRecords(exercise, history, (s) => (s as DatedSet).date),
      note: '',
      lastNote: noteMap.get(exercise.id) ?? null,
    }
  }, [])

  useEffect(() => {
    Promise.all([listRoutines(), listExercises()])
      .then(([r, e]) => { setRoutines(r); setAllExercises(e) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Restore an in-progress workout once the exercise list is known.
  useEffect(() => {
    if (restored || loading) return
    setRestored(true)
    let stored: StoredDraft | null = null
    try { stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') } catch { stored = null }
    if (!stored?.exercises?.length) return

    const byId = new Map(allExercises.map((e) => [e.id, e]))
    const found = stored.exercises.filter((d) => byId.has(d.exerciseId))
    if (found.length === 0) return

    setRoutineId(stored.routineId)
    setRoutineName(stored.routineName)
    setDate(stored.date)
    setDuration(stored.duration)
    setBodyweight(stored.bodyweight)
    setNotes(stored.notes)
    Promise.all(found.map(async (d) => ({
      ...(await hydrate(byId.get(d.exerciseId)!)),
      sets: d.sets.length ? d.sets : [emptySet()],
      note: d.note ?? '',
    }))).then(setDraft)
  }, [restored, loading, allExercises, hydrate])

  // Persist on every change; clear it once the workout is saved.
  useEffect(() => {
    if (!restored) return
    if (draft.length === 0) { localStorage.removeItem(DRAFT_KEY); return }
    const stored: StoredDraft = {
      routineId, routineName, date, duration, bodyweight, notes,
      exercises: draft.map((d) => ({ exerciseId: d.exercise.id, sets: d.sets, note: d.note })),
    }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(stored)) } catch { /* quota — not worth failing over */ }
  }, [draft, routineId, routineName, date, duration, bodyweight, notes, restored])

  useEffect(() => {
    if (!restored || loading || autoLoaded.current) return
    autoLoaded.current = true
    if (draft.length > 0) return // a restored session wins over the schedule
    // Only auto-load an unambiguous day. With two routines on the same weekday
    // (home gym vs school gym) picking one for you would be a coin flip.
    getRoutinesForDay(todayDow)
      .then((rs) => { if (rs.length === 1) loadRoutine(rs[0].id) })
      .catch(() => {})
    // loadRoutine is stable enough here: it only reads setState setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, loading, todayDow])

  async function loadRoutine(id: string) {
    const r = await getRoutine(id)
    if (!r) return
    setRoutineId(r.id)
    setRoutineName(r.name)
    const hydrated = await Promise.all(r.exercises.map(async (re) => {
      const d = await hydrate(re.exercise)
      // Seed the grid with the routine's target set count.
      const n = Math.max(1, re.target_sets ?? 3)
      return { ...d, sets: Array.from({ length: n }, emptySet) }
    }))
    setDraft(hydrated)
  }

  async function addExercise(e: Exercise) {
    setPicking(false)
    if (draft.some((d) => d.exercise.id === e.id)) return
    setAllExercises((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e].sort((a, b) => a.name.localeCompare(b.name))))
    setDraft((prev) => [...prev, { exercise: e, sets: [emptySet(), emptySet(), emptySet()], lastSets: [], records: [], note: '', lastNote: null }])
    const full = await hydrate(e)
    setDraft((prev) => prev.map((d) => (d.exercise.id === e.id ? { ...d, lastSets: full.lastSets, records: full.records, lastNote: full.lastNote } : d)))
  }

  function reset() {
    setDraft([])
    setRoutineId(null)
    setRoutineName(null)
    setDuration('')
    setBodyweight('')
    setNotes('')
    setDate(isoDay(new Date()))
    localStorage.removeItem(DRAFT_KEY)
  }

  // Routines scheduled for today vs the rest, so the start screen can lead with
  // the ones that actually apply.
  const todays = routines.filter((r) => r.day_of_week === todayDow)
  const others = routines.filter((r) => r.day_of_week !== todayDow)

  const loggedSets = draft.flatMap((d) => d.sets.filter(draftHasData).map((s) => ({ d, s })))

  async function save() {
    if (loggedSets.length === 0) { toastError('Log at least one set first'); return }
    setSaving(true)
    try {
      await saveWorkout({
        routine_id: routineId,
        routine_name: routineName,
        date,
        duration_minutes: duration.trim() ? Math.round(Number(duration)) || null : null,
        bodyweight: bodyweight.trim() ? Number(bodyweight) || null : null,
        notes: notes.trim() || null,
        sets: loggedSets.map(({ d, s }) => ({
          exercise_id: d.exercise.id,
          ...draftToSet(d.exercise.tracking_type, s),
        })),
        exerciseNotes: draft.map((d) => ({ exercise_id: d.exercise.id, note: d.note })),
      })
      // Any goal this workout just met flips to achieved right away.
      const progress = await evaluateGoals().catch(() => [])
      const justHit = progress.filter((p) => p.met && !p.goal.achieved_at)
      success(justHit.length > 0
        ? `Workout saved — goal reached: ${justHit.map((p) => p.goal.name).join(', ')}`
        : `Workout saved — ${loggedSets.length} sets`)
      reset()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save workout')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Label>LOADING…</Label>

  if (draft.length === 0) {
    return (
      <>
        <Rule>START A SESSION</Rule>
        {todays.length > 0 && (
          <>
            <Label style={{ marginBottom: 8 }}>
              {todays.length > 1
                ? `${DAY_FULL[todayDow].toUpperCase()} — PICK ONE`
                : `SCHEDULED FOR ${DAY_FULL[todayDow].toUpperCase()}`}
            </Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {todays.map((r) => (
                <Button key={r.id} variant="solid" onClick={() => loadRoutine(r.id)}>
                  <CalendarCheck size={12} /> {r.name.toUpperCase()}
                </Button>
              ))}
            </div>
          </>
        )}

        {others.length > 0 && (
          <>
            <Label style={{ marginBottom: 8 }}>
              {todays.length > 0 ? 'OTHER ROUTINES' : `NOTHING SCHEDULED FOR ${DAY_FULL[todayDow].toUpperCase()}`}
            </Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {others.map((r) => (
                <Button key={r.id} variant="ghost" onClick={() => loadRoutine(r.id)}>
                  {r.name.toUpperCase()}
                  {r.day_of_week != null && (
                    <span style={{ opacity: 0.5, marginLeft: 2 }}>· {DAY_NAMES[r.day_of_week]}</span>
                  )}
                </Button>
              ))}
            </div>
          </>
        )}
        <Empty
          title={routines.length ? 'OR GO FREESTYLE' : 'NO ROUTINES YET'}
          hint={routines.length
            ? 'Pick exercises as you go and log sets without a routine.'
            : 'Build a routine on the Routines tab, or just start adding exercises here and log as you go.'}
          action={<Button variant="ghost" onClick={() => setPicking(true)}><Plus size={13} /> ADD AN EXERCISE</Button>}
        />
        {picking && <ExercisePicker mine={allExercises} onPick={addExercise} onClose={() => setPicking(false)} />}
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.06em' }}>
            {(routineName ?? 'FREESTYLE').toUpperCase()}
          </div>
          <Label style={{ marginTop: 3 }}>{loggedSets.length} SETS LOGGED</Label>
        </div>
        <Button variant="quiet" onClick={reset} title="Discard this session">
          <RotateCcw size={12} /> DISCARD
        </Button>
      </div>

      {draft.map((d, i) => (
        <div key={d.exercise.id} style={{
          border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
          background: 'var(--bg-card)', padding: 14, marginTop: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, color: 'var(--text-hi)', fontWeight: 500 }}>{d.exercise.name}</div>
              <Label style={{ marginTop: 3 }}>
                {d.lastSets.length > 0
                  ? `GREYED VALUES = ${formatNoteDate(d.lastSets[0].date)}`
                  : TRACKING_LABELS[d.exercise.tracking_type].toUpperCase()}
              </Label>
            </div>
            <button
              onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              title="Remove exercise"
              style={{ background: 'none', border: 'none', color: 'var(--text-mute)', cursor: 'pointer', padding: 2 }}
            >
              <X size={15} />
            </button>
          </div>

          {d.records.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, paddingBottom: 8,
              borderBottom: '1px solid var(--border-dim)',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)',
            }}>
              <Trophy size={11} style={{ color: '#eab308' }} />
              {d.records.map((r) => (
                <span key={r.kind}>{PR_LABELS[r.kind]} {fmtPrValue(r.kind, r.value)}</span>
              ))}
            </div>
          )}

          <SetGrid
            exercise={d.exercise}
            sets={d.sets}
            lastSets={d.lastSets}
            records={d.records}
            onChange={(sets) => setDraft(draft.map((x, j) => (j === i ? { ...x, sets } : x)))}
          />

          <div style={{ marginTop: 10, borderTop: '1px solid var(--border-dim)', paddingTop: 9 }}>
            <Label style={{ marginBottom: 5 }}>SETUP NOTES</Label>
            {/* The carried-forward note stays visible while you type over it, so
                you can copy a seat position rather than retype it from memory. */}
            {d.lastNote && (
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)',
                border: '1px dashed var(--border-dim)', padding: '6px 8px', marginBottom: 6,
                lineHeight: 1.5, fontStyle: 'italic',
              }}>
                {formatNoteDate(d.lastNote.date)}: {d.lastNote.note}
              </p>
            )}
            <TextArea
              value={d.note}
              onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              placeholder={d.lastNote ? 'Same as above unless you change it' : 'Seat position, incline, grip width…'}
              style={{ minHeight: 42, fontSize: 13 }}
            />
          </div>
        </div>
      ))}

      <Button variant="ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setPicking(true)}>
        <Plus size={13} /> ADD EXERCISE
      </Button>

      <Rule>SESSION DETAILS</Rule>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div>
          <Label style={{ marginBottom: 5 }}>DATE</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label style={{ marginBottom: 5 }}>DURATION (MIN)</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" inputMode="numeric" />
        </div>
        <div>
          <Label style={{ marginBottom: 5 }}>BODYWEIGHT (LBS)</Label>
          <Input value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} placeholder="—" inputMode="decimal" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Label style={{ marginBottom: 5 }}>NOTES</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
      </div>

      <Button
        variant="solid" style={{ width: '100%', marginTop: 16, padding: '13px' }}
        onClick={save} disabled={saving || loggedSets.length === 0}
      >
        <Save size={14} /> {saving ? 'SAVING…' : `FINISH WORKOUT (${loggedSets.length} SETS)`}
      </Button>

      {picking && <ExercisePicker mine={allExercises} onPick={addExercise} onClose={() => setPicking(false)} />}
    </>
  )
}

function formatNoteDate(date: string): string {
  if (!date) return 'LAST TIME'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
}

