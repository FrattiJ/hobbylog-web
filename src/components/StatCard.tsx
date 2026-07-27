'use client'

import { useEffect, useState } from 'react'
import MechCard from './MechCard'

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return
    const startTime = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setCount(Math.round(eased * target))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return count
}

interface StatCardProps {
  label: string
  value: string | number
  accent?: string
  sub?: string
  index?: number
}

export default function StatCard({ label, value, accent = '#7c3aed', sub, index = 0 }: StatCardProps) {
  const numericValue = typeof value === 'number' ? value : (parseFloat(String(value)) || 0)
  const isNumeric = typeof value === 'number' || (!isNaN(parseFloat(String(value))) && value !== '—')
  const animated = useCountUp(isNumeric ? numericValue : 0)

  return (
    <MechCard accent={accent} index={index} panelNum={index + 1}>
      <div style={{ padding: '20px 18px 16px' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            letterSpacing: '0.18em',
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 32,
            fontWeight: 400,
            color: 'var(--text-hi)',
            lineHeight: 1,
            marginBottom: 6,
          }}
        >
          {isNumeric ? animated : value}
        </p>
        {sub && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {sub}
          </p>
        )}
        {/* Accent bottom bar */}
        <div
          style={{
            marginTop: 12,
            height: 2,
            background: `linear-gradient(to right, ${accent}, ${accent}22)`,
            width: '60%',
          }}
        />
      </div>
    </MechCard>
  )
}
