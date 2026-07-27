'use client'

import { useState, useRef } from 'react'
import { Upload, Trash2, ImagePlus, X } from 'lucide-react'
import { insertPhoto, deletePhoto, type Photo } from '@/lib/db'
import { compressImage } from '@/lib/image'
import { mechInput } from './mechStyles'

interface PhotoGalleryProps {
  entryId: string
  accent: string
  photos: Photo[]
  onPhotosChange: (photos: Photo[]) => void
}

type PhotoType = 'progress' | 'completed'

function PhotoGrid({ items, label, accent, onOpen, onDelete }: {
  items: Photo[]; label: string; accent: string
  onOpen: (p: Photo) => void; onDelete: (id: string) => void
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
        {label}
      </p>
      {items.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mute)', letterSpacing: '0.1em' }}>NO PHOTOS</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {items.map((photo) => (
            <div
              key={photo.id}
              style={{
                position: 'relative',
                aspectRatio: '4/3',
                background: 'var(--bg-card)',
                border: `1px solid ${accent}44`,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.filter = `drop-shadow(0 0 6px ${accent}22)` }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.filter = 'none' }}
              onClick={() => onOpen(photo)}
            >
              <img src={photo.data_url} alt={photo.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {photo.caption && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 6px', background: 'rgba(0,0,0,0.7)', fontSize: 14, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                  {photo.caption}
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(photo.id) }}
                style={{ position: 'absolute', top: 4, right: 4, padding: 4, background: '#ef444455', border: 'none', color: '#f87171', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PhotoGallery({ entryId, accent, photos, onPhotosChange }: PhotoGalleryProps) {
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [uploadType, setUploadType] = useState<PhotoType>('progress')
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const progressPhotos = photos.filter((p) => p.photo_type === 'progress')
  const completedPhotos = photos.filter((p) => p.photo_type === 'completed')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await compressImage(file)
      const photo = await insertPhoto({
        entry_id: entryId,
        data_url: dataUrl,
        caption: caption.trim() || null,
        photo_type: uploadType,
      })
      onPhotosChange([...photos, photo])
      setCaption('')
    } catch (err) {
      console.error('Photo upload failed:', err)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    await deletePhoto(id)
    onPhotosChange(photos.filter((p) => p.id !== id))
  }

  const inp = { ...mechInput(accent), width: '100%' }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <ImagePlus size={14} style={{ color: accent }} />
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>
          PROJECT PHOTOS
        </p>
      </div>

      {/* Progress photos */}
      <PhotoGrid items={progressPhotos} label="⋯ Progress" accent={accent} onOpen={setLightbox} onDelete={handleDelete} />

      {/* Completed photos */}
      <PhotoGrid items={completedPhotos} label="✓ Completed" accent={accent} onOpen={setLightbox} onDelete={handleDelete} />

      {/* Upload controls */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', padding: 16, borderLeft: `3px solid ${accent}` }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12, margin: 0 }}>
          ADD PHOTO
        </p>

        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 12 }}>
          {(['progress', 'completed'] as PhotoType[]).map((t) => (
            <button
              key={t}
              onClick={() => setUploadType(t)}
              style={{
                padding: '5px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                background: uploadType === t ? `${accent}22` : 'transparent',
                border: `1px solid ${uploadType === t ? accent : 'var(--border-dim)'}`,
                borderLeft: uploadType === t ? `2px solid ${accent}` : '1px solid var(--border-dim)',
                color: uploadType === t ? accent : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t === 'completed' ? '✓ COMPLETED' : '⋯ PROGRESS'}
            </button>
          ))}
        </div>

        {/* Caption */}
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="CAPTION (OPTIONAL)…"
          style={{ ...inp, marginBottom: 12 }}
        />

        {/* File picker */}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '8px 12px',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
            background: `${accent}22`,
            border: `1px solid ${accent}`,
            borderLeft: `3px solid ${accent}`,
            color: accent,
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
            transition: 'all 0.15s ease',
            justifyContent: 'center',
          }}
        >
          <Upload size={11} />
          {uploading ? 'COMPRESSING…' : 'CHOOSE PHOTO'}
        </button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--overlay)' }}
          onClick={() => setLightbox(null)}
        >
          <button
            style={{ position: 'absolute', top: 16, right: 16, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, transition: 'color 0.15s ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-hi)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <img
              src={lightbox.data_url}
              alt={lightbox.caption ?? ''}
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: `1px solid color-mix(in srgb, var(--text-dim) 27%, transparent)` }}
            />
            {lightbox.caption && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mid)', letterSpacing: '0.04em', textAlign: 'center', margin: 0 }}>
                {lightbox.caption}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  padding: '4px 10px',
                  textTransform: 'uppercase',
                  background: lightbox.photo_type === 'completed' ? 'rgba(34,197,94,0.15)' : 'color-mix(in srgb, var(--text-hi) 8%, transparent)',
                  color: lightbox.photo_type === 'completed' ? '#22c55e' : 'var(--text-mid)',
                  letterSpacing: '0.1em',
                }}
              >
                {lightbox.photo_type === 'completed' ? '✓ COMPLETED' : '⋯ PROGRESS'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)' }}>
                {new Date(lightbox.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
