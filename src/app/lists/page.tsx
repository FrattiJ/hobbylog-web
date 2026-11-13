'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowUp, ArrowDown, Plus, X, Trash2, Pencil, Eye, EyeOff, Star } from 'lucide-react'
import type { Entry, HobbyCategory } from '@/types/database'
import { HOBBY_MAP, ENTRY_HOBBIES, STATUS_COLORS, statusLabelFor } from '@/lib/hobbies'
import { getAllEntries, ENTRIES_CHANGED_EVENT } from '@/lib/db'
import {
  getLists, createList, updateList, deleteList, addToList, removeFromList, setListOrder,
  entriesOf, listProgress, hobbyMix, LISTS_CHANGED_EVENT, LIST_NAME_MAX, LIST_DESCRIPTION_MAX, type HobbyList,
} from '@/lib/lists'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'

// Your own groupings, across hobbies: a film, a game and a book for one
// season; everything in a series; what you mean to get through on a trip.

const ACCENT = '#ed539f'

const h1: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0 }
const sub: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }
const inp: React.CSSProperties = {
  width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${ACCENT}66`,
  padding: '8px 12px', color: 'var(--text-hi)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none',
}
const lbl: React.CSSProperties = { display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', margin: '0 0 6px' }
const primary = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', whiteSpace: 'nowrap',
  background: `${ACCENT}22`, border: `1px solid ${ACCENT}88`, borderLeft: `3px solid ${ACCENT}`, color: ACCENT,
  fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
})
const plain: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 14px', whiteSpace: 'nowrap',
  background: 'var(--bg-card)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)',
  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const iconBtn = (disabled = false): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0,
  background: 'transparent', border: '1px solid var(--border-dim)', color: disabled ? 'var(--text-mute)' : 'var(--text-mid)',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
})

function SharedTag({ shared }: { shared: boolean }) {
  const color = shared ? '#22c55e' : 'var(--text-dim)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color }}>
      {shared ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
      {shared ? 'Shared with friends' : 'Only you'}
    </span>
  )
}

function Meter({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="meter" role="img" aria-label={label}><span style={{ width: `${pct}%` }} /></div>
  )
}

// ── The form for a new list ──────────────────────────────────────────────────

function NewListForm({ onCreated, onCancel }: { onCreated: (list: HobbyList) => void; onCancel?: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try { onCreated(await createList({ name, description, is_shared: shared })) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not create the list. Try again.') }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} aria-label="New list" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: 18, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
      <div>
        <label htmlFor="list-name" style={lbl}>Name</label>
        <input id="list-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIST_NAME_MAX} required autoComplete="off"
          placeholder="October, the Dune books, for the flight…" style={inp} />
      </div>
      <div>
        <label htmlFor="list-description" style={lbl}>What it is for (optional)</label>
        <input id="list-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIST_DESCRIPTION_MAX} autoComplete="off" style={inp} />
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: ACCENT }} />
        <span>
          Share this list with friends
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>
            Friends you have accepted can see it on your profile. Entries you marked private stay hidden from them.
          </span>
        </span>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy || !name.trim()} style={primary(!busy && !!name.trim())}>{busy ? 'Creating…' : 'Create List'}</button>
        {onCancel && <button type="button" onClick={onCancel} style={plain}>Cancel</button>}
      </div>
    </form>
  )
}

// ── The index: every list as a card ──────────────────────────────────────────

function ListIndex({ lists, byId }: { lists: HobbyList[]; byId: Map<string, Entry> }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={h1}>LISTS</h1>
          <p style={sub}>
            {lists.length === 0 ? 'Group entries from any hobby under a name of your own.' : `${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`}
          </p>
        </div>
        {lists.length > 0 && !creating && (
          <button onClick={() => setCreating(true)} style={primary(true)}><Plus size={16} aria-hidden="true" /> New List</button>
        )}
      </div>

      {(creating || lists.length === 0) && (
        <NewListForm
          onCreated={(l) => router.push(`/lists?id=${l.id}`)}
          onCancel={lists.length > 0 ? () => setCreating(false) : undefined} />
      )}

      {lists.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '62ch', margin: 0 }}>
          A backlog is one hobby in one order. A list is whatever you say belongs together: a film, a game and a book for the same
          month, a whole series, what to pack for a trip. One entry can be in as many lists as you like, and a list shows how far
          through it you are.
        </p>
      ) : (
        <div className="list-cards">
          {lists.map((l) => {
            const p = listProgress(l, byId)
            const covers = entriesOf(l, byId).slice(0, 5)
            return (
              <Link key={l.id} href={`/lists?id=${l.id}`} className="list-card">
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3, color: 'var(--text-hi)', margin: 0, overflowWrap: 'anywhere' }}>{l.name}</h2>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-mid)', margin: '4px 0 10px' }}>
                  {p.total === 0 ? 'Empty' : `${p.finished} of ${p.total} finished`}
                  {p.hobbies.length > 0 && <span style={{ color: 'var(--text-dim)' }}> · {hobbyMix(p.hobbies)}</span>}
                </p>
                <Meter pct={p.pct} label={`${p.pct}% finished`} />
                <div className="list-covers" aria-hidden="true">
                  {covers.map((e) => e.cover_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img key={e.id} src={e.cover_url} alt="" width={48} height={72} loading="lazy" decoding="async" />
                    : <span key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: HOBBY_MAP[e.hobby_category]?.accent }}>{e.title[0]}</span>)}
                </div>
                <p style={{ margin: '12px 0 0' }}><SharedTag shared={l.is_shared} /></p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── One list ─────────────────────────────────────────────────────────────────

function ListDetail({ list, entries, byId, onChanged }: { list: HobbyList; entries: Entry[]; byId: Map<string, Entry>; onChanged: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const [description, setDescription] = useState(list.description ?? '')
  const [adding, setAdding] = useState(list.items.length === 0)
  const [query, setQuery] = useState('')
  const [hobbyF, setHobbyF] = useState<HobbyCategory | 'all'>('all')
  // The order as shown. Kept locally so a row moves the moment it is pressed.
  const [order, setOrder] = useState<string[] | null>(null)

  const items = useMemo(() => {
    const present = list.items.filter((it) => byId.has(it.entry_id))
    if (!order) return present
    const rank = new Map(order.map((id, i) => [id, i]))
    return [...present].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
  }, [list.items, byId, order])
  const p = listProgress(list, byId)
  const inList = useMemo(() => new Set(list.items.map((it) => it.entry_id)), [list.items])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((e) => !inList.has(e.id))
      .filter((e) => hobbyF === 'all' || e.hobby_category === hobbyF)
      .filter((e) => !q || e.title.toLowerCase().includes(q))
      .slice(0, 24)
  }, [entries, inList, query, hobbyF])
  const hobbiesPresent = ENTRY_HOBBIES.filter((h) => entries.some((e) => e.hobby_category === h.id))

  async function run(action: () => Promise<void>, failed: string) {
    if (busy) return
    setBusy(true)
    try { await action(); onChanged() }
    // Our own messages (a name that is too long, the database not being ready)
    // are worth showing as written; anything else gets the plain one.
    catch (err) { toast.error(err instanceof Error && (err.name === 'Error' || err.name === 'NotReadyError') ? err.message : failed) }
    setBusy(false)
  }

  async function move(index: number, by: number) {
    const to = index + by
    if (to < 0 || to >= items.length || busy) return
    const ids = items.map((it) => it.id)
    const [id] = ids.splice(index, 1)
    ids.splice(to, 0, id)
    setOrder(ids)
    try { await setListOrder(list.id, ids); onChanged() }
    catch { setOrder(null); toast.error('Could not save the new order. Try again.') }
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    await run(async () => { await updateList(list.id, { name, description }); setEditing(false) }, 'Could not save the list. Try again.')
  }

  async function remove() {
    if (!(await confirm({
      title: `Delete “${list.name}”?`,
      body: 'Only the list goes. Everything in it stays in your library.',
      confirmLabel: 'Delete List',
      danger: true,
    }))) return
    setBusy(true)
    try { await deleteList(list.id); router.push('/lists') }
    catch { toast.error('Could not delete the list. Try again.'); setBusy(false) }
  }

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href="/lists" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to Lists
      </Link>

      {editing ? (
        <form onSubmit={saveDetails} aria-label="Edit list" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, maxWidth: 620 }}>
          <div>
            <label htmlFor="edit-name" style={lbl}>Name</label>
            <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIST_NAME_MAX} required autoComplete="off" style={inp} />
          </div>
          <div>
            <label htmlFor="edit-description" style={lbl}>What it is for (optional)</label>
            <input id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIST_DESCRIPTION_MAX} autoComplete="off" style={inp} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy || !name.trim()} style={primary(!busy && !!name.trim())}>Save</button>
            <button type="button" onClick={() => { setEditing(false); setName(list.name); setDescription(list.description ?? '') }} style={plain}>Cancel</button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--text-hi)', margin: 0, textTransform: 'none', overflowWrap: 'anywhere' }}>{list.name}</h1>
          {list.description && <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', margin: '8px 0 0', lineHeight: 1.55, maxWidth: '70ch' }}>{list.description}</p>}
        </div>
      )}

      {/* How far through, and who can see it */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: `3px solid ${ACCENT}`, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px 16px', flexWrap: 'wrap', marginBottom: 10 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--text-hi)', margin: 0 }}>
            {p.total === 0 ? 'Nothing in this list yet' : `${p.finished} of ${p.total} finished`}
            {p.inProgress > 0 && <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>, {p.inProgress} in progress</span>}
          </p>
          <SharedTag shared={list.is_shared} />
        </div>
        <Meter pct={p.pct} label={`${p.pct}% finished`} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        <button onClick={() => setAdding((v) => !v)} aria-expanded={adding} style={primary(true)}>
          {adding ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} {adding ? 'Done Adding' : 'Add Entries'}
        </button>
        <button disabled={busy} style={plain}
          onClick={() => run(() => updateList(list.id, { is_shared: !list.is_shared }), 'Could not change who can see the list. Try again.')}>
          {list.is_shared ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          {list.is_shared ? 'Stop Sharing' : 'Share with Friends'}
        </button>
        {!editing && <button onClick={() => setEditing(true)} style={plain}><Pencil size={14} aria-hidden="true" /> Rename</button>}
        <button onClick={remove} disabled={busy} style={{ ...plain, color: '#f87171' }}><Trash2 size={14} aria-hidden="true" /> Delete List</button>
      </div>

      {/* Picking from the library */}
      {adding && (
        <section aria-label="Add entries" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', padding: 16, marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              placeholder="Search your library…" aria-label="Search your library" style={{ ...inp, flex: '1 1 220px', width: 'auto' }} />
            <select value={hobbyF} onChange={(e) => setHobbyF(e.target.value as HobbyCategory | 'all')} aria-label="Filter by hobby"
              style={{ ...plain, padding: '0 10px', fontWeight: 500 }}>
              <option value="all">All hobbies</option>
              {hobbiesPresent.map((h) => <option key={h.id} value={h.id}>{h.pluralLabel}</option>)}
            </select>
          </div>
          {entries.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>Your library is empty. Add something first, then come back.</p>
          ) : candidates.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>
              {query.trim() || hobbyF !== 'all' ? 'Nothing in your library matches.' : 'Everything in your library is already in this list.'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 8 }}>
              {candidates.map((e) => {
                const hobby = HOBBY_MAP[e.hobby_category]
                return (
                  <li key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: hobby?.accent }}>{hobby?.label}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-dim)' }}> · {statusLabelFor(hobby, e.status)}</span>
                    </span>
                    <button disabled={busy} aria-label={`Add ${e.title} to the list`}
                      onClick={() => run(() => addToList(list.id, [e.id]), `Could not add ${e.title}. Try again.`)}
                      style={{ ...plain, minHeight: 34, padding: '0 12px', color: ACCENT, borderColor: `${ACCENT}88` }}>
                      <Plus size={14} aria-hidden="true" /> Add
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {candidates.length === 24 && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: '10px 0 0' }}>Showing the first 24. Search to narrow it down.</p>
          )}
        </section>
      )}

      {/* The list itself */}
      {items.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => {
            const e = byId.get(it.entry_id)!
            const hobby = HOBBY_MAP[e.hobby_category]
            const accent = hobby?.accent ?? ACCENT
            return (
              <li key={it.id} className="list-row" style={{ borderLeftColor: accent }}>
                <span style={{ width: 26, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-mid)' }}>
                  <span className="sr-only">Number </span>{i + 1}
                </span>
                <span aria-hidden="true" style={{ width: 40, height: 60, flexShrink: 0, background: 'var(--bg-base)', border: `1px solid ${accent}55`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {e.cover_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.cover_url} alt="" width={40} height={60} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: accent }}>{e.title[0]}</span>}
                </span>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/entry?id=${e.id}`} style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-hi)', textDecoration: 'none', overflowWrap: 'anywhere' }}>{e.title}</Link>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '2px 10px', flexWrap: 'wrap' }}>
                    <span style={{ color: accent }}>{hobby?.label}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: STATUS_COLORS[e.status] }}>
                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[e.status] }} />
                      {statusLabelFor(hobby, e.status)}
                    </span>
                    {e.rating != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f59e0b' }}>
                        <Star size={11} aria-hidden="true" style={{ fill: '#f59e0b' }} /><span><span className="sr-only">Rated </span>{e.rating}</span>
                      </span>
                    )}
                    {e.is_private && list.is_shared && <span>Private, so friends do not see it here</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${e.title} up`} title="Move up" style={iconBtn(i === 0)}><ArrowUp size={15} aria-hidden="true" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${e.title} down`} title="Move down" style={iconBtn(i === items.length - 1)}><ArrowDown size={15} aria-hidden="true" /></button>
                  <button disabled={busy} aria-label={`Remove ${e.title} from the list`} title="Remove from the list"
                    onClick={() => run(async () => { await removeFromList(list.id, e.id); setOrder(null) }, `Could not remove ${e.title}. Try again.`)}
                    style={{ ...iconBtn(), color: '#f87171' }}><X size={15} aria-hidden="true" /></button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ListsInner() {
  const id = useSearchParams().get('id')
  const [lists, setLists] = useState<HobbyList[] | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  // Set when the lists could not be read at all, with why.
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(() => {
    getLists().then((l) => { setLists(l); setProblem(null) })
      .catch((err) => { setLists([]); setProblem(err instanceof Error && err.name === 'NotReadyError' ? err.message : 'Your lists could not be loaded. Reload the page to try again.') })
    getAllEntries().then(setEntries).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(LISTS_CHANGED_EVENT, load)
    window.addEventListener(ENTRIES_CHANGED_EVENT, load)
    return () => {
      window.removeEventListener(LISTS_CHANGED_EVENT, load)
      window.removeEventListener(ENTRIES_CHANGED_EVENT, load)
    }
  }, [load])

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  // Fitness keeps routines and workouts, not entries, so it has nothing to list.
  const listable = useMemo(() => entries.filter((e) => e.hobby_category !== 'fitness'), [entries])

  if (lists === null) {
    return (
      <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }} aria-busy="true" aria-label="Loading">
        <div className="list-cards">
          {[...Array(3)].map((_, i) => <div key={i} className="mech-skeleton" style={{ height: 190, animationDelay: `${i * 80}ms` }} />)}
        </div>
      </div>
    )
  }

  if (problem) {
    return (
      <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={h1}>LISTS</h1>
        <p role="alert" style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-mid)', margin: '16px 0 0', padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: '3px solid #d97706', maxWidth: 620, lineHeight: 1.55 }}>
          {problem}
        </p>
      </div>
    )
  }

  if (id) {
    const list = lists.find((l) => l.id === id)
    if (!list) {
      return (
        <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={h1}>LISTS</h1>
          <p style={{ ...sub, fontSize: 15, margin: '12px 0 16px' }}>That list is not here. It may have been deleted.</p>
          <Link href="/lists" style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)' }}>See all your lists</Link>
        </div>
      )
    }
    // Keyed by list so its local state (the name being edited, the order) starts fresh.
    return <ListDetail key={list.id} list={list} entries={listable} byId={byId} onChanged={load} />
  }

  return <ListIndex lists={lists} byId={byId} />
}

export default function ListsPage() {
  return (
    <Suspense fallback={<div className="page" />}>
      <ListsInner />
    </Suspense>
  )
}
