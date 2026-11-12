'use client'

import type { Entry } from '@/types/database'
import { yearOf } from '@/lib/format'
import CoverTile from './CoverTile'

// Finished entries as a wall of covers, newest first and grouped by the year
// they were finished. A finish with no date recorded (older imports, mostly)
// is kept, under its own heading at the end, rather than dropped or guessed.
export default function ShelfWall({ entries, showHobby = false }: { entries: Entry[]; showHobby?: boolean }) {
  const byYear = new Map<number | null, Entry[]>()
  const sorted = [...entries].sort((a, b) => (b.date_completed ?? '').localeCompare(a.date_completed ?? ''))
  for (const e of sorted) {
    const y = yearOf(e.date_completed)
    const list = byYear.get(y)
    if (list) list.push(e); else byYear.set(y, [e])
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
                {list.length} finished
              </span>
            </div>
            <div className="cover-grid">
              {list.map((e) => (
                <CoverTile key={e.id} entry={e} context="shelf" showStatus={false} showHobby={showHobby} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
