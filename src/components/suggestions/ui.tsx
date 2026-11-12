'use client'

import { CLIP } from '@/components/MechCard'

// Shared chrome for the suggestions page, in the same mech / blueprint language
// as the rest of the app: clipped panels, corner notch, mono labels.

export function Panel({ accent, title, sub, right, children, style }: {
  accent: string
  title?: string
  sub?: string
  right?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ padding: '1px', clipPath: CLIP, background: `${accent}55`, ...style }}>
      <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 20, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: accent, clipPath: 'polygon(0 0, 100% 0, 0 100%)', zIndex: 2 }} />
        {(title || right) && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: sub ? 14 : 16 }}>
            <div>
              {title && (
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', margin: 0, letterSpacing: '0.05em' }}>
                  {title}
                </h2>
              )}
              {sub && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', margin: '5px 0 0', letterSpacing: '0.05em', lineHeight: 1.5 }}>
                  {sub}
                </p>
              )}
            </div>
            {right}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Tag({ children, color = 'var(--text-dim)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', padding: '2px 7px',
      background: `${color}18`, color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

export function Btn({ children, onClick, color = 'var(--text-dim)', disabled, filled }: {
  children: React.ReactNode
  onClick?: () => void
  color?: string
  disabled?: boolean
  filled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '5px 11px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', background: filled ? `${color}22` : 'transparent',
        border: `1px solid ${disabled ? 'var(--border-dim)' : color}`,
        color: disabled ? 'var(--text-mute)' : color,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'var(--t-fast)', whiteSpace: 'nowrap',
      }}>
      {children}
    </button>
  )
}

/** The horizontal "why" list under every suggestion. */
export function Reasons({ items, accent }: { items: string[]; accent: string }) {
  if (items.length === 0) return null
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((r, i) => (
        <li key={i} style={{ display: 'flex', gap: 7, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          <span style={{ color: accent, flexShrink: 0 }}>›</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  )
}

/** 0–1 score as a thin mech bar. */
export function ScoreBar({ score, accent }: { score: number; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
        <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, background: accent, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.05em', width: 30, textAlign: 'right' }}>
        {Math.round(score * 100)}
      </span>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mute)', letterSpacing: '0.05em', textAlign: 'center', padding: '28px 12px', margin: 0, lineHeight: 1.7 }}>
      {children}
    </p>
  )
}

export function Cover({ url, title, accent, size = 'md' }: { url: string | null; title: string; accent: string; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 40 : 52
  const h = size === 'sm' ? 56 : 74
  return (
    <div style={{ width: w, height: h, flexShrink: 0, background: 'var(--bg-base)', border: `1px solid ${accent}33`, overflow: 'hidden', position: 'relative' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 900, color: `${accent}88` }}>
          {title[0]}
        </div>
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, background: accent, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
    </div>
  )
}
