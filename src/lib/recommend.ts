import type { Entry, HobbyCategory } from '@/types/database'
import { HOBBY_MAP } from './hobbies'
import {
  bucketFor, entryHours, isOngoingSeries, parseTags, tagsOf,
  type CategoryTaste, type TasteProfile,
} from './taste'

// ─────────────────────────────────────────────────────────────────────────────
// Scoring. Two things get scored with the same yardstick: items already in your
// backlog, and brand-new titles from the catalog. Everything here returns the
// numbers it used, so the UI can always say *why* — a recommendation you can't
// interrogate is just noise with a confident font.
// ─────────────────────────────────────────────────────────────────────────────

/** A title from the catalog that isn't in your library yet. */
export interface Candidate {
  external_id: string
  external_source: string
  title: string
  cover_url: string | null
  year: number | null
  hours: number | null
  tags: string[]
  /** The catalog's own score, 0–10. */
  communityRating: number | null
  category: HobbyCategory
  ongoing?: boolean
  /** Which entry of yours this was found through, when it came from a seed. */
  via?: string
  /** Enough of the catalog row to create a real entry straight from a suggestion. */
  progress_total: number | null
  metadata: Record<string, unknown>
  book_subtype?: string | null
}

export interface Fit {
  /** 0–1 overall. */
  score: number
  genre: number
  length: number
  startability: number
  reasons: string[]
}

interface FitInput {
  category: HobbyCategory
  hours: number | null
  tags: string[]
  ongoing: boolean
  title: string
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const hrs = (h: number) => (h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`)

// ── Genre fit ────────────────────────────────────────────────────────────────

function genreFit(tags: string[], taste: CategoryTaste | undefined): { score: number; reason: string | null } {
  if (!taste || tags.length === 0) return { score: 0.5, reason: null }

  const hits = tags
    .map((t) => taste.genres.find((g) => g.tag === t))
    .filter((g): g is NonNullable<typeof g> => !!g && g.evidence >= 0.5)
  if (hits.length === 0) return { score: 0.5, reason: null }

  // Weight each tag by how much evidence stands behind it, so a well-established
  // love of one genre isn't diluted by three tags you've barely touched.
  const totalEv = hits.reduce((a, g) => a + g.evidence, 0)
  const signed = hits.reduce((a, g) => a + g.score * g.evidence, 0) / totalEv
  const score = Math.max(0, Math.min(1, 0.5 + signed))

  const best = hits.reduce((a, b) => (b.score > a.score ? b : a))
  const worst = hits.reduce((a, b) => (b.score < a.score ? b : a))
  let reason: string | null = null
  if (best.score > 0.08 && best.finished > 0) {
    const decided = best.finished + best.abandoned
    reason = `${best.tag} — you've finished ${best.finished}${decided > best.finished ? ` of ${decided}` : ''}`
      + (best.avgRating != null ? ` and rate them ${Math.round(best.avgRating * 10) / 10}/10` : '')
  } else if (worst.score < -0.08 && worst.abandoned > 0) {
    reason = `${worst.tag} — you've abandoned ${worst.abandoned} of ${worst.finished + worst.abandoned}`
  }
  return { score, reason }
}

// ── Length fit ───────────────────────────────────────────────────────────────

function lengthFit(hours: number | null, taste: CategoryTaste | undefined, profile: TasteProfile): { score: number; reason: string | null } {
  if (hours == null || hours <= 0 || !taste) return { score: 0.5, reason: null }

  const bucket = bucketFor(taste.buckets, hours)
  if (!bucket) return { score: 0.5, reason: null }

  // Your measured finish rate at this length, nudged by whether your reviews
  // complain about things running long.
  let score = bucket.rate
  if (profile.lengthSensitivity > 0 && hours > (taste.medianFinishedHours ?? hours)) {
    score *= 1 - 0.25 * profile.lengthSensitivity
  }
  score = Math.max(0, Math.min(1, score))

  let reason: string | null = null
  const n = bucket.finished + bucket.abandoned
  if (n >= 2 && bucket.raw != null) {
    // Contrast against your worst-performing bucket that has real evidence — that
    // contrast is the whole "you finish short things, not long ones" insight.
    const worst = taste.buckets
      .filter((b) => b !== bucket && b.finished + b.abandoned >= 2 && b.raw != null)
      .sort((a, b) => a.raw! - b.raw!)[0]
    reason = `About ${hrs(hours)} — you finish ${pct(bucket.raw)} of ${HOBBY_MAP[taste.category].pluralLabel.toLowerCase()} this long`
      + (worst && worst.raw! < bucket.raw - 0.2 ? `, against ${pct(worst.raw!)} at ${worst.label}` : '')
  } else if (taste.longestFinishedHours != null && hours > taste.longestFinishedHours * 1.3 && taste.sample >= 4) {
    reason = `${hrs(hours)} is longer than anything you've finished here (${hrs(taste.longestFinishedHours)})`
  }
  return { score, reason }
}

// ── Startability: does it fit the time you actually have? ────────────────────

function startability(hours: number | null, profile: TasteProfile): { score: number; reason: string | null } {
  if (hours == null || hours <= 0 || profile.pace.hoursPerWeek <= 0) return { score: 0.5, reason: null }
  const weeks = hours / profile.pace.hoursPerWeek
  // A couple of weeks is the sweet spot; a six-month slog is where things die.
  const score = weeks <= 2 ? 1 : weeks <= 6 ? 0.8 : weeks <= 12 ? 0.5 : weeks <= 26 ? 0.25 : 0.1
  const reason = weeks >= 8
    ? `At your pace (${profile.pace.hoursPerWeek}h/week) that's about ${Math.round(weeks)} weeks`
    : weeks <= 2
      ? `Finishable in a week or two at your pace`
      : null
  return { score, reason }
}

// ── Combined fit ─────────────────────────────────────────────────────────────

export function fitFor(input: FitInput, profile: TasteProfile): Fit {
  const taste = profile.byCategory[input.category]
  const g = genreFit(input.tags, taste)
  const l = lengthFit(input.hours, taste, profile)
  const s = startability(input.hours, profile)

  let score = 0.44 * g.score + 0.36 * l.score + 0.20 * s.score
  const reasons = [g.reason, l.reason, s.reason].filter((r): r is string => !!r)

  // A still-running show never ends, which is a real risk if you have a history
  // of not finishing them.
  if (input.ongoing && taste?.ongoing) {
    const { finished, abandoned } = taste.ongoing
    const n = finished + abandoned
    if (n >= 2 && finished / n < 0.5) {
      score *= 0.75
      reasons.push(`Still airing — you've finished ${finished} of ${n} ongoing shows you started`)
    } else if (n < 2) {
      reasons.push('Still airing — open-ended commitment')
    }
  }

  return { score: Math.max(0, Math.min(1, score)), genre: g.score, length: l.score, startability: s.score, reasons }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1 — Next Up: what to start, from what you already own.
// ─────────────────────────────────────────────────────────────────────────────

export interface NextUpPick {
  entry: Entry
  score: number
  fit: Fit
  /** 1 = top of your own ranked backlog, 0 = bottom. */
  priorityScore: number
  priorityRank: number | null
  reasons: string[]
  /** Set when the engine disagrees with your own ranking. */
  override: string | null
}

/** Your manual ranking is a strong prior — it just isn't the whole story. */
const PRIORITY_WEIGHT = 0.35

export function pickNextUp(entries: Entry[], profile: TasteProfile, limit = 6): NextUpPick[] {
  const backlog = entries.filter((e) => e.status === 'backlog' && e.hobby_category !== 'fitness')
  if (backlog.length === 0) return []

  // Rank within each category, since priority numbers are per-category lists.
  const rankIn = new Map<string, { rank: number; of: number }>()
  for (const cat of new Set(backlog.map((e) => e.hobby_category))) {
    const list = backlog
      .filter((e) => e.hobby_category === cat)
      .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
    list.forEach((e, i) => rankIn.set(e.id, { rank: i + 1, of: list.length }))
  }

  const picks: NextUpPick[] = backlog.map((e) => {
    const r = rankIn.get(e.id)
    const priorityScore = r && r.of > 1 ? 1 - (r.rank - 1) / (r.of - 1) : 0.5
    const hours = entryHours(e) || null
    const fit = fitFor({
      category: e.hobby_category,
      hours,
      tags: tagsOf(e),
      ongoing: isOngoingSeries(e),
      title: e.title,
    }, profile)

    const score = PRIORITY_WEIGHT * priorityScore + (1 - PRIORITY_WEIGHT) * fit.score
    const reasons = [...fit.reasons]
    if (r && r.rank <= 3 && r.of >= 4) reasons.unshift(`You ranked this #${r.rank} of ${r.of}`)

    return { entry: e, score, fit, priorityScore, priorityRank: r?.rank ?? null, reasons, override: null }
  })

  picks.sort((a, b) => b.score - a.score)

  // Where the top pick isn't your own #1, say so plainly instead of quietly
  // reordering your list behind your back.
  const top = picks[0]
  if (top && top.priorityRank != null && top.priorityRank > 1) {
    const yourFirst = picks.find((p) => p.priorityRank === 1 && p.entry.hobby_category === top.entry.hobby_category)
    if (yourFirst && yourFirst.fit.score < top.fit.score - 0.08) {
      top.override = `You ranked ${yourFirst.entry.title} first, but this is the better fit right now`
    }
  }

  return picks.slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 3 — Discovery, rationed against how buried you already are.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many brand-new titles you've earned the right to be shown. Measured in
 * months of backlog at your own pace, not item count — 40 movies is a fortnight,
 * 40 JRPGs is two years. Never returns 0: there's always room for one thing
 * that's genuinely better than what you've got.
 */
export function discoverySlots(profile: TasteProfile): { slots: number; note: string } {
  const m = profile.backlogMonths
  if (m == null) {
    return { slots: 4, note: 'Not enough history to size your backlog yet' }
  }
  if (m <= 2) return { slots: 4, note: `Your backlog is about ${m} months deep — plenty of room` }
  if (m <= 6) return { slots: 3, note: `About ${m} months of backlog — a few new things is fine` }
  if (m <= 12) return { slots: 2, note: `About ${m} months of backlog. Two new ideas, no more` }
  if (m <= 24) return { slots: 1, note: `${m} months of backlog. One new idea, and only if it beats what you have` }
  return { slots: 1, note: `${Math.round(m / 12)} years of backlog at your current pace. Finish something first` }
}

/** What to ask the catalog for, derived from the profile. */
export interface DiscoveryBrief {
  category: HobbyCategory
  includeTags: string[]
  avoidTags: string[]
  /** Soft upper bound on length, from the length model. */
  maxHours: number | null
  seeds: Array<{ source: string; id: string; title: string }>
}

export function buildBrief(category: HobbyCategory, entries: Entry[], profile: TasteProfile): DiscoveryBrief | null {
  const taste = profile.byCategory[category]
  if (!taste) return null

  const include = taste.genres.filter((g) => g.score > 0.05 && g.evidence >= 1).slice(0, 4).map((g) => g.tag)
  const avoid = taste.genres.filter((g) => g.score < -0.1 && g.evidence >= 1).slice(-4).map((g) => g.tag)

  // The longest bucket you still finish more than half the time, with a little
  // headroom. Null when there isn't enough evidence to draw a line.
  let maxHours: number | null = null
  const good = taste.buckets.filter((b) => b.finished + b.abandoned >= 2 && b.raw != null && b.raw >= 0.5)
  if (good.length > 0) {
    const top = good[good.length - 1]
    maxHours = Number.isFinite(top.max) ? Math.round(top.max * 1.25) : null
  } else if (taste.longestFinishedHours != null && taste.sample >= 4) {
    maxHours = Math.round(taste.longestFinishedHours * 1.25)
  }

  // Seed from your best-loved finished titles — "more like this" beats genre
  // matching almost every time, and it's free.
  const seeds = entries
    .filter((e) => e.hobby_category === category && e.status === 'completed' && (e.rating ?? 0) >= 8 && e.external_id && e.external_source)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 3)
    .map((e) => ({ source: e.external_source!, id: e.external_id!, title: e.title }))

  if (include.length === 0 && seeds.length === 0) return null
  return { category, includeTags: include, avoidTags: avoid, maxHours, seeds }
}

// ── Candidate scoring + dedupe ───────────────────────────────────────────────

export interface DiscoveryPick {
  candidate: Candidate
  score: number
  fit: Fit
  reasons: string[]
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Drop anything you already have, by catalog id or by title. */
export function excludeOwned(candidates: Candidate[], entries: Entry[]): Candidate[] {
  const ids = new Set(entries.filter((e) => e.external_id).map((e) => `${e.external_source}:${e.external_id}`))
  const titles = new Set(entries.map((e) => normTitle(e.title)))
  const seen = new Set<string>()
  return candidates.filter((c) => {
    if (ids.has(`${c.external_source}:${c.external_id}`)) return false
    const nt = normTitle(c.title)
    if (titles.has(nt) || seen.has(nt)) return false
    seen.add(nt)
    return true
  })
}

export function scoreCandidates(candidates: Candidate[], profile: TasteProfile, brief: DiscoveryBrief | null): DiscoveryPick[] {
  const avoid = new Set(brief?.avoidTags ?? [])
  return candidates
    .map((c) => {
      const tags = c.tags.length ? c.tags : []
      const fit = fitFor({ category: c.category, hours: c.hours, tags, ongoing: !!c.ongoing, title: c.title }, profile)
      let score = fit.score
      const reasons = [...fit.reasons]

      // A well-reviewed title is a safer bet when your own history is thin on it.
      if (c.communityRating != null) {
        score += Math.max(-0.06, Math.min(0.08, (c.communityRating - 7) / 40))
        if (c.communityRating >= 8) reasons.push(`Rated ${Math.round(c.communityRating * 10) / 10}/10 by the catalog`)
      }
      if (c.via) reasons.unshift(`Because you rated ${c.via} highly`)
      if (tags.some((t) => avoid.has(t))) score *= 0.8

      return { candidate: c, score: Math.max(0, Math.min(1, score)), fit, reasons }
    })
    .sort((a, b) => b.score - a.score)
}

/** Tags for a raw catalog row, matching how library entries are tagged. */
export function candidateTags(metadata: Record<string, unknown>): string[] {
  return parseTags(metadata.genres, metadata.themes)
}

// ── Fetching candidates ──────────────────────────────────────────────────────
// The briefs go to /api/recommend, which holds the catalog keys; scoring stays
// here on the client, against the profile.

export interface CandidateResult {
  candidates: Candidate[]
  /** Upstreams that failed. Empty results plus no problems genuinely means "no matches". */
  problems: string[]
}

export async function fetchCandidates(briefs: Array<DiscoveryBrief & { subtype?: string | null }>): Promise<CandidateResult> {
  if (briefs.length === 0) return { candidates: [], problems: [] }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefs }),
      signal: ctrl.signal,
    })
    if (!res.ok) return { candidates: [], problems: [`the suggestion service returned ${res.status}`] }
    const data = await res.json()
    return {
      candidates: ((data.candidates ?? []) as Candidate[]).map((c) => ({ ...c, tags: parseTags(c.tags.join(', ')) })),
      problems: (data.problems ?? []) as string[],
    }
  } catch {
    return { candidates: [], problems: ['could not reach the suggestion service'] }
  } finally {
    clearTimeout(timer)
  }
}
