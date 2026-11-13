import type { Entry, HobbyCategory } from '@/types/database'
import { entryHours } from './taste'
import { readRecipe } from './recipe'
import { HOBBY_MAP } from './hobbies'

// How long an entry is, and which of a hobby's length bands it falls in. This
// is what the length filter and the length sort on a hobby page read.
//
// The bands differ by hobby on purpose. "Under 10 hours" separates games and
// says nothing about films, every one of which would land in it; a film is
// short or long on a scale of minutes. Each hobby gets the cuts that split its
// own library into useful piles.

export interface LengthBand {
  id: string
  label: string
  /** Hours: `min` is included, `max` is not. */
  min: number
  max: number
}

const LONG_FORM: LengthBand[] = [
  { id: 'short',  label: 'Under 10h', min: 0,  max: 10 },
  { id: 'medium', label: '10–30h',    min: 10, max: 30 },
  { id: 'long',   label: '30–60h',    min: 30, max: 60 },
  { id: 'epic',   label: '60h or more', min: 60, max: Infinity },
]

const BANDS: Partial<Record<HobbyCategory, LengthBand[]>> = {
  games: LONG_FORM,
  tv: LONG_FORM,
  movies: [
    { id: 'short',  label: 'Under 1h30',     min: 0,   max: 1.5 },
    { id: 'medium', label: '1h30–2h',        min: 1.5, max: 2 },
    { id: 'long',   label: '2h–2h30',        min: 2,   max: 2.5 },
    { id: 'epic',   label: '2h30 or more',   min: 2.5, max: Infinity },
  ],
  books: [
    { id: 'short',  label: 'Under 5h',    min: 0,  max: 5 },
    { id: 'medium', label: '5–10h',       min: 5,  max: 10 },
    { id: 'long',   label: '10–20h',      min: 10, max: 20 },
    { id: 'epic',   label: '20h or more', min: 20, max: Infinity },
  ],
  cooking: [
    { id: 'short',  label: 'Under 30 min',    min: 0,   max: 0.5 },
    { id: 'medium', label: '30–60 min',       min: 0.5, max: 1 },
    { id: 'long',   label: 'An hour or more', min: 1,   max: Infinity },
  ],
}

/** The length bands a hobby offers, or an empty list when length means nothing for it. */
export function lengthBandsFor(hobby: HobbyCategory): LengthBand[] {
  return BANDS[hobby] ?? []
}

/**
 * An entry's full length in hours, or null when it is not known. Null has to
 * stay apart from zero: an entry with no page count is not a five-minute read,
 * and it should sit outside every band rather than in the shortest one.
 */
export function lengthHours(e: Entry): number | null {
  if (HOBBY_MAP[e.hobby_category]?.recipe) {
    const mins = readRecipe(e.metadata).cook_minutes
    return mins ? mins / 60 : null
  }
  // A film's bands are cut in minutes, so read its runtime exactly. The shared
  // hours figure is rounded to a tenth of an hour, which is six minutes: enough
  // to put an 89-minute film on the wrong side of the 1h30 line.
  if (e.hobby_category === 'movies' && e.progress_total) return e.progress_total / 60
  const h = entryHours(e)
  return h > 0 ? h : null
}

/** The band an entry falls in, or null when its length is unknown. */
export function lengthBandOf(e: Entry): LengthBand | null {
  const h = lengthHours(e)
  if (h == null) return null
  return lengthBandsFor(e.hobby_category).find((b) => h >= b.min && h < b.max) ?? null
}

/**
 * An entry's genres as written, for filtering. Unlike the taste model's tags
 * this keeps the broad ones ("Adventure", "Drama"): they separate nothing for
 * a recommendation, but they are exactly what someone filters a shelf by.
 */
export function genresOf(e: Pick<Entry, 'metadata'>): string[] {
  const raw = e.metadata?.genres
  const parts = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string' ? raw.split(/[,|]/) : []
  const out: string[] = []
  for (const p of parts) {
    const g = p.trim()
    if (!g || g.length > 40) continue
    if (!out.some((x) => x.toLowerCase() === g.toLowerCase())) out.push(g)
  }
  return out
}

/** Every genre in a set of entries with how many carry it, most common first. */
export function genreCounts(entries: Array<Pick<Entry, 'metadata'>>): Array<{ genre: string; count: number }> {
  const byKey = new Map<string, { genre: string; count: number }>()
  for (const e of entries) {
    for (const g of genresOf(e)) {
      const key = g.toLowerCase()
      const cur = byKey.get(key)
      if (cur) cur.count++
      else byKey.set(key, { genre: g, count: 1 })
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
}
