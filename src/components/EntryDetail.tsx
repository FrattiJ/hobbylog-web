'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Star, Trash2, ArrowLeft, Save, Image as ImageIcon, Pencil, FileText, Eye, EyeOff } from 'lucide-react'
import { HOBBY_MAP, BOOK_SUBTYPE_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import { updateEntry, deleteEntry, refetchDetails, type WebEntry } from '@/lib/entries'
import { getSessionsByEntry, insertSession, deleteSession, getPhotosByEntry, getCommunityRating, normalizeBacklogPriorities, type Photo, type CommunityRating } from '@/lib/db'
import PhotoGallery from './PhotoGallery'
import { compressImage } from '@/lib/image'
import { searchTypeFor, computeTVProgress, searchCatalog, type CatalogHit } from '@/lib/search'
import { useIsMobile } from '@/lib/useIsMobile'
import ProjectChecklist, { type ChecklistItem } from './ProjectChecklist'
import { useToast } from './Toast'
import type { HobbyCategory, Session } from '@/types/database'

const ACCENT = '#7c3aed'
const STATUSES = ['backlog', 'in_progress', 'completed', 'dropped']
const META_KEYS = ['genres', 'platforms', 'author', 'narrator', 'publisher', 'rating', 'release_year', 'director', 'studios', 'developers', 'publishers', 'networks', 'creator', 'streaming'] as const

export default function EntryDetail({ entry, onBack, onChanged }: {
  entry: WebEntry
  onBack: () => void
  onChanged: () => void
}) {
  const hobby = HOBBY_MAP[entry.hobby_category as HobbyCategory]
  const accent = hobby?.accent ?? ACCENT
  const isMobile = useIsMobile()
  const { error: toastError } = useToast()

  const [status, setStatus] = useState(entry.status)
  const [isPrivate, setIsPrivate] = useState(!!entry.is_private)
  const [rating, setRating] = useState(entry.rating?.toString() ?? '')
  const [progressCurrent, setProgressCurrent] = useState(entry.progress_current?.toString() ?? '0')
  const [progressTotal, setProgressTotal] = useState(entry.progress_total?.toString() ?? '')
  const [season, setSeason] = useState(entry.current_season?.toString() ?? '')
  const [episode, setEpisode] = useState(entry.current_episode?.toString() ?? '')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => Array.isArray(entry.metadata?.checklist) ? (entry.metadata!.checklist as ChecklistItem[]) : [])
  const [volumeCurrent, setVolumeCurrent] = useState(entry.metadata?.volume_current != null ? String(entry.metadata.volume_current) : '')
  const [volumeTotal, setVolumeTotal] = useState(entry.metadata?.volume_total != null ? String(entry.metadata.volume_total) : '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [coverUrl, setCoverUrl] = useState(entry.cover_url ?? '')
  const [editingCover, setEditingCover] = useState(false)
  const [coverInput, setCoverInput] = useState('')
  const [coverResults, setCoverResults] = useState<CatalogHit[]>([])
  const [coverSearching, setCoverSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)

  const [sessions, setSessions] = useState<Session[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [community, setCommunity] = useState<CommunityRating | null>(null)
  const [sHours, setSHours] = useState(''); const [sMinutes, setSMinutes] = useState('')
  const [sProgress, setSProgress] = useState(''); const [sNotes, setSNotes] = useState('')

  useEffect(() => {
    if (entry.external_source && entry.external_id) {
      getCommunityRating(entry.external_source, entry.external_id).then(setCommunity).catch(() => {})
    }
  }, [entry.external_source, entry.external_id])

  const loadExtras = useCallback(() => {
    getSessionsByEntry(entry.id).then(setSessions).catch(() => {})
    getPhotosByEntry(entry.id).then(setPhotos).catch(() => {})
  }, [entry.id])
  useEffect(() => { loadExtras() }, [loadExtras])

  const effectiveTotal = (progressTotal ? parseFloat(progressTotal) : null)
    || (entry.hobby_category === 'movies' ? 100 : null)
    || (entry.hobby_category === 'games' && entry.metadata?.time_to_beat ? Number(entry.metadata.time_to_beat) : null)
  const progressPct = effectiveTotal ? Math.round(((parseFloat(progressCurrent) || 0) / effectiveTotal) * 100) : null
  const isCompleted = status === 'completed'
  const canRefetch = searchTypeFor(entry.hobby_category) !== null
  const isTV = entry.hobby_category === 'tv'
  const tmdbId = entry.external_source === 'tmdb' ? entry.external_id : null
  const isManga = entry.hobby_category === 'books' && entry.book_subtype === 'manga'
  const isGameEntry = entry.hobby_category === 'games'
  // Unit for the "progress" field in the session log (pages, chapters, episodes…).
  const progUnit = (entry.hobby_category === 'books' && entry.book_subtype
    ? BOOK_SUBTYPE_MAP[entry.book_subtype as keyof typeof BOOK_SUBTYPE_MAP]?.progressUnit
    : hobby?.progressUnit) ?? 'prog'
  // Games: a session's time IS the hours played, so no separate progress field.
  // Percent hobbies advance via the checklist; % progress makes no sense to add.
  const showSessionProgress = !isGameEntry && !hobby?.percentBased && progUnit !== '%'
  const isPercent = !!hobby?.percentBased

  // Checklist changes drive the project's % and status, and save immediately.
  async function persistChecklist(items: ChecklistItem[]) {
    setChecklist(items)
    const total = items.length, done = items.filter((i) => i.done).length
    const pct = total ? Math.round((done / total) * 100) : (status === 'completed' ? 100 : 0)
    let newStatus = status
    if (total > 0) {
      newStatus = done === total ? 'completed' : done > 0 ? 'in_progress' : 'backlog'
      setStatus(newStatus); setProgressCurrent(String(pct))
    }
    const today = new Date().toISOString().split('T')[0]
    try {
      await updateEntry(entry.id, {
        metadata: { ...(entry.metadata ?? {}), checklist: items },
        progress_current: pct, progress_total: 100, status: newStatus,
        date_completed: newStatus === 'completed' && !entry.date_completed ? today : entry.date_completed,
        date_started: newStatus === 'in_progress' && !entry.date_started ? today : entry.date_started,
      })
      if (newStatus !== entry.status) await normalizeBacklogPriorities(entry.hobby_category as HobbyCategory)
      onChanged()
    } catch {
      toastError('Could not save your checklist change — try again')
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${accent}66`, padding: '9px 12px', color: 'var(--text-hi)',
    fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none',
  }
  const label: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px' }

  async function saveCover(url: string) {
    try {
      await updateEntry(entry.id, { cover_url: url || null })
      setCoverUrl(url); setEditingCover(false); setCoverResults([]); onChanged()
    } catch {
      toastError('Could not update the cover — try again')
    }
  }

  // Books added via manga search use AniList; everything else its normal source.
  const coverSearchType = isManga ? 'manga' : searchTypeFor(entry.hobby_category)
  async function findCovers() {
    if (!coverSearchType) return
    setCoverSearching(true)
    try {
      const hits = await searchCatalog(coverSearchType, entry.title)
      setCoverResults(hits.filter((h) => h.cover_url))
    } catch { /* noop */ }
    setCoverSearching(false)
  }

  async function save() {
    setBusy(true); setNote(null)
    const today = new Date().toISOString().split('T')[0]
    try {
      let progressValue = progressCurrent ? parseFloat(progressCurrent) : 0
      const tvFields: { current_season?: number | null; current_episode?: number | null } = {}
      if (isTV) {
        const s = season ? parseInt(season, 10) : null
        const e = episode ? parseInt(episode, 10) : null
        tvFields.current_season = s
        tvFields.current_episode = e
        // With a TMDB id, "Season S, Episode E" auto-computes episodes watched.
        if (tmdbId && s && e) {
          const eps = await computeTVProgress(tmdbId, s, e)
          if (eps != null) { progressValue = eps; setProgressCurrent(String(eps)) }
        }
      }

      const totalNum = progressTotal ? parseFloat(progressTotal) : null
      // Completing bumps progress to 100% — but never for games (keep your
      // overage / speedrun hours), and never lowers a value that's already higher.
      if (status === 'completed' && entry.hobby_category !== 'games') {
        const fillTo = totalNum ?? (hobby?.progressUnit === '%' ? 100 : null)
        if (fillTo != null && progressValue < fillTo) { progressValue = fillTo; setProgressCurrent(String(fillTo)) }
      }
      // Percent-based projects: total is always 100; the checklist (if any) sets
      // the %, otherwise status maps to 0 / 100.
      let progressTotalValue: number | null = progressTotal ? parseFloat(progressTotal) : null
      if (isPercent) {
        progressTotalValue = 100
        const total = checklist.length, done = checklist.filter((i) => i.done).length
        progressValue = total ? Math.round((done / total) * 100) : status === 'completed' ? 100 : status === 'backlog' ? 0 : progressValue
      }
      const mangaFields = isManga ? {
        metadata: {
          ...(entry.metadata ?? {}),
          volume_current: volumeCurrent ? parseInt(volumeCurrent, 10) : null,
          volume_total: volumeTotal ? parseInt(volumeTotal, 10) : null,
        },
      } : {}
      await updateEntry(entry.id, {
        status,
        rating: rating ? parseFloat(rating) : null,
        notes: notes.trim() || null,
        progress_current: progressValue,
        progress_total: progressTotalValue,
        ...tvFields,
        ...mangaFields,
        date_completed: status === 'completed' && !entry.date_completed ? today : entry.date_completed,
        date_started: status === 'in_progress' && !entry.date_started ? today : entry.date_started,
      })
      // Status change into/out of backlog — renumber that hobby's backlog so ranks stay 1..N.
      if (status !== entry.status) await normalizeBacklogPriorities(entry.hobby_category as HobbyCategory)
      setNote('Saved.'); onChanged()
    } catch (e) { setNote(`Save failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function updateDetails() {
    setBusy(true); setNote(null)
    try {
      const patch = await refetchDetails(entry)
      if (patch) {
        if (patch.cover_url) setCoverUrl(patch.cover_url)
        if (patch.progress_total != null) setProgressTotal(String(patch.progress_total))
        setNote('Metadata refreshed.'); onChanged()
      } else setNote('No match found.')
    } catch (e) { setNote(`Update failed: ${(e as Error).message}`) }
    setBusy(false)
  }

  async function togglePrivate() {
    const v = !isPrivate
    setIsPrivate(v)
    try { await updateEntry(entry.id, { is_private: v }); onChanged() }
    catch { setIsPrivate(!v); toastError('Could not change visibility — try again') }
  }

  async function remove() {
    if (!confirm(`Delete "${entry.title}"?`)) return
    try {
      await deleteEntry(entry.id)
      if (entry.status === 'backlog') await normalizeBacklogPriorities(entry.hobby_category as HobbyCategory)
      onBack()
    } catch {
      toastError(`Could not delete “${entry.title}” — try again`)
    }
  }

  async function addSession() {
    const dur = (parseInt(sHours) || 0) * 60 + (parseInt(sMinutes) || 0)
    // For games the time spent is the hours played, so feed it straight into
    // progress rather than asking for the same number twice.
    let prog = sProgress ? parseFloat(sProgress) : null
    if (isGameEntry && dur > 0) prog = Math.round((dur / 60) * 10) / 10
    if (!dur && prog == null && !sNotes.trim()) return
    setBusy(true)
    try {
      await insertSession({ entry_id: entry.id, date: new Date().toISOString().split('T')[0], duration_minutes: dur || null, progress_logged: prog, notes: sNotes.trim() || null })
      if (prog && prog > 0) {
        const cur = Math.round(((parseFloat(progressCurrent) || 0) + prog) * 10) / 10
        setProgressCurrent(String(cur)); await updateEntry(entry.id, { progress_current: cur })
      }
      setSHours(''); setSMinutes(''); setSProgress(''); setSNotes(''); loadExtras(); onChanged()
    } catch { /* noop */ }
    setBusy(false)
  }

  const metaRows = META_KEYS.map((k) => [k, entry.metadata?.[k]] as const).filter(([, v]) => v != null && v !== '')

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 24, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>
        <ArrowLeft size={14} /> BACK TO {(hobby?.pluralLabel ?? '').toUpperCase()}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: isMobile ? 20 : 32 }}>
        {/* Cover + meta */}
        <div>
          <div style={{ aspectRatio: '2/3', width: '100%', maxWidth: isMobile ? 200 : undefined, margin: isMobile ? '0 auto 8px' : '0 0 8px', background: 'var(--bg-card)', border: `1px solid ${accent}44`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={coverUrl} alt={entry.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 48, fontWeight: 900, color: `${accent}88`, fontFamily: 'var(--font-display)' }}>{entry.title[0]}</span>}
          </div>

          {editingCover ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <input autoFocus value={coverInput} onChange={(e) => setCoverInput(e.target.value)} placeholder="Paste image URL…" style={inp} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => saveCover(coverInput.trim())} style={{ flex: 1, padding: '6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: accent, background: `${accent}22`, border: `1px solid ${accent}`, cursor: 'pointer' }}>SAVE</button>
                <button onClick={() => coverFileRef.current?.click()} style={{ flex: 1, padding: '6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: accent, background: 'transparent', border: `1px solid ${accent}66`, cursor: 'pointer' }}>UPLOAD</button>
                <button onClick={() => { setEditingCover(false); setCoverResults([]) }} style={{ flex: 1, padding: '6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>CANCEL</button>
              </div>
              {coverSearchType && (
                <button onClick={findCovers} disabled={coverSearching}
                  style={{ padding: '6px', fontFamily: 'var(--font-mono)', fontSize: 12, color: accent, background: 'transparent', border: `1px dashed ${accent}66`, cursor: coverSearching ? 'wait' : 'pointer' }}>
                  {coverSearching ? 'SEARCHING…' : '⌕ FIND COVERS'}
                </button>
              )}
              {coverResults.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {coverResults.map((r) => (
                    <button key={`${r.external_source}-${r.external_id}`} onClick={() => saveCover(r.cover_url!)} title={r.title}
                      style={{ padding: 0, border: '1px solid var(--border-dim)', background: 'var(--bg-base)', cursor: 'pointer', aspectRatio: '2/3', overflow: 'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.cover_url!} alt={r.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
              <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await saveCover(await compressImage(f, 600)) } catch { /* noop */ } if (coverFileRef.current) coverFileRef.current.value = '' }} />
            </div>
          ) : (
            <button onClick={() => { setCoverInput(entry.cover_url ?? ''); setEditingCover(true) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginBottom: 16, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
              <ImageIcon size={12} /> {coverUrl ? 'CHANGE COVER' : 'SET COVER'}
            </button>
          )}

          {metaRows.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`, padding: 12 }}>
              {metaRows.map(([k, v]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{k.replace(/_/g, ' ')}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', margin: '2px 0 0', lineHeight: 1.4 }}>{typeof v === 'number' && k === 'rating' ? `${v.toFixed(1)}/10` : String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '2px 8px', background: `${accent}22`, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{(entry.hobby_category === 'books' && entry.book_subtype ? BOOK_SUBTYPE_MAP[entry.book_subtype as keyof typeof BOOK_SUBTYPE_MAP]?.label : null) ?? hobby?.label}</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-hi)', margin: '12px 0 0', letterSpacing: '0.06em' }}>{entry.title}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>
              {entry.date_started && <span>STARTED {entry.date_started}</span>}
              {entry.date_completed && <span>COMPLETED {entry.date_completed}</span>}
            </div>
          </div>

          {/* Review card when completed */}
          {isCompleted && (
            <div style={{ padding: '1px', clipPath: CLIP_SM, background: '#22c55e55' }}>
              <div style={{ background: 'var(--bg-card)', clipPath: CLIP_SM, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <FileText size={14} style={{ color: '#22c55e' }} />
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, letterSpacing: '0.1em' }}>FIELD REPORT</h2>
                  {rating && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 14, color: '#d97706' }}><Star size={13} fill="#d97706" /> {rating}/10</span>}
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} spellCheck autoCapitalize="sentences" placeholder="How was it? (remember to Save)" style={{ ...inp, resize: 'vertical', lineHeight: 1.7 }} />
              </div>
            </div>
          )}

          {/* Edit panel */}
          <div style={{ padding: '1px', clipPath: CLIP_SM, background: `${accent}55` }}>
            <div style={{ background: 'var(--bg-card)', clipPath: CLIP_SM, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, letterSpacing: '0.1em' }}>EDIT ENTRY</h2>

              <div>
                <p style={label}>STATUS</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STATUSES.map((s) => {
                    const active = status === s
                    return <button key={s} onClick={() => setStatus(s)} style={{ padding: '5px 12px', fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.08em', background: active ? `${STATUS_COLORS[s]}22` : 'transparent', border: `1px solid ${active ? STATUS_COLORS[s] : 'var(--border-dim)'}`, color: active ? STATUS_COLORS[s] : 'var(--text-dim)', cursor: 'pointer' }}>{STATUS_LABELS[s]}</button>
                  })}
                </div>
              </div>

              <div>
                <p style={label}>VISIBILITY</p>
                <button onClick={togglePrivate}
                  title={isPrivate ? 'Only you can see this — click to share with friends' : 'Friends can see this — click to make it private'}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: isPrivate ? '#ef444414' : 'transparent', border: `1px solid ${isPrivate ? '#ef444466' : 'var(--border-dim)'}`, borderLeft: isPrivate ? '3px solid #ef4444' : '1px solid var(--border-dim)', color: isPrivate ? '#ef4444' : 'var(--text-mid)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.04em', textAlign: 'left' }}>
                  {isPrivate ? <EyeOff size={14} /> : <Eye size={14} style={{ color: 'var(--text-dim)' }} />}
                  <span style={{ flex: 1 }}>{isPrivate ? 'Private — hidden from friends' : 'Visible to friends'}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{isPrivate ? 'PRIVATE' : 'SHARED'}</span>
                </button>
              </div>

              {isTV && (
                <div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 100px' }}><p style={label}>SEASON</p><input type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="—" style={inp} /></div>
                    <div style={{ flex: '1 1 100px' }}><p style={label}>EPISODE</p><input type="number" min={1} value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="—" style={inp} /></div>
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    {tmdbId ? 'Saving converts season + episode into total episodes watched automatically.' : 'Add this show via search to auto-convert; otherwise set Progress below by hand.'}
                  </p>
                </div>
              )}

              {isManga && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 100px' }}><p style={label}>VOLUME</p><input type="number" min={0} value={volumeCurrent} onChange={(e) => setVolumeCurrent(e.target.value)} placeholder="—" style={inp} /></div>
                  <div style={{ flex: '1 1 100px' }}><p style={label}>VOLUMES TOTAL</p><input type="number" min={0} value={volumeTotal} onChange={(e) => setVolumeTotal(e.target.value)} placeholder="—" style={inp} /></div>
                </div>
              )}

              {(!hobby?.hideRating || !isPercent) && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {!hobby?.hideRating && (
                    <div style={{ flex: '1 1 100px' }}><p style={label}>RATING /10</p><input type="number" min={0} max={10} step={0.5} value={rating} onChange={(e) => setRating(e.target.value)} placeholder="—" style={inp} /></div>
                  )}
                  {!isPercent && (
                    <>
                      <div style={{ flex: '1 1 100px' }}><p style={label}>PROGRESS ({progUnit})</p><input type="number" min={0} value={progressCurrent} onChange={(e) => setProgressCurrent(e.target.value)} style={inp} /></div>
                      <div style={{ flex: '1 1 100px' }}><p style={label}>TOTAL</p><input type="number" min={0} value={progressTotal} onChange={(e) => setProgressTotal(e.target.value)} placeholder="—" style={inp} /></div>
                    </>
                  )}
                </div>
              )}

              {isPercent && (
                <ProjectChecklist items={checklist} accent={accent} onChange={persistChecklist} />
              )}

              {community && community.count > 0 && community.avg != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                  <span style={{ color: 'var(--text-dim)', letterSpacing: '0.14em' }}>THE CROWD</span>
                  <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill="#d97706" /> {community.avg}/10</span>
                  <span style={{ color: 'var(--text-dim)' }}>· {community.count} other{community.count === 1 ? '' : 's'}</span>
                  {rating && (
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: parseFloat(rating) >= community.avg ? '#22c55e' : '#ef4444' }}>
                      you {parseFloat(rating) - community.avg >= 0 ? '+' : ''}{Math.round((parseFloat(rating) - community.avg) * 10) / 10}
                    </span>
                  )}
                </div>
              )}

              {progressPct !== null && !isPercent && (
                <div>
                  <div style={{ height: 4, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, progressPct)}%`, background: accent }} />
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'right', margin: '4px 0 0' }}>{progressPct}%</p>
                </div>
              )}

              {!isCompleted && (
                <div>
                  <p style={label}>NOTES</p>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} spellCheck autoCapitalize="sentences" placeholder="Notes…" style={{ ...inp, resize: 'vertical' }} />
                </div>
              )}

              {note && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', margin: 0 }}>{note}</p>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-dim)', paddingTop: 14 }}>
                <button onClick={remove} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid #ef444455', cursor: 'pointer' }}><Trash2 size={11} /> DELETE</button>
                <div style={{ flex: 1 }} />
                {canRefetch && <button onClick={updateDetails} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-mid)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: busy ? 'wait' : 'pointer' }}><Pencil size={11} /> UPDATE DETAILS</button>}
                <button onClick={save} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: accent, background: `${accent}22`, border: `1px solid ${accent}`, borderLeft: `3px solid ${accent}`, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}><Save size={12} /> {busy ? '…' : 'SAVE'}</button>
              </div>
            </div>
          </div>

          {/* Session log */}
          <div>
            <p style={{ ...label, marginBottom: 4 }}>LOG A SESSION</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {isGameEntry
                ? 'How long you played — added to your hours.'
                : `How long you spent${showSessionProgress ? `, and how much ${progUnit} you got through` : ''}.`}
            </p>
            {(() => {
              const miniLabel: React.CSSProperties = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }
              return (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                  <div>
                    <span style={miniLabel}>{isGameEntry ? 'Time played' : 'Time spent'}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" min={0} value={sHours} onChange={(e) => setSHours(e.target.value)} placeholder="0" aria-label="Hours" style={{ ...inp, width: 56, textAlign: 'center' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>h</span>
                      <input type="number" min={0} max={59} value={sMinutes} onChange={(e) => setSMinutes(e.target.value)} placeholder="0" aria-label="Minutes" style={{ ...inp, width: 56, textAlign: 'center' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>m</span>
                    </div>
                  </div>
                  {showSessionProgress && (
                    <div>
                      <span style={miniLabel}>Progress (+{progUnit})</span>
                      <input type="number" min={0} value={sProgress} onChange={(e) => setSProgress(e.target.value)} placeholder={`+${progUnit}`} aria-label={`Progress in ${progUnit}`} style={{ ...inp, width: 92 }} />
                    </div>
                  )}
                  <div style={{ flex: '1 1 140px' }}>
                    <span style={miniLabel}>Notes</span>
                    <input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="What did you do? (optional)" style={{ ...inp, width: '100%' }} />
                  </div>
                  <button onClick={addSession} disabled={busy} style={{ padding: '9px 18px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#0891b2', background: '#0891b222', border: '1px solid #0891b2', borderLeft: '3px solid #0891b2', cursor: busy ? 'wait' : 'pointer' }}>LOG</button>
                </div>
              )
            })()}
            {sessions.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{s.date}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m ` : ''}{s.progress_logged ? `· +${s.progress_logged} ` : ''}{s.notes ?? ''}
                </span>
                <button onClick={async () => { await deleteSession(s.id); loadExtras() }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Photos only for creative/manual hobbies (Projects, Fitness, Art) */}
          {hobby?.manualOnly && <PhotoGallery entryId={entry.id} accent={accent} photos={photos} onPhotosChange={setPhotos} />}
        </div>
      </div>
    </div>
  )
}

const CLIP_SM = 'polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)'
