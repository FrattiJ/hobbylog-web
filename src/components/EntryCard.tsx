'use client'

import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import MechCard from './MechCard'
import type { Entry } from '@/types/database'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'

export default function EntryCard({ entry, index = 0 }: { entry: Entry; index?: number }) {
  const router = useRouter()
  const hobby  = HOBBY_MAP[entry.hobby_category]
  const accent = hobby?.accent ?? '#7c3aed'

  const displayLabel = entry.hobby_category === 'books' && entry.book_subtype
    ? BOOK_SUBTYPE_MAP[entry.book_subtype]?.label ?? 'Book'
    : hobby?.label

  const progressUnit = entry.hobby_category === 'books' && entry.book_subtype
    ? BOOK_SUBTYPE_MAP[entry.book_subtype]?.progressUnit ?? hobby?.progressUnit
    : hobby?.progressUnit

  const effectiveProgressTotal = entry.progress_total
    || (entry.hobby_category === 'movies' ? 100 : null)
    || (entry.hobby_category === 'games' && entry.metadata?.time_to_beat ? Number(entry.metadata.time_to_beat) : null)
  const progress = effectiveProgressTotal
    ? Math.min(100, Math.round((entry.progress_current / effectiveProgressTotal) * 100))
    : null

  return (
    <MechCard accent={accent} index={index} hoverable onClick={() => router.push(`/entry?id=${entry.id}`)}>
      <div style={{ display: 'flex', gap: 12, padding: '16px 14px 14px' }}>
        {/* Cover */}
        <div
          style={{
            width: 52,
            height: 74,
            flexShrink: 0,
            background: 'var(--bg-base)',
            border: `1px solid ${accent}33`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {entry.cover_url ? (
            <img src={entry.cover_url} alt={entry.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 20, fontWeight: 900, color: `${accent}88`,
            }}>
              {entry.title[0]}
            </div>
          )}
          {/* Accent corner */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: 8, height: 8, background: accent,
            clipPath: 'polygon(0 0, 100% 0, 0 100%)',
          }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-hi)',
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 6,
            lineHeight: 1.3,
          }}>
            {entry.title}
          </p>

          {/* Badges row */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {entry.status === 'backlog' && entry.priority != null && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                letterSpacing: '0.12em',
                padding: '2px 7px',
                background: '#d9770618',
                color: '#d97706',
                border: '1px solid #d9770644',
              }}>
                #{entry.priority}
              </span>
            )}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              letterSpacing: '0.12em',
              padding: '2px 7px',
              background: `${STATUS_COLORS[entry.status]}18`,
              color: STATUS_COLORS[entry.status],
              border: `1px solid ${STATUS_COLORS[entry.status]}44`,
              textTransform: 'uppercase',
            }}>
              {STATUS_LABELS[entry.status]}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              letterSpacing: '0.12em',
              padding: '2px 7px',
              background: `${accent}18`,
              color: accent,
              border: `1px solid ${accent}44`,
              textTransform: 'uppercase',
            }}>
              {displayLabel}
            </span>
          </div>

          {/* Rating */}
          {entry.rating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <Star size={10} style={{ fill: '#d97706', color: '#d97706' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#d97706' }}>
                {entry.rating}/10
              </span>
            </div>
          )}

          {/* Progress bar */}
          {progress !== null && (
            <div>
              <div style={{ height: 3, background: 'var(--border-dim)', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${progress}%`,
                  background: `linear-gradient(to right, ${accent}, ${accent}cc)`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)' }}>
                  {(() => {
                    const isAudiobook = entry.hobby_category === 'books' && entry.book_subtype === 'audiobook'
                    const isMovie = entry.hobby_category === 'movies'
                    if (isAudiobook || isMovie) {
                      return ''
                    }
                    return `${entry.progress_current}/${effectiveProgressTotal} ${progressUnit}`
                  })()}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: accent }}>
                  {progress}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </MechCard>
  )
}
