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
