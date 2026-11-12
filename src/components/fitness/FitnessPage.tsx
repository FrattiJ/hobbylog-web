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
    <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dumbbell size={22} aria-hidden="true" style={{ color: ACCENT, flexShrink: 0 }} />
          FITNESS
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          Build routines, log sets and track records
        </p>
      </div>

      {/* One row that scrolls sideways if it has to; each tab is a full-height target. */}
      <div className="scroll-hide" role="tablist" aria-label="Fitness sections" style={{ display: 'flex', borderBottom: '1px solid var(--border-dim)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => select(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', minHeight: 44, padding: '0 18px',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: active ? 600 : 500,
                whiteSpace: 'nowrap',
                color: active ? ACCENT : 'var(--text-mid)',
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
