'use client'

import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import TodayTab from './TodayTab'
import RoutinesTab from './RoutinesTab'
import HistoryTab from './HistoryTab'
import ProgressTab from './ProgressTab'
import { ACCENT } from './ui'
import { readParamOneOf, useUrlParams } from '@/lib/urlState'

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'routines', label: 'Routines' },
  { id: 'history', label: 'History' },
  { id: 'progress', label: 'Progress' },
] as const

type TabId = (typeof TABS)[number]['id']

const TAB_KEY = 'fitness-tab'

export default function FitnessPage() {
  // The tab is in the URL (so History or Progress can be linked to), and
  // remembered for the session for arrivals that do not name one.
  const [tab, setTab] = useState<TabId>(() => {
    const ids = TABS.map((t) => t.id)
    const fromUrl = readParamOneOf('tab', ids)
    if (fromUrl) return fromUrl
    try {
      const saved = sessionStorage.getItem(TAB_KEY) as TabId | null
      if (saved && ids.includes(saved)) return saved
    } catch { /* storage unavailable */ }
    return 'today'
  })
  useUrlParams({ tab: tab === 'today' ? null : tab })

  function select(id: TabId) {
    setTab(id)
    sessionStorage.setItem(TAB_KEY, id)
  }

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Dumbbell size={20} style={{ color: ACCENT }} />
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900,
          letterSpacing: '0.05em', color: 'var(--text-hi)',
        }}>
          FITNESS
        </h1>
      </div>
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--text-dim)', marginBottom: 18,
      }}>
        Build routines, log sets and track records
      </p>

      <div className="scroll-hide" style={{ display: 'flex', borderBottom: '1px solid var(--border-dim)', marginBottom: 18, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: active ? 700 : 400,
                letterSpacing: '0.05em', whiteSpace: 'nowrap',
                color: active ? ACCENT : 'var(--text-dim)',
                borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
                marginBottom: -1, transition: 'var(--t-fast)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'today' && <TodayTab />}
      {tab === 'routines' && <RoutinesTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'progress' && <ProgressTab />}
    </div>
  )
}
