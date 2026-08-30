import type { Exercise, TrackingType, WorkoutSet } from '@/types/fitness'

// Epley. Every 1RM formula is an estimate; Epley is the common one and stays
// sane across the 1-12 rep range people actually log.
export function e1rm(weight: number, reps: number): number {
  if (!weight || !reps) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

// Seconds per mile - lower is better, which is why pace is special-cased below.
export function pace(seconds: number, distance: number): number | null {
  if (!seconds || !distance) return null
  return seconds / distance
}

export type PrKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'seconds' | 'distance' | 'pace'

export interface PrValue {
  kind: PrKind
  value: number
  setId: string | null
  date: string | null
}

// Which records are meaningful for each way of measuring. A plank has no 1RM;
// a bench press has no pace.
export const PR_KINDS: Record<TrackingType, PrKind[]> = {
  weight_reps: ['weight', 'e1rm', 'volume'],
  reps: ['reps', 'weight'],
  time: ['seconds'],
  time_distance: ['distance', 'seconds', 'pace'],
}

export const PR_LABELS: Record<PrKind, string> = {
  weight: 'HEAVIEST',
  e1rm: 'EST. 1RM',
  volume: 'BEST SET VOLUME',
  reps: 'MOST REPS',
  seconds: 'LONGEST',
  distance: 'FARTHEST',
  pace: 'BEST PACE',
}

// Pace is the one record where a smaller number is the better number.
export const LOWER_IS_BETTER: Partial<Record<PrKind, boolean>> = { pace: true }

type SetLike = Pick<WorkoutSet, 'reps' | 'weight' | 'seconds' | 'distance' | 'is_warmup'>

function setValue(kind: PrKind, s: SetLike): number | null {
  switch (kind) {
    case 'weight': return s.weight ?? null
    case 'e1rm': return s.weight && s.reps ? e1rm(s.weight, s.reps) : null
    case 'volume': return s.weight && s.reps ? s.weight * s.reps : null
    case 'reps': return s.reps ?? null
    case 'seconds': return s.seconds ?? null
    case 'distance': return s.distance ?? null
    case 'pace': return s.seconds && s.distance ? pace(s.seconds, s.distance) : null
  }
}

function better(kind: PrKind, a: number, b: number): boolean {
  return LOWER_IS_BETTER[kind] ? a < b : a > b
}

// Best of every record kind that applies to this exercise. `dateOf` maps a set to
// the day its workout happened, so the PR list can say when it was set.
export function personalRecords(
  exercise: Exercise,
  sets: WorkoutSet[],
  dateOf: (s: WorkoutSet) => string | null,
): PrValue[] {
  const out: PrValue[] = []
  for (const kind of PR_KINDS[exercise.tracking_type]) {
    let best: PrValue | null = null
    for (const s of sets) {
      if (s.is_warmup) continue // warm-ups never count as a record
      const v = setValue(kind, s)
      if (v == null || v <= 0) continue
      if (!best || better(kind, v, best.value)) best = { kind, value: v, setId: s.id, date: dateOf(s) }
    }
    if (best) out.push(best)
  }
  return out
}

// Records a candidate set would break, given the bests that already stand.
// Drives the live PR badge while logging.
export function prsBrokenBy(
  trackingType: TrackingType,
  candidate: SetLike,
  standing: PrValue[],
): PrKind[] {
  if (candidate.is_warmup) return []
  const broken: PrKind[] = []
  for (const kind of PR_KINDS[trackingType]) {
    const v = setValue(kind, candidate)
    if (v == null || v <= 0) continue
    const prev = standing.find((p) => p.kind === kind)
    if (!prev || better(kind, v, prev.value)) broken.push(kind)
  }
  return broken
}

// -- Setup notes -------------------------------------------------------------

// The two rules that make a note carry forward across sessions you left blank.

// 1. Blank notes are never written. An empty field must not overwrite the note
//    being carried forward -- it means "unchanged", not "erase it".
export function notesToPersist<T extends { note: string }>(list: T[]): T[] {
  return list.filter((n) => n.note.trim()).map((n) => ({ ...n, note: n.note.trim() }))
}

// 2. Given every stored note for an exercise, the newest wins. Combined with
//    rule 1, that's the last thing actually typed, however long ago.
export function latestNote<T extends { date: string }>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows) if (!best || r.date > best.date) best = r
  return best
}

// -- Consistency -------------------------------------------------------------

// Dates are 'YYYY-MM-DD'. Parsed at local noon so a timezone shift can't slide a
// workout onto the day before.
function toDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}
const DAY_MS = 86_400_000

export interface StreakInfo { current: number; longest: number }

// Streaks count consecutive days that have a workout. A current streak stays
// alive if the most recent workout was today or yesterday - sleeping between
// sessions shouldn't read as breaking it.
export function dayStreak(dates: string[], today = new Date()): StreakInfo {
  const days = [...new Set(dates)].map(toDay).sort((a, b) => a - b)
  if (days.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY_MS ? run + 1 : 1
    if (run > longest) longest = run
  }

  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()
  const gap = Math.round((todayMs - days[days.length - 1]) / DAY_MS)
  let current = 0
  if (gap <= 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] - days[i - 1] === DAY_MS) current++
      else break
    }
  }
  return { current, longest }
}

// Workouts per day for the last `weeks` weeks, oldest first, starting on a Sunday
// so chunking by 7 gives calendar weeks - the shape a contribution heatmap wants.
export function heatmapDays(dates: string[], weeks = 26, today = new Date()): { date: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1)

  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const start = new Date(end)
  start.setDate(start.getDate() - (weeks * 7 - 1))
  start.setDate(start.getDate() - start.getDay()) // back up to Sunday

  const out: { date: string; count: number }[] = []
  for (const t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
    out.push({ date: isoDay(t), count: counts.get(isoDay(t)) ?? 0 })
  }
  return out
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// -- Formatting --------------------------------------------------------------

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Accepts "45", "1:30", "1:02:30". A bare number is read as seconds; anything
// with a colon is mm:ss or h:mm:ss.
export function parseDuration(input: string): number | null {
  const v = input.trim()
  if (!v) return null
  const parts = v.split(':').map((p) => p.trim())
  if (parts.length > 3) return null
  if (parts.some((p) => p === '' || isNaN(Number(p)))) return null
  const nums = parts.map(Number)
  if (nums.length === 1) return nums[0]
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  return nums[0] * 3600 + nums[1] * 60 + nums[2]
}

export function fmtPace(secondsPerMile: number): string {
  return `${fmtDuration(secondsPerMile)} /mi`
}

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

export function fmtPrValue(kind: PrKind, value: number): string {
  switch (kind) {
    case 'weight': return `${round(value)} lbs`
    case 'e1rm': return `${round(value)} lbs`
    case 'volume': return `${round(value)} lbs`
    case 'reps': return `${round(value)} reps`
    case 'seconds': return fmtDuration(value)
    case 'distance': return `${round(value)} mi`
    case 'pace': return fmtPace(value)
  }
}

// One-line summary of a set, for history rows.
export function fmtSet(trackingType: TrackingType, s: SetLike): string {
  if (trackingType === 'time') return s.seconds ? fmtDuration(s.seconds) : '--'
  if (trackingType === 'time_distance') {
    const bits: string[] = []
    if (s.distance) bits.push(`${round(s.distance)} mi`)
    if (s.seconds) bits.push(fmtDuration(s.seconds))
    return bits.join(' / ') || '--'
  }
  if (trackingType === 'reps') {
    if (!s.reps) return '--'
    return s.weight ? `${s.reps} x +${round(s.weight)} lbs` : `${s.reps} reps`
  }
  if (!s.reps && !s.weight) return '--'
  return `${round(s.weight ?? 0)} lbs x ${s.reps ?? 0}`
}

// Total pounds moved in a workout - the headline number for a strength session.
export function setsVolume(sets: WorkoutSet[]): number {
  return sets.reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0)
}
