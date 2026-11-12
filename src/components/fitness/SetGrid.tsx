'use client'

import { Trash2, Plus, Trophy } from 'lucide-react'
import type { Exercise, TrackingType } from '@/types/fitness'
import type { DatedSet } from '@/lib/fitness/db'
import { parseDuration, fmtDuration, prsBrokenBy, PR_LABELS, type PrValue } from '@/lib/fitness/calc'
import { Input, Button, ACCENT } from './ui'

// A set as it exists while you're typing: strings, so a half-entered "1:3" isn't
// thrown away mid-keystroke. Parsed to numbers only on save.
export interface DraftSet {
  key: string
  reps: string
  weight: string
  duration: string
  distance: string
  warmup: boolean
}

export function emptySet(): DraftSet {
  return { key: Math.random().toString(36).slice(2), reps: '', weight: '', duration: '', distance: '', warmup: false }
}

export function draftHasData(s: DraftSet): boolean {
  return !!(s.reps.trim() || s.weight.trim() || s.duration.trim() || s.distance.trim())
}

// Turn a draft row into the numbers the DB stores, keeping only the fields that
// this tracking type actually measures.
export function draftToSet(t: TrackingType, s: DraftSet) {
  const num = (v: string) => { const n = parseFloat(v); return v.trim() && !isNaN(n) ? n : null }
  return {
    reps: t === 'weight_reps' || t === 'reps' ? num(s.reps) : null,
    weight: t === 'weight_reps' || t === 'reps' ? num(s.weight) : null,
    seconds: t === 'time' || t === 'time_distance' ? parseDuration(s.duration) : null,
    distance: t === 'time_distance' ? num(s.distance) : null,
    rpe: null,
    is_warmup: s.warmup,
  }
}

// What the routine asked for on this exercise. Shown greyed when there's no
// previous session to ghost instead, so loading a routine you built with 3x8
// doesn't read as an empty grid.
export interface SetTargets {
  // Seeds how many rows the grid starts with; the other two are placeholders.
  sets: number | null
  reps: number | null
  seconds: number | null
}

interface Column {
  key: keyof DraftSet
  label: string
  placeholder: (ghost: DatedSet | undefined, target: SetTargets | null) => string
}

// Which inputs each tracking type shows. This is the whole reason a run doesn't
// ask you for "1 set of 30:00 lbs".
//
// Placeholder precedence is last session, then the routine target, then a dash.
// Weight and distance have no target to fall back on -- a routine says how many
// reps to do, never how much to load.
const COLUMNS: Record<TrackingType, Column[]> = {
  weight_reps: [
    { key: 'reps', label: 'Reps', placeholder: (g, t) => (g?.reps != null ? String(g.reps) : t?.reps != null ? String(t.reps) : '—') },
    { key: 'weight', label: 'lbs', placeholder: (g) => (g?.weight != null ? String(g.weight) : '—') },
  ],
  reps: [
    { key: 'reps', label: 'Reps', placeholder: (g, t) => (g?.reps != null ? String(g.reps) : t?.reps != null ? String(t.reps) : '—') },
    { key: 'weight', label: '+ lbs', placeholder: (g) => (g?.weight ? String(g.weight) : 'bw') },
  ],
  time: [
    { key: 'duration', label: 'Time', placeholder: (g, t) => (g?.seconds != null ? fmtDuration(g.seconds) : t?.seconds != null ? fmtDuration(t.seconds) : 'mm:ss') },
  ],
  time_distance: [
    { key: 'duration', label: 'Time', placeholder: (g, t) => (g?.seconds != null ? fmtDuration(g.seconds) : t?.seconds != null ? fmtDuration(t.seconds) : 'mm:ss') },
    { key: 'distance', label: 'miles', placeholder: (g) => (g?.distance != null ? String(g.distance) : '—') },
  ],
}

export default function SetGrid({ exercise, sets, lastSets, records, targets = null, onChange }: {
  exercise: Exercise
  sets: DraftSet[]
  // Last session's sets, shown as ghost placeholders so you know what to beat.
  lastSets: DatedSet[]
  records: PrValue[]
  // The routine's targets, used as placeholders when there's no session to ghost.
  targets?: SetTargets | null
  onChange: (sets: DraftSet[]) => void
}) {
  const cols = COLUMNS[exercise.tracking_type]
  const grid = `28px ${cols.map(() => '1fr').join(' ')} 34px 30px`

  const update = (key: string, patch: Partial<DraftSet>) =>
    onChange(sets.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: grid, gap: 6, padding: '0 0 5px',
        fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em',
        color: 'var(--text-dim)', borderBottom: '1px solid var(--border-dim)', marginBottom: 7,
      }}>
        <span style={{ textAlign: 'center' }}>#</span>
        {cols.map((c) => <span key={c.key}>{c.label}</span>)}
        <span style={{ textAlign: 'center' }} title="Warm-up sets are excluded from records">W/U</span>
        <span />
      </div>

      {sets.map((s, i) => {
        const ghost = lastSets[i]
        const broken = draftHasData(s)
          ? prsBrokenBy(exercise.tracking_type, draftToSet(exercise.tracking_type, s), records)
          : []
        return (
          <div key={s.key} style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', marginBottom: 5 }}>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 12, textAlign: 'center',
              color: s.warmup ? 'var(--text-mute)' : 'var(--text-dim)',
            }}>
              {s.warmup ? 'W' : i + 1}
            </span>

            {cols.map((c) => (
              <Input
                key={c.key}
                value={s[c.key] as string}
                onChange={(e) => update(s.key, { [c.key]: e.target.value } as Partial<DraftSet>)}
                placeholder={c.placeholder(ghost, targets)}
                inputMode={c.key === 'duration' ? 'text' : 'decimal'}
                style={{ padding: '7px 8px', textAlign: 'center' }}
              />
            ))}

            <button
              onClick={() => update(s.key, { warmup: !s.warmup })}
              title="Warm-up set"
              style={{
                height: 32, background: s.warmup ? `${ACCENT}22` : 'transparent',
                border: `1px solid ${s.warmup ? ACCENT : 'var(--border-dim)'}`,
                color: s.warmup ? ACCENT : 'var(--text-mute)',
                fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
              }}
 aria-label="Warm-up set">
              {s.warmup ? '✓' : ''}
            </button>

            <button
              onClick={() => onChange(sets.filter((x) => x.key !== s.key))}
              title="Remove set"
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-mute)' }}
 aria-label="Remove set">
              <Trash2 size={13} />
            </button>

            {broken.length > 0 && (
              <span style={{
                gridColumn: '2 / -1', display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em',
                color: '#eab308', marginTop: -2, marginBottom: 3,
              }}>
                <Trophy size={10} /> {broken.map((k) => PR_LABELS[k]).join(' · ')} PR
              </span>
            )}
          </div>
        )
      })}

      <Button
        variant="ghost" style={{ width: '100%', marginTop: 4, borderLeft: '1px dashed var(--border-dim)' }}
        onClick={() => onChange([...sets, emptySet()])}
      >
        <Plus size={12} /> Add Set
      </Button>
    </div>
  )
}
