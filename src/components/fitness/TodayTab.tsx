'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, Save, Trophy, RotateCcw, CalendarCheck, ArrowLeftRight, CheckCircle2 } from 'lucide-react'
import type { Exercise, LastNote, Routine } from '@/types/fitness'
import { getHistories, getLastNotes, getRoutine, getRoutinesForDay, listExercises, listRoutines, saveWorkout, evaluateGoals } from '@/lib/fitness/db'
import { personalRecords, isoDay, fmtPrValue, PR_LABELS, type PrValue } from '@/lib/fitness/calc'
import type { DatedSet, ExerciseHistory } from '@/lib/fitness/db'
import { useToast } from '../Toast'
import ExercisePicker, { TRACKING_LABELS } from './ExercisePicker'
import SetGrid, { emptySet, draftHasData, draftToSet, type DraftSet, type SetTargets } from './SetGrid'
import { Button, Input, TextArea, Label, Rule, Empty, DAY_NAMES, DAY_FULL, ACCENT } from './ui'
import WeighInCard from './WeighIn'
import SwapExercise from './SwapExercise'
import { SessionMusclesPanel, type SessionWork } from './MuscleMap'

interface DraftExercise {
  exercise: Exercise
  sets: DraftSet[]
  lastSets: DatedSet[]
  records: PrValue[]
  // What the routine asked for, if this came from one. Shown as placeholders when
  // there's no previous session to ghost instead.
  targets: SetTargets | null
  // Setup note for this session, and the last one you actually wrote (which may
  // be several sessions back, since blank notes are never stored).
  note: string
  lastNote: LastNote | null
  // The exercise this one is standing in for today, when it was swapped in.
  // Only the session knows: the routine still lists the original.
  swappedFrom: Exercise | null
}

// What the screen shows once a workout is saved: the session just finished, for
// the body map. Held in memory only -- History has the permanent copy.
interface Recap {
  title: string
  date: string
  setCount: number
  work: SessionWork[]
}

// A workout in progress survives a refresh or a tab close — losing half a
// session to a stray reload is the fastest way to make someone stop logging.
const DRAFT_KEY = 'fitness-draft-v1'

interface StoredDraft {
  routineId: string | null
  routineName: string | null
  date: string
  duration: string
  notes: string
  exercises: { exerciseId: string; sets: DraftSet[]; note?: string; targets?: SetTargets | null; swappedFromId?: string | null }[]
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
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<DraftExercise[]>([])
  const [picking, setPicking] = useState(false)
  // The exercise being swapped out, by id, while the swap sheet is open.
  const [swapping, setSwapping] = useState<string | null>(null)
  const [recap, setRecap] = useState<Recap | null>(null)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  // Auto-load runs at most once per mount, so finishing a workout (which clears
  // the draft) doesn't immediately repopulate the form underneath you.
  const autoLoaded = useRef(false)
  const todayDow = new Date().getDay()

  // Pull the history for a whole list of exercises at once, so the grid can show
  // ghosts and PR badges.
  //
  // This is deliberately batched. Done per exercise it was six requests each --
  // two of them downloading the same full history twice -- so an eight-exercise
  // routine cost around fifty round trips to open. Now it's two, whatever the
  // routine's length.
  //
  // `known` is history someone already fetched (the swap sheet does, to show what
  // you did last time), so it isn't downloaded twice.
  const hydrateAll = useCallback(async (
    list: { exercise: Exercise; targets: SetTargets | null; sets?: DraftSet[]; note?: string; swappedFrom?: Exercise | null }[],
    known?: Map<string, ExerciseHistory>,
  ): Promise<DraftExercise[]> => {
    const ids = list.map((l) => l.exercise.id)
    const missing = ids.filter((id) => !known?.has(id))
    const [histories, noteMap] = await Promise.all([
      missing.length > 0 ? getHistories(missing) : Promise.resolve(new Map<string, ExerciseHistory>()),
      getLastNotes(ids),
    ])
    return list.map(({ exercise, targets, sets, note, swappedFrom }) => {
      const h = known?.get(exercise.id) ?? histories.get(exercise.id)
      // A routine's target set count seeds the grid; freestyle starts at three.
      const rows = sets?.length
        ? sets
        : Array.from({ length: Math.max(1, targets?.sets ?? 3) }, emptySet)
      return {
        exercise,
        sets: rows,
        lastSets: h?.lastSets ?? [],
        records: personalRecords(exercise, h?.history ?? [], (s) => (s as DatedSet).date),
        targets,
        note: note ?? '',
        lastNote: noteMap.get(exercise.id) ?? null,
        swappedFrom: swappedFrom ?? null,
      }
    })
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
    setNotes(stored.notes)
    hydrateAll(found.map((d) => ({
      exercise: byId.get(d.exerciseId)!,
      targets: d.targets ?? null,
      sets: d.sets.length ? d.sets : [emptySet()],
      note: d.note ?? '',
      swappedFrom: (d.swappedFromId && byId.get(d.swappedFromId)) || null,
    }))).then(setDraft).catch(() => {})
  }, [restored, loading, allExercises, hydrateAll])

  // Persist on every change; clear it once the workout is saved.
  useEffect(() => {
    if (!restored) return
    if (draft.length === 0) { localStorage.removeItem(DRAFT_KEY); return }
    const stored: StoredDraft = {
      routineId, routineName, date, duration, notes,
      exercises: draft.map((d) => ({
        exerciseId: d.exercise.id, sets: d.sets, note: d.note, targets: d.targets,
        swappedFromId: d.swappedFrom?.id ?? null,
      })),
    }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(stored)) } catch { /* quota — not worth failing over */ }
  }, [draft, routineId, routineName, date, duration, notes, restored])

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
    setRecap(null)
    setRoutineId(r.id)
    setRoutineName(r.name)
    setDraft(await hydrateAll(r.exercises.map((re) => ({
      exercise: re.exercise,
      targets: { sets: re.target_sets, reps: re.target_reps, seconds: re.target_seconds },
    }))))
  }

  async function addExercise(e: Exercise) {
    setPicking(false)
    setRecap(null)
    if (draft.some((d) => d.exercise.id === e.id)) return
    setAllExercises((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e].sort((a, b) => a.name.localeCompare(b.name))))
    // Show the row immediately, then fill in history when it lands.
    setDraft((prev) => [...prev, {
      exercise: e, sets: [emptySet(), emptySet(), emptySet()],
      lastSets: [], records: [], targets: null, note: '', lastNote: null, swappedFrom: null,
    }])
    const [full] = await hydrateAll([{ exercise: e, targets: null }])
    setDraft((prev) => prev.map((d) => (d.exercise.id === e.id
      ? { ...d, lastSets: full.lastSets, records: full.records, lastNote: full.lastNote }
      : d)))
  }

  // Put a different exercise in a card's place for this session only.
  //
  // Nothing is written until the workout is saved, and then the sets are logged
  // against the exercise actually done -- so the original's records and "last
  // time" numbers aren't polluted by a lift it never was. The routine is left
  // alone and asks for the original again next time.
  async function swapExercise(fromId: string, next: Exercise, known?: ExerciseHistory) {
    setSwapping(null)
    const old = draft.find((d) => d.exercise.id === fromId)
    if (!old || next.id === fromId) return
    if (draft.some((d) => d.exercise.id === next.id)) { toastError(`${next.name} is already in this session`); return }
    setAllExercises((prev) => (prev.some((x) => x.id === next.id) ? prev : [...prev, next].sort((a, b) => a.name.localeCompare(b.name))))

    // Sets already typed belong to the exercise they were done on. If there are
    // any, the old card stays, trimmed to them, and the new one takes over the
    // rows that were still to do. Otherwise the card is simply replaced.
    const done = old.sets.filter(draftHasData)
    const keepOld = done.length > 0
    const counted = next.tracking_type === 'weight_reps' || next.tracking_type === 'reps'
    // A routine's targets carry over where they still make sense: the set count
    // always, reps only onto something counted in reps, a hold only onto a hold.
    const targets: SetTargets | null = old.targets && {
      sets: old.targets.sets,
      reps: counted ? old.targets.reps : null,
      seconds: counted ? null : old.targets.seconds,
    }
    // Swapping back to the original is an undo, not a second substitution.
    const origin = old.swappedFrom ?? old.exercise
    const swappedFrom = keepOld || next.id === origin.id ? null : origin

    try {
      const [entry] = await hydrateAll([{
        exercise: next,
        targets,
        sets: Array.from({ length: Math.max(1, old.sets.length - done.length) }, emptySet),
        swappedFrom,
      }], known ? new Map([[next.id, known]]) : undefined)

      setDraft((prev) => {
        const i = prev.findIndex((d) => d.exercise.id === fromId)
        if (i < 0 || prev.some((d) => d.exercise.id === next.id)) return prev
        const copy = [...prev]
        if (keepOld) copy.splice(i, 1, { ...prev[i], sets: prev[i].sets.filter(draftHasData) }, entry)
        else copy[i] = entry
        return copy
      })
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not swap that exercise')
    }
  }

  // The swap sheet can save a muscle onto the exercise it is replacing; keep the
  // copies held here in step so the next open does not ask again.
  function exerciseChanged(e: Exercise) {
    setAllExercises((prev) => prev.map((x) => (x.id === e.id ? e : x)))
    setDraft((prev) => prev.map((d) => (d.exercise.id === e.id ? { ...d, exercise: e } : d)))
  }

  function reset() {
    setDraft([])
    setRoutineId(null)
    setRoutineName(null)
    setDuration('')
    setNotes('')
    setDate(isoDay(new Date()))
    localStorage.removeItem(DRAFT_KEY)
  }

  // Routines scheduled for today vs the rest, so the start screen can lead with
  // the ones that actually apply.
  const todays = routines.filter((r) => r.day_of_week === todayDow)
  const others = routines.filter((r) => r.day_of_week !== todayDow)

  const loggedSets = draft.flatMap((d) => d.sets.filter(draftHasData).map((s) => ({ d, s })))

  const swapTarget = swapping ? draft.find((d) => d.exercise.id === swapping) ?? null : null
  const inSession = useMemo(() => new Set(draft.map((d) => d.exercise.id)), [draft])

  async function save() {
    if (loggedSets.length === 0) { toastError('Log at least one set first'); return }
    setSaving(true)
    try {
      await saveWorkout({
        routine_id: routineId,
        routine_name: routineName,
        date,
        duration_minutes: duration.trim() ? Math.round(Number(duration)) || null : null,
        notes: notes.trim() || null,
        sets: loggedSets.map(({ d, s }) => ({
          exercise_id: d.exercise.id,
          ...draftToSet(d.exercise.tracking_type, s),
        })),
        exerciseNotes: draft.map((d) => ({ exercise_id: d.exercise.id, note: d.note })),
      })
      // Any goal this workout just met flips to achieved right away.
      // Captured before the form clears, so the start screen can show what was trained.
      setRecap({
        title: routineName ?? 'Freestyle',
        date,
        setCount: loggedSets.length,
        work: draft.map((d) => {
          const logged = d.sets.filter(draftHasData)
          const working = logged.filter((s) => !s.warmup).length
          return { exercise: d.exercise, sets: working > 0 ? working : logged.length }
        }).filter((w) => w.sets > 0),
      })
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

  if (loading) return <Label>Loading…</Label>

  if (draft.length === 0) {
    return (
      <>
        {recap && <RecapCard recap={recap} onDismiss={() => setRecap(null)} />}
        <WeighInCard />
        <Rule>{recap ? 'Start Another Session' : 'Start a Session'}</Rule>
        {todays.length > 0 && (
          <>
            <Label style={{ marginBottom: 8 }}>
              {todays.length > 1
                ? `${DAY_FULL[todayDow]} — Pick One`
                : `Scheduled For ${DAY_FULL[todayDow]}`}
            </Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {todays.map((r) => (
                <Button key={r.id} variant="solid" onClick={() => loadRoutine(r.id)}>
                  <CalendarCheck size={12} /> {r.name}
                </Button>
              ))}
            </div>
          </>
        )}

        {others.length > 0 && (
          <>
            <Label style={{ marginBottom: 8 }}>
              {todays.length > 0 ? 'Other Routines' : `Nothing scheduled for ${DAY_FULL[todayDow]}`}
            </Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {others.map((r) => (
                <Button key={r.id} variant="ghost" onClick={() => loadRoutine(r.id)}>
                  {r.name}
                  {r.day_of_week != null && (
                    <span style={{ opacity: 0.5, marginLeft: 2 }}>· {DAY_NAMES[r.day_of_week]}</span>
                  )}
                </Button>
              ))}
            </div>
          </>
        )}
        <Empty
          title={routines.length ? 'Or Go Freestyle' : 'No routines yet'}
          hint={routines.length
            ? 'Pick exercises as you go and log sets without a routine.'
            : 'Build a routine on the Routines tab, or just start adding exercises here and log as you go.'}
          action={<Button variant="ghost" onClick={() => setPicking(true)}><Plus size={13} /> Add an Exercise</Button>}
        />
        {picking && <ExercisePicker mine={allExercises} onPick={addExercise} onClose={() => setPicking(false)} />}
      </>
    )
  }

  return (
    <>
      <WeighInCard />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.02em' }}>
            {(routineName ?? 'Freestyle')}
          </div>
          <Label style={{ marginTop: 3 }}>{loggedSets.length} {loggedSets.length === 1 ? 'set' : 'sets'} logged</Label>
        </div>
        <Button variant="quiet" onClick={reset} title="Discard this session">
          <RotateCcw size={12} /> Discard
        </Button>
      </div>

      {/* Two exercises side by side where the screen allows; the set grid inside
          each is only as wide as its numbers need. */}
      <div className="fit-cards">
      {draft.map((d, i) => (
        <div key={d.exercise.id} style={{
          border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
          background: 'var(--bg-card)', padding: 14, minWidth: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, letterSpacing: 0, color: 'var(--text-hi)', margin: 0 }}>{d.exercise.name}</h3>
              <Label style={{ marginTop: 3 }}>{grayLegend(d)}</Label>
              {d.swappedFrom && (
                <Label style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>In place of {d.swappedFrom.name} today</span>
                  <button
                    type="button"
                    onClick={() => swapExercise(d.exercise.id, d.swappedFrom!)}
                    style={{
                      background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: ACCENT, textDecoration: 'underline',
                    }}>
                    Undo
                  </button>
                </Label>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, margin: -6 }}>
              <button
                onClick={() => setSwapping(d.exercise.id)}
                title="Swap for a similar exercise"
                aria-label={`Swap ${d.exercise.name} for a similar exercise`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32,
                  background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 8,
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                }}>
                <ArrowLeftRight size={14} /> Swap
              </button>
              <button
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                title="Remove exercise"
                aria-label="Remove exercise"
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 8 }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {d.records.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, paddingBottom: 8,
              borderBottom: '1px solid var(--border-dim)',
              fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', color: 'var(--text-dim)',
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
            targets={d.targets}
            onChange={(sets) => setDraft(draft.map((x, j) => (j === i ? { ...x, sets } : x)))}
          />

          <div style={{ marginTop: 10, borderTop: '1px solid var(--border-dim)', paddingTop: 9 }}>
            <Label style={{ marginBottom: 5 }}>Setup Notes</Label>
            {/* The carried-forward note stays visible while you type over it, so
                you can copy a seat position rather than retype it from memory. */}
            {d.lastNote && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
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
      </div>

      <Button variant="ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setPicking(true)}>
        <Plus size={13} /> Add Exercise
      </Button>

      <Rule>Session Details</Rule>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div>
          <Label style={{ marginBottom: 5 }}>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label style={{ marginBottom: 5 }}>Duration (min)</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" inputMode="numeric" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Label style={{ marginBottom: 5 }}>Notes</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
      </div>

      <Button
        variant="solid" style={{ width: '100%', marginTop: 16, padding: '13px' }}
        onClick={save} disabled={saving || loggedSets.length === 0}
      >
        <Save size={14} /> {saving ? 'Saving…' : `Finish Workout (${loggedSets.length} ${loggedSets.length === 1 ? 'set' : 'sets'})`}
      </Button>

      {picking && <ExercisePicker mine={allExercises} onPick={addExercise} onClose={() => setPicking(false)} />}
      {swapTarget && (
        <SwapExercise
          target={swapTarget.exercise}
          mine={allExercises}
          inSession={inSession}
          onPick={(e, known) => swapExercise(swapTarget.exercise.id, e, known)}
          onTargetChanged={exerciseChanged}
          onClose={() => setSwapping(null)}
        />
      )}
    </>
  )
}

// Shown above the start screen once a workout is saved: what the session
// trained, on a body, before you move on.
function RecapCard({ recap, onDismiss }: { recap: Recap; onDismiss: () => void }) {
  return (
    <section aria-label="Workout saved" style={{
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
      background: 'var(--bg-card)', padding: 16, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: 0,
            fontFamily: 'var(--font-body)', fontSize: 17, fontWeight: 700, color: 'var(--text-hi)',
          }}>
            <CheckCircle2 size={17} aria-hidden="true" style={{ color: ACCENT, flexShrink: 0 }} />
            Workout saved
          </h2>
          <Label style={{ marginTop: 3 }}>
            {[recap.title, formatNoteDate(recap.date), `${recap.setCount} ${recap.setCount === 1 ? 'set' : 'sets'}`].join(' · ')}
          </Label>
        </div>
        <Button variant="quiet" onClick={onDismiss} title="Dismiss"><X size={14} /></Button>
      </div>
      <SessionMusclesPanel work={recap.work} />
    </section>
  )
}

// What the greyed-out numbers in the grid mean. Last session wins when there is
// one; otherwise it's the routine's target, which is what stops a freshly loaded
// routine from looking empty.
function grayLegend(d: DraftExercise): string {
  if (d.lastSets.length > 0) return `Greyed values are from ${formatNoteDate(d.lastSets[0].date)}`
  if (d.targets && (d.targets.reps != null || d.targets.seconds != null)) return 'Greyed values are the routine target'
  return TRACKING_LABELS[d.exercise.tracking_type]
}

function formatNoteDate(date: string): string {
  if (!date) return 'last time'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
