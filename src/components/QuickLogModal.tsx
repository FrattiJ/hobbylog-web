'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getAllEntries, insertSession, updateEntry, normalizeBacklogPriorities } from '@/lib/db'
import { HOBBY_MAP } from '@/lib/hobbies'
import { CLIP } from './MechCard'
import type { Entry } from '@/types/database'
import { useEscape } from '@/lib/useEscape'

export default function QuickLogModal({ onClose, onLogged }: { onClose: () => void; onLogged?: () => void }) {
  useEscape(onClose)
  const [entries, setEntries] = useState<Entry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [progress, setProgress] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { getAllEntries().then((e) => setEntries(e.filter((x) => x.status !== 'completed' && x.status !== 'dropped'))) }, [])

  const matches = query.trim().length >= 2
    ? entries.filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []

  async function log() {
    if (!selected) return
    const dur = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0)
    const prog = progress ? parseFloat(progress) : null
    if (!dur && prog == null) return
    setBusy(true)
    const date = new Date().toISOString().split('T')[0]
    try {
      await insertSession({ entry_id: selected.id, date, duration_minutes: dur || null, progress_logged: prog, notes: notes.trim() || null })
      const update: Record<string, unknown> = {}
      // A session on something still waiting (backlog or wishlist) means it has started.
      const waiting = selected.status === 'backlog' || selected.status === 'wishlist'
      if (waiting) { update.status = 'in_progress'; update.date_started = date }
      let inc = prog
      // Where the session's length IS the progress, don't ask for the same
      // number twice: games count hours, movies and audiobooks count minutes.
      const isAudiobook = selected.hobby_category === 'books' && selected.book_subtype === 'audiobook'
      if (selected.hobby_category === 'games' && prog == null && dur) inc = Math.round((dur / 60) * 10) / 10
      else if ((selected.hobby_category === 'movies' || isAudiobook) && prog == null && dur) inc = dur
      if (inc && inc > 0) {
        const total = selected.progress_total || (selected.hobby_category === 'games' && selected.metadata?.time_to_beat ? Number(selected.metadata.time_to_beat) : null) || Number.MAX_SAFE_INTEGER
        update.progress_current = Math.round(Math.min((selected.progress_current || 0) + inc, total) * 10) / 10
      }
      if (Object.keys(update).length) await updateEntry(selected.id, update)
      // Logging moves a backlog item to In Progress — close the rank gap it leaves.
      if (selected.status === 'backlog') await normalizeBacklogPriorities(selected.hobby_category)
      setDone(true); onLogged?.()
      setTimeout(onClose, 1000)
    } catch { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: '2px solid #0891b266', padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }
  const label: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose() }}
      role="dialog" aria-modal="true" aria-label="Log a session"
      style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, zIndex: 70, background: 'var(--overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 460, padding: '1px', clipPath: CLIP, background: '#0891b255' }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 22, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#0891b2', clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: 0 }}>Quick log</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>LOG SESSION</h2>
            </div>
            <button aria-label="Close" onClick={onClose} style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
          </div>

          {done ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#22c55e', letterSpacing: '0.05em', textAlign: 'center', padding: '20px 0' }}>Session Logged</p>
          ) : !selected ? (
            <>
              <p style={label}>Find Entry</p>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your library…" style={inp} autoFocus aria-label="Find Entry" />
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {matches.map((e) => {
                  const h = HOBBY_MAP[e.hobby_category]
                  return (
                    <button key={e.id} onClick={() => setSelected(e)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${h?.accent ?? '#0891b2'}`, cursor: 'pointer' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>{(h?.pluralLabel ?? e.hobby_category)}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-hi)', margin: '0 0 4px' }}>{selected.title}</p>
              <button onClick={() => setSelected(null)} style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14 }}>← pick another</button>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><p style={label}>hrs</p><input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" style={inp} aria-label="hrs" /></div>
                <div style={{ flex: 1 }}><p style={label}>min</p><input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" style={inp} aria-label="min" /></div>
                <div style={{ flex: 1 }}><p style={label}>+{HOBBY_MAP[selected.hobby_category]?.progressUnit ?? 'progress'}</p><input type="number" min={0} aria-label="Progress made" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="0" style={inp} /></div>
              </div>
              <p style={label}>Notes</p>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="—" style={{ ...inp, marginBottom: 16 }} aria-label="Notes" />
              <button onClick={log} disabled={busy}
                style={{ width: '100%', padding: '11px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', color: '#0891b2', background: '#0891b222', border: '1px solid #0891b2', borderLeft: '3px solid #0891b2', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? '…' : 'Log Session'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
