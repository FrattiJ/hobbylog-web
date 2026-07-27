import type { CSSProperties } from 'react'

// Canonical text input for the mech aesthetic: dark base, dim border,
// accent-colored left edge. Shared by every form in the app.
export function mechInput(accent: string): CSSProperties {
  return {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${accent}66`,
    padding: '8px 12px',
    color: 'var(--text-hi)',
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    outline: 'none',
  }
}
