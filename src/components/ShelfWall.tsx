'use client'

import type { Entry } from '@/types/database'
import { yearOf } from '@/lib/format'
import { finishesOf, type Finish } from '@/lib/finishes'
import CoverTile from './CoverTile'
import { useProgressive } from '@/lib/useProgressive'
import ListFooter from './ListFooter'

// Finished entries as a wall of covers, newest first and grouped by the year
// they were finished. A finish with no date recorded (older imports, mostly)
// is kept, under its own heading at the end, rather than dropped or guessed.
//
// The wall is of finishes, not entries: something finished twice stands in
// both years, each time with its own date.
export default function ShelfWall({ entries, showHobby = false }: { entries: Entry[]; showHobby?: boolean }) {
  const byYear = new Map<number | null, Array<{ entry: Entry; finish: Finish }>>()
  const sorted = entries
    .flatMap((entry) => finishesOf(entry).map((finish) => ({ entry, finish })))
    .sort((a, b) => (b.finish.date ?? '').localeCompare(a.finish.date ?? ''))
  // Newest first, so the batches arrive in the order the years are read. The
  // year counts come from the full list: "38 finished" should not grow as you scroll.
  const paged = useProgressive(sorted.length, sorted.map((x) => `${x.entry.id}:${x.finish.nth}`).join(','))
  const totals = new Map<number | null, number>()
  for (const x of sorted) { const y = yearOf(x.finish.date); totals.set(y, (totals.get(y) ?? 0) + 1) }
  for (const x of sorted.slice(0, paged.shown)) {
    const y = yearOf(x.finish.date)
    const list = byYear.get(y)
    if (list) list.push(x); else byYear.set(y, [x])
  }
  const years = [...byYear.keys()].sort((a, b) => (b ?? -1) - (a ?? -1))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      {years.map((year) => {
        const list = byYear.get(year)!
        return (
          <section key={year ?? 'undated'} aria-label={year ? `Finished in ${year}` : 'Finished, date not recorded'}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: year ? 26 : 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0 }}>
                {year ?? 'DATE NOT RECORDED'}
              </h2>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>
                {totals.get(year)} finished
              </span>
            </div>
            {!year && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '-6px 0 16px', lineHeight: 1.5, maxWidth: '70ch' }}>
                These are marked finished with no date. Open one to add its date, or on a hobby page choose Completed, then Select,
                pick several and use Set Finish Date.
              </p>
            )}
            <div className="cover-grid">
              {list.map(({ entry, finish }) => (
                <CoverTile key={`${entry.id}:${finish.nth}`} entry={entry} finish={finish} context="shelf" showStatus={false} showHobby={showHobby} />
              ))}
            </div>
          </section>
        )
      })}
      <ListFooter sentinel={paged.sentinel} shown={paged.shown} total={sorted.length} done={paged.done} more={paged.more} noun="finished" />
    </div>
  )
}
