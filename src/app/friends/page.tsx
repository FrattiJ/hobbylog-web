'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, Check, X, Users } from 'lucide-react'
import Link from 'next/link'
import {
  searchUsers, sendFriendRequest, listFriends, listIncomingRequests, listOutgoingRequests,
  respondToRequest, removeFriend, getProfile, PROFILE_CHANGED_EVENT, type UserRef, type FriendView,
} from '@/lib/db'
import FriendLibrary from '@/components/FriendLibrary'

const GREEN = '#22c55e'

export default function FriendsPage() {
  const [selected, setSelected] = useState<{ id: string; username: string } | null>(null)
  const [myHandle, setMyHandle] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserRef[]>([])
  const [searching, setSearching] = useState(false)
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  const [friends, setFriends] = useState<FriendView[]>([])
  const [incoming, setIncoming] = useState<FriendView[]>([])
  const [outgoing, setOutgoing] = useState<FriendView[]>([])
  const seq = useRef(0)

  const load = useCallback(() => {
    listFriends().then(setFriends).catch(() => {})
    listIncomingRequests().then(setIncoming).catch(() => {})
    listOutgoingRequests().then(setOutgoing).catch(() => {})
    getProfile().then((p) => setMyHandle(p.username ?? '')).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(PROFILE_CHANGED_EVENT, load)
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, load)
  }, [load])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); return }
    const s = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(query.trim())
        if (s === seq.current) { setResults(r); setSearching(false) }
      } catch { if (s === seq.current) setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  async function add(u: UserRef) {
    setMsg(null)
    try {
      await sendFriendRequest(u.user_id)
      setRequested((prev) => new Set(prev).add(u.user_id))
      load()
    } catch (e) { setMsg((e as Error).message) }
  }

  async function respond(id: string, accept: boolean) { await respondToRequest(id, accept); load() }
  async function unfriend(id: string) { await removeFriend(id); load() }

  const knownIds = new Set<string>([
    ...friends.map((f) => f.user_id),
    ...incoming.map((f) => f.user_id),
    ...outgoing.map((f) => f.user_id),
  ])

  if (selected) {
    return (
      <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
        <FriendLibrary friendId={selected.id} username={selected.username} onBack={() => setSelected(null)} />
      </div>
    )
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${GREEN}`, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 12px' }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-dim)' }
  const nameStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', letterSpacing: '0.04em' }
  const smallBtn = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color, background: `${color}18`, border: `1px solid ${color}66`, cursor: 'pointer' })

  return (
    <div style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>NETWORK / FRIENDS</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>FRIENDS</h1>
      </div>

      {/* Your handle — friends search by this exact username */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${GREEN}`, padding: '14px 18px', marginBottom: 16 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', margin: '0 0 4px' }}>FRIENDS FIND YOU AS</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: GREEN, letterSpacing: '0.04em' }}>{myHandle || '—'}</span>
          <Link href="/settings" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>change in Settings →</Link>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
          Share that handle so friends can search you. Search is by username — pick a memorable one. You only see someone&apos;s logs once you&apos;re friends.
        </p>
      </div>

      {/* Find people */}
      <div style={card}>
        <h2 style={h2}>FIND OPERATORS</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username…" spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${GREEN}66`, padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }} />
        {msg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#f59e0b', margin: '10px 0 0' }}>{msg}</p>}
        {(searching || results.length > 0) && (
          <div style={{ marginTop: 10 }}>
            {searching && results.length === 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>SEARCHING…</p>}
            {results.map((u) => {
              const already = knownIds.has(u.user_id) || requested.has(u.user_id)
              return (
                <div key={u.user_id} style={row}>
                  <span style={nameStyle}>{u.username}</span>
                  {already
                    ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{friends.some((f) => f.user_id === u.user_id) ? 'FRIENDS' : 'PENDING'}</span>
                    : <button onClick={() => add(u)} style={smallBtn(GREEN)}><UserPlus size={12} /> ADD</button>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div style={{ ...card, borderLeftColor: '#0891b2' }}>
          <h2 style={h2}>FRIEND REQUESTS <span style={{ color: '#0891b2' }}>({incoming.length})</span></h2>
          {incoming.map((r) => (
            <div key={r.id} style={row}>
              <span style={nameStyle}>{r.username}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => respond(r.id, true)} style={smallBtn(GREEN)}><Check size={12} /> ACCEPT</button>
                <button onClick={() => respond(r.id, false)} style={smallBtn('#ef4444')}><X size={12} /> DECLINE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Friends */}
      <div style={card}>
        <h2 style={h2}>YOUR NETWORK <span style={{ color: GREEN }}>({friends.length})</span></h2>
        {friends.length === 0
          ? <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}><Users size={14} /> No friends yet — search a username above to send a request.</p>
          : friends.map((f) => (
            <div key={f.id} style={row}>
              <button onClick={() => setSelected({ id: f.user_id, username: f.username })}
                style={{ ...nameStyle, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                {f.username}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected({ id: f.user_id, username: f.username })} style={smallBtn('#0891b2')}>VIEW LOGS</button>
                <button onClick={() => unfriend(f.id)} style={smallBtn('#ef4444')}>REMOVE</button>
              </div>
            </div>
          ))}
      </div>

      {/* Outgoing (sent) */}
      {outgoing.length > 0 && (
        <div style={{ ...card, borderLeftColor: 'var(--border-dim)' }}>
          <h2 style={h2}>SENT REQUESTS</h2>
          {outgoing.map((r) => (
            <div key={r.id} style={row}>
              <span style={{ ...nameStyle, color: 'var(--text-mid)' }}>{r.username}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>PENDING</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
