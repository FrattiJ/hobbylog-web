import type { Entry } from '@/types/database'
import { hoursRemaining } from './windows'

// Plan to a date: given the hours you have each week and a day to be done by,
// which of the things you own fit, and when would each be finished?
//
// What Next already answers "what should I start". This answers a different
// question, the one a deadline asks: a holiday, the end of the year, a sequel
// coming out. It is arithmetic over lengths the library already knows, so it is
// a pure function and the page can redraw it on every keystroke.

export type PlanMode = 'balanced' | 'finishes' | 'long'

export const PLAN_MODES: Array<{ id: PlanMode; label: string; blurb: string }> = [
  { id: 'balanced', label: 'Balanced', blurb: 'What you are in the middle of comes first, then your backlog in the order Next Up would pick it.' },
  { id: 'finishes', label: 'More Finishes', blurb: 'What you are in the middle of comes first, then the shortest things, to finish as many as the time allows.' },
  { id: 'long', label: 'Longer Ones', blurb: 'What you are in the middle of comes first, then the longest thing that fits, with shorter ones around it.' },
]

export interface PlanItem {
  entry: Entry
  /** Hours still needed to finish it. */
  hours: number
  /** The day you would get to it, and the day you would be done, 'YYYY-MM-DD'. */
  start: string
  end: string
  /** Already in progress when the plan was made. */
  carried: boolean
}

export interface Plan {
  /** Days from today to the goal date. */
  days: number
  budgetHours: number
  items: PlanItem[]
  usedHours: number
  /** Budget left over. Below zero when a fixed plan runs past its date. */
  spareHours: number
  /** The day the last thing would be finished, or null for an empty plan. */
  finishBy: string | null
  /** Days between finishing and the goal date. Below zero when it runs past. */
  spareDays: number
  /** Left out because their length is not recorded, so no date could be honest. */
  unknownLength: number
  /** Left out because they would not fit in the time that remained. */
  didNotFit: number
}

export interface PlanInput {
  /** The library, already narrowed to the hobbies being planned for. */
  entries: Entry[]
  /** Backlog entry ids in the order Next Up ranks them; anything missing goes last. */
  rank?: string[]
  hoursPerWeek: number
  /** 'YYYY-MM-DD' */
  today: string
  goal: string
  mode: PlanMode
  /** Entries the reader has taken out of this plan. */
  exclude?: ReadonlySet<string>
  /**
   * A saved plan's own list, in its own order. When given, exactly these are
   * scheduled (those not yet finished), whether or not they still fit: a saved
   * plan that has fallen behind should say so, not quietly drop its last item.
   */
  only?: string[] | null
}

const DAY_MS = 86_400_000

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from one day to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS)
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function buildPlan(input: PlanInput): Plan {
  const { entries, today, goal, mode } = input
  const hoursPerWeek = Math.max(0, input.hoursPerWeek)
  const perDay = hoursPerWeek / 7
  const days = Math.max(0, daysBetween(today, goal))
  const budget = perDay * days
  const exclude = input.exclude ?? new Set<string>()
  const fixed = Array.isArray(input.only)

  // ── Candidates ─────────────────────────────────────────────────────────────
  let unknownLength = 0
  const pool: Array<{ entry: Entry; hours: number; carried: boolean }> = []
  const consider = (e: Entry) => {
    if (e.status !== 'backlog' && e.status !== 'in_progress') return
    if (exclude.has(e.id)) return
    const hours = hoursRemaining(e)
    if (hours == null) { unknownLength++; return }
    if (hours <= 0) return // nothing left to do: it only needs marking finished
    pool.push({ entry: e, hours, carried: e.status === 'in_progress' })
  }

  if (fixed) {
    const byId = new Map(entries.map((e) => [e.id, e]))
    for (const id of input.only!) { const e = byId.get(id); if (e) consider(e) }
  } else {
    for (const e of entries) consider(e)
    const rankOf = new Map((input.rank ?? []).map((id, i) => [id, i]))
    const order = (a: typeof pool[number], b: typeof pool[number]) => {
      // What is already underway always leads, closest to done first.
      if (a.carried !== b.carried) return a.carried ? -1 : 1
      if (a.carried) return a.hours - b.hours
      if (mode === 'finishes') return a.hours - b.hours
      if (mode === 'long') return b.hours - a.hours
      return (rankOf.get(a.entry.id) ?? 1e9) - (rankOf.get(b.entry.id) ?? 1e9)
    }
    pool.sort((a, b) => order(a, b) || a.entry.title.localeCompare(b.entry.title))
  }

  // ── Fill ───────────────────────────────────────────────────────────────────
  // Take things in order while they fit. Something too long is passed over, not
  // a stopping point: a shorter one further down may still fit behind it.
  const items: PlanItem[] = []
  let used = 0
  let didNotFit = 0
  // Each thing starts the day the one before it ends, so the dates read as one
  // unbroken run instead of overlapping by the part of a day rounding leaves.
  let endOffset = 0
  for (const c of pool) {
    if (!fixed && used + c.hours > budget + 1e-9) { didNotFit++; continue }
    const startOffset = endOffset
    used += c.hours
    endOffset = perDay > 0 ? Math.max(startOffset, Math.ceil(used / perDay - 1e-9)) : 0
    items.push({ entry: c.entry, hours: c.hours, start: addDays(today, startOffset), end: addDays(today, endOffset), carried: c.carried })
  }

  const finishBy = items.length ? items[items.length - 1].end : null
  return {
    days,
    budgetHours: round1(budget),
    items,
    usedHours: round1(used),
    spareHours: round1(budget - used),
    finishBy,
    spareDays: finishBy ? daysBetween(finishBy, goal) : days,
    unknownLength,
    didNotFit,
  }
}

// ── A saved plan, and how it is going ────────────────────────────────────────

export interface SavedPlan {
  hours_per_week: number
  goal_date: string
  mode: PlanMode
  /** What the plan held when it was saved, in its order. */
  entry_ids: string[]
  /** The day it was saved: progress is measured from here. */
  started_on: string
}

export interface PlanProgress {
  total: number
  finished: Entry[]
  /** Dropped, or deleted from the library, since the plan was saved. */
  gone: number
  hoursLogged: number
  /** Hours the plan expected by today at the pace it was saved with. */
  hoursExpected: number
  /** What is left, rescheduled from today at the saved pace. */
  remaining: Plan
  onTrack: boolean
  /** How many days past the goal date the rest would run. Zero when on track. */
  daysOver: number
  /** The goal date has gone by. */
  ended: boolean
}

export function planProgress(
  saved: SavedPlan,
  entries: Entry[],
  sessions: Array<{ entry_id: string; date: string; minutes: number }>,
  today: string,
): PlanProgress {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const inPlan = new Set(saved.entry_ids)
  const finished: Entry[] = []
  let gone = 0
  for (const id of saved.entry_ids) {
    const e = byId.get(id)
    if (!e || e.status === 'dropped') gone++
    else if (e.status === 'completed') finished.push(e)
  }

  const minutes = sessions
    .filter((s) => inPlan.has(s.entry_id) && s.date >= saved.started_on && s.date <= today)
    .reduce((t, s) => t + s.minutes, 0)
  const elapsed = Math.max(0, Math.min(daysBetween(saved.started_on, today), daysBetween(saved.started_on, saved.goal_date)))

  const remaining = buildPlan({
    entries, hoursPerWeek: saved.hours_per_week, today, goal: saved.goal_date, mode: saved.mode, only: saved.entry_ids,
  })
  const daysOver = remaining.items.length ? Math.max(0, -remaining.spareDays) : 0

  return {
    total: saved.entry_ids.length,
    finished,
    gone,
    hoursLogged: round1(minutes / 60),
    hoursExpected: round1((saved.hours_per_week / 7) * elapsed),
    remaining,
    onTrack: daysOver === 0,
    daysOver,
    ended: today > saved.goal_date,
  }
}
