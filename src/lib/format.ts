// Dates in the library are stored as plain 'YYYY-MM-DD' days. Parsing one with
// new Date(string) reads it as UTC midnight, which lands on the previous day
// anywhere west of Greenwich, so these build a local date from the parts.

function localDay(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** "Oct 23, 2026" in the viewer's locale, or '' for a missing date. */
export function formatDay(iso: string | null | undefined): string {
  const d = localDay(iso)
  return d ? dayMonthYear.format(d) : ''
}

/** "Oct 23": for places where the year is already given by a heading. */
export function formatDayShort(iso: string | null | undefined): string {
  const d = localDay(iso)
  return d ? dayMonth.format(d) : ''
}

export function yearOf(iso: string | null | undefined): number | null {
  const d = localDay(iso)
  return d ? d.getFullYear() : null
}

/** Today as 'YYYY-MM-DD' in the viewer's own time zone (not UTC). */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The local calendar day of a timestamp, as 'YYYY-MM-DD'. */
export function isoDayOf(timestamp: string | null | undefined): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A day as a timestamp at local noon, so it stays on that day in any nearby time zone. */
export function dayToTimestamp(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toISOString()
}
