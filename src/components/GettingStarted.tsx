'use client'

import { useEffect, useState } from 'react'
import { X, Search, ListOrdered, Clock, Users } from 'lucide-react'

const KEY = 'hobbylog-tips-dismissed'
const ACCENT = '#955ff0'

const TIPS = [
  { icon: Search, title: 'Add anything', text: 'Add Entry or Quick Add — search a title and cover art + details fill in for you.' },
  { icon: ListOrdered, title: 'Rank your backlog', text: 'On a hobby page, filter to Backlog and hit Rank to order what to tackle next.' },
  { icon: Clock, title: 'Log sessions', text: 'Quick Log tracks time/progress and moves items to In Progress automatically.' },
  { icon: Users, title: 'Add friends', text: 'Share your username on Friends to compare libraries and swap ratings.' },
]

export default function GettingStarted() {
  const [show, setShow] = useState(false)
  useEffect(() => { if (localStorage.getItem(KEY) !== '1') setShow(true) }, [])
  if (!show) return null

  function dismiss() { localStorage.setItem(KEY, '1'); setShow(false) }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: '18px 20px', marginBottom: 24, position: 'relative' }}>
      <button onClick={dismiss} title="Dismiss" style={{ position: 'absolute', top: 12, right: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label="Dismiss"><X size={15} /></button>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: ACCENT, letterSpacing: '0.08em', margin: '0 0 4px' }}>Welcome</p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: '0 0 16px' }}>GETTING STARTED</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {TIPS.map((t) => (
          <div key={t.title} style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
              <t.icon size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: '0 0 3px' }}>{t.title}</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, margin: 0 }}>{t.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
