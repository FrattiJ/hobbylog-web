import type { Entry, HobbyCategory } from '@/types/database'
import { isoDayOf, todayIso } from './format'
import { HOBBY_MAP } from './hobbies'
import { finishesOf } from './finishes'

// "Finished" here means what it means on the Shelf: a recipe marked Made is a
// meal cooked, not a thing completed, so recipes stay out of the finished
// counts, the finish rate and the time-to-finish figure. They still appear in
// the per-hobby breakdown, where the row is plainly about Cooking.
const isFinish = (e: Entry) => e.status === 'completed' && !HOBBY_MAP[e.hobby_category]?.recipe

// Every dated finish in the library, one per time through: something finished
// twice was finished on two days, and both belong on a chart of finishes.
const finishDaysOf = (entries: Entry[]): string[] =>
  entries
    .filter((e) => !HOBBY_MAP[e.hobby_category]?.recipe)
    .flatMap((e) => finishesOf(e).map((f) => f.date))
    .filter((d): d is string => !!d)

// Everything the Stats page and the dashboard's "this month" strip show, worked
// out from data the browser already has. Pure functions: entries, the session
// log and the workout log go in, numbers come out.
//
// Two kinds of figure live here and they are kept apart on purpose:
//   - over a period: things that happened between two dates (finished, added,
//     hours logged). These answer "how is it going lately".
//   - a snapshot: the library as it stands today (how much is finished, how
//     ratings spread, what has sat longest). A date range means nothing here.

export interface DatedMinutes { date: string; minutes: number }
export interface SessionLogRow extends DatedMinutes { entry_id: string }
// (Same shape as db.ts's SessionLogRow; declared here so this file stays free of
// anything that talks to the network.)

export type Range = '12m' | 'year' | 'all'
export const RANGES: Array<{ id: Range; label: string }> = [
  { id: '12m', label: 'Last 12 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
]

/** One column on a time chart: a month, or a whole year when the range is all time. */
export interface Bucket {
  key: string        // '2026-11' or '2026'
  label: string      // 'Nov' or '2026'
  longLabel: string  // 'November 2026' or '2026'
  start: string      // first day, inclusive, 'YYYY-MM-DD'
  end: string        // last day, inclusive
  finished: number
  added: number
  hours: number
}

const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short' })
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDayOf = (y: number, m: number) => new Date(y, m, 0).getDate()   // m is 1-based

function monthBucket(y: number, m: number): Bucket {
  const d = new Date(y, m - 1, 1)
  return {
    key: `${y}-${pad(m)}`, label: MONTH_SHORT.format(d), longLabel: MONTH_LONG.format(d),
    start: iso(y, m, 1), end: iso(y, m, lastDayOf(y, m)), finished: 0, added: 0, hours: 0,
  }
}

function yearBucket(y: number): Bucket {
  return { key: String(y), label: String(y), longLabel: String(y), start: iso(y, 1, 1), end: iso(y, 12, 31), finished: 0, added: 0, hours: 0 }
}

/** The empty columns for a range, oldest first, ending at the current month or year. */
function bucketsFor(range: Range, earliest: string | null, today: string): Bucket[] {
  const [ty, tm] = today.split('-').map(Number)
  if (range === 'all') {
    const from = earliest ? Number(earliest.slice(0, 4)) : ty
    // Never more than a decade of columns: older years are rare and unreadable.
    const first = Math.max(from, ty - 9)
    return Array.from({ length: ty - first + 1 }, (_, i) => yearBucket(first + i))
  }
  if (range === 'year') return Array.from({ length: tm }, (_, i) => monthBucket(ty, i + 1))
  const out: Bucket[] = []
  for (let back = 11; back >= 0; back--) {
    const d = new Date(ty, tm - 1 - back, 1)
    out.push(monthBucket(d.getFullYear(), d.getMonth() + 1))
  }
  return out
}

export interface HobbyHours { hobby: HobbyCategory; hours: number }

export interface PeriodStats {
  buckets: Bucket[]
  start: string
  end: string
  finished: number
  added: number
  /** Added minus finished: above zero, the pile grew. */
  net: number
  hours: number
  hoursPerWeek: number
  sessions: number
  activeDays: number
  byHobby: HobbyHours[]
  /** Completed entries with no finish date at all. They cannot be placed in any period. */
  undatedFinishes: number
}

export function periodStats(
  range: Range, entries: Entry[], sessions: SessionLogRow[], workouts: DatedMinutes[], today = todayIso(),
): PeriodStats {
  const addedDays = entries.map((e) => isoDayOf(e.created_at)).filter(Boolean)
  const finishDays = finishDaysOf(entries)
  const logDays = [...sessions, ...workouts].map((r) => r.date).filter(Boolean)
  // A session with no date cannot be placed in a period; it is skipped below.
  const earliest = [...addedDays, ...finishDays, ...logDays].sort()[0] ?? null

  const buckets = bucketsFor(range, earliest, today)
  const start = buckets[0].start
  const end = today
  const find = (day: string) => (day >= start && day <= end ? buckets.find((b) => day >= b.start && day <= b.end) : undefined)

  for (const day of finishDays) { const b = find(day); if (b) b.finished++ }
  for (const day of addedDays) { const b = find(day); if (b) b.added++ }

  const hobbyOf = new Map(entries.map((e) => [e.id, e.hobby_category]))
  const minutesByHobby = new Map<HobbyCategory, number>()
  const days = new Set<string>()
  let minutes = 0, count = 0
  const tally = (date: string, mins: number, hobby: HobbyCategory | undefined) => {
    const b = date ? find(date) : undefined
    if (!b) return
    count++; days.add(date)
    if (mins <= 0) return
    b.hours += mins / 60; minutes += mins
    if (hobby) minutesByHobby.set(hobby, (minutesByHobby.get(hobby) ?? 0) + mins)
  }
  for (const s of sessions) tally(s.date, s.minutes, hobbyOf.get(s.entry_id))
  for (const w of workouts) tally(w.date, w.minutes, 'fitness')
  for (const b of buckets) b.hours = Math.round(b.hours * 10) / 10

  const finished = buckets.reduce((t, b) => t + b.finished, 0)
  const added = buckets.reduce((t, b) => t + b.added, 0)
  const spanDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1)

  return {
    buckets, start, end, finished, added, net: added - finished,
    hours: Math.round((minutes / 60) * 10) / 10,
    hoursPerWeek: Math.round((minutes / 60 / (spanDays / 7)) * 10) / 10,
    sessions: count, activeDays: days.size,
    byHobby: [...minutesByHobby.entries()]
      .map(([hobby, mins]) => ({ hobby, hours: Math.round((mins / 60) * 10) / 10 }))
      .filter((h) => h.hours > 0)
      .sort((a, b) => b.hours - a.hours),
    undatedFinishes: entries.filter((e) => isFinish(e) && !e.date_completed).length,
  }
}

export interface HobbyProgress { hobby: HobbyCategory; total: number; finished: number; dropped: number; pct: number }

export interface LibraryStats {
  /** Median days from start to finish, counting both ends, over entries that have both dates. */
  medianDaysToFinish: number | null
  timedFinishes: number
  finished: number
  dropped: number
  /** Of everything you stopped, the share you finished. Null until something has ended. */
  finishRate: number | null
  byHobby: HobbyProgress[]
  /** Index 0 is a rating of 1 (anything up to 1), index 9 is a 10. */
  ratingCounts: number[]
  averageRating: number | null
  rated: number
  oldestBacklog: Array<{ entry: Entry; days: number }>
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

export function libraryStats(entries: Entry[], hobbies: HobbyCategory[], today = todayIso()): LibraryStats {
  const done = entries.filter(isFinish)
  const dropped = entries.filter((e) => e.status === 'dropped' && !HOBBY_MAP[e.hobby_category]?.recipe)

  const spans = done
    .filter((e) => e.date_started && e.date_completed && e.date_completed >= e.date_started)
    .map((e) => daysBetween(e.date_started as string, e.date_completed as string) + 1)

  const ratingCounts = Array.from({ length: 10 }, () => 0)
  const rated = entries.filter((e) => e.rating != null)
  for (const e of rated) ratingCounts[Math.min(10, Math.max(1, Math.ceil(e.rating as number))) - 1]++

  return {
    medianDaysToFinish: median(spans),
    timedFinishes: spans.length,
    finished: done.length,
    dropped: dropped.length,
    finishRate: done.length + dropped.length > 0 ? Math.round((done.length / (done.length + dropped.length)) * 100) : null,
    byHobby: hobbies.map((hobby) => {
      const mine = entries.filter((e) => e.hobby_category === hobby)
      const finished = mine.filter((e) => e.status === 'completed').length
      return {
        hobby, total: mine.length, finished,
        dropped: mine.filter((e) => e.status === 'dropped').length,
        pct: mine.length ? Math.round((finished / mine.length) * 100) : 0,
      }
    }).filter((h) => h.total > 0).sort((a, b) => b.pct - a.pct),
    ratingCounts,
    averageRating: rated.length ? Math.round((rated.reduce((t, e) => t + (e.rating as number), 0) / rated.length) * 10) / 10 : null,
    rated: rated.length,
    oldestBacklog: entries
      .filter((e) => e.status === 'backlog')
      .map((entry) => ({ entry, days: Math.max(0, daysBetween(isoDayOf(entry.created_at), today)) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 5),
  }
}

/** "3 years", "8 months", "2 weeks", "5 days": how long, in the largest unit that fits. */
export function ageLabel(days: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (days >= 365) return unit(Math.floor(days / 365), 'year')
  if (days >= 60) return unit(Math.floor(days / 30), 'month')
  if (days >= 14) return unit(Math.floor(days / 7), 'week')
  return unit(days, 'day')
}

/** The current calendar month, for the dashboard. */
export function thisMonth(entries: Entry[], sessions: SessionLogRow[], workouts: DatedMinutes[], today = todayIso()) {
  const prefix = today.slice(0, 7)
  const minutes = [...sessions, ...workouts].filter((r) => r.date && r.date.startsWith(prefix)).reduce((t, r) => t + r.minutes, 0)
  const finished = finishDaysOf(entries).filter((d) => d.startsWith(prefix)).length
  const added = entries.filter((e) => isoDayOf(e.created_at).startsWith(prefix)).length
  return { finished, added, net: added - finished, hours: Math.round((minutes / 60) * 10) / 10 }
}
