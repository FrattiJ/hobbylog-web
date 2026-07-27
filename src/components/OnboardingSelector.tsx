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

export default function OnboardingSelector({ onComplete }: { onComplete: (ids: HobbyCategory[]) => Promise<void> }) {
  const [selected, setSelected] = useState<HobbyCategory[]>(HOBBIES.map((h) => h.id))
  const [busy, setBusy] = useState(false)

  function toggle(id: HobbyCategory) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function finish() {
    if (selected.length === 0) return
    setBusy(true)
    await onComplete(selected)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' }}>
      <div style={gridBg} />
      <div style={{ width: '100%', maxWidth: 720, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#22c55e', letterSpacing: '0.25em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'status-blink 1.5s ease-in-out infinite' }} />
            SYSTEM INITIALIZED
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>WHAT DO YOU TRACK?</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', margin: '10px 0 0', lineHeight: 1.7 }}>
            Pick the categories you want in your backlog. You can change these anytime in Settings.
          </p>
        </div>

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
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: active ? 'var(--text-hi)' : 'var(--text-dim)' }}>
                    {h.pluralLabel.toUpperCase()}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={finish} disabled={busy || selected.length === 0}
            style={{ padding: '13px 36px', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: '#7c3aed', background: '#7c3aed22', border: '1px solid #7c3aed', borderLeft: '3px solid #7c3aed', cursor: busy ? 'wait' : 'pointer', opacity: busy || selected.length === 0 ? 0.5 : 1 }}>
            {busy ? '…' : 'ENTER SYSTEM'}
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{selected.length} selected</span>
        </div>
      </div>
    </main>
  )
}
