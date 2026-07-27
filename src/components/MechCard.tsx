'use client'

import { useState } from 'react'

export const CLIP = 'polygon(14px 0%, 100% 0%, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0% 100%, 0% 14px)'

interface MechCardProps {
  children: React.ReactNode
  accent?: string
  index?: number
  panelNum?: number
  className?: string
  style?: React.CSSProperties
  hoverable?: boolean
  noPad?: boolean
  onClick?: () => void
}

export default function MechCard({
  children,
  accent = '#7c3aed',
  index = 0,
  panelNum,
  className = '',
  style,
  hoverable = false,
  noPad = false,
  onClick,
}: MechCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`mech-enter ${className}`}
      onClick={onClick}
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        padding: '1px',
        clipPath: CLIP,
        background: `${accent}${hovered ? 'cc' : '55'}`,
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        filter: hovered ? `drop-shadow(0 0 10px ${accent}44)` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        animationDelay: `${index * 80}ms`,
        ...style,
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          clipPath: CLIP,
          position: 'relative',
          width: '100%',
          height: '100%',
          padding: noPad ? 0 : undefined,
        }}
      >
        {/* Accent corner notch */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 14,
            height: 14,
            background: accent,
            clipPath: 'polygon(0 0, 100% 0, 0 100%)',
            zIndex: 1,
          }}
        />

        {/* Panel number */}
        {panelNum !== undefined && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 12,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
              zIndex: 1,
            }}
          >
            {String(panelNum).padStart(2, '0')}
          </span>
        )}

        {children}
      </div>
    </div>
  )
}

/* ── Simple non-clipped mech border box (for inputs, smaller elements) ──────── */
export function MechBox({
  children,
  accent = 'var(--text-dim)',
  className = '',
  style,
}: {
  children: React.ReactNode
  accent?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${accent}66`,
        borderLeft: `2px solid ${accent}`,
        padding: '12px 16px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
