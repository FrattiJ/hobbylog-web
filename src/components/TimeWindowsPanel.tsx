'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Plus, Trash2, CalendarArrowDown, Eye, EyeOff } from 'lucide-react'
import {
  getTimeWindows, insertTimeWindow, updateTimeWindow, deleteTimeWindow, WINDOWS_CHANGED_EVENT,
} from '@/lib/db'
import {
  DAY_SHORT, fmtDuration, hobbyMinutes, spanMinutes, weeklyHobbyHours, longestWindowHours,
  windowsToIcs, MAX_SPAN_MIN, type TimeWindow,
} from '@/lib/windows'

const ACCENT = '#0891b2'

// The share presets. A free-form percentage invites false precision about a block
// you're guessing at anyway; four choices covers "mine", "mostly mine", "split"
// and "I get a third of this".
const SHARES: Array<{ value: number; label: string }> = [
  { value: 1, label: 'All' },
  { value: 0.75, label: '¾' },
  { value: 0.5, label: '½' },
  { value: 0.33, label: '⅓' },
]

/** "18:15" <-> minutes from midnight, for <input type="time">. */
const toTimeValue = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const fromTimeValue = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const min = Number(m[1]) * 60 + Number(m[2])
  return min >= 0 && min <= 1439 ? min : null
}

/**
 * A block entered as 7:30pm-12:30am has an end time earlier than its start, which
 * every person means as "the next morning" and no naive reading does. Rolling the
 * end past 1440 keeps one late evening as one row.
 */
function resolveEnd(startMin: number, endRaw: number): number {
  const end = endRaw <= startMin ? endRaw + 1440 : endRaw
  return Math.min(end, startMin + MAX_SPAN_MIN)
}

export default function TimeWindowsPanel() {
  const [rows, setRows] = useState<TimeWindow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const load = () => { getTimeWindows().then(setRows).catch(() => setRows([])) }
    load()
    window.addEventListener(WINDOWS_CHANGED_EVENT, load)
    return () => window.removeEventListener(WINDOWS_CHANGED_EVENT, load)
  }, [])

  // Write through to the row, but keep the local copy authoritative for the input
  // so a slow round trip can't yank the field out from under what's being typed.
  async function patch(id: string, p: Partial<TimeWindow>) {
    setRows((cur) => (cur ?? []).map((w) => (w.id === id ? { ...w, ...p } : w)))
    setErr(null)
    try { await updateTimeWindow(id, p) } catch { setErr('Could not save that change.') }
  }

  async function addRow() {
    setBusy(true); setErr(null)
    try {
      // A weekday evening: the block most people are actually defending.
      await insertTimeWindow({ label: null, day_of_week: 3, start_min: 19 * 60, end_min: 21 * 60, share: 1, active: true })
      setRows(await getTimeWindows())
    } catch { setErr('Could not add a window.') }
    setBusy(false)
  }

  async function removeRow(id: string) {
    setRows((cur) => (cur ?? []).filter((w) => w.id !== id))
    try { await deleteTimeWindow(id) } catch { setErr('Could not delete that window.'); setRows(await getTimeWindows()) }
  }

  async function exportIcs() {
    const { download } = await import('@/lib/exportData')
    const ics = windowsToIcs(rows ?? [])
    download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'hobby-time.ics')
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }
  const note: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.55, margin: 0 }
  const field: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--border-dim)', color: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '6px 8px', outline: 'none' }

  const list = rows ?? []
  const weekly = weeklyHobbyHours(list)
  const longest = longestWindowHours(list)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <CalendarClock size={15} style={{ color: ACCENT }} />
        <h2 style={h2}>HOBBY TIME</h2>
        {weekly > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
            · {weekly}h/week · longest sitting {longest}h
          </span>
        )}
      </div>

      <p style={{ ...note, marginBottom: 14 }}>
        The blocks you reliably have free each week, so What Next knows what fits tonight.
      </p>

      {rows === null ? (
        <p style={note}>Loading…</p>
      ) : list.length === 0 ? (
        <p style={{ ...note, marginBottom: 14 }}>
          Nothing declared yet — add the windows you&apos;d defend.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {list.map((w) => {
            const span = spanMinutes(w)
            const hobby = hobbyMinutes(w)
            const crosses = w.end_min >= 1440
            return (
              <div key={w.id}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${w.active ? ACCENT : 'var(--border-dim)'}`, padding: '10px 12px', opacity: w.active ? 1 : 0.55 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select aria-label="Day" value={w.day_of_week} onChange={(e) => patch(w.id, { day_of_week: Number(e.target.value) })}
                    style={{ ...field, cursor: 'pointer', width: 72 }}>
                    {DAY_SHORT.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>

                  <input type="time" aria-label="Start time" value={toTimeValue(w.start_min)} step={900}
                    onChange={(e) => {
                      const start = fromTimeValue(e.target.value)
                      if (start == null) return
                      patch(w.id, { start_min: start, end_min: resolveEnd(start, w.end_min % 1440) })
                    }}
                    style={{ ...field, width: 108 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>to</span>
                  <input type="time" aria-label="End time" value={toTimeValue(w.end_min)} step={900}
                    onChange={(e) => {
                      const end = fromTimeValue(e.target.value)
                      if (end == null) return
                      patch(w.id, { end_min: resolveEnd(w.start_min, end) })
                    }}
                    style={{ ...field, width: 108 }} />
                  {crosses && (
                    <span title="Runs past midnight into the next day"
                      style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: ACCENT, letterSpacing: '0.05em' }}>+1 Day</span>
                  )}

                  <input value={w.label ?? ''} placeholder="label (optional)" maxLength={40}
                    onChange={(e) => setRows((cur) => (cur ?? []).map((x) => (x.id === w.id ? { ...x, label: e.target.value } : x)))}
                    onBlur={(e) => patch(w.id, { label: e.target.value })}
                    style={{ ...field, flex: '1 1 130px', minWidth: 0 }} aria-label="label (optional)" />

                  <button onClick={() => patch(w.id, { active: !w.active })}
                    title={w.active ? 'Pause this window (keeps it for later)' : 'Use this window again'}
                    style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', cursor: 'pointer' }} aria-label={w.active ? 'Pause this window (keeps it for later)' : 'Use this window again'}>
                    {w.active ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button onClick={() => removeRow(w.id)} title="Delete this window"
                    style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'transparent', border: '1px solid #ef444455', color: '#f87171', cursor: 'pointer' }} aria-label="Delete this window">
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* The share factor, with the number it produces spelled out. */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 9 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Hobby Share</span>
                  {SHARES.map((s) => {
                    const on = Math.abs(w.share - s.value) < 0.02
                    return (
                      <button key={s.value} onClick={() => patch(w.id, { share: s.value })}
                        style={{ minWidth: 34, padding: '3px 8px', fontFamily: 'var(--font-body)', fontSize: 12, background: on ? `${ACCENT}22` : 'transparent', border: `1px solid ${on ? ACCENT : 'var(--border-dim)'}`, color: on ? ACCENT : 'var(--text-dim)', cursor: 'pointer' }}>
                        {s.label}
                      </button>
                    )
                  })}
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
                    {hobby === span
                      ? `${fmtDuration(span)} of hobby time`
                      : `≈ ${fmtDuration(hobby)} of ${fmtDuration(span)} — the rest shared with everything else`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={addRow} disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <Plus size={13} /> Add a Window
        </button>
        {list.some((w) => w.active) && (
          <button onClick={exportIcs}
            title="Download these blocks as a weekly-recurring .ics for your own calendar"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }} aria-label="Download these blocks as a weekly-recurring .ics for your own calendar">
            <CalendarArrowDown size={13} /> Export .ics
          </button>
        )}
      </div>

      {err && <p style={{ ...note, color: '#f87171', marginTop: 12 }}>{err}</p>}
    </div>
  )
}
