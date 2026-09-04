import { supabase } from './supabaseClient'
import { currentUserId } from './currentUser'
import { getAllEntries } from './db'
import { getWorkoutNotes, listBodyweight, listExercises, listWorkouts } from './fitness/db'
import { fmtDuration } from './fitness/calc'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_LABELS } from './hobbies'
import type { HobbyCategory } from '@/types/database'
import type { CellValue, Sheet } from './xlsx'

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

// Fitness as a single table: one row per set, with the workout and exercise it
// belongs to repeated across it.
//
// It was six sheets -- workouts, sets, records, exercises, bodyweight, goals --
// which is the shape a database wants, not the shape a spreadsheet wants. Flat
// and denormalised, you can pivot the whole thing: volume by month, best set per
// exercise, bodyweight over time all come out of this one sheet. The columns that
// used to be their own tables (duration, bodyweight, session notes, how an
// exercise is measured, the setup note) ride along on every row.
async function fitnessSheet(): Promise<Sheet[]> {
  // listWorkouts caps at 100 by default, which would quietly truncate an export.
  const [workouts, exercises, weighIns] = await Promise.all([
    listWorkouts(100000),
    listExercises(true),
    listBodyweight(),
  ])
  if (workouts.length === 0 && weighIns.length === 0) return []

  const weightOn = new Map(weighIns.map((w) => [w.date, w.weight]))

  const byId = new Map(exercises.map((e) => [e.id, e]))
  // Setup notes are per (workout, exercise), so they land on every set of that
  // exercise in that session.
  const notes = await getWorkoutNotes(workouts.map((w) => w.id)).catch(() => new Map<string, string>())

  const rows: CellValue[][] = []
  for (const w of workouts) {
    // Number sets within their exercise, matching how the logger showed them,
    // rather than across the whole session.
    const seen = new Map<string, number>()
    for (const set of w.sets) {
      const ex = byId.get(set.exercise_id)
      const n = (seen.get(set.exercise_id) ?? 0) + 1
      seen.set(set.exercise_id, n)
      rows.push([
        w.date,
        w.routine_name ?? 'Freestyle',
        ex?.name ?? 'Deleted exercise',
        n,
        set.is_warmup ? 'Yes' : '',
        set.reps,
        set.weight,
        set.seconds,
        set.seconds != null ? fmtDuration(set.seconds) : '',
        set.distance,
        (set.weight ?? 0) * (set.reps ?? 0) || null,
        ex?.tracking_type ?? '',
        ex?.muscle ?? '',
        ex?.equipment ?? '',
        ex ? notes.get(`${w.id}:${ex.id}`) ?? '' : '',
        w.duration_minutes,
        weightOn.get(w.date) ?? null,
        w.notes ?? '',
      ])
    }
  }

  // A weigh-in on a rest day belongs to no set, so it would fall out of a
  // row-per-set sheet entirely. Rather than lose it -- or split fitness back
  // into two tabs -- those days get a row of their own, marked in the exercise
  // column so they are trivial to filter out when pivoting the training log.
  const trainedOn = new Set(workouts.map((w) => w.date))
  for (const w of weighIns) {
    if (trainedOn.has(w.date)) continue
    rows.push([w.date, '', '(weigh-in)', null, '', null, null, null, '', null, null, '', '', '', '', null, w.weight, ''])
  }

  // Newest first, matching how History reads.
  rows.sort((a, b) => (String(a[0]) < String(b[0]) ? 1 : String(a[0]) > String(b[0]) ? -1 : 0))

  return [{
    name: 'Fitness',
    headers: [
      'Date', 'Routine', 'Exercise', 'Set #', 'Warm-up',
      'Reps', 'Weight (lbs)', 'Seconds', 'Time', 'Distance (mi)', 'Volume (lbs)',
      'Measured As', 'Muscle', 'Equipment', 'Setup Note',
      'Workout Duration (min)', 'Bodyweight (lbs)', 'Workout Notes',
    ],
    rows,
  }]
}
// -- Entry point -------------------------------------------------------------

// Sheets for the chosen hobbies, in the order the hobby list defines them so an
// export reads the same way every time.
export async function collectSheets(hobbies: HobbyCategory[]): Promise<Sheet[]> {
  const entryHobbies = hobbies.filter((h) => h !== FITNESS)
  const [entries, fitness] = await Promise.all([
    entryHobbies.length > 0 ? entrySheets(entryHobbies) : Promise.resolve([]),
    hobbies.includes(FITNESS) ? fitnessSheet() : Promise.resolve([]),
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
