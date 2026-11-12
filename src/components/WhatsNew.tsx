'use client'

import { Sparkles, X } from 'lucide-react'
import { CHANGELOG, markChangelogSeen } from '@/lib/changelog'
import { CLIP } from './MechCard'

const ACCENT = '#955ff0'

export default function WhatsNew({ onClose }: { onClose: () => void }) {
  function close() { markChangelogSeen(); onClose() }
  const latest = CHANGELOG[0]

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 460, padding: '1px', clipPath: CLIP, background: `${ACCENT}66` }}>
        <div style={{ background: 'var(--bg-card)', clipPath: CLIP, padding: 24, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, background: ACCENT, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <button onClick={close} style={{ position: 'absolute', top: 16, right: 16, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={16} /></button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Sparkles size={16} style={{ color: ACCENT }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: ACCENT, letterSpacing: '0.08em', margin: 0 }}>WHAT&rsquo;S NEW</p>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: '0 0 2px' }}>v{latest.version}</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.05em', margin: '0 0 18px' }}>{latest.date}</p>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {latest.items.map((it, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55 }}>
                <span style={{ color: ACCENT, flexShrink: 0 }}>▸</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>

          <button onClick={close}
            style={{ width: '100%', padding: '11px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer' }}>
            Got It
          </button>
        </div>
      </div>
    </div>
  )
}
