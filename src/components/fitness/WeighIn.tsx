'use client'

import { useEffect, useState } from 'react'
import { Scale, Check, Trash2 } from 'lucide-react'
import { deleteBodyweight, evaluateGoals, listBodyweight, setBodyweight, type BodyweightPoint } from '@/lib/fitness/db'
import { isoDay } from '@/lib/fitness/calc'
import { useToast } from '../Toast'
import { Button, Input, Label, Modal, ACCENT } from './ui'

const BLUE = '#0891b2'

// Logging a weigh-in can complete a bodyweight goal exactly as finishing a
// workout can, so every save re-checks them and reports what it hit.
async function saveAndCheckGoals(date: string, weight: number): Promise<string[]> {
  await setBodyweight(date, weight)
  const progress = await evaluateGoals().catch(() => [])
  return progress.filter((g) => g.met && !g.goal.achieved_at).map((g) => g.goal.name)
}

function parseWeight(text: string): number | null {
  const n = parseFloat(text.trim())
  // A scale reading is a positive number; 0 or a stray minus is a typo, not data.
  return text.trim() && !isNaN(n) && n > 0 ? n : null
}

function fmtDelta(current: number, previous: number): string | null {
  const d = Math.round((current - previous) * 10) / 10
  if (d === 0) return 'NO CHANGE'
  return `${d > 0 ? '+' : ''}${d} LBS`
}

// -- Today's weigh-in, on the Today tab --------------------------------------

// Sits above the session UI and is always visible, workout or not — the whole
// point is that a morning weigh-in shouldn't wait on an evening workout.
export default function WeighInCard({ onLogged }: { onLogged?: () => void }) {
  const { success, error: toastError } = useToast()
  const today = isoDay(new Date())

  const [history, setHistory] = useState<BodyweightPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => listBodyweight()
    .then(setHistory)
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const todays = history.find((h) => h.date === today) ?? null
  // The most recent reading that isn't today's, for the change line.
  const previous = [...history].reverse().find((h) => h.date !== today) ?? null

  async function save() {
    const weight = parseWeight(text)
    if (weight == null) { toastError('Enter a weight in pounds'); return }
    setSaving(true)
    try {
      const hit = await saveAndCheckGoals(today, weight)
      success(hit.length > 0 ? `Weight logged — goal reached: ${hit.join(', ')}` : 'Weight logged')
      setEditing(false)
      setText('')
      await load()
      onLogged?.()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save that weight')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  const showInput = editing || !todays

  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderLeft: `3px solid ${BLUE}`,
      background: 'var(--bg-card)', padding: '12px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showInput ? 9 : 6 }}>
        <Scale size={13} style={{ color: BLUE, flexShrink: 0 }} />
        <Label>TODAY&apos;S WEIGH-IN</Label>
      </div>

      {showInput ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder={todays ? String(todays.weight) : previous ? String(previous.weight) : 'lbs'}
            inputMode="decimal"
            autoFocus={editing}
            style={{ flex: '1 1 110px', minWidth: 0 }}
          />
          <Button variant="solid" accent={BLUE} onClick={save} disabled={saving}>
            <Check size={12} /> {saving ? 'SAVING…' : 'LOG'}
          </Button>
          {todays && (
            <Button variant="quiet" onClick={() => { setEditing(false); setText('') }}>CANCEL</Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--text-hi)' }}>
              {todays!.weight}
            </span>
            <Label>LBS</Label>
            {previous && (
              <Label style={{ color: 'var(--text-mute)' }}>{fmtDelta(todays!.weight, previous.weight)}</Label>
            )}
          </div>
          <Button variant="quiet" onClick={() => { setEditing(true); setText(String(todays!.weight)) }}>
            CHANGE
          </Button>
        </div>
      )}

      {showInput && !todays && previous && (
        <Label style={{ marginTop: 7, color: 'var(--text-mute)' }}>
          LAST READING {previous.weight} LBS ON {previous.date}
        </Label>
      )}
    </div>
  )
}

// -- Logging a weigh-in for any date -----------------------------------------

// The Progress tab's way in, so a day you forgot can be filled in after the fact.
export function WeighInModal({ existing, onClose, onSaved }: {
  existing: BodyweightPoint[]
  onClose: () => void
  onSaved: () => void
}) {
  const { success, error: toastError } = useToast()
  const [date, setDate] = useState(isoDay(new Date()))
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const onThatDay = existing.find((e) => e.date === date) ?? null

  // Moving the date shows what's already recorded there, so saving can't silently
  // overwrite a reading you'd forgotten about.
  useEffect(() => { setText(onThatDay ? String(onThatDay.weight) : '') }, [date, onThatDay])

  async function save() {
    const weight = parseWeight(text)
    if (weight == null) { toastError('Enter a weight in pounds'); return }
    setSaving(true)
    try {
      const hit = await saveAndCheckGoals(date, weight)
      success(hit.length > 0 ? `Weight logged — goal reached: ${hit.join(', ')}` : 'Weight logged')
      onSaved()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save that weight')
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await deleteBodyweight(date)
      success('Weigh-in removed')
      onSaved()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove that weigh-in')
      setSaving(false)
    }
  }

  return (
    <Modal title="Log a weigh-in" onClose={onClose} width={420}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label style={{ marginBottom: 5 }}>DATE</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={isoDay(new Date())} />
        </div>
        <div>
          <Label style={{ marginBottom: 5 }}>WEIGHT (LBS)</Label>
          <Input
            autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="—" inputMode="decimal"
          />
        </div>
      </div>

      {onThatDay && (
        <Label style={{ marginTop: 9, color: ACCENT }}>
          ALREADY LOGGED THAT DAY — SAVING REPLACES IT
        </Label>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        {onThatDay && (
          <Button variant="quiet" onClick={remove} disabled={saving}><Trash2 size={12} /> REMOVE</Button>
        )}
        <Button variant="quiet" onClick={onClose}>CANCEL</Button>
        <Button variant="solid" accent={BLUE} onClick={save} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE'}
        </Button>
      </div>
    </Modal>
  )
}
