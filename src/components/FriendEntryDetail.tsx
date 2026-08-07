'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Star, Plus, Check, X } from 'lucide-react'
import { getPhotosByEntry, type Photo } from '@/lib/db'
import { HOBBY_MAP, STATUS_LABELS, STATUS_COLORS } from '@/lib/hobbies'
import type { Entry } from '@/types/database'
import type { ChecklistItem } from './ProjectChecklist'

const META_KEYS = ['genres', 'platforms', 'author', 'publisher', 'release_year', 'director', 'studios', 'developers', 'publishers', 'networks', 'creator', 'streaming'] as const

export default function FriendEntryDetail({ entry, username, iHave, myRating, onBack, onAdd }: {
  entry: Entry
  username: string
  iHave: boolean
  myRating: number | null
  onBack: () => void
  onAdd: (e: Entry) => void
}) {
  const hobby = HOBBY_MAP[entry.hobby_category]
  const accent = hobby?.accent ?? '#22c55e'
  const isPercent = !!hobby?.percentBased
  const [photos, setPhotos] = useState<Photo[]>([])
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let alive = true
    getPhotosByEntry(entry.id).then((p) => { if (alive) setPhotos(p) }).catch(() => { /* photos are optional */ })
    return () => { alive = false }
  }, [entry.id])

  const checklist: ChecklistItem[] = Array.isArray(entry.metadata?.checklist) ? (entry.metadata!.checklist as ChecklistItem[]) : []
  const doneSteps = checklist.filter((i) => i.done).length
  const pct = entry.progress_total ? Math.round(((entry.progress_current ?? 0) / entry.progress_total) * 100) : 0
  const metaRows = META_KEYS.map((k) => [k, entry.metadata?.[k]] as const).filter(([, v]) => v != null && v !== '')
  const have = iHave || added

  const progressPhotos = photos.filter((p) => p.photo_type === 'progress')
  const completedPhotos = photos.filter((p) => p.photo_type === 'completed')

  function PhotoRow({ items, label }: { items: Photo[]; label: string }) {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 10px' }}>{label}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {items.map((p) => (
            <button key={p.id} onClick={() => setLightbox(p)}
              style={{ position: 'relative', aspectRatio: '4/3', padding: 0, background: 'var(--bg-card)', border: `1px solid ${accent}44`, overflow: 'hidden', cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.data_url} alt={p.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {p.caption && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 6px', background: 'rgba(0,0,0,0.7)', fontSize: 11, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{p.caption}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 20, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>
        <ArrowLeft size={14} /> BACK TO {username.toUpperCase()}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* Cover + meta */}
        <div style={{ minWidth: 0 }}>
          <div style={{ aspectRatio: '2/3', width: '100%', background: 'var(--bg-card)', border: `1px solid ${accent}44`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            {entry.cover_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={entry.cover_url} alt={entry.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 48, fontWeight: 900, color: `${accent}88`, fontFamily: 'var(--font-display)' }}>{entry.title[0]}</span>}
          </div>

          {have ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginBottom: 16, padding: '8px 10px', background: '#d9770618', border: '1px solid #d9770655', color: '#d97706', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em' }}>
              <Check size={13} /> IN YOUR LOG
            </div>
          ) : (
            <button onClick={() => { setAdded(true); onAdd(entry) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginBottom: 16, padding: '8px 10px', background: `${accent}22`, border: `1px solid ${accent}`, borderLeft: `3px solid ${accent}`, color: accent, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>
              <Plus size={13} /> ADD TO MY BACKLOG
            </button>
          )}

          {metaRows.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`, padding: 12 }}>
              {metaRows.map(([k, v]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{k.replace(/_/g, ' ')}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', margin: '2px 0 0', lineHeight: 1.4 }}>{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 8px', background: `${accent}22`, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{hobby?.label}</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: 'var(--text-hi)', margin: '12px 0 0', letterSpacing: '0.05em', wordBreak: 'break-word' }}>{entry.title}</h1>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              <span style={{ color: STATUS_COLORS[entry.status], letterSpacing: '0.1em', textTransform: 'uppercase' }}>{STATUS_LABELS[entry.status]}</span>
              {entry.rating != null && <span style={{ color: accent, display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill={accent} /> {entry.rating}/10</span>}
              {entry.date_completed && <span style={{ color: 'var(--text-dim)' }}>COMPLETED {entry.date_completed}</span>}
            </div>
            {myRating != null && entry.rating != null && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '6px 12px', border: '1px solid var(--border-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>HEAD-TO-HEAD</span>
                <span style={{ color: 'var(--text-hi)' }}>YOU {myRating}</span>
                <span style={{ color: 'var(--text-mute)' }}>·</span>
                <span style={{ color: accent }}>{username.toUpperCase()} {entry.rating}</span>
              </div>
            )}
          </div>

          {/* Progress / checklist (read-only) */}
          {isPercent && checklist.length > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: 0 }}>BUILD CHECKLIST</p>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: accent }}>{doneSteps}/{checklist.length} · {pct}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', marginBottom: 12 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: accent }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {checklist.map((it) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? accent : 'transparent', border: `1px solid ${it.done ? accent : 'var(--border-dim)'}`, color: '#fff' }}>{it.done && <Check size={12} />}</span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: it.done ? 'var(--text-dim)' : 'var(--text-hi)', textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (!isPercent && entry.progress_total ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: 0 }}>PROGRESS</p>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: accent }}>{entry.progress_current ?? 0} / {entry.progress_total} · {pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: accent }} />
              </div>
            </div>
          ) : null)}

          {/* Review */}
          {entry.notes && (
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: '0 0 8px' }}>REVIEW</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{entry.notes}</p>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 14px' }}>PHOTOS</p>
              <PhotoRow items={progressPhotos} label="⋯ Progress" />
              <PhotoRow items={completedPhotos} label="✓ Completed" />
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--overlay)' }} onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.data_url} alt={lightbox.caption ?? ''} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: '1px solid color-mix(in srgb, var(--text-dim) 27%, transparent)' }} />
            {lightbox.caption && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mid)', textAlign: 'center', margin: 0 }}>{lightbox.caption}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
