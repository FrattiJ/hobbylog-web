'use client'

import { useState } from 'react'
import { MUSCLE_LABELS, MUSCLE_REGIONS, MUSCLE_WHERE, type MuscleId } from '@/lib/fitness/muscles'
import { Select, ACCENT } from './ui'

// Choosing a muscle, two ways. Both say where on the body each one is, because
// "lats" means nothing to someone in their first month at a gym.

// A dropdown, for forms where the muscle is one field among several.
export function MuscleSelect({ value, onChange, style }: {
  value: MuscleId | null
  onChange: (m: MuscleId | null) => void
  style?: React.CSSProperties
}) {
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as MuscleId | null)}
      style={{ width: '100%', ...style }}
      aria-label="Main muscle worked"
    >
      <option value="">Not sure, or not a muscle exercise</option>
      {MUSCLE_REGIONS.map((r) => (
        <optgroup key={r.label} label={r.label}>
          {r.muscles.map((m) => (
            <option key={m} value={m}>{MUSCLE_LABELS[m]} ({MUSCLE_WHERE[m]})</option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

// A grid of buttons, for when choosing the muscle is the whole question.
export function MuscleChooser({ value, onChoose, disabled }: {
  value: MuscleId | null
  onChoose: (m: MuscleId) => void
  disabled?: boolean
}) {
  return (
    <div>
      {MUSCLE_REGIONS.map((r) => (
        <div key={r.label} style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 6 }}>
            {r.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {r.muscles.map((m) => (
              <MuscleButton key={m} muscle={m} on={value === m} disabled={disabled} onClick={() => onChoose(m)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MuscleButton({ muscle, on, disabled, onClick }: {
  muscle: MuscleId; on: boolean; disabled?: boolean; onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const lit = on || (hover && !disabled)
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', padding: '8px 10px', minHeight: 44, cursor: disabled ? 'wait' : 'pointer',
        background: lit ? `${ACCENT}18` : 'transparent',
        border: `1px solid ${on ? ACCENT : 'var(--border-dim)'}`,
        borderLeft: `3px solid ${lit ? ACCENT : 'var(--border-dim)'}`,
        transition: 'var(--t-fast)',
      }}
    >
      <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)' }}>
        {MUSCLE_LABELS[muscle]}
      </span>
      <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.35 }}>
        {MUSCLE_WHERE[muscle]}
      </span>
    </button>
  )
}
