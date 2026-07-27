import { supabase } from './supabaseClient'
import type { Entry, HobbyCategory, Profile, Session } from '@/types/database'

// Web data layer: mirrors the desktop app's src/lib/db.ts API surface, but backed by
// Supabase (web_entries) so the desktop UI components port over almost unchanged.

export const ENTRIES_CHANGED_EVENT = 'entries-changed'
export const PROFILE_CHANGED_EVENT = 'profile-changed'

function notifyEntriesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ENTRIES_CHANGED_EVENT))
}
function notifyProfileChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT))
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? ''
}

type Row = Record<string, unknown>
function parseEntry(r: Row): Entry {
  return {
    ...(r as unknown as Entry),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    progress_current: (r.progress_current as number) ?? 0,
  }
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function getAllEntries(): Promise<Entry[]> {
  // Scope to the current user: friends-read RLS means an unscoped query would
  // also return friends' entries. "My library" must always filter by user_id.
  const userId = await currentUserId()
  const { data, error } = await supabase.from('web_entries').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(parseEntry)
}

export async function getEntriesByHobby(hobby: HobbyCategory): Promise<Entry[]> {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('web_entries').select('*').eq('user_id', userId).eq('hobby_category', hobby).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(parseEntry)
}

export async function getEntryById(id: string): Promise<Entry | null> {
  const { data } = await supabase.from('web_entries').select('*').eq('id', id).maybeSingle()
  return data ? parseEntry(data) : null
}

const INSERT_FIELDS = [
  'hobby_category', 'title', 'status', 'rating', 'notes', 'progress_current', 'progress_total',
  'cover_url', 'external_id', 'external_source', 'metadata', 'book_subtype', 'current_season',
  'current_episode', 'priority', 'date_started', 'date_completed',
] as const

async function nextBacklogPriority(hobby: HobbyCategory): Promise<number> {
  const { data } = await supabase.from('web_entries').select('priority').eq('hobby_category', hobby).eq('status', 'backlog').order('priority', { ascending: false }).limit(1)
  return ((data?.[0]?.priority as number) ?? 0) + 1
}

export async function insertEntry(data: Omit<Entry, 'id' | 'created_at' | 'updated_at'>): Promise<Entry> {
  const user_id = await currentUserId()
  const row: Row = { user_id }
  for (const f of INSERT_FIELDS) row[f] = (data as Row)[f] ?? null
  if (data.status === 'backlog' && data.priority == null) row.priority = await nextBacklogPriority(data.hobby_category)
  if (row.metadata == null) row.metadata = {}
  const { data: inserted, error } = await supabase.from('web_entries').insert(row).select().single()
  if (error) throw error
  notifyEntriesChanged()
  return parseEntry(inserted)
}

export async function updateEntry(id: string, data: Partial<Entry> & { metadata_patch?: Record<string, unknown> }): Promise<Entry> {
  const patch: Row = {}
  const UPDATABLE = ['status', 'rating', 'notes', 'progress_current', 'progress_total', 'cover_url', 'book_subtype', 'current_season', 'current_episode', 'priority', 'date_started', 'date_completed', 'external_id', 'external_source']
  for (const k of UPDATABLE) if (k in data) patch[k] = (data as Row)[k]
  if (data.metadata_patch) {
    const existing = await getEntryById(id)
    patch.metadata = { ...(existing?.metadata ?? {}), ...data.metadata_patch }
  }
  patch.updated_at = new Date().toISOString()
  const { error } = await supabase.from('web_entries').update(patch).eq('id', id)
  if (error) throw error
  notifyEntriesChanged()
  return (await getEntryById(id))!
}

export async function deleteEntry(id: string): Promise<void> {
  await supabase.from('web_entries').delete().eq('id', id)
  notifyEntriesChanged()
}

export async function setEntryPriorities(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) => supabase.from('web_entries').update({ priority: i + 1 }).eq('id', id)))
  notifyEntriesChanged()
}

export async function bulkInsertEntries(list: Array<Omit<Entry, 'id' | 'created_at' | 'updated_at'>>, onProgress?: (n: number) => void): Promise<number> {
  let n = 0
  for (const d of list) { await insertEntry(d); onProgress?.(++n) }
  return n
}

export async function clearAllData(): Promise<void> {
  const user_id = await currentUserId()
  await supabase.from('web_entries').delete().eq('user_id', user_id)
  notifyEntriesChanged()
}

// ── Profile (cloud: tracked hobbies + onboarding state, synced across devices) ──

export type WebProfile = Profile & { onboarded: boolean; steam_id: string | null; steam_persona: string | null }

export async function getProfile(): Promise<WebProfile> {
  const { data: u } = await supabase.auth.getUser()
  const userId = u.user?.id ?? ''
  const username = (u.user?.email ?? 'operator').split('@')[0].toUpperCase()
  let enabled: HobbyCategory[] | null = null
  let onboarded = false
  let steam_id: string | null = null
  let steam_persona: string | null = null
  if (userId) {
    const { data: row } = await supabase.from('web_profile').select('enabled_hobbies, onboarded, steam_id, steam_persona').eq('user_id', userId).maybeSingle()
    if (row) {
      enabled = (row.enabled_hobbies as HobbyCategory[]) ?? null
      onboarded = (row.onboarded as boolean) ?? false
      steam_id = (row.steam_id as string) ?? null
      steam_persona = (row.steam_persona as string) ?? null
    } else {
      // First read — create the profile. Existing users (with entries) skip onboarding.
      const { count } = await supabase.from('web_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      onboarded = (count ?? 0) > 0
      await supabase.from('web_profile').insert({ user_id: userId, username, onboarded })
    }
  }
  return { id: userId || '1', username, avatar_url: null, bio: null, enabled_hobbies: enabled, created_at: '', onboarded, steam_id, steam_persona }
}

export async function linkSteam(steamId: string, persona: string | null): Promise<void> {
  const userId = await currentUserId()
  await supabase.from('web_profile').upsert({ user_id: userId, steam_id: steamId, steam_persona: persona })
  notifyProfileChanged()
}

export async function unlinkSteam(): Promise<void> {
  const userId = await currentUserId()
  await supabase.from('web_profile').update({ steam_id: null, steam_persona: null }).eq('user_id', userId)
  notifyProfileChanged()
}

export async function setEnabledHobbies(ids: HobbyCategory[]): Promise<void> {
  const userId = await currentUserId()
  await supabase.from('web_profile').upsert({ user_id: userId, enabled_hobbies: ids })
  notifyProfileChanged()
}

export async function completeOnboarding(ids: HobbyCategory[]): Promise<void> {
  const userId = await currentUserId()
  await supabase.from('web_profile').upsert({ user_id: userId, enabled_hobbies: ids, onboarded: true })
  notifyProfileChanged()
}

export async function updateProfile(): Promise<void> { notifyProfileChanged() }

export async function setUsername(username: string): Promise<void> {
  const userId = await currentUserId()
  const clean = username.trim()
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(clean)) throw new Error('Usernames are 3–20 characters: letters, numbers, or underscore.')
  const { error } = await supabase.from('web_profile').upsert({ user_id: userId, username: clean })
  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken.')
    throw error
  }
  notifyProfileChanged()
}

// ── Social: friends ────────────────────────────────────────────────────────────

export interface UserRef { user_id: string; username: string }
export interface FriendView { id: string; user_id: string; username: string }
interface FriendshipRow { id: string; requester: string; addressee: string; status: 'pending' | 'accepted' | 'declined' }

export async function searchUsers(q: string): Promise<UserRef[]> {
  const { data, error } = await supabase.rpc('search_users', { q: q.trim() })
  if (error) throw error
  return (data ?? []) as UserRef[]
}

async function usernamesFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.rpc('usernames_for', { ids })
  const m = new Map<string, string>()
  for (const r of (data ?? []) as UserRef[]) m.set(r.user_id, r.username)
  return m
}

export async function getUsername(userId: string): Promise<string> {
  return (await usernamesFor([userId])).get(userId) ?? 'operator'
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const requester = await currentUserId()
  const { error } = await supabase.from('friendships').insert({ requester, addressee: addresseeId })
  if (error) {
    if (error.code === '23505') throw new Error('You already have a request or friendship with this user.')
    throw error
  }
}

export async function listFriends(): Promise<FriendView[]> {
  const me = await currentUserId()
  const { data } = await supabase.from('friendships').select('*').eq('status', 'accepted')
  const rows = (data ?? []) as FriendshipRow[]
  const otherIds = rows.map((r) => (r.requester === me ? r.addressee : r.requester))
  const names = await usernamesFor(otherIds)
  return rows.map((r) => {
    const other = r.requester === me ? r.addressee : r.requester
    return { id: r.id, user_id: other, username: names.get(other) ?? 'unknown' }
  })
}

export async function listIncomingRequests(): Promise<FriendView[]> {
  const me = await currentUserId()
  const { data } = await supabase.from('friendships').select('*').eq('status', 'pending').eq('addressee', me)
  const rows = (data ?? []) as FriendshipRow[]
  const names = await usernamesFor(rows.map((r) => r.requester))
  return rows.map((r) => ({ id: r.id, user_id: r.requester, username: names.get(r.requester) ?? 'unknown' }))
}

export async function listOutgoingRequests(): Promise<FriendView[]> {
  const me = await currentUserId()
  const { data } = await supabase.from('friendships').select('*').eq('status', 'pending').eq('requester', me)
  const rows = (data ?? []) as FriendshipRow[]
  const names = await usernamesFor(rows.map((r) => r.addressee))
  return rows.map((r) => ({ id: r.id, user_id: r.addressee, username: names.get(r.addressee) ?? 'unknown' }))
}

export async function respondToRequest(id: string, accept: boolean): Promise<void> {
  await supabase.from('friendships').update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() }).eq('id', id)
  notifyProfileChanged()
}

export async function removeFriend(id: string): Promise<void> {
  await supabase.from('friendships').delete().eq('id', id)
  notifyProfileChanged()
}

// A friend's library — accepted-friend RLS on web_entries permits this read.
export async function getFriendEntries(friendId: string): Promise<Entry[]> {
  const { data, error } = await supabase.from('web_entries').select('*').eq('user_id', friendId).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(parseEntry)
}

// ── Global benchmark (aggregate across all users, anonymous) ────────────────────

export interface GlobalStats {
  avg_rating: number | null
  avg_completed: number | null
  avg_finished_hours: number | null
  user_count: number
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const { data, error } = await supabase.rpc('global_stats')
  if (error) throw error
  return data as GlobalStats
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function getSessionsByEntry(entryId: string): Promise<Session[]> {
  const { data } = await supabase.from('web_sessions').select('*').eq('entry_id', entryId).order('date', { ascending: false })
  return (data ?? []) as Session[]
}

export async function insertSession(data: Omit<Session, 'id' | 'created_at'>): Promise<Session> {
  const user_id = await currentUserId()
  const { data: row, error } = await supabase.from('web_sessions').insert({
    user_id, entry_id: data.entry_id, date: data.date,
    duration_minutes: data.duration_minutes ?? null, progress_logged: data.progress_logged ?? null,
    notes: data.notes ?? null,
  }).select().single()
  if (error) throw error
  notifyEntriesChanged()
  return row as Session
}

export async function deleteSession(id: string): Promise<void> {
  await supabase.from('web_sessions').delete().eq('id', id)
  notifyEntriesChanged()
}

// ── Photos ──────────────────────────────────────────────────────────────────

export interface Photo {
  id: string
  entry_id: string
  data_url: string
  caption: string | null
  photo_type: string
  created_at: string
}

export async function getPhotosByEntry(entryId: string): Promise<Photo[]> {
  const { data } = await supabase.from('web_photos').select('*').eq('entry_id', entryId).order('created_at', { ascending: true })
  return (data ?? []) as Photo[]
}

export async function insertPhoto(data: { entry_id: string; data_url: string; caption: string | null; photo_type: string }): Promise<Photo> {
  const user_id = await currentUserId()
  const { data: row, error } = await supabase.from('web_photos').insert({ user_id, ...data }).select().single()
  if (error) throw error
  return row as Photo
}

export async function deletePhoto(id: string): Promise<void> {
  await supabase.from('web_photos').delete().eq('id', id)
}

// ── App notes (per-user, cloud-synced) ─────────────────────────────────────────

export async function getNotes(): Promise<string> {
  const { data } = await supabase.from('web_notes').select('content').maybeSingle()
  return (data?.content as string) ?? ''
}

export async function saveNotes(content: string): Promise<void> {
  const user_id = await currentUserId()
  await supabase.from('web_notes').upsert({ user_id, content, updated_at: new Date().toISOString() })
}
