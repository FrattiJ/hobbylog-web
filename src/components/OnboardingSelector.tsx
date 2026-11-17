'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { HOBBIES } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { CLIP } from './MechCard'
import type { HobbyCategory } from '@/types/database'

const gridBg: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
  backgroundImage: 'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
  backgroundSize: '40px 40px', opacity: 0.25,
}

const IMPORT_SOURCES = [
  { label: 'Steam', blurb: 'Games + playtime', accent: '#099bbe' },
  { label: 'MyAnimeList', blurb: 'Anime & manga', accent: '#2e51a2' },
  { label: 'Goodreads', blurb: 'Books', accent: '#d97706' },
  { label: 'Letterboxd', blurb: 'Films', accent: '#00c030' },
]

export default function OnboardingSelector({ onComplete }: { onComplete: (ids: HobbyCategory[], goToImport: boolean) => Promise<void> }) {
  const [step, setStep] = useState<'hobbies' | 'imports'>('hobbies')
  const [selected, setSelected] = useState<HobbyCategory[]>(HOBBIES.map((h) => h.id))
  const [busy, setBusy] = useState(false)

  function toggle(id: HobbyCategory) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function finish(goToImport: boolean) {
    if (selected.length === 0) return
    setBusy(true)
    await onComplete(selected, goToImport)
  }

  const primaryBtn: React.CSSProperties = {
    padding: '13px 36px', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 700, letterSpacing: '0.05em',
    color: '#a577f2', background: '#a577f222', border: '1px solid #a577f2', borderLeft: '3px solid #a577f2', cursor: 'pointer',
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' }}>
      <div style={gridBg} />
      <div style={{ width: '100%', maxWidth: 720, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#22c55e', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'status-blink 1.5s ease-in-out infinite' }} />
            {step === 'hobbies' ? 'Step 1 of 2' : 'Step 2 Of 2'}
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: 0 }}>
            {step === 'hobbies' ? 'What do you track?' : 'Bring in your lists?'}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: '10px 0 0', lineHeight: 1.7 }}>
            {step === 'hobbies'
              ? 'Pick the categories you want in your backlog. You can change these anytime in Settings.'
              : 'Already have libraries elsewhere? Import them now so your backlog starts full — or skip and add things by hand. You can always import later from Settings.'}
          </p>
        </div>

        {step === 'hobbies' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
              {HOBBIES.map((h) => {
                const Icon = HOBBY_ICON_MAP[h.icon]
                const active = selected.includes(h.id)
                return (
                  <button key={h.id} onClick={() => toggle(h.id)}
                    style={{ padding: '1px', clipPath: CLIP, background: active ? `${h.accent}aa` : 'var(--border-dim)', cursor: 'pointer', border: 'none' }}>
                    <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
                      {active && <div style={{ position: 'absolute', top: 8, right: 8, color: h.accent }}><Check size={14} /></div>}
                      {Icon && <span style={{ color: active ? h.accent : 'var(--text-dim)', display: 'inline-flex' }}><Icon size={26} /></span>}
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: active ? 'var(--text-hi)' : 'var(--text-dim)' }}>
                        {h.pluralLabel}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => setStep('imports')} disabled={selected.length === 0}
                style={{ ...primaryBtn, cursor: selected.length === 0 ? 'not-allowed' : 'pointer', opacity: selected.length === 0 ? 0.5 : 1 }}>
                CONTINUE →
              </button>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>{selected.length} selected</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
              {IMPORT_SOURCES.map((s) => (
                <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${s.accent}`, padding: '14px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', color: s.accent }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{s.blurb}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => finish(true)} disabled={busy} style={{ ...primaryBtn, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? '…' : 'Set Up Imports'}
              </button>
              <button onClick={() => finish(false)} disabled={busy}
                style={{ padding: '13px 28px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: busy ? 'wait' : 'pointer' }}>
                Skip for Now
              </button>
              <button onClick={() => setStep('hobbies')} disabled={busy}
                style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>
                ← back
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
