'use client'

import { useRouter } from 'next/navigation'
import { Star, Check, Clock } from 'lucide-react'
import MechCard from './MechCard'
import type { Entry } from '@/types/database'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_COLORS, statusLabelFor } from '@/lib/hobbies'
import { readRecipe, formatCookTime, DIFFICULTIES, MEAL_TAG_LABEL } from '@/lib/recipe'

export default function EntryCard({ entry, index = 0, selectable = false, selected = false, onToggleSelect }: {
  entry: Entry
  index?: number
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const router = useRouter()
  const hobby  = HOBBY_MAP[entry.hobby_category]
  const accent = hobby?.accent ?? '#7c3aed'

  const displayLabel = entry.hobby_category === 'books' && entry.book_subtype
    ? BOOK_SUBTYPE_MAP[entry.book_subtype]?.label ?? 'Book'
    : hobby?.label

  const progressUnit = entry.hobby_category === 'books' && entry.book_subtype
    ? BOOK_SUBTYPE_MAP[entry.book_subtype]?.progressUnit ?? hobby?.progressUnit
    : hobby?.progressUnit

  const recipe = hobby?.recipe ? readRecipe(entry.metadata) : null
  const recipeDifficulty = recipe ? DIFFICULTIES.find((d) => d.id === recipe.difficulty) : undefined
  const recipeTime = recipe ? formatCookTime(recipe.cook_minutes) : null

  const effectiveProgressTotal = entry.progress_total
    || (entry.hobby_category === 'games' && entry.metadata?.time_to_beat ? Number(entry.metadata.time_to_beat) : null)
  const progress = effectiveProgressTotal
    ? Math.min(100, Math.round((entry.progress_current / effectiveProgressTotal) * 100))
    : null

  return (
    <MechCard accent={selected ? accent : accent} index={index} hoverable
      onClick={() => (selectable ? onToggleSelect?.(entry.id) : router.push(`/entry?id=${entry.id}`))}>
      <div style={{ display: 'flex', gap: 12, padding: '16px 14px 14px', position: 'relative', background: selected ? `${accent}1f` : undefined }}>
        {selectable && (
          <span style={{ position: 'absolute', top: 8, right: 10, width: 20, height: 20, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? accent : 'var(--bg-base)', border: `1px solid ${selected ? accent : 'var(--border-dim)'}`, color: '#fff', zIndex: 2 }}>
            {selected && <Check size={13} />}
          </span>
        )}
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
              {statusLabelFor(hobby, entry.status)}
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

          {/* Recipe facts: time, difficulty, meal tags, times made */}
          {recipe && (recipeTime || recipeDifficulty || recipe.meal_tags.length > 0 || entry.progress_current > 0) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
              {recipeTime && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {recipeTime}</span>}
              {recipeDifficulty && <span style={{ color: recipeDifficulty.color }}>{recipeDifficulty.label.toUpperCase()}</span>}
              {recipe.meal_tags.length > 0 && <span>{recipe.meal_tags.map((t) => MEAL_TAG_LABEL[t] ?? t).join(' · ')}</span>}
              {entry.progress_current > 0 && <span style={{ color: accent }}>MADE {entry.progress_current}x</span>}
            </div>
          )}

          {/* Progress bar */}
          {progress !== null && !recipe && (
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
                  {`${entry.progress_current}/${effectiveProgressTotal} ${progressUnit}`}
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
