'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getFriendEntries, getAllEntries } from '@/lib/db'
import { HOBBY_MAP, STATUS_LABELS } from '@/lib/hobbies'
import { HOBBIES } from '@/lib/hobbies'
import type { Entry, HobbyCategory } from '@/types/database'

function norm(t: string): string { return t.toLowerCase().replace(/[™®©]/g, '').trim() }

export default function FriendLibrary({ friendId, username, onBack }: { friendId: string; username: string; onBack: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [myRatings, setMyRatings] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getFriendEntries(friendId), getAllEntries()]).then(([theirs, mine]) => {
      if (!alive) return
      const m = new Map<string, number>()
      for (const e of mine) if (e.status === 'completed' && e.rating != null) m.set(`${e.hobby_category}::${norm(e.title)}`, e.rating)
      setMyRatings(m); setEntries(theirs); setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [friendId])

  const completed = entries.filter((e) => e.status === 'completed').length
  const backlog = entries.filter((e) => e.status === 'backlog').length
  const inProgress = entries.filter((e) => e.status === 'in_progress').length

  const byHobby = HOBBIES.map((h) => ({ hobby: h, items: entries.filter((e) => e.hobby_category === (h.id as HobbyCategory)) })).filter((g) => g.items.length > 0)

  const stat = (n: number, label: string, color: string) => (
    <div>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', marginLeft: 6 }}>{label}</span>
    </div>
  )

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer', padding: '0 0 16px' }}>
        <ArrowLeft size={14} /> BACK TO FRIENDS
      </button>

      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#22c55e', letterSpacing: '0.2em', margin: '0 0 4px' }}>OPERATOR PROFILE /</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.06em', margin: 0 }}>{username.toUpperCase()}</h1>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 24, padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: '3px solid #22c55e' }}>
        {stat(entries.length, 'TRACKED', 'var(--text-hi)')}
        {stat(completed, 'COMPLETED', '#22c55e')}
        {stat(inProgress, 'IN PROGRESS', '#0891b2')}
        {stat(backlog, 'BACKLOG', 'var(--text-mid)')}
      </div>

      {loading && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>LOADING LIBRARY…</p>}
      {!loading && entries.length === 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>This operator hasn&apos;t logged anything yet.</p>}

      {byHobby.map(({ hobby, items }) => (
        <div key={hobby.id} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, background: hobby.accent, transform: 'rotate(45deg)' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.12em', margin: 0 }}>{hobby.pluralLabel.toUpperCase()}</h2>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>({items.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {items.map((e) => {
              const mine = e.status === 'completed' && e.rating != null ? myRatings.get(`${e.hobby_category}::${norm(e.title)}`) : undefined
              return (
                <div key={e.id} style={{ display: 'flex', gap: 10, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${HOBBY_MAP[e.hobby_category].accent}55` }}>
                  {e.cover_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.cover_url} alt="" style={{ width: 40, height: 58, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 58, background: 'var(--bg-base)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: 3 }}>{STATUS_LABELS[e.status]}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      {e.rating != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: hobby.accent }}>★ {e.rating}/10</span>}
                      {mine != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em', padding: '1px 6px', border: '1px solid var(--border-dim)' }}>
                          YOU {mine} · THEM {e.rating}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
