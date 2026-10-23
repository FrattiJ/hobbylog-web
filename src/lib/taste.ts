import type { Entry, HobbyCategory } from '@/types/database'
import { calcHours } from './hours'
import type { SessionActivity } from './db'

// ─────────────────────────────────────────────────────────────────────────────
// Taste profile: everything the suggestion engine knows about you, derived
// entirely from your own library. No model calls, no network — a pure function
// over entries + the session log, so it is cheap enough to recompute on render
// and can be reasoned about (and tested) line by line.
//
// The guiding idea is that every entry is *evidence*, not just a row. Finishing
// something is a vote for it; dropping it early is a vote against; leaving it
// half-played for eight months is a quieter vote against. Each signal below is
// built out of that one notion.
// ─────────────────────────────────────────────────────────────────────────────

/** An entry is "stalled" once it has been in progress and untouched this long. */
export const STALL_DAYS = 30
/** Evidence older than this counts for half as much. */
const RECENCY_HALF_LIFE_DAYS = 730
/** Added to a genre's evidence total so thin genres shrink toward neutral. */
const GENRE_SMOOTHING = 2.5
/** Below this much evidence in a category, say so rather than bluffing. */
const MIN_CONFIDENT_SAMPLE = 8

// Genre strings that are true of nearly everything and so separate nothing.
const USELESS_GENRES = new Set([
  'fiction', 'nonfiction', 'non-fiction', 'general', 'literature', 'novel',
  'books', 'audiobooks', 'ebook', 'indie', 'adventure', 'drama', 'misc',
  'miscellaneous', 'other', 'english fiction', 'reading', 'tv', 'television',
])

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, (Date.now() - t) / DAY)
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Split a metadata genre/theme string into clean, comparable tags. */
export function parseTags(...raw: unknown[]): string[] {
  const out: string[] = []
  for (const r of raw) {
    if (typeof r !== 'string') continue
    for (const part of r.split(/[,/|]/)) {
      const tag = part.trim().toLowerCase()
      if (!tag || tag.length > 32) continue
      if (USELESS_GENRES.has(tag)) continue
      if (!out.includes(tag)) out.push(tag)
    }
  }
  return out
}

/** Tags for one entry — genres plus IGDB themes, which carry the commitment shape. */
export function tagsOf(e: Pick<Entry, 'metadata'>): string[] {
  return parseTags(e.metadata?.genres, e.metadata?.themes)
}

/**
 * Full length of one entry in hours, in the same currency the rest of the app
 * uses. Games prefer IGDB's "main story" time over whatever has been played, so
 * an abandoned 80-hour game still counts as an 80-hour commitment.
 */
export function entryHours(e: Entry): number {
  if (e.hobby_category === 'games') {
    const ttb = e.metadata?.ttb as { normally?: number; hastily?: number; completely?: number } | undefined
    const est = ttb?.normally ?? ttb?.hastily ?? ttb?.completely ?? (Number(e.metadata?.time_to_beat) || 0)
    if (est > 0) return est
    return Number(e.progress_current) || 0
  }
  return calcHours([e], 'full')
}

/** How far through an entry you got, 0–1, or null when it can't be known. */
export function progressFraction(e: Entry): number | null {
  if (e.status === 'completed') return 1
  const total = Number(e.progress_total) || 0
  const cur = Number(e.progress_current) || 0
  if (e.hobby_category === 'games') {
    const full = entryHours(e)
    return full > 0 ? Math.min(1, cur / full) : null
  }
  if (e.hobby_category === 'movies' || (e.hobby_category === 'books' && e.book_subtype === 'audiobook')) {
    return Math.min(1, cur / 100) // tracked as a percentage
  }
  if (total > 0) return Math.min(1, cur / total)
  return null
}

/**
 * When you last actually engaged with an entry, and how well we know it.
 *
 * `updated_at` is the obvious candidate and the wrong one: it moves for any write
 * to the row, so a Steam sync, a time-to-beat backfill or a genre sweep all used
 * to make a long-abandoned game look freshly played. Those writes now pass
 * `touch: false`, but rows touched before that fix still carry a bogus date — so
 * the precise signals win outright rather than being max()'d against it.
 *
 *  - 'steam'   Steam's own last-played timestamp. Ground truth for a game.
 *  - 'session' a session you logged by hand.
 *  - 'updated' the row's updated_at. A fallback, and treated as approximate.
 */
export type TouchSource = 'steam' | 'session' | 'updated'

export function lastTouched(e: Entry, activity: SessionActivity): { date: string; source: TouchSource } {
  const session = activity.byEntry.get(e.id)?.lastDate ?? null
  const steam = typeof e.metadata?.steam_last_played === 'string'
    ? (e.metadata.steam_last_played as string)
    : null

  // Both precise signals mean real engagement, so the later one is the answer.
  if (steam && session) {
    return steam >= session ? { date: steam, source: 'steam' } : { date: session, source: 'session' }
  }
  if (steam) return { date: steam, source: 'steam' }
  if (session) return { date: session, source: 'session' }
  return { date: e.updated_at, source: 'updated' }
}

/** A still-running show is an open-ended commitment, not a finite one. */
export function isOngoingSeries(e: Entry): boolean {
  if (e.hobby_category !== 'tv') return false
  if (e.metadata?.in_production === true) return true
  const st = String(e.metadata?.show_status ?? '').toLowerCase()
  return st === 'returning series' || st === 'in production' || st === 'planned'
}

// ── Review text: do you complain about length? ────────────────────────────────

const PACING_COMPLAINT = /\b(bloat(ed)?|too long|drag(s|ged|gy)?|padd(ed|ing)|filler|slog|repetitive|overstay|outstay|tedious|grind(y)?|dull stretch|lost interest|burn(ed|t) out)\b/i
const PACING_PRAISE = /\b(tight|concise|brisk|no filler|never outstays|doesn'?t overstay|lean|focused|perfect length|just the right length|breezy)\b/i

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface GenreAffinity {
  tag: string
  /** −1 (you bounce off these) … +1 (you reliably finish and rate these high). */
  score: number
  /** How much evidence backs it up — sum of the absolute per-entry weights. */
  evidence: number
  finished: number
  abandoned: number
  avgRating: number | null
}

export interface LengthBucket {
  label: string
  /** Inclusive lower bound, exclusive upper bound, in hours. */
  min: number
  max: number
  finished: number
  abandoned: number
  /** Finish rate, smoothed toward your overall rate where evidence is thin. */
  rate: number
  raw: number | null
}

export interface CategoryTaste {
  category: HobbyCategory
  genres: GenreAffinity[]
  buckets: LengthBucket[]
  overallFinishRate: number
  medianFinishedHours: number | null
  longestFinishedHours: number | null
  abandonedMedianHours: number | null
  /** Finish rate for still-running shows vs. ended ones (TV only). */
  ongoing: { finished: number; abandoned: number } | null
  sample: number
  confident: boolean
}

export interface StalledItem {
  entry: Entry
  daysSinceTouch: number
  progressPct: number | null
  hoursRemaining: number | null
  verdict: 'finish' | 'drop' | 'unclear'
  reason: string
  /** Where the idle date came from, so the UI never states a guess as a fact. */
  touchedAt: string
  touchSource: TouchSource
}

export interface TasteProfile {
  byCategory: Partial<Record<HobbyCategory, CategoryTaste>>
  stalled: StalledItem[]
  /** Hours of attention you actually have, measured from your own history. */
  pace: { hoursPerWeek: number; basis: 'sessions' | 'completions' | 'none' }
  backlogHours: number
  /** Backlog measured in months of *you* — the honest unit for "am I overloaded". */
  backlogMonths: number | null
  /** 0–1: how much your written reviews complain about things running long. */
  lengthSensitivity: number
  ratingBaseline: { mean: number; sd: number; count: number } | null
  totalEvidence: number
}

// ── Evidence weighting ───────────────────────────────────────────────────────

interface Evidence {
  entry: Entry
  /** Signed −1…+1: did this go well? */
  sentiment: number
  /** 0…1: how much this single entry should count. */
  weight: number
  finished: boolean
  abandoned: boolean
}

function ratingBaseline(entries: Entry[]): { mean: number; sd: number; count: number } | null {
  const rs = entries.map((e) => e.rating).filter((r): r is number => r != null)
  if (rs.length === 0) return null
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length)
  return { mean, sd, count: rs.length }
}

/**
 * Turn a rating into −1…+1. Someone who rates everything 8–9 gives no signal on
 * an absolute scale, so once there are enough ratings we score against their own
 * distribution instead of against 10.
 */
function normalizeRating(r: number, base: { mean: number; sd: number; count: number } | null): number {
  if (base && base.count >= 5 && base.sd >= 0.5) {
    return Math.max(-1, Math.min(1, (r - base.mean) / (base.sd * 2)))
  }
  return Math.max(-1, Math.min(1, (r - 6.5) / 3.5))
}

function recencyWeight(e: Entry): number {
  const age = daysSince(e.date_completed ?? e.updated_at ?? e.created_at)
  if (age == null) return 1
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS)
}

function buildEvidence(entries: Entry[], activity: SessionActivity, base: ReturnType<typeof ratingBaseline>): Evidence[] {
  const out: Evidence[] = []
  for (const e of entries) {
    const recency = recencyWeight(e)
    const frac = progressFraction(e)

    if (e.status === 'completed') {
      // Finishing is the strongest positive there is. A rating sharpens it, and
      // can even turn it negative — you finished it and you didn't like it.
      const r = e.rating != null ? normalizeRating(e.rating, base) : 0.45
      out.push({ entry: e, sentiment: Math.max(-0.6, r), weight: recency, finished: true, abandoned: r < -0.3 })
      continue
    }

    if (e.status === 'dropped') {
      // Bailing at 10% is a much louder "not for me" than bailing at 85%.
      const depth = frac ?? 0.2
      const sentiment = -1 + 0.8 * Math.min(1, depth) // −1 early … −0.2 near the end
      const r = e.rating != null ? normalizeRating(e.rating, base) : null
      out.push({
        entry: e,
        sentiment: r != null ? (sentiment + r) / 2 : sentiment,
        weight: recency,
        finished: false,
        abandoned: true,
      })
      continue
    }

    if (e.status === 'in_progress') {
      const idle = daysSince(lastTouched(e, activity).date) ?? 0
      if (idle >= STALL_DAYS) {
        // Quiet abandonment. Weaker evidence than a real drop, and weaker still
        // when you were nearly done (that reads as life getting in the way).
        const depth = frac ?? 0.3
        const stallness = Math.min(1, idle / 180)
        out.push({
          entry: e,
          sentiment: -0.7 * stallness * (1 - 0.7 * Math.min(1, depth)),
          weight: recency * 0.7,
          finished: false,
          abandoned: depth < 0.7 && idle >= 90,
        })
      } else {
        out.push({ entry: e, sentiment: 0.35, weight: recency * 0.5, finished: false, abandoned: false })
      }
      continue
    }

    // Backlog. Stated intent, not revealed preference — so it barely counts, and
    // something you ranked and then ignored for a year counts slightly against.
    const sat = daysSince(e.created_at) ?? 0
    if (sat > 240) {
      out.push({ entry: e, sentiment: -0.25, weight: 0.2, finished: false, abandoned: false })
    }
  }
  return out
}

// ── Genre affinity ───────────────────────────────────────────────────────────

function buildGenreAffinity(evidence: Evidence[]): GenreAffinity[] {
  interface Acc { signed: number; evidence: number; finished: number; abandoned: number; ratings: number[] }
  const acc = new Map<string, Acc>()
  for (const ev of evidence) {
    for (const tag of tagsOf(ev.entry)) {
      const a = acc.get(tag) ?? { signed: 0, evidence: 0, finished: 0, abandoned: 0, ratings: [] }
      a.signed += ev.sentiment * ev.weight
      a.evidence += ev.weight
      if (ev.finished) a.finished++
      if (ev.abandoned) a.abandoned++
      if (ev.entry.rating != null) a.ratings.push(ev.entry.rating)
      acc.set(tag, a)
    }
  }
  return [...acc.entries()]
    .map(([tag, a]) => ({
      tag,
      // Smoothing is what stops one lucky 10/10 from crowning a whole genre.
      score: a.signed / (a.evidence + GENRE_SMOOTHING),
      evidence: Math.round(a.evidence * 100) / 100,
      finished: a.finished,
      abandoned: a.abandoned,
      avgRating: a.ratings.length ? a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length : null,
    }))
    .sort((a, b) => b.score - a.score)
}

// ── Length tolerance ─────────────────────────────────────────────────────────

const BUCKET_DEFS: Array<{ label: string; min: number; max: number }> = [
  { label: 'under 5h',  min: 0,   max: 5 },
  { label: '5–15h',     min: 5,   max: 15 },
  { label: '15–30h',    min: 15,  max: 30 },
  { label: '30–60h',    min: 30,  max: 60 },
  { label: '60–100h',   min: 60,  max: 100 },
  { label: '100h+',     min: 100, max: Infinity },
]

function buildBuckets(evidence: Evidence[], overallRate: number): LengthBucket[] {
  return BUCKET_DEFS.map((def) => {
    let finished = 0, abandoned = 0
    for (const ev of evidence) {
      if (!ev.finished && !ev.abandoned) continue
      const h = entryHours(ev.entry)
      if (h <= 0) continue
      if (h < def.min || h >= def.max) continue
      if (ev.finished) finished++
      else abandoned++
    }
    const n = finished + abandoned
    const raw = n > 0 ? finished / n : null
    // Pull thin buckets toward your overall finish rate rather than claiming 0% or
    // 100% off a single data point.
    const PRIOR = 2
    const rate = (finished + overallRate * PRIOR) / (n + PRIOR)
    return { ...def, finished, abandoned, rate, raw }
  })
}

export function bucketFor(buckets: LengthBucket[], hours: number): LengthBucket | null {
  return buckets.find((b) => hours >= b.min && hours < b.max) ?? null
}

// ── Per-category profile ─────────────────────────────────────────────────────

function buildCategoryTaste(category: HobbyCategory, evidence: Evidence[]): CategoryTaste {
  const mine = evidence.filter((ev) => ev.entry.hobby_category === category)
  const decided = mine.filter((ev) => ev.finished || ev.abandoned)
  const finishedCount = decided.filter((ev) => ev.finished).length
  const overallFinishRate = decided.length > 0 ? finishedCount / decided.length : 0.5

  const finishedHours = mine.filter((ev) => ev.finished).map((ev) => entryHours(ev.entry)).filter((h) => h > 0)
  const abandonedHours = mine.filter((ev) => ev.abandoned).map((ev) => entryHours(ev.entry)).filter((h) => h > 0)

  let ongoing: CategoryTaste['ongoing'] = null
  if (category === 'tv') {
    ongoing = { finished: 0, abandoned: 0 }
    for (const ev of decided) {
      if (!isOngoingSeries(ev.entry)) continue
      if (ev.finished) ongoing.finished++
      else ongoing.abandoned++
    }
  }

  return {
    category,
    genres: buildGenreAffinity(mine),
    buckets: buildBuckets(mine, overallFinishRate),
    overallFinishRate,
    medianFinishedHours: median(finishedHours),
    longestFinishedHours: finishedHours.length ? Math.max(...finishedHours) : null,
    abandonedMedianHours: median(abandonedHours),
    ongoing,
    sample: decided.length,
    confident: decided.length >= MIN_CONFIDENT_SAMPLE,
  }
}

// ── Stalled items ────────────────────────────────────────────────────────────

function buildStalled(entries: Entry[], activity: SessionActivity, byCategory: TasteProfile['byCategory']): StalledItem[] {
  const out: StalledItem[] = []
  for (const e of entries) {
    if (e.status !== 'in_progress') continue
    const touch = lastTouched(e, activity)
    const idle = daysSince(touch.date)
    if (idle == null || idle < STALL_DAYS) continue

    const frac = progressFraction(e)
    const full = entryHours(e)
    const remaining = full > 0 && frac != null ? Math.round(full * (1 - frac) * 10) / 10 : null

    // Does your history say you like this kind of thing, independent of this item?
    const taste = byCategory[e.hobby_category]
    const tags = tagsOf(e)
    const affinity = taste && tags.length
      ? tags.map((t) => taste.genres.find((g) => g.tag === t)?.score ?? 0).reduce((a, b) => a + b, 0) / tags.length
      : 0

    let verdict: StalledItem['verdict'] = 'unclear'
    let reason = ''
    if (frac != null && frac >= 0.6) {
      verdict = 'finish'
      reason = remaining != null && remaining <= 5
        ? `${Math.round(frac * 100)}% done — about ${remaining}h left. Finish it.`
        : `${Math.round(frac * 100)}% done and idle ${Math.round(idle)} days. You're past the hard part.`
    } else if (remaining != null && remaining <= 2) {
      verdict = 'finish'
      reason = `Only about ${remaining}h left. Clear it.`
    } else if (idle >= 90 && (frac == null || frac < 0.25) && affinity <= 0.02) {
      verdict = 'drop'
      reason = tags.length
        ? `Untouched ${Math.round(idle)} days, barely started, and you don't finish ${tags[0]} much. Let it go.`
        : `Untouched ${Math.round(idle)} days and barely started. Let it go.`
    } else if (idle >= 150) {
      verdict = 'drop'
      reason = `Five months untouched${frac != null ? ` at ${Math.round(frac * 100)}%` : ''}. Drop it or restart it deliberately.`
    } else {
      reason = `Idle ${Math.round(idle)} days${frac != null ? ` at ${Math.round(frac * 100)}%` : ''}.`
    }

    out.push({
      entry: e,
      daysSinceTouch: Math.round(idle),
      progressPct: frac != null ? Math.round(frac * 100) : null,
      hoursRemaining: remaining,
      verdict,
      reason,
      touchedAt: touch.date,
      touchSource: touch.source,
    })
  }
  // Easiest wins first, then the clear-outs, then the murky ones.
  const rank = { finish: 0, drop: 1, unclear: 2 }
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict] || (a.hoursRemaining ?? 1e9) - (b.hoursRemaining ?? 1e9))
}

// ── Pace ─────────────────────────────────────────────────────────────────────

function buildPace(entries: Entry[], activity: SessionActivity): TasteProfile['pace'] {
  const WINDOW = 84 // 12 weeks
  const sessionMinutes = activity.log
    .filter((r) => (daysSince(r.date) ?? 1e9) <= WINDOW)
    .reduce((a, r) => a + r.minutes, 0)
  const fromSessions = sessionMinutes / 60 / 12

  // Most people don't log a session for every movie, so completions are usually
  // the truer measure of throughput. Take whichever says you have more time.
  const recentlyDone = entries.filter((e) => e.status === 'completed' && (daysSince(e.date_completed) ?? 1e9) <= WINDOW)
  const fromCompletions = recentlyDone.reduce((a, e) => a + entryHours(e), 0) / 12

  const hoursPerWeek = Math.max(fromSessions, fromCompletions)
  if (hoursPerWeek <= 0) return { hoursPerWeek: 0, basis: 'none' }
  return {
    hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
    basis: fromCompletions >= fromSessions ? 'completions' : 'sessions',
  }
}

function buildLengthSensitivity(entries: Entry[]): number {
  let complaints = 0, praise = 0
  for (const e of entries) {
    const text = e.notes
    if (!text || text.length < 12) continue
    if (PACING_COMPLAINT.test(text)) complaints++
    if (PACING_PRAISE.test(text)) praise++
  }
  const total = complaints + praise
  if (total === 0) return 0
  // Shrunk toward 0 so one grumpy review doesn't rewrite the whole model.
  return Math.round(((complaints - praise * 0.5) / (total + 3)) * 100) / 100
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function buildTasteProfile(entries: Entry[], activity: SessionActivity): TasteProfile {
  // Fitness lives outside web_entries and has no "finish" notion, so it can't
  // contribute to or receive suggestions.
  const relevant = entries.filter((e) => e.hobby_category !== 'fitness')
  const base = ratingBaseline(relevant)
  const evidence = buildEvidence(relevant, activity, base)

  const categories = [...new Set(relevant.map((e) => e.hobby_category))]
  const byCategory: TasteProfile['byCategory'] = {}
  for (const c of categories) byCategory[c] = buildCategoryTaste(c, evidence)

  const backlog = relevant.filter((e) => e.status === 'backlog')
  const backlogHours = Math.round(backlog.reduce((a, e) => a + entryHours(e), 0) * 10) / 10
  const pace = buildPace(relevant, activity)
  const weeksOfBacklog = pace.hoursPerWeek > 0 ? backlogHours / pace.hoursPerWeek : null

  return {
    byCategory,
    stalled: buildStalled(relevant, activity, byCategory),
    pace,
    backlogHours,
    backlogMonths: weeksOfBacklog != null ? Math.round((weeksOfBacklog / 4.345) * 10) / 10 : null,
    lengthSensitivity: buildLengthSensitivity(relevant),
    ratingBaseline: base,
    totalEvidence: evidence.filter((ev) => ev.finished || ev.abandoned).length,
  }
}
