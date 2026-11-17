import type { Entry, HobbyCategory } from '@/types/database'
import { isoDayOf } from './format'
import { HOBBY_MAP } from './hobbies'
import { finishesOf, pastFinishesOf } from './finishes'

// The Timeline: everything that happened in the library, in date order. It is
// built from what is already recorded (the three dates an entry carries, the
// sessions logged against it, and workouts) rather than from a journal of its
// own, so it is complete on the day it ships and needs nothing new filled in.
//
// Pure functions: entries and logs go in, a list of dated moments comes out.

export type MomentKind = 'finished' | 'started' | 'session' | 'workout' | 'added'

export interface TimelineSession {
  id?: string
  entry_id: string
  date: string
  minutes: number
  progress?: number | null
  notes?: string | null
  created_at?: string
}

export interface Moment {
  key: string
  kind: MomentKind
  /** 'YYYY-MM-DD' */
  date: string
  hobby: HobbyCategory
  /** The entry it is about. Null for a workout, and for a day's additions rolled into one row. */
  entry: Entry | null
  /** For a start or a finish: which time through (2 for a reread). */
  nth?: number
  minutes?: number
  progress?: number | null
  note?: string | null
  /** For additions rolled into one row: everything added that day. */
  entries?: Entry[]
}

/** More additions than this on one day read as an import, and are shown as one row. */
export const ADD_GROUP_LIMIT = 5

const KIND_ORDER: Record<MomentKind, number> = { finished: 0, started: 1, session: 2, workout: 3, added: 4 }

/** Every moment in the library, newest first. Additions are not yet rolled up: see groupAdditions. */
export function buildMoments(
  entries: Entry[],
  sessions: TimelineSession[],
  workouts: Array<{ date: string; minutes: number }> = [],
): Moment[] {
  const out: Moment[] = []
  const byId = new Map(entries.map((e) => [e.id, e]))

  // Which entries had a session on which day, so a recipe's "first made" is
  // not listed beside the cook that made it.
  const sessionDays = new Set(sessions.map((s) => `${s.entry_id}|${s.date}`))

  for (const e of entries) {
    if (e.hobby_category === 'fitness') continue
    const hobby = e.hobby_category
    const isRecipe = !!HOBBY_MAP[hobby]?.recipe
    const days = new Set<string>()

    for (const f of finishesOf(e)) {
      if (!f.date) continue
      if (isRecipe && sessionDays.has(`${e.id}|${f.date}`)) continue
      out.push({ key: `f:${e.id}:${f.nth}`, kind: 'finished', date: f.date, hobby, entry: e, nth: f.nth })
      days.add(f.date)
    }

    // A start is worth its own line only when it is not the day of the finish:
    // a film watched in one evening was started and finished in the same breath.
    const past = pastFinishesOf(e)
    const starts = [
      ...past.map((p, i) => ({ started: p.started, completed: p.completed, nth: i + 1 })),
      { started: e.date_started, completed: e.status === 'completed' ? e.date_completed : null, nth: past.length + 1 },
    ]
    for (const s of starts) {
      if (!s.started || s.started === s.completed) continue
      out.push({ key: `s:${e.id}:${s.nth}`, kind: 'started', date: s.started, hobby, entry: e, nth: s.nth })
      days.add(s.started)
    }

    // "Added" says nothing on a day that already says started or finished.
    const added = isoDayOf(e.created_at)
    if (added && !days.has(added)) out.push({ key: `a:${e.id}`, kind: 'added', date: added, hobby, entry: e })
  }

  sessions.forEach((s, i) => {
    const e = byId.get(s.entry_id)
    if (!e || !s.date) return
    out.push({
      key: `l:${s.id ?? `${s.entry_id}:${s.date}:${i}`}`, kind: 'session', date: s.date, hobby: e.hobby_category, entry: e,
      minutes: s.minutes, progress: s.progress ?? null, note: s.notes?.trim() || null,
    })
  })

  workouts.forEach((w, i) => {
    if (!w.date) return
    out.push({ key: `w:${w.date}:${i}`, kind: 'workout', date: w.date, hobby: 'fitness', entry: null, minutes: w.minutes })
  })

  return sortMoments(out)
}

export function sortMoments(list: Moment[]): Moment[] {
  return [...list].sort((a, b) =>
    b.date.localeCompare(a.date)
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.entry?.title ?? '').localeCompare(b.entry?.title ?? ''))
}

export type ShowFilter = 'all' | 'finished' | 'started' | 'session' | 'notes' | 'added'

export interface MomentFilter {
  hobby?: HobbyCategory | 'all'
  show?: ShowFilter
  /** Matched against the title and the note. */
  query?: string
  /** 'YYYY-MM': nothing after this month is listed. */
  upToMonth?: string | null
}

export function filterMoments(moments: Moment[], f: MomentFilter): Moment[] {
  const q = f.query?.trim().toLowerCase() ?? ''
  const show = f.show ?? 'all'
  return moments.filter((m) => {
    if (f.hobby && f.hobby !== 'all' && m.hobby !== f.hobby) return false
    if (show === 'notes') { if (!m.note) return false }
    else if (show === 'session') { if (m.kind !== 'session' && m.kind !== 'workout') return false }
    else if (show !== 'all' && m.kind !== show) return false
    if (f.upToMonth && m.date.slice(0, 7) > f.upToMonth) return false
    if (q && !(m.entry?.title.toLowerCase().includes(q) || m.note?.toLowerCase().includes(q))) return false
    return true
  })
}

/**
 * Roll a day's additions into one row when there are enough of them to be an
 * import. Two hundred "Added" lines for one afternoon would bury everything
 * else that month.
 */
export function groupAdditions(moments: Moment[], limit = ADD_GROUP_LIMIT): Moment[] {
  const perDay = new Map<string, Moment[]>()
  for (const m of moments) {
    if (m.kind !== 'added') continue
    const list = perDay.get(m.date)
    if (list) list.push(m); else perDay.set(m.date, [m])
  }
  const out: Moment[] = []
  const done = new Set<string>()
  for (const m of moments) {
    if (m.kind !== 'added') { out.push(m); continue }
    const day = perDay.get(m.date)!
    if (day.length <= limit) { out.push(m); continue }
    if (done.has(m.date)) continue
    done.add(m.date)
    const entries = day.map((d) => d.entry!).filter(Boolean)
    // The row takes the hobby most of the batch belongs to, for its colour.
    const counts = new Map<HobbyCategory, number>()
    for (const e of entries) counts.set(e.hobby_category, (counts.get(e.hobby_category) ?? 0) + 1)
    const hobby = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? m.hobby
    out.push({ key: `ag:${m.date}`, kind: 'added', date: m.date, hobby, entry: null, entries })
  }
  return out
}

export interface MonthSummary { finished: number; started: number; sessions: number; added: number; minutes: number }

/** What each month held, keyed 'YYYY-MM'. Counted over whatever list it is given. */
export function monthSummaries(moments: Moment[]): Map<string, MonthSummary> {
  const out = new Map<string, MonthSummary>()
  for (const m of moments) {
    const key = m.date.slice(0, 7)
    const s = out.get(key) ?? { finished: 0, started: 0, sessions: 0, added: 0, minutes: 0 }
    if (m.kind === 'finished') s.finished++
    else if (m.kind === 'started') s.started++
    else if (m.kind === 'added') s.added += m.entries?.length ?? 1
    else { s.sessions++; s.minutes += m.minutes ?? 0 }
    out.set(key, s)
  }
  return out
}

/**
 * The last thing written about each entry when a session was logged on it:
 * the reminder of where you left off. Later date wins, then later logging.
 */
export function latestNotes(sessions: TimelineSession[]): Map<string, { text: string; date: string }> {
  const best = new Map<string, { text: string; date: string; at: string }>()
  for (const s of sessions) {
    const text = s.notes?.trim()
    if (!text || !s.date) continue
    const at = s.created_at ?? ''
    const cur = best.get(s.entry_id)
    if (!cur || s.date > cur.date || (s.date === cur.date && at > cur.at)) best.set(s.entry_id, { text, date: s.date, at })
  }
  return new Map([...best.entries()].map(([id, v]) => [id, { text: v.text, date: v.date }]))
}
