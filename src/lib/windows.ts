import type { Entry } from '@/types/database'
import { entryHours, progressFraction } from './taste'
import { HOBBY_MAP } from './hobbies'

// Hobby time windows: the recurring weekly blocks you actually have free, and
// the matching of backlog items to them.
//
// The point of this file is a question the taste model can't answer. buildPace()
// knows how many hours a week you get; it has no idea what shape they come in.
// "9 hours a week" is one Sunday afternoon or eighteen half-hours before bed,
// and a 40-hour RPG is reachable in the first and effectively unreachable in the
// second. Everything here works from declared windows -> available hours in a
// specific sitting -> which items that sitting can actually close out.
//
// Every function here is pure. That matters: the app sits behind hosted Supabase
// auth, so this logic has to be verifiable without a logged-in page.

export interface TimeWindow {
  id: string
  label: string | null
  /** 0 = Sunday .. 6 = Saturday, matching web_routines.day_of_week. */
  day_of_week: number
  /** Minutes from midnight on day_of_week. */
  start_min: number
  /** Minutes from the same midnight; may exceed 1440 for a block past midnight. */
  end_min: number
  /** 0-1: the fraction of the block that realistically goes to a hobby. */
  share: number
  active: boolean
  created_at: string
}

export type NewTimeWindow = Omit<TimeWindow, 'id' | 'created_at'>

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// Mirrors the CHECK constraints in 0008_time_windows.sql.
export const MAX_START_MIN = 1439
export const MAX_END_MIN = 2879
export const MAX_SPAN_MIN = 1440

// ── Window arithmetic ────────────────────────────────────────────────────────

/** Wall-clock length of the block, ignoring the share factor. */
export function spanMinutes(w: TimeWindow): number {
  return Math.max(0, w.end_min - w.start_min)
}

export function clampShare(share: number): number {
  const s = Number(share)
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(1, s)
}

/**
 * The honest number: wall-clock length scaled by the share factor. A 2h15m block
 * marked as half-shared with chores is about 1h08m of hobby time, and every
 * downstream calculation uses this rather than the raw span, because planning
 * against the span is how a schedule ends up lying to you.
 */
export function hobbyMinutes(w: TimeWindow): number {
  return Math.round(spanMinutes(w) * clampShare(w.share))
}

export function hobbyHours(w: TimeWindow): number {
  return Math.round((hobbyMinutes(w) / 60) * 100) / 100
}

/** Declared hobby hours per week across the active windows. */
export function weeklyHobbyHours(windows: TimeWindow[]): number {
  const total = windows.filter((w) => w.active).reduce((a, w) => a + hobbyMinutes(w), 0)
  return Math.round((total / 60) * 10) / 10
}

/** Longest single sitting you have in a normal week — the real ceiling on length. */
export function longestWindowHours(windows: TimeWindow[]): number {
  return windows.filter((w) => w.active).reduce((a, w) => Math.max(a, hobbyHours(w)), 0)
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** Minutes-from-midnight to a 12-hour clock, wrapping past 1440. */
export function fmtClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m % 60).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`
}

/** "2h15m", "45m", "3h" — a duration, not a clock time. */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h${String(rem).padStart(2, '0')}m`
}

/** Hours as a short label: "45m", "1.8h", "12h". */
export function fmtHours(h: number): string {
  if (h <= 0) return '0h'
  if (h < 1) return `${Math.round(h * 60)}m`
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

/** "Sun 6:15pm – 8:30pm" (with "+1" when the block runs past midnight). */
export function describeWindow(w: TimeWindow): string {
  return `${DAY_SHORT[w.day_of_week]} ${fmtClock(w.start_min)} – ${fmtClock(w.end_min)}${w.end_min >= 1440 ? ' +1' : ''}`
}

export function windowTitle(w: TimeWindow): string {
  return w.label?.trim() || describeWindow(w)
}

// ── Occurrences: turning a weekly pattern into actual upcoming sittings ──────

export interface WindowOccurrence {
  window: TimeWindow
  start: Date
  end: Date
  /** True when `now` falls inside the block. */
  isNow: boolean
  /**
   * Hobby hours this sitting still offers. For a block already running that's
   * the time left, share-adjusted — being an hour late to a two-hour window
   * leaves you an hour, and offering a two-hour film would be useless.
   */
  hoursLeft: number
}

/**
 * The next `count` sittings, soonest first, including one already running.
 *
 * The start is built from date components so the clock time survives a
 * daylight-saving boundary (6:15pm stays 6:15pm); the end is start + span, i.e.
 * "two hours later", which is what a block's length means.
 */
export function upcomingOccurrences(windows: TimeWindow[], now: Date, count = 6): WindowOccurrence[] {
  const out: WindowOccurrence[] = []
  for (const w of windows) {
    if (!w.active) continue
    const span = spanMinutes(w)
    if (span <= 0) continue
    // -1 catches a block that started yesterday and runs past midnight into now.
    for (let offset = -1; offset <= 7; offset++) {
      const probe = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
      if (probe.getDay() !== w.day_of_week) continue
      const start = new Date(
        probe.getFullYear(), probe.getMonth(), probe.getDate(),
        Math.floor(w.start_min / 60), w.start_min % 60, 0, 0,
      )
      const end = new Date(start.getTime() + span * 60000)
      if (end <= now) continue
      const isNow = start <= now
      const minutesLeft = isNow ? (end.getTime() - now.getTime()) / 60000 : span
      out.push({
        window: w,
        start,
        end,
        isNow,
        hoursLeft: Math.round(((minutesLeft * clampShare(w.share)) / 60) * 100) / 100,
      })
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, count)
}

/** The block you are inside right now, if any. */
export function currentOccurrence(windows: TimeWindow[], now: Date): WindowOccurrence | null {
  return upcomingOccurrences(windows, now, 3).find((o) => o.isNow) ?? null
}

// ── Fitting backlog items into a sitting ─────────────────────────────────────

/**
 * Hours still needed to finish an entry. Null when the length genuinely isn't
 * known — which has to stay distinguishable from zero, or every entry with no
 * page count would masquerade as a five-minute job and win every window.
 */
export function hoursRemaining(e: Entry): number | null {
  if (HOBBY_MAP[e.hobby_category]?.manualOnly) return null
  const full = entryHours(e)
  if (!(full > 0)) return null
  const frac = progressFraction(e)
  const remaining = frac != null ? full * (1 - frac) : full
  return Math.round(Math.max(0, remaining) * 10) / 10
}

export type Fit =
  | 'finish'   // this sitting can close it out
  | 'dent'     // too long to finish, but already underway — real progress
  | 'too_long' // doesn't fit meaningfully

export interface FitPick {
  entry: Entry
  hoursRemaining: number
  fit: Fit
  /** Share of the sitting this would use; > 1 means it overflows. */
  utilization: number
  reason: string
}

/** Leeway on a "finish": 10 minutes of slop, so a 2h05m film fits a 2h block. */
const SLOP_HOURS = 0.17

/**
 * What to do with `availableHours`, best use first.
 *
 * The ranking is the whole feature, and it is deliberately NOT the taste
 * ranking. Among things you can finish, the best use of a sitting is the one
 * that fills it — closing out a 1h50m film in a two-hour window beats clearing a
 * 22-minute episode, even if the episode scores higher on taste, because the
 * window is the scarce thing, not the appetite. Ties break toward what's already
 * started, since an unfinished thing costs you the re-entry otherwise.
 */
export function fitsIn(
  entries: Entry[],
  availableHours: number,
  opts: { includeDents?: boolean; includeTooLong?: boolean } = {},
): FitPick[] {
  if (!(availableHours > 0)) return []
  const includeDents = opts.includeDents !== false
  const includeTooLong = opts.includeTooLong === true
  const out: FitPick[] = []

  for (const e of entries) {
    if (e.status !== 'backlog' && e.status !== 'in_progress') continue
    const remaining = hoursRemaining(e)
    if (remaining == null || remaining <= 0) continue
    const utilization = remaining / availableHours

    if (remaining <= availableHours + SLOP_HOURS) {
      // Say so when it only fits on the slop allowance. Both numbers are rounded
      // to a tenth of an hour on screen, so "1.8h left / finishes it" inside a
      // 1.7h window reads like broken arithmetic unless the overrun is named.
      const tight = remaining > availableHours
      out.push({
        entry: e, hoursRemaining: remaining, fit: 'finish', utilization,
        reason: tight
          ? `${fmtHours(remaining)} against ${fmtHours(availableHours)} — a few minutes over, but near enough to finish.`
          : e.status === 'in_progress'
            ? `About ${fmtHours(remaining)} left — this sitting finishes it.`
            : `${fmtHours(remaining)} start to finish, in one sitting.`,
      })
    } else if (includeDents && e.status === 'in_progress') {
      out.push({
        entry: e, hoursRemaining: remaining, fit: 'dent', utilization,
        reason: `${fmtHours(remaining)} to go — won't finish, but ${fmtHours(availableHours)} is real progress.`,
      })
    } else if (includeTooLong) {
      out.push({
        entry: e, hoursRemaining: remaining, fit: 'too_long', utilization,
        reason: `${fmtHours(remaining)} needs more than this sitting gives you.`,
      })
    }
  }

  const rank: Record<Fit, number> = { finish: 0, dent: 1, too_long: 2 }
  return out.sort((a, b) => {
    if (rank[a.fit] !== rank[b.fit]) return rank[a.fit] - rank[b.fit]
    if (a.fit === 'finish') {
      // Fullest use of the window first.
      if (b.utilization !== a.utilization) return b.utilization - a.utilization
    } else if (a.hoursRemaining !== b.hoursRemaining) {
      // Nearest to done first.
      return a.hoursRemaining - b.hoursRemaining
    }
    const started = (x: Entry) => (x.status === 'in_progress' ? 0 : 1)
    return started(a.entry) - started(b.entry)
  })
}

// ── The reverse question: which block is this item for? ──────────────────────

export interface WindowPlan {
  window: TimeWindow
  /** Sittings of this window needed to finish. 1 = one sitting. */
  sittings: number
  reason: string
}

/**
 * Given an item, which of your weekly blocks is it for?
 *
 * The smallest sufficient window wins for anything that fits in one sitting, so
 * a 90-minute film is pointed at a weeknight rather than eating the one long
 * block you have. A 60-hour game has no window that finishes it, and saying so
 * plainly ("about 9 Sunday afternoons") is more useful than staying quiet.
 */
export function bestWindowFor(e: Entry, windows: TimeWindow[]): WindowPlan | null {
  const remaining = hoursRemaining(e)
  if (remaining == null || remaining <= 0) return null
  const usable = windows.filter((w) => w.active && hobbyHours(w) > 0)
  if (usable.length === 0) return null

  const oneSitting = usable
    .filter((w) => hobbyHours(w) + SLOP_HOURS >= remaining)
    .sort((a, b) => hobbyHours(a) - hobbyHours(b))[0]
  if (oneSitting) {
    return {
      window: oneSitting,
      sittings: 1,
      reason: `${fmtHours(remaining)} fits ${windowTitle(oneSitting)} — one sitting.`,
    }
  }

  const longest = [...usable].sort((a, b) => hobbyHours(b) - hobbyHours(a))[0]
  const sittings = Math.ceil(remaining / hobbyHours(longest))
  return {
    window: longest,
    sittings,
    reason: `${fmtHours(remaining)} is about ${sittings} ${windowTitle(longest)} sittings — ${sittings} weeks at that rate.`,
  }
}

/** Weeks to clear a backlog at the declared weekly rate. Null when nothing is declared. */
export function weeksToClear(backlogHours: number, windows: TimeWindow[]): number | null {
  const perWeek = weeklyHobbyHours(windows)
  if (!(perWeek > 0) || !(backlogHours > 0)) return null
  return Math.round((backlogHours / perWeek) * 10) / 10
}

// ── Calendar export ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const icsEscape = (s: string) => s.replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n')

/**
 * The windows as a weekly-recurring .ics feed, so the blocks land in whatever
 * calendar you already use. One-way on purpose: pushing events out needs no
 * calendar UI, no OAuth and no sync conflicts, where reading a calendar back in
 * needs all three.
 *
 * Times are written as floating local times (no TZ, no Z) because a block means
 * "6:15pm wherever I am", not an instant.
 */
export function windowsToIcs(windows: TimeWindow[], now = new Date()): string {
  const stamp = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hobbylog//hobby time//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Hobby time',
  ]
  for (const w of windows.filter((x) => x.active)) {
    // Anchor each event on its next real occurrence, then let the RRULE repeat it.
    const first = upcomingOccurrences([w], now, 1)[0]
    if (!first) continue
    const share = clampShare(w.share)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${w.id}@hobbylog`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(first.start)}`,
      `DTEND:${stamp(first.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][w.day_of_week]}`,
      `SUMMARY:${icsEscape(w.label?.trim() || 'Hobby time')}`,
      `DESCRIPTION:${icsEscape(
        `${fmtDuration(spanMinutes(w))} blocked` +
        (share < 1 ? `, about ${fmtDuration(hobbyMinutes(w))} of it hobby time` : ''),
      )}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
