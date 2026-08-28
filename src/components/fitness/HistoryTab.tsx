'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import type { Exercise, WorkoutDetail, WorkoutSet } from '@/types/fitness'
import { deleteWorkout, listExercises, listWorkouts } from '@/lib/fitness/db'
import { fmtSet, setsVolume } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import { Button, Label, Empty, ACCENT } from './ui'

export default function HistoryTab() {
  const { success, error: toastError } = useToast()
  const [workouts, setWorkouts] = useState<WorkoutDetail[]>([])
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = () => Promise.all([listWorkouts(), listExercises(true)])
    .then(([w, e]) => { setWorkouts(w); setExercises(new Map(e.map((x) => [x.id, x]))) })
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { reload() }, [])

  async function remove(w: WorkoutDetail) {
    if (!confirm(`Delete the workout logged on ${w.date}? This can't be undone.`)) return
    try {
      await deleteWorkout(w.id)
      success('Workout deleted')
      reload()
    } catch {
      toastError('Could not delete that workout')
    }
  }

  if (loading) return <Label>LOADING…</Label>

  if (workouts.length === 0) {
    return <Empty title="NO WORKOUTS LOGGED" hint="Once you finish a session on the Today tab it shows up here." />
  }

  return (
    <>
      <Label style={{ marginBottom: 12 }}>{workouts.length} WORKOUT{workouts.length === 1 ? '' : 'S'}</Label>
      {workouts.map((w) => {
        const expanded = open === w.id
        const volume = setsVolume(w.sets)
        // Group sets under their exercise, preserving the order they were logged in.
        const groups: { exercise: Exercise | undefined; sets: WorkoutSet[] }[] = []
        for (const s of w.sets) {
          const last = groups[groups.length - 1]
          if (last && last.sets[0].exercise_id === s.exercise_id) last.sets.push(s)
          else groups.push({ exercise: exercises.get(s.exercise_id), sets: [s] })
        }

        return (
          <div key={w.id} style={{
            border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`,
            background: 'var(--bg-card)', marginBottom: 8,
          }}>
            <button
              onClick={() => setOpen(expanded ? null : w.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: 'var(--text-hi)', fontWeight: 500 }}>
                  {w.routine_name ?? 'Freestyle'}
                </div>
                <Label style={{ marginTop: 3 }}>
                  {[
                    formatDate(w.date),
                    `${w.sets.length} SETS`,
                    volume > 0 ? `${Math.round(volume).toLocaleString()} LBS` : null,
                    w.duration_minutes ? `${w.duration_minutes} MIN` : null,
                  ].filter(Boolean).join(' · ')}
                </Label>
              </div>
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--text-dim)', flexShrink: 0,
                  transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease',
                }}
              />
            </button>

            {expanded && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-dim)' }}>
                {groups.map((g, i) => (
                  <div key={i} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 4 }}>
                      {g.exercise?.name ?? 'Deleted exercise'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.sets.map((s, j) => (
                        <span key={s.id} style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12,
                          color: s.is_warmup ? 'var(--text-mute)' : 'var(--text-hi)',
                          border: '1px solid var(--border-dim)', padding: '3px 8px',
                        }}>
                          <span style={{ color: 'var(--text-dim)' }}>{s.is_warmup ? 'W' : j + 1}</span>{' '}
                          {g.exercise ? fmtSet(g.exercise.tracking_type, s) : '--'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {w.notes && (
                  <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 12, lineHeight: 1.6, fontStyle: 'italic' }}>
                    {w.notes}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <Label>{w.bodyweight ? `BODYWEIGHT ${w.bodyweight} LBS` : ''}</Label>
                  <Button variant="quiet" onClick={() => remove(w)}><Trash2 size={13} /> DELETE</Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}
