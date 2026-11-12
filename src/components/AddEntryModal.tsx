'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ArrowLeft, Upload, Eye, EyeOff } from 'lucide-react'
import { HOBBY_MAP, BOOK_SUBTYPES, BOOK_SUBTYPE_MAP, statusesFor, statusLabelFor } from '@/lib/hobbies'
import { EMPTY_RECIPE, recipeMetadata, type RecipeData } from '@/lib/recipe'
import RecipeFields from './RecipeFields'
import { insertEntry, moveEntryToRank } from '@/lib/db'
import { searchCatalog, searchTypeFor, fetchCatalogDetails, type CatalogHit } from '@/lib/search'
import { compressImage } from '@/lib/image'
import { CLIP } from './MechCard'
import ProjectChecklist, { type ChecklistItem } from './ProjectChecklist'
import type { HobbyCategory, EntryStatus, BookSubtype } from '@/types/database'
import { useEscape } from '@/lib/useEscape'

export default function AddEntryModal({ hobbyId, onClose, onAdded, onBack }: {
  hobbyId: HobbyCategory
  onClose: () => void
  onAdded: () => void
  onBack?: () => void
}) {
  const hobby = HOBBY_MAP[hobbyId]
  const accent = hobby.accent
  useEscape(onClose)

  const [bookSubtype, setBookSubtype] = useState<BookSubtype>('book')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<CatalogHit | null>(null)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<EntryStatus>('backlog')
  const [rating, setRating] = useState('')
  const [progressTotal, setProgressTotal] = useState('')
  const [gameTTB, setGameTTB] = useState('')
  const [ttbTiers, setTtbTiers] = useState<{ hastily?: number; normally?: number; completely?: number } | null>(null)
  const [volumeCurrent, setVolumeCurrent] = useState('')
  const [volumeTotal, setVolumeTotal] = useState('')
  const [rankInput, setRankInput] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [recipe, setRecipe] = useState<RecipeData>(EMPTY_RECIPE)
  const [coverUrl, setCoverUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const coverFileRef = useRef<HTMLInputElement>(null)

  // Book subtype drives the search source: manga -> Jikan (series), audiobook ->
  // Audible (real runtime), others -> OpenLibrary.
  const searchType = hobbyId === 'books'
    ? (bookSubtype === 'manga' ? 'manga' : bookSubtype === 'audiobook' ? 'audiobook' : BOOK_SUBTYPE_MAP[bookSubtype].api === 'openlibrary' ? 'books' : null)
    : searchTypeFor(hobbyId)
  const totalUnit = hobbyId === 'books'
    ? (bookSubtype === 'audiobook' ? 'min' : BOOK_SUBTYPE_MAP[bookSubtype].progressUnit)
    : hobbyId === 'movies' ? 'min'
    : hobbyId === 'tv' ? 'ep'
    : hobby.progressUnit

  const isGame = hobbyId === 'games'
  const isRecipe = !!hobby.recipe
  const showTotal = !isGame && !hobby.percentBased && !isRecipe

  // Search-as-you-type
  useEffect(() => {
    if (!searchType || query.trim().length < 2 || selected) { setResults([]); setSearching(false); return }
    const s = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const hits = await searchCatalog(searchType, query.trim())
      if (s === seq.current) { setResults(hits); setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [query, searchType, selected])

  async function pick(hit: CatalogHit) {
    setSelected(hit)
    setTitle(hit.title)
    setCoverUrl(hit.cover_url ?? '')
    setResults([])

    // Games: IGDB gives completion tiers (default to Main Story); RAWG gives one number.
    if (hobbyId === 'games') {
      const tiers = hit.metadata?.ttb as { hastily?: number; normally?: number; completely?: number } | undefined
      if (tiers) {
        setTtbTiers(tiers)
        const def = tiers.normally ?? tiers.hastily ?? tiers.completely
        if (def != null) setGameTTB(String(def))
      } else if (hit.metadata?.time_to_beat != null) {
        setTtbTiers(null)
        setGameTTB(String(hit.metadata.time_to_beat))
      }
    }
    // Manga: Jikan returns the series' total volume count.
    if (hobbyId === 'books' && bookSubtype === 'manga' && hit.metadata?.volumes != null) {
      setVolumeTotal(String(hit.metadata.volumes))
    }

    let total = hit.progress_total
    // Movies/TV: fetch per-title details (runtime, episode count) for the picked item.
    if (hobbyId === 'movies' || hobbyId === 'tv') {
      setEnriching(true)
      const d = await fetchCatalogDetails(hobbyId === 'movies' ? 'movie' : 'tv', hit.external_id)
      setEnriching(false)
      if (d.progress_total != null) total = d.progress_total
      setSelected({ ...hit, metadata: { ...hit.metadata, ...d.metadata } })
    }

    if (total != null) {
      // Audiobooks are measured in minutes of listening. Audible answers in
      // minutes already; only a page count (OpenLibrary) needs the ~26 pg/hr
      // estimate to become one.
      const shown = hobbyId === 'books' && bookSubtype === 'audiobook' && hit.external_source !== 'audible'
        ? Math.round((total / 26) * 60)
        : total
      setProgressTotal(String(shown))
    }
  }

  async function save() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    const today = new Date().toISOString().split('T')[0]
    // Percent-based projects: a checklist added here sets the initial % + status.
    let effStatus = status
    // A recipe added as already made has been made once.
    let progCurrent = isRecipe && status === 'completed' ? 1 : 0
    if (hobby.percentBased && checklist.length > 0) {
      const done = checklist.filter((i) => i.done).length
      progCurrent = Math.round((done / checklist.length) * 100)
      effStatus = done === checklist.length ? 'completed' : done > 0 ? 'in_progress' : status
    }
    try {
      const created = await insertEntry({
        hobby_category: hobbyId,
        title: title.trim(),
        status: effStatus,
        rating: rating ? parseFloat(rating) : null,
        notes: notes.trim() || null,
        progress_current: progCurrent,
        progress_total: hobbyId === 'games' || isRecipe ? null : hobby.percentBased ? 100 : (progressTotal ? parseFloat(progressTotal) : null),
        cover_url: coverUrl.trim() || null,
        external_id: selected?.external_id ?? null,
        external_source: selected?.external_source ?? null,
        metadata: {
          added_via: 'web',
          ...(selected?.metadata ?? {}),
          ...(hobbyId === 'games' && gameTTB ? { time_to_beat: parseFloat(gameTTB) } : {}),
          ...(hobbyId === 'books' && bookSubtype === 'manga' ? {
            ...(volumeCurrent ? { volume_current: parseInt(volumeCurrent) } : {}),
            ...(volumeTotal ? { volume_total: parseInt(volumeTotal) } : {}),
          } : {}),
          ...(hobby.percentBased && checklist.length > 0 ? { checklist } : {}),
          ...(isRecipe ? recipeMetadata(recipe) : {}),
        },
        book_subtype: hobbyId === 'books' ? bookSubtype : null,
        is_private: isPrivate,
        current_season: null, current_episode: null, priority: null,
        date_started: effStatus === 'in_progress' ? today : null,
        date_completed: effStatus === 'completed' ? today : null,
      })
      // Optional backlog rank override — otherwise it stays at the bottom.
      if (status === 'backlog' && rankInput.trim()) {
        const r = parseInt(rankInput, 10)
        if (!isNaN(r) && r > 0) await moveEntryToRank(hobbyId, created.id, r)
      }
      onAdded()
      onClose()
    } catch { setError('Failed to save.'); setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${accent}66`, padding: '9px 12px', color: 'var(--text-hi)',
    fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
  }
  const label: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }
  const pill = (active: boolean, c: string): React.CSSProperties => ({ padding: '5px 10px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', background: active ? `${c}22` : 'transparent', border: `1px solid ${active ? c : 'var(--border-dim)'}`, color: active ? c : 'var(--text-dim)', cursor: 'pointer' })

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose() }}
      role="dialog" aria-modal="true" aria-label="Add entry"
      style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, zIndex: 70, background: 'var(--overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 520, padding: '1px', clipPath: CLIP, background: `${accent}55` }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 20, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: accent, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {onBack && (
                <button onClick={onBack} title="Pick a different category" style={{ color: accent, background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }} aria-label="Pick a different category"><ArrowLeft size={16} /></button>
              )}
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: 0 }}>Add</p>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>
                  {(hobbyId === 'books' ? BOOK_SUBTYPE_MAP[bookSubtype].label : hobby.label).toUpperCase()}
                </h2>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}><X size={16} /></button>
          </div>

          {hobbyId === 'books' && (
            <div style={{ marginBottom: 14 }}>
              <p style={label}>Type</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BOOK_SUBTYPES.map((s) => (
                  <button key={s.id} onClick={() => setBookSubtype(s.id)} style={pill(bookSubtype === s.id, accent)}>{s.label}</button>
                ))}
              </div>
            </div>
          )}

          {searchType && !selected && (
            <div style={{ marginBottom: 14 }}>
              <p style={label}>Search {hobby.pluralLabel}</p>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a title…" style={inp} autoFocus aria-label="Type a title" />
              {(searching || results.length > 0) && (
                <div style={{ marginTop: 6, border: '1px solid var(--border-dim)', maxHeight: 240, overflowY: 'auto' }}>
                  {searching && results.length === 0 && <div style={{ padding: 10, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>}
                  {results.map((r) => (
                    <button key={`${r.external_source}-${r.external_id}`} onClick={() => pick(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 8, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dim)', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-base)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      {r.cover_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.cover_url} alt="" style={{ width: 30, height: 44, objectFit: 'cover', flexShrink: 0 }} loading="lazy" decoding="async" />
                        : <div style={{ width: 30, height: 44, background: 'var(--bg-base)', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>{r.year ?? ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <p style={label}>Title *</p>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setSelected(null) }} placeholder={isRecipe ? 'Recipe name…' : 'Entry title…'} style={inp} aria-label="Title" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={label}>Status</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {statusesFor(hobby).map((s) => (
                <button key={s} onClick={() => setStatus(s)} style={pill(status === s, accent)}>{statusLabelFor(hobby, s)}</button>
              ))}
            </div>
          </div>

          {status === 'backlog' && (
            <div style={{ marginBottom: 14 }}>
              <p style={label}>{isRecipe ? 'To-Try Rank (optional)' : 'Backlog Rank (optional)'}</p>
              <input type="number" min={1} value={rankInput} onChange={(e) => setRankInput(e.target.value)} placeholder="Added to the bottom" style={inp} aria-label="Backlog rank" />
            </div>
          )}

          {hobbyId === 'games' && ttbTiers && (
            <div style={{ marginBottom: 14 }}>
              <p style={label}>Completion Time</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([['Rushed', 'hastily'], ['Main', 'normally'], ['100%', 'completely']] as const).map(([lbl, key]) => {
                  const v = ttbTiers[key]
                  if (v == null) return null
                  return <button key={key} onClick={() => setGameTTB(String(v))} style={pill(gameTTB === String(v), accent)}>{lbl} · {v}h</button>
                })}
              </div>
            </div>
          )}

          {(!hobby.hideRating || isGame || showTotal) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {!hobby.hideRating && (
                <div style={{ flex: 1 }}>
                  <p style={label}>Rating /10</p>
                  <input type="number" min={0} max={10} step={0.5} value={rating} onChange={(e) => setRating(e.target.value)} placeholder="—" style={inp} aria-label="Rating /10" />
                </div>
              )}
              {isGame && (
                <div style={{ flex: 1 }}>
                  <p style={label}>Time to Beat (hrs)</p>
                  <input type="number" min={0} step={0.5} value={gameTTB} onChange={(e) => setGameTTB(e.target.value)} placeholder={enriching ? '…' : '—'} style={inp} aria-label="Time to beat in hours" />
                </div>
              )}
              {showTotal && (
                <div style={{ flex: 1 }}>
                  <p style={label}>Total ({totalUnit})</p>
                  <input type="number" min={0} aria-label={`Total ${totalUnit}`} value={progressTotal} onChange={(e) => setProgressTotal(e.target.value)} placeholder={enriching ? 'Fetching…' : '—'} style={inp} />
                </div>
              )}
            </div>
          )}

          {hobbyId === 'books' && bookSubtype === 'manga' && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <p style={label}>Volume</p>
                <input type="number" min={0} value={volumeCurrent} onChange={(e) => setVolumeCurrent(e.target.value)} placeholder="—" style={inp} aria-label="Volume" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={label}>Volumes Total</p>
                <input type="number" min={0} value={volumeTotal} onChange={(e) => setVolumeTotal(e.target.value)} placeholder="—" style={inp} aria-label="Volumes Total" />
              </div>
            </div>
          )}

          {isRecipe && (
            <div style={{ marginBottom: 14 }}>
              <RecipeFields value={recipe} onChange={setRecipe} accent={accent} />
            </div>
          )}

          {hobby.percentBased && (
            <div style={{ marginBottom: 14 }}>
              <ProjectChecklist items={checklist} accent={accent} onChange={setChecklist} />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <p style={label}>{isRecipe ? 'Photo' : 'Cover'}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={coverUrl.startsWith('data:') ? '(uploaded image)' : coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="Paste an image URL…" style={{ ...inp, flex: 1, minWidth: 0 }} aria-label="Paste an image URL" />
              {coverUrl.startsWith('data:') && (
                <button type="button" onClick={() => setCoverUrl('')} title="Remove image"
                  style={{ flexShrink: 0, padding: '0 10px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }} aria-label="Remove image">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => coverFileRef.current?.click()} title="Upload an image"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em', color: accent, background: `${accent}22`, border: `1px solid ${accent}`, cursor: 'pointer' }} aria-label="Upload an image">
                <Upload size={13} /> Upload
              </button>
            </div>
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" style={{ marginTop: 8, height: 84, width: 'auto', objectFit: 'cover', border: `1px solid ${accent}44` }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} loading="lazy" decoding="async" />
            )}
            <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setCoverUrl(await compressImage(f, 600)) } catch { /* bad image */ } if (coverFileRef.current) coverFileRef.current.value = '' }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={label}>{isRecipe ? 'Notes for Next Time' : 'Notes'}</p>
            <textarea aria-label={isRecipe ? 'Notes for next time' : 'Notes'} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} spellCheck autoCapitalize="sentences" placeholder={isRecipe ? 'Less salt, longer rest, double the sauce…' : '—'} style={{ ...inp, resize: 'vertical' }} />
          </div>

          <button type="button" onClick={() => setIsPrivate((v) => !v)}
            title={isPrivate ? 'Only you can see this — click to share with friends' : 'Friends can see this — click to make it private'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 16, padding: '10px 12px', background: isPrivate ? '#ef444414' : 'transparent', border: `1px solid ${isPrivate ? '#ef444466' : 'var(--border-dim)'}`, borderLeft: isPrivate ? '3px solid #ef4444' : '1px solid var(--border-dim)', color: isPrivate ? '#ef4444' : 'var(--text-mid)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.02em', textAlign: 'left' }} aria-label={isPrivate ? 'Only you can see this — click to share with friends' : 'Friends can see this — click to make it private'}>
            {isPrivate ? <EyeOff size={14} /> : <Eye size={14} style={{ color: 'var(--text-dim)' }} />}
            <span style={{ flex: 1 }}>{isPrivate ? 'Private — hidden from friends' : 'Visible to friends'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>{isPrivate ? 'Private' : 'Shared'}</span>
          </button>

          {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#f87171', margin: '0 0 12px' }}>✗ {error}</p>}

          <button onClick={save} disabled={saving || !title.trim()}
            style={{ width: '100%', padding: '11px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', color: accent, background: `${accent}22`, border: `1px solid ${accent}`, borderLeft: `3px solid ${accent}`, cursor: saving ? 'wait' : 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
