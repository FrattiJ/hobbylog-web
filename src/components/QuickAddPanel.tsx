'use client'

import { useState } from 'react'
import AddEntryModal from './AddEntryModal'
import { CLIP } from './MechCard'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { useHobbies } from './HobbyContext'
import type { HobbyCategory } from '@/types/database'

export default function QuickAddPanel({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  const [selected, setSelected] = useState<HobbyCategory | null>(null)
  const { enabledHobbies } = useHobbies()

  if (selected) {
    return <AddEntryModal hobbyId={selected} onClose={onClose} onAdded={() => { onAdded?.() }} />
  }

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '1px', clipPath: CLIP, background: '#7c3aed55' }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 22, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: '#7c3aed', clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', margin: '0 0 4px' }}>QUICK ADD /</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-hi)', letterSpacing: '0.1em', margin: '0 0 16px' }}>PICK A CATEGORY</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {enabledHobbies.map((h) => {
              const Icon = HOBBY_ICON_MAP[h.icon]
              return (
                <button key={h.id} onClick={() => setSelected(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: `${h.accent}14`, border: `1px solid ${h.accent}55`, borderLeft: `3px solid ${h.accent}`, color: h.accent, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
                  {Icon && <Icon size={16} />}
                  {h.pluralLabel.toUpperCase()}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
