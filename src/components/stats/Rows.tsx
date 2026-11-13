'use client'

import { HOBBY_MAP } from '@/lib/hobbies'
import type { HobbyCategory } from '@/types/database'
import { HOBBY_ICON_MAP } from '@/components/hobbyIcons'

// A hobby named the way the rest of the app names it: its icon in its own
// colour, then the name in ordinary text. In these lists the name carries
// identity, so the bars beside it can all be one hue.
function HobbyName({ hobby }: { hobby: HobbyCategory }) {
  const h = HOBBY_MAP[hobby]
  const Icon = h ? HOBBY_ICON_MAP[h.icon] : null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-hi)' }}>
      <span aria-hidden="true" style={{ display: 'flex', color: h?.accent, flexShrink: 0 }}>{Icon && <Icon size={15} />}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h?.pluralLabel ?? hobby}</span>
    </span>
  )
}

const figure: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'nowrap', textAlign: 'right' }

/** Hours per hobby, largest first, on one shared baseline, with the value at the end of each bar. */
export function RankedBars({ rows, color }: { rows: Array<{ hobby: HobbyCategory; hours: number }>; color: string }) {
  const max = Math.max(...rows.map((r) => r.hours), 0.001)
  return (
    <ul className="stat-rows">
      {rows.map((r) => (
        <li key={r.hobby} title={`${HOBBY_MAP[r.hobby]?.pluralLabel}: ${r.hours.toLocaleString()} hours`}>
          <HobbyName hobby={r.hobby} />
          <span aria-hidden="true" style={{ display: 'block', height: 10 }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(1.5, (r.hours / max) * 100)}%`, background: color, borderRadius: '0 4px 4px 0' }} />
          </span>
          <span style={figure}><strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{r.hours.toLocaleString()}</strong> h</span>
        </li>
      ))}
    </ul>
  )
}

/** A share per hobby, each against its own whole: a filled bar on a lighter track of the same hue. */
export function MeterList({ rows, color }: { rows: Array<{ hobby: HobbyCategory; finished: number; total: number; pct: number; dropped: number }>; color: string }) {
  return (
    <ul className="stat-rows">
      {rows.map((r) => (
        <li key={r.hobby} title={`${HOBBY_MAP[r.hobby]?.pluralLabel}: ${r.finished} of ${r.total} finished${r.dropped ? `, ${r.dropped} dropped` : ''}`}>
          <HobbyName hobby={r.hobby} />
          <span role="img" aria-label={`${r.pct} percent finished`} style={{ display: 'block', height: 8, background: `color-mix(in srgb, ${color} 22%, transparent)`, borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: color }} />
          </span>
          <span style={figure}><strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{r.pct}%</strong> · {r.finished} of {r.total}</span>
        </li>
      ))}
    </ul>
  )
}
