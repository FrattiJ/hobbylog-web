'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Entry } from '@/types/database'
import { HOBBY_MAP, STATUS_COLORS, statusLabelFor } from '@/lib/hobbies'
import { getSessionLog, type SessionLogRow } from '@/lib/db'
import { formatDay, formatDayShort, todayIso } from '@/lib/format'
import { fmtHours } from '@/lib/windows'
import { PLAN_MODES, addDays, buildPlan, planProgress, type Plan, type PlanItem, type PlanMode, type SavedPlan } from '@/lib/plan'
import { deleteSavedPlan, getSavedPlan, saveSavedPlan } from '@/lib/planStore'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Panel, Tag, Btn, Empty, Cover } from './ui'

// Plan to a date: say how much time you have and when you want to be done, and
// see which of the things you own fit, in order, each with the day it would be
// finished. Saving a plan keeps the list so it can be measured against later.

const ACCENT = '#5f8df1'

const weeksText = (days: number) => {
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  const w = Math.round(days / 7)
  return `${w} weeks`
}

const field: React.CSSProperties = {
  height: 40, background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`,
  padding: '0 10px', color: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 16, outline: 'none',
}
const fieldLabel: React.CSSProperties = { display: 'block', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 10px' }
const hint: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: '10px 0 0', lineHeight: 1.5 }
const body: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.55, margin: 0 }

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        minHeight: 32, padding: '0 11px', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: 'pointer',
        background: on ? `${ACCENT}22` : 'transparent', border: `1px solid ${on ? ACCENT : 'var(--border-dim)'}`,
        color: on ? ACCENT : 'var(--text-mid)', transition: 'var(--t-fast)', whiteSpace: 'nowrap',
      }}>
      {children}
    </button>
  )
}

/** Today to the goal date as one bar: a segment per item, then what is left over. */
function PlanBar({ plan, goal }: { plan: Plan; goal: string }) {
  const total = Math.max(plan.budgetHours, plan.usedHours, 0.1)
  return (
    <div>
      <div className="plan-bar" role="img"
        aria-label={`${plan.items.length} ${plan.items.length === 1 ? 'thing' : 'things'} using ${fmtHours(plan.usedHours)} of ${fmtHours(plan.budgetHours)}`}>
        {plan.items.map((it) => (
          <span key={it.entry.id} title={`${it.entry.title}, ${fmtHours(it.hours)}`}
            style={{ width: `${(it.hours / total) * 100}%`, background: HOBBY_MAP[it.entry.hobby_category]?.accent ?? ACCENT }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', marginTop: 5 }}>
        <span>Today</span>
        <span>{formatDay(goal)}</span>
      </div>
    </div>
  )
}

function ItemRow({ item, index, children }: { item: PlanItem; index: number; children: React.ReactNode }) {
  const e = item.entry
  const hobby = HOBBY_MAP[e.hobby_category]
  const accent = hobby?.accent ?? ACCENT
  return (
    <li className="plan-row" style={{ borderLeftColor: accent }}>
      <span style={{ width: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-mid)' }}>
        <span className="sr-only">Number </span>{index + 1}
      </span>
      <Cover url={e.cover_url} title={e.title} accent={accent} size="sm" />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-hi)', margin: '0 0 6px', overflowWrap: 'anywhere' }}>{e.title}</p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          <Tag color={accent}>{hobby?.label}</Tag>
          {item.carried && <Tag color={STATUS_COLORS.in_progress}>{statusLabelFor(hobby, 'in_progress')}</Tag>}
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', margin: 0 }}>
          {fmtHours(item.hours)} {item.carried ? 'left' : 'long'}, {item.start === item.end ? `on ${formatDayShort(item.end)}` : `${formatDayShort(item.start)} to ${formatDayShort(item.end)}`}
        </p>
      </div>
      <div>{children}</div>
    </li>
  )
}

export default function PlanPanel({ entries, rank, paceHours, windowHours }: {
  /** The library, narrowed to the hobbies in scope. */
  entries: Entry[]
  /** Backlog ids in Next Up order, for the balanced plan. */
  rank: string[]
  /** Hours a week measured from the reader's own history; 0 when unknown. */
  paceHours: number
  /** Hours a week declared as weekly windows; 0 when none are set. */
  windowHours: number
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [today] = useState(() => todayIso())

  const [hours, setHours] = useState(() => (paceHours > 0 ? paceHours : windowHours > 0 ? windowHours : 5))
  const [goal, setGoal] = useState(() => addDays(todayIso(), 90))
  const [mode, setMode] = useState<PlanMode>('balanced')
  const [left, setLeft] = useState<Set<string>>(new Set())

  // undefined while loading, null when there is none.
  const [saved, setSaved] = useState<SavedPlan | null | undefined>(undefined)
  const [sessions, setSessions] = useState<SessionLogRow[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getSavedPlan().then((p) => { if (alive) setSaved(p) }).catch(() => { if (alive) setSaved(null) })
    getSessionLog().then((s) => { if (alive) setSessions(s) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const plan = useMemo(
    () => buildPlan({ entries, rank, hoursPerWeek: hours, today, goal, mode, exclude: left }),
    [entries, rank, hours, today, goal, mode, left],
  )
  const progress = useMemo(
    () => (saved ? planProgress(saved, entries, sessions, today) : null),
    [saved, entries, sessions, today],
  )

  const goalValid = goal > today
  const endOfYear = `${today.slice(0, 4)}-12-31`
  const presets = [
    { label: '1 month', date: addDays(today, 30) },
    { label: '3 months', date: addDays(today, 90) },
    { label: '6 months', date: addDays(today, 182) },
    ...(endOfYear > addDays(today, 14) ? [{ label: 'End of the year', date: endOfYear }] : []),
  ]

  async function save() {
    if (busy || plan.items.length === 0) return
    setBusy(true)
    try {
      const next: SavedPlan = { hours_per_week: hours, goal_date: goal, mode, entry_ids: plan.items.map((i) => i.entry.id), started_on: today }
      await saveSavedPlan(next)
      setSaved(next); setEditing(false)
      toast.success('Plan saved')
    } catch (e) {
      toast.error(e instanceof Error && e.name === 'NotReadyError' ? e.message : 'Could not save the plan. Try again.')
    }
    setBusy(false)
  }

  async function remove() {
    if (!(await confirm({
      title: 'Remove this plan?',
      body: 'The plan and its progress figures go. Nothing in your library changes.',
      confirmLabel: 'Remove Plan',
      danger: true,
    }))) return
    setBusy(true)
    try { await deleteSavedPlan(); setSaved(null); setEditing(false) }
    catch { toast.error('Could not remove the plan. Try again.') }
    setBusy(false)
  }

  // Open the builder on the saved plan's own settings, to change and save again.
  function adjust() {
    if (!saved) return
    setHours(saved.hours_per_week); setMode(saved.mode); setLeft(new Set())
    setGoal(saved.goal_date > today ? saved.goal_date : addDays(today, 30))
    setEditing(true)
  }

  // ── A saved plan, and how it is going ──────────────────────────────────────
  if (saved && progress && !editing) {
    const r = progress.remaining
    const allDone = r.items.length === 0
    return (
      <Panel accent={ACCENT} title="Your Plan"
        sub={`${saved.hours_per_week}h a week, to be done by ${formatDay(saved.goal_date)}. Saved ${formatDay(saved.started_on)}.`}
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn color={ACCENT} onClick={adjust} disabled={busy}>Change Plan</Btn>
            <Btn onClick={remove} disabled={busy}>Remove Plan</Btn>
          </div>
        }>
        <dl className="month-strip" style={{ borderLeftColor: ACCENT, marginBottom: 16 }}>
          <div><dt>Finished</dt><dd>{progress.finished.length} of {progress.total}</dd></div>
          <div><dt>Hours logged</dt><dd>{progress.hoursLogged}</dd></div>
          <div><dt>Hours planned by now</dt><dd>{progress.hoursExpected}</dd></div>
          <div><dt>Left to do</dt><dd>{fmtHours(r.usedHours)}</dd></div>
        </dl>

        <p style={{ ...body, marginBottom: 16, color: 'var(--text-hi)' }}>
          {allDone
            ? progress.finished.length > 0 ? 'Everything in this plan is finished.' : 'Nothing in this plan is left to do.'
            : progress.ended
              ? `The date has passed with ${r.items.length} still to finish. At ${saved.hours_per_week}h a week the rest takes until ${formatDay(r.finishBy)}.`
              : progress.onTrack
                ? `On track: at ${saved.hours_per_week}h a week the rest is done by ${formatDay(r.finishBy)}, ${r.spareDays === 0 ? 'right on the date' : `${weeksText(r.spareDays)} early`}.`
                : `Behind: at ${saved.hours_per_week}h a week the rest runs ${weeksText(progress.daysOver)} past your date, to ${formatDay(r.finishBy)}.`}
          {progress.gone > 0 && ` ${progress.gone} ${progress.gone === 1 ? 'was' : 'were'} dropped or removed since you saved it.`}
        </p>

        {!allDone && <div style={{ marginBottom: 16 }}><PlanBar plan={r} goal={saved.goal_date} /></div>}

        {!allDone && (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.items.map((it, i) => (
              <ItemRow key={it.entry.id} item={it} index={i}>
                <Link href={`/entry?id=${it.entry.id}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, padding: '0 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-mid)', border: '1px solid var(--text-dim)', textDecoration: 'none' }}>Open</Link>
              </ItemRow>
            ))}
          </ol>
        )}

        {progress.finished.length > 0 && (
          <p style={{ ...hint, marginTop: 14 }}>
            Finished: {progress.finished.map((e) => e.title).join(', ')}.
          </p>
        )}
        {r.unknownLength > 0 && (
          <p style={hint}>{r.unknownLength} in this plan no longer {r.unknownLength === 1 ? 'has' : 'have'} a length recorded, so {r.unknownLength === 1 ? 'it is' : 'they are'} not scheduled.</p>
        )}
      </Panel>
    )
  }

  // ── The builder ────────────────────────────────────────────────────────────
  const dailyMinutes = Math.round((hours / 7) * 60)
  return (
    <Panel accent={ACCENT} title="Plan to a Date"
      sub="Say how much time you have and when you want to be done. The plan fills that time from what you already own, with the day each thing would be finished."
      right={editing ? <Btn onClick={() => setEditing(false)}>Back to Saved Plan</Btn> : undefined}>
      <div className="plan-fields">
        <div className="plan-field">
          <label htmlFor="plan-hours" style={fieldLabel}>Hours you have each week</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input id="plan-hours" type="number" min={0.5} max={100} step={0.5} value={hours}
              onChange={(e) => setHours(Math.max(0.5, Math.min(100, Number(e.target.value) || 0.5)))}
              style={{ ...field, width: 92 }} />
            {paceHours > 0 && <Chip on={hours === paceHours} onClick={() => setHours(paceHours)}>Your pace, {paceHours}h</Chip>}
            {windowHours > 0 && <Chip on={hours === windowHours} onClick={() => setHours(windowHours)}>Your windows, {windowHours}h</Chip>}
            {[3, 7, 14].filter((h) => h !== paceHours && h !== windowHours).map((h) => (
              <Chip key={h} on={hours === h} onClick={() => setHours(h)}>{h}h</Chip>
            ))}
          </div>
          <p style={hint}>
            About {dailyMinutes >= 60 ? fmtHours(hours / 7) : `${dailyMinutes} minutes`} a day.
            {paceHours > 0 ? ' Your pace is what your sessions and finishes of the last twelve weeks add up to.' : ''}
          </p>
        </div>

        <div className="plan-field">
          <label htmlFor="plan-goal" style={fieldLabel}>Be done by</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input id="plan-goal" type="date" min={addDays(today, 1)} value={goal} onChange={(e) => { if (e.target.value) setGoal(e.target.value) }}
              style={{ ...field, width: 'auto' }} />
            {presets.map((p) => <Chip key={p.label} on={goal === p.date} onClick={() => setGoal(p.date)}>{p.label}</Chip>)}
          </div>
          <p style={hint}>
            {goalValid
              ? `${weeksText(plan.days)} from today, which is about ${fmtHours(plan.budgetHours)} at ${hours}h a week.`
              : 'Pick a date after today.'}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="tab-row" role="tablist" aria-label="How to fill the time" style={{ marginBottom: 8 }}>
          {PLAN_MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)}
              style={{
                minHeight: 38, padding: '0 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: mode === m.id ? 600 : 500, cursor: 'pointer',
                background: mode === m.id ? `${ACCENT}22` : 'transparent', border: `1px solid ${mode === m.id ? ACCENT : 'var(--border-dim)'}`,
                color: mode === m.id ? ACCENT : 'var(--text-mid)', transition: 'var(--t-fast)',
              }}>
              {m.label}
            </button>
          ))}
        </div>
        <p style={{ ...hint, margin: 0 }}>{PLAN_MODES.find((m) => m.id === mode)!.blurb}</p>
      </div>

      {!goalValid ? null : plan.items.length === 0 ? (
        <Empty>
          {plan.didNotFit > 0
            ? <>Nothing fits in {fmtHours(plan.budgetHours)}.<br />Give it more hours a week or a later date.</>
            : plan.unknownLength > 0
              ? <>Nothing here has a length recorded, so there is nothing to put a date on.<br />Open an entry and use Update Details to fill its length in.</>
              : <>Nothing in your backlog or in progress for this filter.</>}
        </Empty>
      ) : (
        <>
          <div style={{ padding: '14px 16px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, marginBottom: 14 }}>
            <p style={{ ...body, color: 'var(--text-hi)', marginBottom: 12 }}>
              {plan.items.length} {plan.items.length === 1 ? 'thing' : 'things'} finished by {formatDay(plan.finishBy)}
              {plan.spareDays > 0 ? `, ${weeksText(plan.spareDays)} before your date` : ''}.
              {' '}That uses {fmtHours(plan.usedHours)} of the {fmtHours(plan.budgetHours)} you have.
            </p>
            <PlanBar plan={plan} goal={goal} />
          </div>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plan.items.map((it, i) => (
              <ItemRow key={it.entry.id} item={it} index={i}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Link href={`/entry?id=${it.entry.id}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, padding: '0 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-mid)', border: '1px solid var(--text-dim)', textDecoration: 'none' }}>Open</Link>
                  <Btn onClick={() => setLeft((prev) => new Set(prev).add(it.entry.id))}>Leave Out</Btn>
                </div>
              </ItemRow>
            ))}
          </ol>
        </>
      )}

      {goalValid && (plan.didNotFit > 0 || plan.unknownLength > 0 || left.size > 0) && (
        <div style={{ marginTop: 14 }}>
          {plan.didNotFit > 0 && plan.items.length > 0 && (
            <p style={hint}>{plan.didNotFit} more {plan.didNotFit === 1 ? 'does' : 'do'} not fit in the time that is left.</p>
          )}
          {plan.unknownLength > 0 && plan.items.length > 0 && (
            <p style={hint}>{plan.unknownLength} {plan.unknownLength === 1 ? 'entry has' : 'entries have'} no length recorded, so {plan.unknownLength === 1 ? 'it' : 'they'} cannot be given a date. Projects, art and recipes are always in this group.</p>
          )}
          {left.size > 0 && (
            <p style={hint}>
              {left.size} left out.{' '}
              <button type="button" onClick={() => setLeft(new Set())}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', textDecoration: 'underline' }}>
                Put {left.size === 1 ? 'it' : 'them'} back
              </button>
            </p>
          )}
        </div>
      )}

      {goalValid && plan.items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-dim)' }}>
          <Btn color={ACCENT} filled onClick={save} disabled={busy || saved === undefined}>
            {busy ? 'Saving…' : saved ? 'Replace Saved Plan' : 'Save This Plan'}
          </Btn>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', flex: '1 1 220px', lineHeight: 1.5 }}>
            Saving keeps this list and counts what you finish and log against it from today. Nothing in your library changes.
          </span>
        </div>
      )}
    </Panel>
  )
}
