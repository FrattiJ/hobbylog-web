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
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: '70ch' }}>
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
      fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, padding: '2px 7px',
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
        minHeight: 36, padding: '0 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, background: filled ? `${color}22` : 'transparent',
        border: `1px solid ${disabled ? 'var(--border-dim)' : color}`,
        color: disabled ? 'var(--text-mute)' : color === 'var(--text-dim)' ? 'var(--text-mid)' : color,
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
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((r, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.45 }}>
          <span aria-hidden="true" style={{ color: accent, flexShrink: 0 }}>›</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  )
}

/** 0–1 score as a thin bar, with the number and what it is. */
export function ScoreBar({ score, accent }: { score: number; accent: string }) {
  const pct = Math.round(score * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 260 }} title="How strongly your own history points at this one, out of 100">
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-dim)' }}>Match</span>
      <div aria-hidden="true" style={{ flex: 1, height: 4, background: 'var(--bg-card)', border: '1px solid var(--border-dim)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)', minWidth: 22, textAlign: 'right' }}>{pct}</span>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', textAlign: 'center', padding: '28px 12px', margin: 0, lineHeight: 1.6 }}>
      {children}
    </p>
  )
}

export function Cover({ url, title, accent, size = 'md', rank }: { url: string | null; title: string; accent: string; size?: 'sm' | 'md'; rank?: number }) {
  const w = size === 'sm' ? 56 : 72
  const h = size === 'sm' ? 84 : 108
  return (
    <div style={{ width: w, height: h, flexShrink: 0, background: 'var(--bg-card)', border: `1px solid ${accent}55`, overflow: 'hidden', position: 'relative' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={w} height={h} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
      ) : (
        <div aria-hidden="true" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: accent }}>
          {title[0]}
        </div>
      )}
      {rank != null && (
        <span style={{ position: 'absolute', top: 0, left: 0, minWidth: 22, padding: '1px 5px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#fbbf24', background: 'rgba(8,10,14,0.85)', borderRight: '1px solid #d9770688', borderBottom: '1px solid #d9770688' }}>
          <span className="sr-only">Number </span>{rank}
        </span>
      )}
    </div>
  )
}

/**
 * One suggestion: cover, a heading block beside it, the reasoning, and the
 * actions. Wide, the reasoning sits beside the cover; on a phone it drops
 * underneath and gets the full width, and the actions become a row of
 * equal buttons. The layout is in globals.css (.sg-card).
 */
export function Suggestion({ accent, cover, title, tags, children, actions }: {
  accent: string
  cover: React.ReactNode
  title: React.ReactNode
  tags: React.ReactNode
  children?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <article className="sg-card" style={{ borderLeftColor: accent }}>
      <div className="sg-cover">{cover}</div>
      <div className="sg-head">
        <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3, color: 'var(--text-hi)', margin: '0 0 7px', overflowWrap: 'anywhere' }}>
          {title}
        </h3>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{tags}</div>
      </div>
      {children && <div className="sg-detail">{children}</div>}
      <div className="sg-actions">{actions}</div>
    </article>
  )
}
