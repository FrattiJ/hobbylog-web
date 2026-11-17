'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { addToList, createList, getLists, removeFromList, LISTS_CHANGED_EVENT, LIST_NAME_MAX, type HobbyList } from '@/lib/lists'
import { useToast } from './Toast'

// Which lists an entry is in, on the entry's own page, and the way to put it
// in another without leaving. Renders nothing at all if lists cannot be read
// (the tables not being there yet, say): an entry page should never be the
// place that breaks.

const LIST_ACCENT = '#ed539f'
const NEW = '__new__'

export default function EntryLists({ entryId, accent }: { entryId: string; accent: string }) {
  const toast = useToast()
  const [lists, setLists] = useState<HobbyList[] | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { getLists().then(setLists).catch(() => setLists(null)) }, [])
  useEffect(() => {
    load()
    window.addEventListener(LISTS_CHANGED_EVENT, load)
    return () => window.removeEventListener(LISTS_CHANGED_EVENT, load)
  }, [load])

  if (lists === null) return null

  const mine = lists.filter((l) => l.items.some((it) => it.entry_id === entryId))
  const others = lists.filter((l) => !mine.includes(l))

  async function add(listId: string) {
    if (busy) return
    setBusy(true)
    try { await addToList(listId, [entryId]) }
    catch { toast.error('Could not add it to that list. Try again.') }
    setBusy(false)
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const list = await createList({ name })
      await addToList(list.id, [entryId])
      setName(''); setNaming(false)
      toast.success(`Added to your new list, ${list.name}`)
    } catch (err) {
      toast.error(err instanceof Error && err.name === 'Error' ? err.message : 'Could not create the list. Try again.')
    }
    setBusy(false)
  }

  async function remove(list: HobbyList) {
    if (busy) return
    setBusy(true)
    try { await removeFromList(list.id, entryId) }
    catch { toast.error(`Could not take it out of ${list.name}. Try again.`) }
    setBusy(false)
  }

  const control: React.CSSProperties = {
    height: 32, padding: '0 10px', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500,
    background: 'var(--bg-card)', border: '1px solid var(--border-dim)', color: 'var(--text-mid)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--text-dim)', marginRight: 2 }}>
        {mine.length === 0 ? 'Not in a list' : 'In'}
      </span>
      {mine.map((l) => (
        <span key={l.id} style={{ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${LIST_ACCENT}66`, background: `${LIST_ACCENT}14` }}>
          <Link href={`/lists?id=${l.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 30, padding: '0 9px', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-hi)', textDecoration: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.name}
          </Link>
          <button type="button" onClick={() => remove(l)} disabled={busy} aria-label={`Take it out of ${l.name}`} title={`Take it out of ${l.name}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, background: 'none', border: 'none', borderLeft: `1px solid ${LIST_ACCENT}44`, color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}

      {naming ? (
        <form onSubmit={createAndAdd} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={LIST_NAME_MAX} autoComplete="off"
            placeholder="Name the new list" aria-label="Name the new list"
            style={{ ...control, width: 190, color: 'var(--text-hi)', borderLeft: `2px solid ${LIST_ACCENT}66`, outline: 'none' }} />
          <button type="submit" disabled={busy || !name.trim()} style={{ ...control, fontWeight: 600, color: accent, borderColor: `${accent}88`, cursor: 'pointer' }}>Create</button>
          <button type="button" onClick={() => { setNaming(false); setName('') }} style={{ ...control, cursor: 'pointer' }}>Cancel</button>
        </form>
      ) : (
        // Always back on its first option: this is a menu of actions, not a setting.
        <select value="" disabled={busy} aria-label="Add to a list"
          onChange={(e) => { const v = e.target.value; if (v === NEW) setNaming(true); else if (v) add(v) }}
          style={{ ...control, cursor: 'pointer', maxWidth: 200 }}>
          <option value="">Add to a list…</option>
          {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value={NEW}>New list…</option>
        </select>
      )}
    </div>
  )
}
