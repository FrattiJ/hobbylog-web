import type { Entry } from '@/types/database'
import { HOBBY_MAP } from './hobbies'

// Reading/listening rates for turning a book's page/chapter counts into hours.
// These are estimates (real reading speed varies) — tune here if they feel off.
const READ_MIN_PER_PAGE = 1.5      // ~40 pages/hour, typical adult prose
const AUDIO_MIN_PER_PAGE = 1.8     // audiobook narration vs the print page count
const MANGA_MIN_PER_CHAPTER = 6    // manga / light-novel chapter
const COMIC_MIN_PER_ISSUE = 12     // single comic issue
const WEBTOON_MIN_PER_EPISODE = 5  // webtoon episode

// A book's length in hours. `count` is progress_total (full) or progress_current
// (spent), in the subtype's native unit (pages, chapters, issues, episodes).
function bookHours(e: Entry, count: number): number {
  if (!count) return 0
  const sub = e.book_subtype
  const perUnit =
    sub === 'audiobook' ? AUDIO_MIN_PER_PAGE :
    sub === 'manga' || sub === 'light_novel' ? MANGA_MIN_PER_CHAPTER :
    sub === 'comic' ? COMIC_MIN_PER_ISSUE :
    sub === 'webtoon' ? WEBTOON_MIN_PER_EPISODE :
    READ_MIN_PER_PAGE // 'book' and default
  return (count * perUnit) / 60
}

// Length of a RAW catalog row, before it's an entry. The suggestion engine scores
// brand-new titles against the same hour buckets your library is measured in, so
// both sides have to use the rates above rather than each inventing their own.
export type CatalogLength =
  | { kind: 'games'; timeToBeat?: number | null }
  | { kind: 'movies'; runtimeMin?: number | null }
  | { kind: 'tv'; episodes?: number | null; episodeRuntimeMin?: number | null }
  | { kind: 'books'; pages?: number | null }
  | { kind: 'manga'; chapters?: number | null }
  | { kind: 'audiobook'; runtimeMin?: number | null }

export function catalogHours(input: CatalogLength): number | null {
  const round = (h: number) => (h > 0 ? Math.round(h * 10) / 10 : null)
  switch (input.kind) {
    case 'games':     return round(Number(input.timeToBeat) || 0)
    case 'movies':    return round((Number(input.runtimeMin) || 0) / 60)
    case 'audiobook': return round((Number(input.runtimeMin) || 0) / 60)
    case 'tv': {
      const eps = Number(input.episodes) || 0
      if (!eps) return null
      return round((eps * (Number(input.episodeRuntimeMin) || 22)) / 60)
    }
    case 'books':     return round(((Number(input.pages) || 0) * READ_MIN_PER_PAGE) / 60)
    case 'manga':     return round(((Number(input.chapters) || 0) * MANGA_MIN_PER_CHAPTER) / 60)
  }
}

// Single source of truth for estimated hours so the dashboard and stats page can't drift.
// basis 'full'  — full length of each entry: games time-to-beat, whole movie runtime,
//                 every TV episode, a book's whole length. Use for backlog ("time
//                 remaining") and completed ("hours finished") estimates.
// basis 'spent' — time consumed so far: TV counts episodes watched, books count pages
//                 read. Games and movies use full length (no minute-level progress).
export function calcHours(items: Entry[], basis: 'full' | 'spent'): number {
  let total = 0
  for (const e of items) {
    if (e.hobby_category === 'games') {
      // progress_current holds actual hours played (Steam sync / manual). That's
      // the truth when present; fall back to the time-to-beat estimate for
      // unplayed games. 'spent' = time actually put in; 'full' prefers real hours.
      const played = Number(e.progress_current) || 0
      const ttb = Number(e.metadata?.time_to_beat) || 0
      total += basis === 'spent' ? played : (played > 0 ? played : ttb)
    } else if (e.hobby_category === 'movies' && e.progress_total) {
      total += e.progress_total / 60 // runtime, stored in minutes
    } else if (e.hobby_category === 'tv') {
      const episodes = basis === 'full' ? e.progress_total : e.progress_current
      if (episodes) {
        const minPerEp = (e.metadata?.episode_runtime as number) || 22
        total += (episodes * minPerEp) / 60
      }
    } else if (e.hobby_category === 'books') {
      if (e.book_subtype === 'audiobook') {
        // Prefer the real Audible listening length (minutes); fall back to a
        // page-based estimate for older OpenLibrary-sourced audiobooks. Progress
        // is tracked as a %, so scale the full length by it for 'spent'.
        const realMin = Number(e.metadata?.audio_runtime_min) || 0
        const fullH = realMin > 0 ? realMin / 60 : bookHours(e, Number(e.progress_total) || 0)
        total += basis === 'full' ? fullH : fullH * Math.min(1, (Number(e.progress_current) || 0) / 100)
      } else {
        // Reading/manga/comics: estimate from page/chapter counts.
        const count = basis === 'full' ? Number(e.progress_total) || 0 : Number(e.progress_current) || 0
        total += bookHours(e, count)
      }
    }
  }
  return Math.round(total * 10) / 10
}

// Like calcHours, but manual hobbies (projects/fitness/art) — which have no
// estimate — use the user's actually-logged session time instead. `loggedMinutes`
// maps entry id → total logged minutes.
export function calcHoursWithLogged(items: Entry[], loggedMinutes: Map<string, number>, basis: 'full' | 'spent'): number {
  const media = items.filter((e) => !HOBBY_MAP[e.hobby_category]?.manualOnly)
  let total = calcHours(media, basis)
  for (const e of items) {
    if (HOBBY_MAP[e.hobby_category]?.manualOnly) total += (loggedMinutes.get(e.id) ?? 0) / 60
  }
  return Math.round(total * 10) / 10
}
