'use client'

import { useMemo } from 'react'
import type { Exercise } from '@/types/fitness'
import { BODY_BACK, BODY_FRONT, BODY_VIEWBOX, type BodyPiece } from '@/lib/fitness/bodyMap'
import { MUSCLE_LABELS, musclesFor, sessionMuscles, type SessionMuscles } from '@/lib/fitness/muscles'
import { useCatalog } from './useCatalog'
import { Label, ACCENT } from './ui'

// A muscle nobody trained: a quiet step off the card, in either theme.
const IDLE = 'color-mix(in srgb, var(--text-dim) 26%, var(--bg-card))'

// The least-worked muscle still has to read as lit, so shading starts well
// above zero and climbs to solid for the hardest-hit one.
const shade = (intensity: number) => 0.32 + 0.68 * intensity

function Figure({ pieces, session }: { pieces: BodyPiece[]; session: SessionMuscles }) {
  return (
    <svg viewBox={BODY_VIEWBOX} aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }}>
      {pieces.map((p, i) => {
        const tally = p.muscle ? session.byMuscle.get(p.muscle) : undefined
        const path = (
          <path
            d={p.d}
            fill={tally ? ACCENT : IDLE}
            fillOpacity={tally ? shade(tally.intensity) : 1}
            style={{ transition: 'fill 0.25s ease, fill-opacity 0.25s ease' }}
          />
        )
        return p.mirror
          ? <g key={i}>{path}<g transform="translate(100 0) scale(-1 1)">{path}</g></g>
          : <g key={i}>{path}</g>
      })}
    </svg>
  )
}

// Front and back figures with the session's muscles lit. The drawing is
// decoration for anyone who can't see it, so it carries the same information as
// a single sentence.
export function MuscleMap({ session, width = 190 }: { session: SessionMuscles; width?: number }) {
  const names = session.tallies.map((t) => MUSCLE_LABELS[t.muscle])
  return (
    <div
      role="img"
      aria-label={names.length > 0 ? `Muscles worked: ${names.join(', ')}` : 'No muscles recorded for this session'}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width, maxWidth: '100%', flexShrink: 0 }}
    >
      {[{ label: 'Front', pieces: BODY_FRONT }, { label: 'Back', pieces: BODY_BACK }].map((f) => (
        <div key={f.label}>
          <Figure pieces={f.pieces} session={session} />
          <div aria-hidden="true" style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginTop: 2 }}>
            {f.label}
          </div>
        </div>
      ))}
    </div>
  )
}

export interface SessionWork {
  exercise: Pick<Exercise, 'name' | 'muscle' | 'catalog_id'>
  // Sets that count: working sets, or every set if they were all warm-ups.
  sets: number
}

// The body map with its numbers beside it: which muscles a session trained, how
// many sets each got, and which ones only helped out.
export function SessionMusclesPanel({ work, width }: { work: SessionWork[]; width?: number }) {
  // Without the catalog the main muscles are already right (they're stored on
  // the exercise or read off its name); the catalog adds the supporting ones.
  const catalog = useCatalog()
  const session = useMemo(() => sessionMuscles(work.map((w) => ({
    name: w.exercise.name,
    use: catalog ? catalog.resolveMuscles(w.exercise) : musclesFor(w.exercise),
    sets: w.sets,
  }))), [work, catalog])

  if (session.tallies.length === 0 && session.unmapped.length === 0) return null

  const main = session.tallies.filter((t) => t.sets > 0)
  const assist = session.tallies.filter((t) => t.sets === 0)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
      <MuscleMap session={session} width={width} />

      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        {main.length > 0 && (
          <>
            <Label style={{ marginBottom: 7 }}>Muscles worked</Label>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {main.map((t) => (
                <li key={t.muscle} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(84px, auto) 1fr auto', alignItems: 'center',
                  gap: 10, marginBottom: 5, fontFamily: 'var(--font-body)', fontSize: 14,
                }}>
                  <span style={{ color: 'var(--text-hi)' }}>{MUSCLE_LABELS[t.muscle]}</span>
                  <span aria-hidden="true" style={{ height: 6, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round(t.intensity * 100)}%`, background: ACCENT, opacity: shade(t.intensity) }} />
                  </span>
                  {/* The bar counts assisting sets too (at a discount), which is why a
                      muscle with fewer sets of its own can sit above one with more. */}
                  <span style={{ color: 'var(--text-dim)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {t.sets} {t.sets === 1 ? 'set' : 'sets'}
                    {t.assistSets > 0 && <span style={{ color: 'var(--text-mute)' }}> +{t.assistSets} assisting</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {assist.length > 0 && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, margin: '8px 0 0' }}>
            Also involved: {assist.map((t) => MUSCLE_LABELS[t.muscle]).join(', ')}
          </p>
        )}

        {session.unmapped.length > 0 && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, margin: '8px 0 0' }}>
            Not on the map: {session.unmapped.join(', ')}. Give {session.unmapped.length === 1 ? 'it' : 'them'} a
            muscle under Routines, Your Exercises.
          </p>
        )}
      </div>
    </div>
  )
}

// How many of an exercise's sets count toward the map. Warm-ups are left out
// unless they're all there is, so an exercise never vanishes from the picture.
export function countedSets(sets: { is_warmup: boolean }[]): number {
  const working = sets.filter((s) => !s.is_warmup).length
  return working > 0 ? working : sets.length
}
