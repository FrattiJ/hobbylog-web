'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Dumbbell } from 'lucide-react'
import type { Exercise, TrackingType } from '@/types/fitness'
import type { CatalogExercise } from '@/lib/fitness/catalog'
import { exerciseFromCatalog, findOrCreateExercise } from '@/lib/fitness/db'
import { Modal, Input, Select, Button, Label, ACCENT, Empty } from './ui'

export const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight × reps',
  reps: 'Reps only',
  time: 'Time',
  time_distance: 'Time + distance',
}

const TRACKING_HINTS: Record<TrackingType, string> = {
  weight_reps: 'Barbell, dumbbell, machine work — logs lbs and reps.',
  reps: 'Bodyweight work — logs reps, with optional added lbs.',
  time: 'Holds and stretches — logs a duration, longer is better.',
  time_distance: 'Running, rowing, cycling — logs a duration and how far you went.',
}

// The catalog is ~52 KB of generated data, so it only loads when the picker opens.
function useCatalog() {
  const [mod, setMod] = useState<typeof import('@/lib/fitness/catalog') | null>(null)
  useEffect(() => { import('@/lib/fitness/catalog').then(setMod) }, [])
  return mod
}

export default function ExercisePicker({ mine, onPick, onClose }: {
  mine: Exercise[]
  onPick: (e: Exercise) => void
  onClose: () => void
}) {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the user opts to define an exercise the catalog doesn't have.
  const [custom, setCustom] = useState<{ name: string; tracking: TrackingType } | null>(null)

  const q = query.trim().toLowerCase()

  const mineHits = useMemo(
    () => (q ? mine.filter((e) => e.name.toLowerCase().includes(q)) : mine).slice(0, 12),
    [mine, q],
  )

  // Don't offer a catalog row the user already has — it'd look like a duplicate.
  const mineNames = useMemo(() => new Set(mine.map((e) => e.name.toLowerCase())), [mine])
  const catalogHits = useMemo(() => {
    if (!catalog) return []
    return catalog.searchCatalog(query, 60).filter((c) => !mineNames.has(c.name.toLowerCase())).slice(0, 25)
  }, [catalog, query, mineNames])

  const exactExists = mineNames.has(q) || catalogHits.some((c) => c.name.toLowerCase() === q)

  async function pickCatalog(c: CatalogExercise) {
    setBusy(true)
    setError(null)
    try {
      onPick(await exerciseFromCatalog(c))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that exercise')
      setBusy(false)
    }
  }

  async function saveCustom() {
    if (!custom?.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      onPick(await findOrCreateExercise({ name: custom.name, tracking_type: custom.tracking }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that exercise')
      setBusy(false)
    }
  }

  if (custom) {
    return (
      <Modal title="New exercise" onClose={onClose} width={480}>
        <Label style={{ marginBottom: 6 }}>Name</Label>
        <Input
          autoFocus value={custom.name}
          onChange={(e) => setCustom({ ...custom, name: e.target.value })}
          placeholder="e.g. Sled Push"
        />

        <Label style={{ margin: '16px 0 6px' }}>How is it measured?</Label>
        <Select
          value={custom.tracking}
          onChange={(e) => setCustom({ ...custom, tracking: e.target.value as TrackingType })}
          style={{ width: '100%' }}
        >
          {(Object.keys(TRACKING_LABELS) as TrackingType[]).map((t) => (
            <option key={t} value={t}>{TRACKING_LABELS[t]}</option>
          ))}
        </Select>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
          marginTop: 8, lineHeight: 1.6,
        }}>
          {TRACKING_HINTS[custom.tracking]}
        </p>

        {error && <p style={{ color: '#f15959', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="quiet" onClick={() => setCustom(null)}>Back</Button>
          <Button variant="solid" onClick={saveCustom} disabled={busy || !custom.name.trim()}>
            {busy ? 'Saving…' : 'Add Exercise'}
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Add exercise" onClose={onClose}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-dim)' }} />
        <Input
          autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 873 exercises, or type your own name"
          style={{ paddingLeft: 30 }}
        />
      </div>

      {error && <p style={{ color: '#f15959', fontSize: 13, marginTop: 10 }}>{error}</p>}

      <div style={{ maxHeight: '52vh', overflowY: 'auto', marginTop: 14 }}>
        {mineHits.length > 0 && (
          <>
            <Label style={{ marginBottom: 6 }}>Your Exercises</Label>
            {mineHits.map((e) => (
              <Row
                key={e.id} name={e.name} disabled={busy}
                meta={[TRACKING_LABELS[e.tracking_type], e.muscle, e.equipment].filter(Boolean).join(' · ')}
                onClick={() => onPick(e)}
              />
            ))}
          </>
        )}

        {catalogHits.length > 0 && (
          <>
            <Label style={{ margin: mineHits.length ? '16px 0 6px' : '0 0 6px' }}>Exercise Catalog</Label>
            {catalogHits.map((c) => (
              <Row
                key={c.id} name={c.name} disabled={busy}
                meta={[c.muscles[0], c.equipment, c.category].filter(Boolean).join(' · ')}
                onClick={() => pickCatalog(c)}
              />
            ))}
          </>
        )}

        {!catalog && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', padding: '12px 2px' }}>
            Loading catalog…
          </p>
        )}

        {catalog && mineHits.length === 0 && catalogHits.length === 0 && (
          <Empty title="No matches" hint="Nothing in the catalog matches that. You can still add it as your own exercise." />
        )}
      </div>

      {/* Always available: the catalog is a convenience, not a gate. */}
      {q && !exactExists && (
        <Button
          variant="solid" style={{ width: '100%', marginTop: 14 }}
          onClick={() => setCustom({ name: query.trim(), tracking: 'weight_reps' })}
        >
          <Plus size={13} /> ADD “{query.trim()}” AS CUSTOM
        </Button>
      )}
      {!q && (
        <Button
          variant="ghost" style={{ width: '100%', marginTop: 14 }}
          onClick={() => setCustom({ name: '', tracking: 'weight_reps' })}
        >
          <Plus size={13} /> Create a Custom Exercise
        </Button>
      )}
    </Modal>
  )
}

function Row({ name, meta, onClick, disabled }: {
  name: string; meta: string; onClick: () => void; disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '9px 10px', background: hover ? `${ACCENT}14` : 'transparent',
        border: '1px solid transparent', borderLeft: `2px solid ${hover ? ACCENT : 'var(--border-dim)'}`,
        cursor: disabled ? 'wait' : 'pointer', marginBottom: 3, transition: 'var(--t-fast)',
      }}
    >
      <Dumbbell size={13} style={{ color: hover ? ACCENT : 'var(--text-dim)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, color: 'var(--text-hi)' }}>{name}</span>
        {meta && (
          <span style={{
            display: 'block', fontFamily: 'var(--font-body)', fontSize: 12,
            color: 'var(--text-dim)', letterSpacing: '0.05em', marginTop: 2,
          }}>
            {meta}
          </span>
        )}
      </span>
    </button>
  )
}
