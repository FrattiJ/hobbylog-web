'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, Check, X, Users, Undo2 } from 'lucide-react'
import Link from 'next/link'
import {
  searchUsers, discoverUsers, sendFriendRequest, listFriends, listIncomingRequests,
  listOutgoingRequests, respondToRequest, removeFriend, cancelFriendRequest,
  getProfile, getFriendsFeed, PROFILE_CHANGED_EVENT,
  type UserRef, type FriendView, type FeedItem,
} from '@/lib/db'
import { HOBBY_MAP, statusLabelFor } from '@/lib/hobbies'
import type { Entry } from '@/types/database'
import FriendLibrary from '@/components/FriendLibrary'

const GREEN = '#22c55e'

function activityVerb(e: Entry): string {
  if (e.status === 'completed') return 'finished'
  if (e.status === 'dropped') return 'dropped'
  if (e.status === 'backlog') return 'added to backlog'
  if (e.hobby_category === 'games') return 'is playing'
  if (e.hobby_category === 'movies' || e.hobby_category === 'tv') return 'is watching'
  if (e.hobby_category === 'books') return 'is reading'
  return 'is working on'
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d ago`
  const w = d / 7; if (w < 5) return `${Math.floor(w)}w ago`
  return new Date(iso).toLocaleDateString()
}

function Avatar({ url, name, size = 30 }: { url: string | null; name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #7c3aed55' }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.45, fontWeight: 700, color: '#fff' }}>{(name || 'O')[0].toUpperCase()}</span>}
    </div>
  )
}

export default function FriendsPage() {
  const [selected, setSelected] = useState<{ id: string; username: string; avatar_url: string | null; entryId?: string } | null>(null)
  const [myHandle, setMyHandle] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserRef[]>([])
  // Who else is on the app, shown before you type. Search alone meant you could
  // only find someone whose handle you'd already been told.
  const [suggested, setSuggested] = useState<UserRef[]>([])
  const [searching, setSearching] = useState(false)
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  const [friends, setFriends] = useState<FriendView[]>([])
  const [incoming, setIncoming] = useState<FriendView[]>([])
  const [outgoing, setOutgoing] = useState<FriendView[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const seq = useRef(0)

  const load = useCallback(() => {
    listFriends().then(setFriends).catch(() => {})
    listIncomingRequests().then(setIncoming).catch(() => {})
    listOutgoingRequests().then(setOutgoing).catch(() => {})
    getFriendsFeed().then(setFeed).catch(() => {})
    getProfile().then((p) => setMyHandle(p.username ?? '')).catch(() => {})
    discoverUsers().then(setSuggested).catch(() => {})
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

  async function unsend(r: FriendView) {
    setMsg(null)
    try {
      await cancelFriendRequest(r.id)
      // Drop it from the just-requested set too, so the ADD button comes back
      // rather than the row staying stuck on PENDING.
      setRequested((prev) => { const next = new Set(prev); next.delete(r.user_id); return next })
      load()
    } catch (e) { setMsg((e as Error).message) }
  }

  const knownIds = new Set<string>([
    ...friends.map((f) => f.user_id),
    ...incoming.map((f) => f.user_id),
    ...outgoing.map((f) => f.user_id),
  ])

  // Empty box: a directory of everyone else, minus anyone already in your
  // network (they have their own section). Two characters in, it becomes search.
  const browsing = query.trim().length >= 2
  const shown = browsing ? results : suggested.filter((u) => !knownIds.has(u.user_id))

  if (selected) {
    return (
      <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
        <FriendLibrary friendId={selected.id} username={selected.username} avatarUrl={selected.avatar_url} initialEntryId={selected.entryId} onBack={() => setSelected(null)} />
      </div>
    )
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${GREEN}`, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: '0 0 12px' }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-dim)' }
  const nameStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-hi)', letterSpacing: '0.04em' }
  const smallBtn = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color, background: `${color}18`, border: `1px solid ${color}66`, cursor: 'pointer' })
  const subLabel: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.16em', margin: '0 0 6px' }

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
          Share that handle so friends can find you — pick a memorable one. You can also browse everyone on Hobbylog below. You only see someone&apos;s logs once you&apos;re friends.
        </p>
      </div>

      {/* Find people */}
      <div style={card}>
        <h2 style={h2}>FIND OPERATORS</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username, or browse below…" spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${GREEN}66`, padding: '9px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }} />
        {msg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#f59e0b', margin: '10px 0 0' }}>{msg}</p>}
        <div style={{ marginTop: 10 }}>
          {searching && results.length === 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>SEARCHING…</p>}
          {!searching && browsing && results.length === 0 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>NO ONE BY THAT NAME.</p>
          )}
          {shown.length > 0 && (
            <p style={{ ...subLabel, marginTop: 4 }}>{browsing ? 'RESULTS' : 'ON HOBBYLOG'}</p>
          )}
          {shown.map((u) => {
            const already = knownIds.has(u.user_id) || requested.has(u.user_id)
            return (
              <div key={u.user_id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar url={u.avatar_url} name={u.username} />
                  <span style={nameStyle}>{u.username}</span>
                </div>
                {already
                  ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{friends.some((f) => f.user_id === u.user_id) ? 'FRIENDS' : 'PENDING'}</span>
                  : <button onClick={() => add(u)} style={smallBtn(GREEN)}><UserPlus size={12} /> ADD</button>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Your network — friends + requests combined */}
      <div style={card}>
        <h2 style={h2}>YOUR NETWORK <span style={{ color: GREEN }}>({friends.length})</span></h2>

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={subLabel}>FRIEND REQUESTS <span style={{ color: '#0891b2' }}>({incoming.length})</span></p>
            {incoming.map((r) => (
              <div key={r.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar url={r.avatar_url} name={r.username} />
                  <span style={nameStyle}>{r.username}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respond(r.id, true)} style={smallBtn(GREEN)}><Check size={12} /> ACCEPT</button>
                  <button onClick={() => respond(r.id, false)} style={smallBtn('#ef4444')}><X size={12} /> DECLINE</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends */}
        {friends.length === 0
          ? <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}><Users size={14} /> No friends yet — search a username above to send a request.</p>
          : friends.map((f) => (
            <div key={f.id} style={row}>
              <button onClick={() => setSelected({ id: f.user_id, username: f.username, avatar_url: f.avatar_url })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                <Avatar url={f.avatar_url} name={f.username} />
                <span style={nameStyle}>{f.username}</span>
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected({ id: f.user_id, username: f.username, avatar_url: f.avatar_url })} style={smallBtn('#0891b2')}>VIEW LOGS</button>
                <button onClick={() => unfriend(f.id)} style={smallBtn('#ef4444')}>REMOVE</button>
              </div>
            </div>
          ))}

        {/* Sent requests */}
        {outgoing.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={subLabel}>SENT REQUESTS</p>
            {outgoing.map((r) => (
              <div key={r.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar url={r.avatar_url} name={r.username} />
                  <span style={{ ...nameStyle, color: 'var(--text-mid)' }}>{r.username}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>PENDING</span>
                  <button onClick={() => unsend(r)} style={smallBtn('#f59e0b')} title="Take this request back">
                    <Undo2 size={12} /> UNSEND
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity feed */}
      {feed.length > 0 && (
        <div style={card}>
          <h2 style={h2}>RECENT ACTIVITY</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {feed.map(({ entry: e, friend: f }, i) => {
              const hobby = HOBBY_MAP[e.hobby_category]
              return (
                <button key={`${e.id}-${f.user_id}`} onClick={() => setSelected({ id: f.user_id, username: f.username, avatar_url: f.avatar_url, entryId: e.id })}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 0', borderBottom: i < feed.length - 1 ? '1px solid var(--border-dim)' : 'none', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <Avatar url={f.avatar_url} name={f.username} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>{f.username}</span> {activityVerb(e)}
                      <span style={{ color: 'var(--text-dim)' }}> · {timeAgo(e.updated_at)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      {e.cover_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={e.cover_url} alt="" style={{ width: 26, height: 38, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 26, height: 38, background: 'var(--bg-base)', flexShrink: 0 }} />}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{statusLabelFor(HOBBY_MAP[e.hobby_category as keyof typeof HOBBY_MAP], e.status)}</span>
                      {e.hobby_category === 'games' && e.status === 'in_progress' && (e.progress_current ?? 0) > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>· {e.progress_current}h</span>
                      )}
                      {e.status === 'completed' && e.rating != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: hobby.accent, flexShrink: 0 }}>★ {e.rating}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
