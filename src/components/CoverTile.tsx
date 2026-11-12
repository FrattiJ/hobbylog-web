'use client'

import Link from 'next/link'
import { Star, Check } from 'lucide-react'
import type { Entry } from '@/types/database'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_COLORS, statusLabelFor } from '@/lib/hobbies'
import { readRecipe, formatCookTime } from '@/lib/recipe'
import { formatDayShort, formatDay } from '@/lib/format'

// The chamfered corner that marks a panel across the app, at cover size.
const CLIP = 'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)'

// What sits under the title. One line, chosen by what is most useful to know
// about an entry in that state.
function metaLine(entry: Entry, context: 'library' | 'shelf', showStatus: boolean): string {
  const hobby = HOBBY_MAP[entry.hobby_category]
  if (context === 'shelf') return formatDayShort(entry.date_completed)
  if (hobby?.recipe) {
    const r = readRecipe(entry.metadata)
    const parts = [formatCookTime(r.cook_minutes), entry.progress_current > 0 ? `Made ${entry.progress_current}x` : null].filter(Boolean)
    return parts.join(', ')
  }
  // Beside a "Completed" label the date is one fact too many for a tile; it
  // shows once the tab has already said these are all finished.
  if (entry.status === 'completed') return !showStatus && entry.date_completed ? `Finished ${formatDay(entry.date_completed)}` : ''
  if (entry.status === 'in_progress') {
    const unit = entry.hobby_category === 'books' && entry.book_subtype
      ? BOOK_SUBTYPE_MAP[entry.book_subtype]?.progressUnit ?? hobby?.progressUnit
      : hobby?.progressUnit
    const total = entry.progress_total
      || (entry.hobby_category === 'games' && entry.metadata?.time_to_beat ? Number(entry.metadata.time_to_beat) : null)
    if (hobby?.percentBased) return `${entry.progress_current}%`
    return total ? `${entry.progress_current} of ${total} ${unit}` : `${entry.progress_current} ${unit}`
  }
  return ''
}

// One entry as a poster: the cover does the talking, with the few facts worth
// seeing at a glance laid over or under it. Used by the library grid and the
// shelf. In select mode it is a toggle; otherwise it is a real link, so it can
// be opened in a new tab like any other.
export default function CoverTile({ entry, context = 'library', showStatus = true, showHobby = false, selectable = false, selected = false, onToggleSelect }: {
  entry: Entry
  context?: 'library' | 'shelf'
  showStatus?: boolean
  showHobby?: boolean
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const hobby = HOBBY_MAP[entry.hobby_category]
  const accent = hobby?.accent ?? '#a577f2'
  const total = entry.progress_total
    || (entry.hobby_category === 'games' && entry.metadata?.time_to_beat ? Number(entry.metadata.time_to_beat) : null)
  const pct = total && !hobby?.recipe ? Math.min(100, Math.round((entry.progress_current / total) * 100)) : null
  const meta = metaLine(entry, context, showStatus)
  const statusColor = STATUS_COLORS[entry.status]

  const body = (
    <>
      <div className="tile-frame" style={{ padding: 1, clipPath: CLIP, background: selected ? accent : `${accent}55` }}>
        <div style={{ position: 'relative', aspectRatio: '2 / 3', clipPath: CLIP, background: 'var(--bg-card)', overflow: 'hidden' }}>
          {entry.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.cover_url} alt="" loading="lazy" decoding="async" width={300} height={450}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            // No artwork: say so with the title itself rather than a fake cover.
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', padding: 12, background: `linear-gradient(160deg, ${accent}26, transparent 70%)` }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: accent, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {entry.title}
              </span>
            </div>
          )}

          {entry.status === 'backlog' && entry.priority != null && context === 'library' && (
            <span style={{ position: 'absolute', top: 8, left: 12, padding: '2px 7px', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#fbbf24', background: 'rgba(8,10,14,0.82)', border: '1px solid #d9770688' }}>
              #{entry.priority}
            </span>
          )}
          {entry.rating != null && (
            <span style={{ position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#fbbf24', background: 'rgba(8,10,14,0.82)', border: '1px solid #d9770688' }}>
              <Star size={11} aria-hidden="true" style={{ fill: '#fbbf24', color: '#fbbf24' }} />
              <span><span className="sr-only">Rated </span>{entry.rating}</span>
            </span>
          )}
          {selectable && (
            <span aria-hidden="true" style={{ position: 'absolute', bottom: 10, right: 10, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? accent : 'rgba(8,10,14,0.82)', border: `1px solid ${selected ? accent : 'var(--text-dim)'}`, color: '#fff' }}>
              {selected && <Check size={15} />}
            </span>
          )}
          {pct !== null && entry.status === 'in_progress' && (
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(8,10,14,0.7)' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: accent }} />
            </div>
          )}
        </div>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-hi)', margin: '8px 0 0', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {entry.title}
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.4, color: 'var(--text-dim)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {showHobby && <span style={{ color: accent }}>{hobby?.label}</span>}
        {showStatus && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: statusColor }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            {statusLabelFor(hobby, entry.status)}
          </span>
        )}
        {meta && <span>{meta}</span>}
      </p>
    </>
  )

  if (selectable) {
    return (
      <button type="button" className="tile" aria-pressed={selected} onClick={() => onToggleSelect?.(entry.id)}
        style={{ display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
        {body}
      </button>
    )
  }
  return (
    <Link href={`/entry?id=${entry.id}`} className="tile" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  )
}
