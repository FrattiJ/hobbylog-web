'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Entry, HobbyCategory } from '@/types/database'
import { ENTRY_HOBBIES } from '@/lib/hobbies'
import { getAllEntries, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import { useHobbies } from '@/components/HobbyContext'
import ShelfWall from '@/components/ShelfWall'
import { readParamOneOf, useUrlParams } from '@/lib/urlState'
import { timesFinished } from '@/lib/finishes'

// Everything you have finished, across hobbies, as one wall of covers. The
// backlog is a list of things to do; this is the record of what got done.
// Recipes are left out: "made it" is not a finish, and Cooking keeps its own
// Made tab.
const SHELF_HOBBIES = ENTRY_HOBBIES.filter((h) => !h.recipe)

export default function ShelfPage() {
  const { enabledIds } = useHobbies()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [hobbyFilter, setHobbyFilter] = useState<HobbyCategory | 'all'>(() => readParamOneOf('hobby', SHELF_HOBBIES.map((h) => h.id)) ?? 'all')
  useUrlParams({ hobby: hobbyFilter === 'all' ? null : hobbyFilter })

  useEffect(() => {
    const load = () => { getAllEntries().then(setEntries).catch(() => setEntries([])) }
    load()
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    return () => window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
  }, [])

  const hobbies = SHELF_HOBBIES.filter((h) => enabledIds.includes(h.id))
  // Anything finished at least once, including something you are in the
  // middle of again. The counts are of finishes, so a reread counts twice.
  const finished = (entries ?? []).filter((e) => timesFinished(e) > 0 && hobbies.some((h) => h.id === e.hobby_category))
  const finishCount = (list: Entry[]) => list.reduce((t, e) => t + timesFinished(e), 0)
  const withFinishes = hobbies
    .map((h) => ({ hobby: h, count: finishCount(finished.filter((e) => e.hobby_category === h.id)) }))
    .filter((x) => x.count > 0)
  const shown = hobbyFilter === 'all' ? finished : finished.filter((e) => e.hobby_category === hobbyFilter)
  const total = finishCount(finished)

  const tab = (active: boolean, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px',
    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: active ? 600 : 500,
    background: active ? `${color}1f` : 'transparent',
    border: `1px solid ${active ? color : 'var(--border-dim)'}`,
    color: active ? color : 'var(--text-mid)', cursor: 'pointer', transition: 'var(--t-fast)',
  })
  const tabCount: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0 }}>SHELF</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          {entries === null
            ? 'Loading…'
            : finished.length === 0
              ? 'Everything you finish lands here.'
              : `${total} finished across ${withFinishes.length} ${withFinishes.length === 1 ? 'hobby' : 'hobbies'}`}
        </p>
      </div>

      {entries === null ? (
        <div className="cover-grid" aria-busy="true" aria-label="Loading">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="mech-skeleton" style={{ aspectRatio: '2 / 3', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : finished.length === 0 ? (
        <div style={{ padding: '56px 24px', textAlign: 'center', border: '1px dashed var(--border-dim)', background: 'var(--bg-card)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 600, color: 'var(--text-hi)', margin: '0 0 6px' }}>Your shelf is empty</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>
            Mark something as completed and its cover goes up here, with the date and your rating.
          </p>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 20, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>
            Go to your dashboard
          </Link>
        </div>
      ) : (
        <>
          {withFinishes.length > 1 && (
            <div className="tab-row" role="tablist" aria-label="Filter by hobby" style={{ marginBottom: 24 }}>
              <button role="tab" aria-selected={hobbyFilter === 'all'} onClick={() => setHobbyFilter('all')} style={tab(hobbyFilter === 'all', '#f59e0b')}>
                All <span style={tabCount}>{total}</span>
              </button>
              {withFinishes.map(({ hobby, count }) => (
                <button key={hobby.id} role="tab" aria-selected={hobbyFilter === hobby.id}
                  onClick={() => setHobbyFilter(hobbyFilter === hobby.id ? 'all' : hobby.id)} style={tab(hobbyFilter === hobby.id, hobby.accent)}>
                  {hobby.pluralLabel} <span style={tabCount}>{count}</span>
                </button>
              ))}
            </div>
          )}
          <ShelfWall entries={shown} showHobby={hobbyFilter === 'all'} />
        </>
      )}
    </div>
  )
}
