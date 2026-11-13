import { supabase } from './supabaseClient'
import { currentUserId } from './currentUser'
import { isMissingTable, NotReadyError } from './planStore'
import type { Entry, HobbyCategory } from '@/types/database'
import { HOBBY_MAP } from './hobbies'

// Lists: your own groupings of entries, across hobbies. A backlog is one list
// per hobby in one order; a list is whatever you say belongs together (a film,
// a game and a book for October, everything by one author, what to take on a
// trip), and something can be in several of them.
//
// Two tables (migration 0014): web_lists, and web_list_items joining a list to
// entries. A list is private until it is shared, and a shared list is readable
// by accepted friends only. An entry marked private stays out of what friends
// see of a list, exactly as it stays out of your library for them.

export const LISTS_CHANGED_EVENT = 'lists-changed'

function notifyListsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LISTS_CHANGED_EVENT))
}

export interface ListItem {
  id: string
  list_id: string
  entry_id: string
  position: number
  created_at: string
}

export interface HobbyList {
  id: string
  user_id: string
  name: string
  description: string | null
  is_shared: boolean
  created_at: string
  updated_at: string
  /** In the list's own order. */
  items: ListItem[]
}

export const LIST_NAME_MAX = 80
export const LIST_DESCRIPTION_MAX = 500

type Err = { code?: string; message?: string } | null

function check(error: Err): void {
  if (!error) return
  if (isMissingTable(error)) throw new NotReadyError('Lists')
  throw error
}

async function withItems(rows: Array<Omit<HobbyList, 'items'>>): Promise<HobbyList[]> {
  if (rows.length === 0) return []
  const { data, error } = await supabase.from('web_list_items').select('id, list_id, entry_id, position, created_at')
    .in('list_id', rows.map((r) => r.id))
    .order('position', { ascending: true })
  check(error)
  const byList = new Map<string, ListItem[]>()
  for (const it of (data ?? []) as ListItem[]) {
    const list = byList.get(it.list_id)
    if (list) list.push(it); else byList.set(it.list_id, [it])
  }
  return rows.map((r) => ({ ...r, items: byList.get(r.id) ?? [] }))
}

/** Your lists, most recently changed first, each with its items in order. */
export async function getLists(): Promise<HobbyList[]> {
  // Scoped by user id: a friend's shared lists are readable too, and "my lists"
  // must not include them.
  const userId = await currentUserId()
  const { data, error } = await supabase.from('web_lists').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  check(error)
  return withItems((data ?? []) as Array<Omit<HobbyList, 'items'>>)
}

/** The lists a friend has shared. Row-level security decides what comes back. */
export async function getFriendLists(friendId: string): Promise<HobbyList[]> {
  const { data, error } = await supabase.from('web_lists').select('*').eq('user_id', friendId).eq('is_shared', true).order('updated_at', { ascending: false })
  check(error)
  return withItems((data ?? []) as Array<Omit<HobbyList, 'items'>>)
}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  if (!n) throw new Error('Give the list a name.')
  if (n.length > LIST_NAME_MAX) throw new Error(`Keep the name under ${LIST_NAME_MAX} characters.`)
  return n
}

function cleanDescription(text: string | null | undefined): string | null {
  const d = (text ?? '').trim()
  if (d.length > LIST_DESCRIPTION_MAX) throw new Error(`Keep the description under ${LIST_DESCRIPTION_MAX} characters.`)
  return d || null
}

export async function createList(input: { name: string; description?: string | null; is_shared?: boolean }): Promise<HobbyList> {
  const user_id = await currentUserId()
  const { data, error } = await supabase.from('web_lists').insert({
    user_id, name: cleanName(input.name), description: cleanDescription(input.description), is_shared: !!input.is_shared,
  }).select().single()
  check(error)
  notifyListsChanged()
  return { ...(data as Omit<HobbyList, 'items'>), items: [] }
}

export async function updateList(id: string, patch: { name?: string; description?: string | null; is_shared?: boolean }): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) row.name = cleanName(patch.name)
  if (patch.description !== undefined) row.description = cleanDescription(patch.description)
  if (patch.is_shared !== undefined) row.is_shared = patch.is_shared
  const { error } = await supabase.from('web_lists').update(row).eq('id', id)
  check(error)
  notifyListsChanged()
}

/** Delete a list. Its entries stay in the library; only the grouping goes. */
export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('web_lists').delete().eq('id', id)
  check(error)
  notifyListsChanged()
}

async function touch(listId: string): Promise<void> {
  await supabase.from('web_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId)
}

/** Add entries to the end of a list. Ones already in it are left where they are. */
export async function addToList(listId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return
  const user_id = await currentUserId()
  const { data: last, error: lastErr } = await supabase.from('web_list_items').select('position')
    .eq('list_id', listId).order('position', { ascending: false }).limit(1)
  check(lastErr)
  const start = ((last?.[0]?.position as number | undefined) ?? 0) + 1
  const { error } = await supabase.from('web_list_items').upsert(
    entryIds.map((entry_id, i) => ({ list_id: listId, user_id, entry_id, position: start + i })),
    { onConflict: 'list_id,entry_id', ignoreDuplicates: true },
  )
  check(error)
  await touch(listId)
  notifyListsChanged()
}

export async function removeFromList(listId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('web_list_items').delete().eq('list_id', listId).eq('entry_id', entryId)
  check(error)
  await touch(listId)
  notifyListsChanged()
}

/** Write a list's order: the item ids, first to last. */
export async function setListOrder(listId: string, itemIds: string[]): Promise<void> {
  const results = await Promise.all(itemIds.map((id, i) => supabase.from('web_list_items').update({ position: i + 1 }).eq('id', id)))
  for (const r of results) check(r.error)
  await touch(listId)
  notifyListsChanged()
}

// ── Reading a list against the library (pure) ────────────────────────────────

export interface ListProgress {
  /** Items whose entry is still in the library. */
  total: number
  finished: number
  inProgress: number
  /** 0–100. */
  pct: number
  /** The hobbies in the list, most entries first. */
  hobbies: HobbyCategory[]
}

/** A list's entries, in the list's order, skipping any that are no longer in the library. */
export function entriesOf(list: Pick<HobbyList, 'items'>, byId: Map<string, Entry>): Entry[] {
  return [...list.items]
    .sort((a, b) => a.position - b.position)
    .map((it) => byId.get(it.entry_id))
    .filter((e): e is Entry => !!e)
}

export function listProgress(list: Pick<HobbyList, 'items'>, byId: Map<string, Entry>): ListProgress {
  const entries = entriesOf(list, byId)
  const finished = entries.filter((e) => e.status === 'completed').length
  const counts = new Map<HobbyCategory, number>()
  for (const e of entries) counts.set(e.hobby_category, (counts.get(e.hobby_category) ?? 0) + 1)
  return {
    total: entries.length,
    finished,
    inProgress: entries.filter((e) => e.status === 'in_progress').length,
    pct: entries.length ? Math.round((finished / entries.length) * 100) : 0,
    hobbies: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h),
  }
}

/** The hobbies in a list as one line: "Movies, Video Games, Books". */
export function hobbyMix(hobbies: HobbyCategory[]): string {
  return hobbies.map((h) => HOBBY_MAP[h]?.pluralLabel ?? h).join(', ')
}
