'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Search } from 'lucide-react'
import type { Exercise } from '@/types/fitness'
import type { CatalogExercise } from '@/lib/fitness/catalog'
import { exerciseFromCatalog, getHistories, updateExercise, type ExerciseHistory } from '@/lib/fitness/db'
import { fmtSet } from '@/lib/fitness/calc'
import { MUSCLE_LABELS, kindOf, swapScore, type MuscleId } from '@/lib/fitness/muscles'
import { useCatalog } from './useCatalog'
import { MuscleChooser } from './MuscleSelect'
import { Modal, Input, Button, Label, Empty, ACCENT } from './ui'

// Swap an exercise for another that works the same muscle, for one session.
//
// The machine is taken, or broken, and you still want to train what it trains.
// This lists what else would do it: your own exercises first, with what you did
// last time, then the catalog. Nothing here touches the routine -- that keeps
// asking for the original next week.

const EQUIPMENT_LABELS: Record<string, string> = {
  'body only': 'Bodyweight',
  'e-z curl bar': 'EZ bar',
  kettlebells: 'Kettlebell',
  bands: 'Bands',
  'exercise ball': 'Ball',
  'foam roll': 'Foam roller',
  'medicine ball': 'Med ball',
}

function equipmentLabel(e: string): string {
  return EQUIPMENT_LABELS[e] ?? e.charAt(0).toUpperCase() + e.slice(1)
}

interface Option {
  key: string
  name: string
  equipment: string | null
  score: number
  owned?: Exercise
  catalog?: CatalogExercise
}

const CATALOG_PAGE = 30

export default function SwapExercise({ target, mine, inSession, onPick, onTargetChanged, onClose }: {
  target: Exercise
  mine: Exercise[]
  // Exercises already in today's session, which can't be swapped in twice.
  inSession: Set<string>
  // History is handed back when it was already fetched for the list, so the
  // logger doesn't download it a second time.
  onPick: (e: Exercise, known?: ExerciseHistory) => void
  // The muscle chosen here is saved to the exercise; the logger keeps its copy in step.
  onTargetChanged: (e: Exercise) => void
  onClose: () => void
}) {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const [equipment, setEquipment] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(CATALOG_PAGE)
  const [histories, setHistories] = useState<Map<string, ExerciseHistory>>(new Map())

  const use = useMemo(() => (catalog ? catalog.resolveMuscles(target) : null), [catalog, target])
  const muscle: MuscleId | null = use?.primary[0] ?? null

  const options = useMemo(() => {
    if (!catalog || !use || use.primary.length === 0) return { owned: [] as Option[], fromCatalog: [] as Option[] }
    const entry = catalog.catalogEntryFor(target)
    const want = { name: target.name, primary: use.primary, kind: kindOf(entry?.category, target.tracking_type, target.name) }
    const byScore = (a: Option, b: Option) => b.score - a.score || a.name.length - b.name.length

    const owned: Option[] = []
    for (const e of mine) {
      if (e.id === target.id || e.archived || inSession.has(e.id)) continue
      const c = catalog.catalogEntryFor(e)
      const score = swapScore(want, {
        name: e.name,
        equipment: e.equipment ?? c?.equipment ?? null,
        category: c?.category ?? null,
        primary: catalog.resolveMuscles(e).primary,
        kind: kindOf(c?.category, e.tracking_type, e.name),
      })
      if (score > 0) owned.push({ key: e.id, name: e.name, equipment: e.equipment ?? c?.equipment ?? null, score, owned: e })
    }

    // A catalog row you already own is listed above, under its own history.
    const mineNames = new Set(mine.map((e) => e.name.toLowerCase()))
    const fromCatalog: Option[] = []
    for (const c of catalog.CATALOG) {
      if (mineNames.has(c.name.toLowerCase())) continue
      const score = swapScore(want, {
        name: c.name,
        equipment: c.equipment,
        category: c.category,
        primary: catalog.resolveMuscles({ name: c.name, muscle: null, catalog_id: c.id }).primary,
        kind: kindOf(c.category, catalog.defaultTracking(c), c.name),
      })
      if (score > 0) fromCatalog.push({ key: c.id, name: c.name, equipment: c.equipment, score, catalog: c })
    }

    return { owned: owned.sort(byScore), fromCatalog: fromCatalog.sort(byScore) }
  }, [catalog, use, target, mine, inSession])

  // One query for what you did last time on each of your own alternatives.
  const ownedIds = useMemo(() => options.owned.map((o) => o.key).join(','), [options.owned])
  useEffect(() => {
    if (!ownedIds) return
    let live = true
    getHistories(ownedIds.split(','))
      .then((h) => { if (live) setHistories(h) })
      .catch(() => { /* the list still works without "last time" */ })
    return () => { live = false }
  }, [ownedIds])

  const q = query.trim().toLowerCase()
  const matches = (o: Option) =>
    (!equipment || o.equipment === equipment) && (!q || o.name.toLowerCase().includes(q))
  const ownedShown = options.owned.filter(matches)
  const catalogMatches = options.fromCatalog.filter(matches)
  const catalogShown = catalogMatches.slice(0, shown)

  // Only offer the equipment filters that would actually leave something.
  const equipmentChoices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of [...options.owned, ...options.fromCatalog]) {
      if (o.equipment && o.equipment !== 'other') counts.set(o.equipment, (counts.get(o.equipment) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)
  }, [options])

  async function saveMuscle(m: MuscleId) {
    setBusy(true)
    setError(null)
    try {
      await updateExercise(target.id, { muscle: m })
      onTargetChanged({ ...target, muscle: m })
      setChoosing(false)
      setEquipment(null)
      setShown(CATALOG_PAGE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  async function pick(o: Option) {
    if (o.owned) { onPick(o.owned, histories.get(o.owned.id)); return }
    if (!o.catalog) return
    setBusy(true)
    setError(null)
    try {
      onPick(await exerciseFromCatalog(o.catalog))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that exercise')
      setBusy(false)
    }
  }

  const title = `Swap ${target.name}`

  if (!catalog || !use) {
    return <Modal title={title} onClose={onClose}><Label>Loading…</Label></Modal>
  }

  // No muscle on record and nothing in the name to go on, or the user asked to
  // change it. Asked once: the answer is saved to the exercise.
  if (!muscle || choosing) {
    return (
      <Modal title={title} onClose={onClose}>
        <p style={{ fontSize: 15, color: 'var(--text-hi)', margin: '0 0 4px', fontWeight: 600 }}>
          Which muscle does it mainly work?
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, margin: '0 0 14px' }}>
          Pick the closest one and you&apos;ll get exercises that train the same thing. It&apos;s saved
          to {target.name}, so you only answer this once.
        </p>
        {error && <p style={{ color: '#f15959', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <MuscleChooser value={muscle} onChoose={saveMuscle} disabled={busy} />
        {muscle && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <Button variant="quiet" onClick={() => setChoosing(false)}>Back</Button>
          </div>
        )}
      </Modal>
    )
  }

  const nothing = options.owned.length === 0 && options.fromCatalog.length === 0

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', margin: 0, lineHeight: 1.5 }}>
          Other ways to train your{' '}
          <strong style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{MUSCLE_LABELS[muscle].toLowerCase()}</strong>
          {use.source === 'guess' && <span style={{ color: 'var(--text-dim)' }}> (guessed from the name)</span>}
        </p>
        {/* A catalog exercise's muscle is the catalog's call; yours is yours to fix. */}
        {!target.catalog_id && (
          <Button variant="quiet" onClick={() => setChoosing(true)} style={{ minHeight: 28, padding: '0 6px' }}>
            {use.source === 'guess' ? 'Not right?' : 'Change muscle'}
          </Button>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-dim)' }} />
        <Input
          value={query} onChange={(e) => { setQuery(e.target.value); setShown(CATALOG_PAGE) }}
          placeholder="Filter by name" aria-label="Filter alternatives by name"
          style={{ paddingLeft: 30 }}
        />
      </div>

      {equipmentChoices.length > 1 && (
        <div className="scroll-hide" role="group" aria-label="Filter by equipment" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0 0', paddingBottom: 2 }}>
          <Chip on={equipment === null} onClick={() => { setEquipment(null); setShown(CATALOG_PAGE) }}>Any equipment</Chip>
          {equipmentChoices.map((e) => (
            <Chip key={e} on={equipment === e} onClick={() => { setEquipment(equipment === e ? null : e); setShown(CATALOG_PAGE) }}>
              {equipmentLabel(e)}
            </Chip>
          ))}
        </div>
      )}

      {error && <p style={{ color: '#f15959', fontSize: 13, marginTop: 10 }}>{error}</p>}

      <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: 14 }}>
        {ownedShown.length > 0 && (
          <>
            <Label style={{ marginBottom: 6 }}>Your Exercises</Label>
            {ownedShown.map((o) => (
              <Row
                key={o.key} name={o.name} disabled={busy} onClick={() => pick(o)}
                meta={o.equipment ? equipmentLabel(o.equipment) : ''}
                last={lastTime(o.owned!, histories.get(o.key))}
              />
            ))}
          </>
        )}

        {catalogShown.length > 0 && (
          <>
            <Label style={{ margin: ownedShown.length ? '16px 0 6px' : '0 0 6px' }}>From the Catalog</Label>
            {catalogShown.map((o) => (
              <Row
                key={o.key} name={o.name} disabled={busy} onClick={() => pick(o)}
                meta={o.equipment ? equipmentLabel(o.equipment) : ''}
              />
            ))}
            {catalogMatches.length > catalogShown.length && (
              <Button variant="ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => setShown(shown + CATALOG_PAGE)}>
                Show More ({catalogMatches.length - catalogShown.length})
              </Button>
            )}
          </>
        )}

        {nothing && (
          <Empty
            title="Nothing else for this muscle"
            hint="No other exercise here trains the same one. Close this and use Add Exercise to pick anything you like."
          />
        )}
        {!nothing && ownedShown.length === 0 && catalogShown.length === 0 && (
          <Empty title="No matches" hint="Nothing fits that filter. Clear it to see every alternative." />
        )}
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, margin: '14px 0 0' }}>
        This only changes today&apos;s session. Sets are logged against the exercise you pick, and your
        routine keeps {target.name}.
      </p>
    </Modal>
  )
}

// "Nov 3: 135 x 8, 135 x 8, 135 x 6" -- what the grid will ghost if you pick it.
function lastTime(e: Exercise, h: ExerciseHistory | undefined): string {
  if (!h || h.lastSets.length === 0) return ''
  const sets = h.lastSets.filter((s) => !s.is_warmup)
  const list = (sets.length > 0 ? sets : h.lastSets).slice(0, 4).map((s) => fmtSet(e.tracking_type, s))
  const more = (sets.length > 0 ? sets : h.lastSets).length - list.length
  return `${shortDate(h.lastSets[0].date)}: ${list.join(', ')}${more > 0 ? `, +${more}` : ''}`
}

function shortDate(date: string): string {
  if (!date) return 'Last time'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      style={{
        flexShrink: 0, minHeight: 34, padding: '0 12px', cursor: 'pointer', whiteSpace: 'nowrap',
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
        background: on ? `${ACCENT}22` : 'transparent',
        border: `1px solid ${on ? ACCENT : 'var(--border-dim)'}`,
        color: on ? ACCENT : 'var(--text-mid)', transition: 'var(--t-fast)',
      }}
    >
      {children}
    </button>
  )
}

function Row({ name, meta, last, onClick, disabled }: {
  name: string; meta: string; last?: string; onClick: () => void; disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '9px 10px', background: hover ? `${ACCENT}14` : 'transparent',
        border: '1px solid transparent', borderLeft: `2px solid ${hover ? ACCENT : 'var(--border-dim)'}`,
        cursor: disabled ? 'wait' : 'pointer', marginBottom: 3, transition: 'var(--t-fast)',
      }}
    >
      <ArrowLeftRight size={13} aria-hidden="true" style={{ color: hover ? ACCENT : 'var(--text-dim)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, color: 'var(--text-hi)' }}>{name}</span>
        {(meta || last) && (
          <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.45 }}>
            {[meta, last].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </button>
  )
}
