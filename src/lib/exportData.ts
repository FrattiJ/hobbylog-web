import { supabase } from './supabaseClient'
import { currentUserId } from './currentUser'
import { getAllEntries } from './db'
import { getBodyweightHistory, listExercises, listGoals, listWorkouts } from './fitness/db'
import { fmtDuration, fmtPrValue, personalRecords } from './fitness/calc'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_LABELS } from './hobbies'
import type { HobbyCategory } from '@/types/database'
import type { Sheet } from './xlsx'
import type { DatedSet } from './fitness/db'

// Turns the account into spreadsheet tables.
//
// Everything here is a plain value: no formulas, no formatting. The point is to
// hand over the data in a shape you can pivot and chart yourself, so dates stay
// as ISO strings and durations are written both raw (seconds, for maths) and
// formatted (mm:ss, for reading).

// Fitness doesn't live in web_entries and exports as several related tables, so
// it's kept separate from the per-hobby entry sheets throughout.
export const FITNESS: HobbyCategory = 'fitness'

const iso = (v: string | null | undefined) => v ?? ''

// -- Entry hobbies -----------------------------------------------------------

async function entrySheets(hobbies: HobbyCategory[]): Promise<Sheet[]> {
  const entries = await getAllEntries()
  const wanted = new Set(hobbies)
  const mine = entries.filter((e) => wanted.has(e.hobby_category))
  if (mine.length === 0 && hobbies.length === 0) return []

  const sheets: Sheet[] = []

  for (const hobby of hobbies) {
    const rows = mine.filter((e) => e.hobby_category === hobby)
    const config = HOBBY_MAP[hobby]

    // Season and episode only mean something for TV; sub-type only for books.
    const isTv = hobby === 'tv'
    const isBooks = hobby === 'books'

    const headers = [
      'Title',
      ...(isBooks ? ['Type'] : []),
      'Status',
      'Rating',
      config.progressLabel,
      'Total',
      ...(isTv ? ['Season', 'Episode'] : []),
      'Backlog Rank',
      'Started',
      'Completed',
      'Notes',
      'Source',
      'External ID',
      'Added',
      'Updated',
    ]

    sheets.push({
      name: config.pluralLabel,
      headers,
      rows: rows.map((e) => [
        e.title,
        ...(isBooks ? [e.book_subtype ? BOOK_SUBTYPE_MAP[e.book_subtype]?.label ?? e.book_subtype : ''] : []),
        STATUS_LABELS[e.status] ?? e.status,
        e.rating,
        e.progress_current,
        e.progress_total,
        ...(isTv ? [e.current_season, e.current_episode] : []),
        e.priority,
        iso(e.date_started),
        iso(e.date_completed),
        e.notes ?? '',
        e.external_source ?? '',
        e.external_id ?? '',
        iso(e.created_at),
        iso(e.updated_at),
      ]),
    })
  }

  // Session logs for whatever was selected, as one table keyed by title.
  const ids = mine.map((e) => e.id)
  if (ids.length > 0) {
    const userId = await currentUserId()
    const { data } = await supabase
      .from('web_sessions')
      .select('entry_id, date, duration_minutes, progress_logged, notes')
      .eq('user_id', userId)
      .in('entry_id', ids)
      .order('date', { ascending: false })

    const byId = new Map(mine.map((e) => [e.id, e]))
    const rows = ((data ?? []) as {
      entry_id: string; date: string; duration_minutes: number | null
      progress_logged: number | null; notes: string | null
    }[]).map((s) => {
      const entry = byId.get(s.entry_id)
      return [
        s.date,
        entry ? HOBBY_MAP[entry.hobby_category].pluralLabel : '',
        entry?.title ?? '',
        s.duration_minutes,
        s.progress_logged,
        s.notes ?? '',
      ]
    })

    if (rows.length > 0) {
      sheets.push({
        name: 'Sessions',
        headers: ['Date', 'Hobby', 'Title', 'Minutes', 'Progress Logged', 'Notes'],
        rows,
      })
    }
  }

  return sheets
}

// -- Fitness -----------------------------------------------------------------

async function fitnessSheets(): Promise<Sheet[]> {
  // listWorkouts caps at 100 by default, which would quietly truncate an export.
  const [workouts, exercises, goals, bodyweight] = await Promise.all([
    listWorkouts(100000),
    listExercises(true),
    listGoals(),
    getBodyweightHistory(),
  ])
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const sheets: Sheet[] = []

  sheets.push({
    name: 'Workouts',
    headers: ['Date', 'Routine', 'Sets', 'Volume (lbs)', 'Duration (min)', 'Bodyweight (lbs)', 'Notes'],
    rows: workouts.map((w) => [
      w.date,
      w.routine_name ?? 'Freestyle',
      w.sets.length,
      Math.round(w.sets.reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0)),
      w.duration_minutes,
      w.bodyweight,
      w.notes ?? '',
    ]),
  })

  // One row per set: the table you'd actually pivot on.
  const setRows: (string | number | null)[][] = []
  for (const w of workouts) {
    w.sets.forEach((s, i) => {
      const ex = byId.get(s.exercise_id)
      setRows.push([
        w.date,
        w.routine_name ?? 'Freestyle',
        ex?.name ?? 'Deleted exercise',
        i + 1,
        s.is_warmup ? 'Yes' : '',
        s.reps,
        s.weight,
        s.seconds,
        s.seconds != null ? fmtDuration(s.seconds) : '',
        s.distance,
        (s.weight ?? 0) * (s.reps ?? 0) || null,
      ])
    })
  }
  sheets.push({
    name: 'Sets',
    headers: [
      'Date', 'Routine', 'Exercise', 'Set #', 'Warm-up',
      'Reps', 'Weight (lbs)', 'Seconds', 'Time', 'Distance (mi)', 'Volume (lbs)',
    ],
    rows: setRows,
  })

  // Personal records, computed from the sets already in hand rather than
  // re-querying per exercise.
  const historyByExercise = new Map<string, DatedSet[]>()
  for (const w of workouts) {
    for (const s of w.sets) {
      const arr = historyByExercise.get(s.exercise_id)
      const dated: DatedSet = { ...s, date: w.date }
      if (arr) arr.push(dated)
      else historyByExercise.set(s.exercise_id, [dated])
    }
  }

  const prRows: (string | number | null)[][] = []
  for (const ex of exercises) {
    const history = historyByExercise.get(ex.id) ?? []
    if (history.length === 0) continue
    for (const pr of personalRecords(ex, history, (s) => (s as DatedSet).date)) {
      prRows.push([ex.name, pr.kind, fmtPrValue(pr.kind, pr.value), Math.round(pr.value * 100) / 100, pr.date ?? ''])
    }
  }
  if (prRows.length > 0) {
    sheets.push({
      name: 'Personal Records',
      headers: ['Exercise', 'Record', 'Value', 'Raw Value', 'Set On'],
      rows: prRows,
    })
  }

  sheets.push({
    name: 'Exercises',
    headers: ['Name', 'Measured As', 'Muscle', 'Equipment', 'Custom', 'Archived', 'Added'],
    rows: exercises.map((e) => [
      e.name,
      e.tracking_type,
      e.muscle ?? '',
      e.equipment ?? '',
      e.catalog_id ? '' : 'Yes',
      e.archived ? 'Yes' : '',
      iso(e.created_at),
    ]),
  })

  if (bodyweight.length > 0) {
    sheets.push({
      name: 'Bodyweight',
      headers: ['Date', 'Weight (lbs)'],
      rows: bodyweight.map((b) => [b.date, b.weight]),
    })
  }

  if (goals.length > 0) {
    sheets.push({
      name: 'Goals',
      headers: ['Goal', 'Exercise', 'Measure', 'Target', 'Target Date', 'Achieved'],
      rows: goals.map((g) => [
        g.name,
        g.exercise_id ? byId.get(g.exercise_id)?.name ?? '' : '',
        g.metric,
        g.target,
        iso(g.target_date),
        iso(g.achieved_at),
      ]),
    })
  }

  return sheets
}

// -- Entry point -------------------------------------------------------------

// Sheets for the chosen hobbies, in the order the hobby list defines them so an
// export reads the same way every time.
export async function collectSheets(hobbies: HobbyCategory[]): Promise<Sheet[]> {
  const entryHobbies = hobbies.filter((h) => h !== FITNESS)
  const [entries, fitness] = await Promise.all([
    entryHobbies.length > 0 ? entrySheets(entryHobbies) : Promise.resolve([]),
    hobbies.includes(FITNESS) ? fitnessSheets() : Promise.resolve([]),
  ])
  return [...entries, ...fitness].filter((s) => s.rows.length > 0)
}

// Browsers only reliably deliver one download per gesture, so a multi-table CSV
// export is bundled rather than fired off as a burst of separate files.
export function fileStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
