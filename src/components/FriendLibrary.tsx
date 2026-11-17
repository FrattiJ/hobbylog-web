'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Star, Plus, Check } from 'lucide-react'
import { getFriendEntries, getAllEntries, addToMyBacklog } from '@/lib/db'
import { HOBBY_MAP, HOBBIES, STATUS_LABELS, STATUS_COLORS, statusLabelFor } from '@/lib/hobbies'
import type { Entry, HobbyCategory } from '@/types/database'
import FriendEntryDetail from './FriendEntryDetail'
import { useToast } from './Toast'
import { useProgressive } from '@/lib/useProgressive'
import ListFooter from './ListFooter'
import { getFriendLists, type HobbyList } from '@/lib/lists'

const GREEN = '#22c55e'

function norm(t: string): string { return t.toLowerCase().replace(/[™®©]/g, '').trim() }
function keyOf(e: Entry): string {
  return e.external_source && e.external_id ? `id:${e.external_source}:${e.external_id}` : `t:${e.hobby_category}:${norm(e.title)}`
}

type SortKey = 'recent' | 'rating' | 'title'

export default function FriendLibrary({ friendId, username, avatarUrl, onBack, initialEntryId }: { friendId: string; username: string; avatarUrl?: string | null; onBack: () => void; initialEntryId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [mine, setMine] = useState<Map<string, Entry>>(new Map())
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [hobbyF, setHobbyF] = useState<'all' | HobbyCategory>('all')
  const [statusF, setStatusF] = useState<'all' | string>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [commonOnly, setCommonOnly] = useState(false)
  // Lists this friend has chosen to share, and which one is open.
  const [lists, setLists] = useState<HobbyList[]>([])
  const [listF, setListF] = useState<string>('all')
  const [selected, setSelected] = useState<Entry | null>(null)
  const { error: toastError, success: toastSuccess } = useToast()

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getFriendEntries(friendId), getAllEntries()]).then(([theirs, mineArr]) => {
      if (!alive) return
      const m = new Map<string, Entry>()
      for (const e of mineArr) m.set(keyOf(e), e)
      setMine(m); setEntries(theirs); setLoading(false)
      // Deep-link from the activity feed: open this entry's detail straight away.
      if (initialEntryId) {
        const e0 = theirs.find((t) => t.id === initialEntryId)
        if (e0) setSelected(e0)
      }
    }).catch(() => { if (alive) setLoading(false) })
    // Optional: a friend with nothing shared, or a database without the lists
    // tables yet, both just mean there is no row of lists to show.
    getFriendLists(friendId).then((l) => { if (alive) setLists(l.filter((x) => x.items.length > 0)) }).catch(() => {})
    return () => { alive = false }
  }, [friendId, initialEntryId])

  const iHave = (e: Entry) => mine.has(keyOf(e)) || added.has(keyOf(e))
  const myRatingFor = (e: Entry) => { const m = mine.get(keyOf(e)); return m?.rating != null ? m.rating : null }

  async function add(e: Entry) {
    setAdded((prev) => new Set(prev).add(keyOf(e)))
    try {
      await addToMyBacklog(e)
      toastSuccess(`Added “${e.title}” to your backlog`)
    } catch {
      setAdded((prev) => { const n = new Set(prev); n.delete(keyOf(e)); return n }) // roll back the optimistic mark
      toastError(`Couldn’t add “${e.title}” — try again`)
    }
  }

  const completed = entries.filter((e) => e.status === 'completed').length
  const inProgress = entries.filter((e) => e.status === 'in_progress').length
  const backlog = entries.filter((e) => e.status === 'backlog').length
  const commonCount = entries.filter(iHave).length
  const hobbiesPresent = HOBBIES.filter((h) => entries.some((e) => e.hobby_category === h.id))

  // An open list narrows the library to its entries and puts them in its order.
  const openList = lists.find((l) => l.id === listF) ?? null
  const listOrder = openList ? new Map(openList.items.map((it) => [it.entry_id, it.position])) : null

  const filtered = entries.filter((e) => {
    if (listOrder && !listOrder.has(e.id)) return false
    if (hobbyF !== 'all' && e.hobby_category !== hobbyF) return false
    if (statusF !== 'all' && e.status !== statusF) return false
    if (commonOnly && !iHave(e)) return false
    return true
  })
  const display = [...filtered].sort((a, b) => {
    if (listOrder) return (listOrder.get(a.id) ?? 0) - (listOrder.get(b.id) ?? 0)
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1)
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0
  })
  const paged = useProgressive(display.length, [hobbyF, statusF, sort, String(commonOnly), listF].join('|'))

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    padding: '5px 12px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em',
    background: active ? `${color}22` : 'transparent', border: `1px solid ${active ? color : 'var(--border-dim)'}`,
    borderLeft: active ? `2px solid ${color}` : '1px solid var(--border-dim)', color: active ? color : 'var(--text-dim)', cursor: 'pointer',
  })
  const stat = (n: number, label: string, color: string) => (
    <div><span style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 900, color }}>{n}</span><span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.05em', marginLeft: 6 }}>{label}</span></div>
  )

  if (selected) {
    return (
      <FriendEntryDetail
        entry={selected}
        username={username}
        iHave={iHave(selected)}
        myRating={myRatingFor(selected)}
        onBack={() => setSelected(null)}
        onAdd={add}
      />
    )
  }

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer', padding: '0 0 16px' }}>
        <ArrowLeft size={14} /> Back to Friends
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `2px solid ${GREEN}66`, background: 'linear-gradient(135deg, #a577f2, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
            : <span style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700, color: '#fff' }}>{(username || 'O')[0].toUpperCase()}</span>}
        </div>
        <div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: GREEN, letterSpacing: '0.08em', margin: '0 0 2px' }}>Profile</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: 0 }}>{username.toUpperCase()}</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 20, padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${GREEN}` }}>
        {stat(entries.length, 'Tracked', 'var(--text-hi)')}
        {stat(completed, 'Completed', GREEN)}
        {stat(inProgress, 'In Progress', '#099bbe')}
        {stat(backlog, 'Backlog', 'var(--text-mid)')}
        {stat(commonCount, 'In Common', '#d97706')}
      </div>

      {/* Lists they have shared */}
      {lists.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', marginRight: 2 }}>Lists</span>
            {lists.map((l) => (
              <button key={l.id} onClick={() => setListF(listF === l.id ? 'all' : l.id)} aria-pressed={listF === l.id} style={chip(listF === l.id, '#ed539f')}>
                {l.name} ({l.items.filter((it) => entries.some((e) => e.id === it.entry_id)).length})
              </button>
            ))}
          </div>
          {openList?.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: '70ch' }}>{openList.description}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <button onClick={() => setHobbyF('all')} style={chip(hobbyF === 'all', GREEN)}>All</button>
        {hobbiesPresent.map((h) => <button key={h.id} onClick={() => setHobbyF(h.id)} style={chip(hobbyF === h.id, h.accent)}>{h.pluralLabel}</button>)}
        <span style={{ width: 1, height: 20, background: 'var(--border-dim)', margin: '0 2px' }} />
        {(['all', 'in_progress', 'completed', 'backlog', 'wishlist'] as const).map((s) => (
          <button key={s} onClick={() => setStatusF(s)} style={chip(statusF === s, s === 'all' ? GREEN : STATUS_COLORS[s])}>{s === 'all' ? 'Any' : STATUS_LABELS[s]}</button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border-dim)', margin: '0 2px' }} />
        <button onClick={() => setCommonOnly((v) => !v)} style={chip(commonOnly, '#d97706')}>In Common</button>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ marginLeft: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', padding: '6px 10px', cursor: 'pointer', outline: 'none' }}>
          <option value="recent">Sort: Recent</option>
          <option value="rating">Sort: Rating</option>
          <option value="title">Sort: Title</option>
        </select>
      </div>

      {loading && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Loading…</p>}
      {!loading && display.length === 0 && <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)' }}>Nothing matches those filters.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {display.slice(0, paged.shown).map((e) => {
          const hobby = HOBBY_MAP[e.hobby_category]
          const mineRating = myRatingFor(e)
          const have = iHave(e)
          return (
            <div key={e.id} onClick={() => setSelected(e)}
              role="button" tabIndex={0}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelected(e) } }}
              aria-label={`View ${e.title}`} title="View details"
              style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${hobby.accent}66`, cursor: 'pointer' }}>
              {e.cover_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={e.cover_url} alt="" style={{ width: 46, height: 66, objectFit: 'cover', flexShrink: 0 }} loading="lazy" decoding="async" />
                : <div style={{ width: 46, height: 66, background: 'var(--bg-base)', flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                  {have
                    ? <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#d97706', letterSpacing: '0.05em', border: '1px solid #d9770655', padding: '1px 5px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}><Check size={9} /> In Log</span>
                    : <button onClick={(ev) => { ev.stopPropagation(); add(e) }} title="Add to my backlog" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', color: hobby.accent, background: `${hobby.accent}18`, border: `1px solid ${hobby.accent}66`, padding: '2px 6px', cursor: 'pointer' }} aria-label="Add to my backlog"><Plus size={9} /> Add</button>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: STATUS_COLORS[e.status], letterSpacing: '0.02em' }}>{statusLabelFor(HOBBY_MAP[e.hobby_category], e.status)}</span>
                  {e.rating != null && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: hobby.accent, display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} fill={hobby.accent} /> {e.rating}</span>}
                  {mineRating != null && e.rating != null && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.02em', border: '1px solid var(--border-dim)', padding: '1px 5px' }}>You {mineRating} · Them {e.rating}</span>
                  )}
                </div>
                {e.status === 'completed' && e.notes && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    &ldquo;{e.notes}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <ListFooter sentinel={paged.sentinel} shown={paged.shown} total={display.length} done={paged.done} more={paged.more} />
    </div>
  )
}
