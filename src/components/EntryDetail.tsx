'use client'

import { useState, useEffect, useCallback } from 'react'
import { HOBBY_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { updateEntry, deleteEntry, refetchDetails, type WebEntry } from '@/lib/entries'
import { getSessionsByEntry, insertSession, deleteSession, getPhotosByEntry, type Photo } from '@/lib/db'
import PhotoGallery from './PhotoGallery'
import { searchTypeFor } from '@/lib/search'
import type { HobbyCategory, Session } from '@/types/database'

const ACCENT = '#7c3aed'
const STATUSES = ['backlog', 'in_progress', 'completed', 'dropped']
const META_KEYS = ['genres', 'platforms', 'author', 'rating', 'release_year', 'director', 'studios'] as const

export default function EntryDetail({ entry, onClose, onChanged }: {
  entry: WebEntry
  onClose: () => void
  onChanged: () => void
}) {
  const hobby = HOBBY_MAP[entry.hobby_category as HobbyCategory]
  const accent = hobby?.accent ?? ACCENT

  const [status, setStatus] = useState(entry.status)
  const [rating, setRating] = useState(entry.rating?.toString() ?? '')
  const [progressCurrent, setProgressCurrent] = useState(entry.progress_current?.toString() ?? '0')
  const [progressTotal, setProgressTotal] = useState(entry.progress_total?.toString() ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [coverUrl, setCoverUrl] = useState(entry.cover_url ?? '')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [sessions, setSessions] = useState<Session[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [sHours, setSHours] = useState('')
  const [sMinutes, setSMinutes] = useState('')
  const [sProgress, setSProgress] = useState('')
  const [sNotes, setSNotes] = useState('')

  const loadExtras = useCallback(() => {
    getSessionsByEntry(entry.id).then(setSessions).catch(() => {})
    getPhotosByEntry(entry.id).then(setPhotos).catch(() => {})
  }, [entry.id])
  useEffect(() => { loadExtras() }, [loadExtras])

  async function addSession() {
    const dur = (parseInt(sHours) || 0) * 60 + (parseInt(sMinutes) || 0)
    const prog = sProgress ? parseFloat(sProgress) : null
    if (!dur && prog == null && !sNotes.trim()) return
    setBusy(true); setNote(null)
    try {
      await insertSession({ entry_id: entry.id, date: new Date().toISOString().split('T')[0], duration_minutes: dur || null, progress_logged: prog, notes: sNotes.trim() || null })
      if (prog && prog > 0) {
        const cur = Math.round(((parseFloat(progressCurrent) || 0) + prog) * 10) / 10
        setProgressCurrent(String(cur))
        await updateEntry(entry.id, { progress_current: cur })
      }
      setSHours(''); setSMinutes(''); setSProgress(''); setSNotes('')
      loadExtras(); onChanged()
    } catch (e) { setNote(`Session failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function removeSession(id: string) { await deleteSession(id); loadExtras() }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${accent}66`, padding: '9px 12px', color: 'var(--text-hi)',
    fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none',
  }
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.2em',
    textTransform: 'uppercase', margin: '0 0 6px',
  }

  async function save() {
    setBusy(true); setNote(null)
    const today = new Date().toISOString().split('T')[0]
    try {
      await updateEntry(entry.id, {
        status,
        rating: rating ? parseFloat(rating) : null,
        notes: notes.trim() || null,
        progress_current: progressCurrent ? parseFloat(progressCurrent) : 0,
        progress_total: progressTotal ? parseFloat(progressTotal) : null,
        cover_url: coverUrl.trim() || null,
        date_completed: status === 'completed' && !entry.date_completed ? today : entry.date_completed,
        date_started: status === 'in_progress' && !entry.date_started ? today : entry.date_started,
      })
      onChanged()
      onClose()
    } catch (e) { setNote(`Save failed: ${(e as Error).message}`); setBusy(false) }
  }

  async function updateDetails() {
    setBusy(true); setNote(null)
    try {
      const patch = await refetchDetails(entry)
      if (patch) {
        if (patch.cover_url) setCoverUrl(patch.cover_url)
        if (patch.progress_total != null) setProgressTotal(String(patch.progress_total))
        setNote('Metadata refreshed.')
        onChanged()
      } else setNote('No match found.')
    } catch (e) { setNote(`Update failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function remove() {
    if (!confirm(`Delete "${entry.title}"?`)) return
    setBusy(true)
    try { await deleteEntry(entry.id); onChanged(); onClose() }
    catch (e) { setNote(`Delete failed: ${(e as Error).message}`); setBusy(false) }
  }

  const metaRows = META_KEYS
    .map((k) => [k, entry.metadata?.[k]] as const)
    .filter(([, v]) => v != null && v !== '')
  const canRefetch = searchTypeFor(entry.hobby_category) !== null
  const isCompleted = status === 'completed'

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 640, background: 'var(--bg-card)', border: `1px solid ${accent}55`, borderTop: `3px solid ${accent}` }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border-dim)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...label, color: accent, margin: '0 0 3px' }}>{(hobby?.pluralLabel ?? entry.hobby_category).toUpperCase()}</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: '0.04em', margin: 0, lineHeight: 1.2 }}>{entry.title}</h2>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 18, padding: 18, flexWrap: 'wrap' }}>
          {/* Cover + meta */}
          <div style={{ flex: '0 0 150px', maxWidth: 150 }}>
            <div style={{ aspectRatio: '2/3', background: 'var(--bg-base)', border: `1px solid ${accent}44`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              {coverUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={coverUrl} alt={entry.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 44, color: `${accent}66` }}>{entry.title[0]?.toUpperCase()}</span>}
            </div>
            {metaRows.length > 0 && (
              <div style={{ background: 'var(--bg-base)', border: `1px solid ${accent}22`, borderLeft: `3px solid ${accent}`, padding: 10 }}>
                {metaRows.map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 6 }}>
                    <p style={{ ...label, fontSize: 9, margin: 0 }}>{k.replace(/_/g, ' ')}</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-hi)', margin: '1px 0 0', lineHeight: 1.4 }}>
                      {k === 'rating' && typeof v === 'number' ? `${v.toFixed(1)}/10` : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div style={{ flex: '1 1 300px', minWidth: 240 }}>
            <p style={label}>STATUS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {STATUSES.map((s) => {
                const active = status === s
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', background: active ? `${STATUS_COLORS[s]}22` : 'transparent', border: `1px solid ${active ? STATUS_COLORS[s] : 'var(--border-dim)'}`, color: active ? STATUS_COLORS[s] : 'var(--text-dim)', cursor: 'pointer' }}>
                    {STATUS_LABELS[s]}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 90px' }}>
                <p style={label}>RATING /10</p>
                <input type="number" min={0} max={10} step={0.5} value={rating} onChange={(e) => setRating(e.target.value)} placeholder="—" style={inp} />
              </div>
              <div style={{ flex: '1 1 90px' }}>
                <p style={label}>PROGRESS</p>
                <input type="number" min={0} value={progressCurrent} onChange={(e) => setProgressCurrent(e.target.value)} style={inp} />
              </div>
              <div style={{ flex: '1 1 90px' }}>
                <p style={label}>TOTAL</p>
                <input type="number" min={0} value={progressTotal} onChange={(e) => setProgressTotal(e.target.value)} placeholder="—" style={inp} />
              </div>
            </div>

            <p style={{ ...label, color: isCompleted ? '#22c55e' : 'var(--text-dim)' }}>{isCompleted ? '✦ FIELD REPORT / REVIEW' : 'NOTES'}</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={isCompleted ? 6 : 3}
              placeholder={isCompleted ? 'How was it?' : 'Notes…'}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 14 }} />

            <p style={label}>COVER IMAGE URL</p>
            <input type="url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" style={{ ...inp, marginBottom: 4 }} />
          </div>
        </div>

        {/* Session log + photos */}
        <div style={{ padding: '0 18px 4px' }}>
          <p style={{ ...label, marginBottom: 10 }}>SESSION LOG</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input type="number" min={0} value={sHours} onChange={(e) => setSHours(e.target.value)} placeholder="Hrs" style={{ ...inp, width: 64 }} />
            <input type="number" min={0} value={sMinutes} onChange={(e) => setSMinutes(e.target.value)} placeholder="Min" style={{ ...inp, width: 64 }} />
            <input type="number" min={0} value={sProgress} onChange={(e) => setSProgress(e.target.value)} placeholder={`+${hobby?.progressUnit ?? 'prog'}`} style={{ ...inp, width: 90 }} />
            <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Session notes…" style={{ ...inp, flex: '1 1 120px' }} />
            <button onClick={addSession} disabled={busy}
              style={{ padding: '9px 16px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#0891b2', background: '#0891b222', border: '1px solid #0891b2', borderLeft: '3px solid #0891b2', cursor: 'pointer' }}>LOG</button>
          </div>
          {sessions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{s.date}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m ` : ''}
                    {s.progress_logged ? `· +${s.progress_logged} ` : ''}
                    {s.notes ?? ''}
                  </span>
                  <button onClick={() => removeSession(s.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <PhotoGallery entryId={entry.id} accent={accent} photos={photos} onPhotosChange={setPhotos} />
        </div>

        {note && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', padding: '0 18px', margin: '0 0 10px' }}>{note}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--border-dim)', flexWrap: 'wrap' }}>
          <button onClick={remove} disabled={busy}
            style={{ padding: '9px 16px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid #ef444455', cursor: 'pointer' }}>DELETE</button>
          <div style={{ flex: 1 }} />
          {canRefetch && (
            <button onClick={updateDetails} disabled={busy}
              style={{ padding: '9px 16px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-mid)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: busy ? 'wait' : 'pointer' }}>UPDATE DETAILS</button>
          )}
          <button onClick={save} disabled={busy}
            style={{ padding: '9px 22px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: accent, background: `${accent}22`, border: `1px solid ${accent}`, borderLeft: `3px solid ${accent}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : 'SAVE'}</button>
        </div>
      </div>
    </div>
  )
}
