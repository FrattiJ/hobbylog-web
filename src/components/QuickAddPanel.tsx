'use client'

import { useState } from 'react'
import AddEntryModal from './AddEntryModal'
import { CLIP } from './MechCard'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { useHobbies } from './HobbyContext'
import type { HobbyCategory } from '@/types/database'
import { useEscape } from '@/lib/useEscape'

export default function QuickAddPanel({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  useEscape(onClose)
  const [selected, setSelected] = useState<HobbyCategory | null>(null)
  const { enabledHobbies } = useHobbies()

  if (selected) {
    return <AddEntryModal hobbyId={selected} onClose={onClose} onAdded={() => { onAdded?.() }} onBack={() => setSelected(null)} />
  }

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose() }}
      role="dialog" aria-modal="true" aria-label="Quick add"
      style={{ overscrollBehavior: 'contain', position: 'fixed', inset: 0, zIndex: 70, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '1px', clipPath: CLIP, background: '#955ff055' }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 22, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#955ff0', clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 4px' }}>Quick add</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', letterSpacing: '0.05em', margin: '0 0 16px' }}>PICK A CATEGORY</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {/* Fitness isn't an entry you add — it has its own section. */}
            {enabledHobbies.filter((h) => !h.customSection).map((h) => {
              const Icon = HOBBY_ICON_MAP[h.icon]
              return (
                <button key={h.id} onClick={() => setSelected(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${h.accent}14`, border: `1px solid ${h.accent}55`, borderLeft: `3px solid ${h.accent}`, color: h.accent, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer' }}>
                  {Icon && <Icon size={16} />}
                  {h.pluralLabel}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
