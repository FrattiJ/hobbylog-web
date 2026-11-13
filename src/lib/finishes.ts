// Finishing something more than once: a film rewatched, a book reread, a game
// replayed. The entry's own date_started and date_completed always describe the
// latest time through. Earlier times are kept beside it in metadata, as
// `past_finishes`, so that going round again never overwrites the date you
// first finished.
//
// Pure functions over an entry, no network: the Shelf, Stats and the Timeline
// all ask the same question ("when was this finished, each time?") and get the
// answer from here.

export interface PastFinish {
  /** 'YYYY-MM-DD', or null when it was not recorded. */
  started: string | null
  completed: string | null
}

export interface Finish {
  /** The day it was finished, or null for a finish with no date recorded. */
  date: string | null
  started: string | null
  /** 1 for the first time through, 2 for the second, and so on. */
  nth: number
  /** How many times it has been finished in all. */
  of: number
  /** True for the finish the entry's own dates describe. */
  current: boolean
}

interface FinishSource {
  status: string
  date_started: string | null
  date_completed: string | null
  metadata?: Record<string, unknown> | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (v: unknown): string | null => (typeof v === 'string' && DAY.test(v) ? v : null)

/** The earlier finishes stored on an entry, oldest first. Malformed rows are dropped. */
export function pastFinishesOf(e: { metadata?: Record<string, unknown> | null }): PastFinish[] {
  const raw = e.metadata?.past_finishes
  if (!Array.isArray(raw)) return []
  const out: PastFinish[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const row = r as Record<string, unknown>
    out.push({ started: day(row.started), completed: day(row.completed) })
  }
  return sortPast(out)
}

/** Oldest first. A finish with no date sorts first: an unknown date is an old one far more often than a new one. */
export function sortPast(list: PastFinish[]): PastFinish[] {
  return [...list].sort((a, b) => (a.completed ?? '').localeCompare(b.completed ?? ''))
}

/**
 * Every time an entry has been finished, oldest first. The earlier finishes
 * count whatever the entry's status is now: something you are halfway through
 * rereading was still finished the first time.
 */
export function finishesOf(e: FinishSource): Finish[] {
  const past = pastFinishesOf(e)
  const hasCurrent = e.status === 'completed'
  const of = past.length + (hasCurrent ? 1 : 0)
  const out: Finish[] = past.map((p, i) => ({ date: p.completed, started: p.started, nth: i + 1, of, current: false }))
  if (hasCurrent) out.push({ date: e.date_completed, started: e.date_started, nth: of, of, current: true })
  return out
}

export function timesFinished(e: FinishSource): number {
  return pastFinishesOf(e).length + (e.status === 'completed' ? 1 : 0)
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const last = n % 10
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}
