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

// Renumber a hobby's backlog to 1..N (closing gaps left when an item leaves the
// backlog or is deleted). Call after any status change / delete affecting backlog.
export async function normalizeBacklogPriorities(hobby: HobbyCategory): Promise<void> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_entries').select('id')
    .eq('user_id', userId).eq('hobby_category', hobby).eq('status', 'backlog')
    .order('priority', { ascending: true, nullsFirst: false })
  const ids = (data ?? []).map((r) => r.id as string)
  if (ids.length) await setEntryPriorities(ids)
}

// Place one backlog entry at a specific 1-based rank, shifting the rest around it.
export async function moveEntryToRank(hobby: HobbyCategory, entryId: string, rank: number): Promise<void> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_entries').select('id')
    .eq('user_id', userId).eq('hobby_category', hobby).eq('status', 'backlog')
    .order('priority', { ascending: true, nullsFirst: false })
  const ids = (data ?? []).map((r) => r.id as string).filter((id) => id !== entryId)
  const idx = Math.max(0, Math.min(ids.length, rank - 1))
  ids.splice(idx, 0, entryId)
  await setEntryPriorities(ids)
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
  const emailName = (u.user?.email ?? 'operator').split('@')[0].toUpperCase()
  let username = emailName
  let enabled: HobbyCategory[] | null = null
  let onboarded = false
  let steam_id: string | null = null
  let steam_persona: string | null = null
  let avatar_url: string | null = null
  if (userId) {
    const { data: row } = await supabase.from('web_profile').select('username, enabled_hobbies, onboarded, steam_id, steam_persona, avatar_url').eq('user_id', userId).maybeSingle()
    if (row) {
      username = (row.username as string) || emailName
      enabled = (row.enabled_hobbies as HobbyCategory[]) ?? null
      onboarded = (row.onboarded as boolean) ?? false
      steam_id = (row.steam_id as string) ?? null
      steam_persona = (row.steam_persona as string) ?? null
      avatar_url = (row.avatar_url as string) ?? null
    } else {
      // First read — create the profile. Existing users (with entries) skip onboarding.
      const { count } = await supabase.from('web_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      onboarded = (count ?? 0) > 0
      await supabase.from('web_profile').insert({ user_id: userId, username, onboarded })
    }
  }
  return { id: userId || '1', username, avatar_url, bio: null, enabled_hobbies: enabled, created_at: '', onboarded, steam_id, steam_persona }
}

export async function setAvatar(dataUrl: string | null): Promise<void> {
  const userId = await currentUserId()
  await supabase.from('web_profile').upsert({ user_id: userId, avatar_url: dataUrl })
  notifyProfileChanged()
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

export interface UserRef { user_id: string; username: string; avatar_url: string | null }
export interface FriendView { id: string; user_id: string; username: string; avatar_url: string | null }
interface FriendshipRow { id: string; requester: string; addressee: string; status: 'pending' | 'accepted' | 'declined' }

export async function searchUsers(q: string): Promise<UserRef[]> {
  const { data, error } = await supabase.rpc('search_users', { q: q.trim() })
  if (error) throw error
  return (data ?? []) as UserRef[]
}

async function usernamesFor(ids: string[]): Promise<Map<string, { username: string; avatar_url: string | null }>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.rpc('usernames_for', { ids })
  const m = new Map<string, { username: string; avatar_url: string | null }>()
  for (const r of (data ?? []) as UserRef[]) m.set(r.user_id, { username: r.username, avatar_url: r.avatar_url })
  return m
}

export async function getUsername(userId: string): Promise<string> {
  return (await usernamesFor([userId])).get(userId)?.username ?? 'operator'
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
    return { id: r.id, user_id: other, username: names.get(other)?.username ?? 'unknown', avatar_url: names.get(other)?.avatar_url ?? null }
  })
}

export async function listIncomingRequests(): Promise<FriendView[]> {
  const me = await currentUserId()
  const { data } = await supabase.from('friendships').select('*').eq('status', 'pending').eq('addressee', me)
  const rows = (data ?? []) as FriendshipRow[]
  const names = await usernamesFor(rows.map((r) => r.requester))
  return rows.map((r) => ({ id: r.id, user_id: r.requester, username: names.get(r.requester)?.username ?? 'unknown', avatar_url: names.get(r.requester)?.avatar_url ?? null }))
}

export async function listOutgoingRequests(): Promise<FriendView[]> {
  const me = await currentUserId()
  const { data } = await supabase.from('friendships').select('*').eq('status', 'pending').eq('requester', me)
  const rows = (data ?? []) as FriendshipRow[]
  const names = await usernamesFor(rows.map((r) => r.addressee))
  return rows.map((r) => ({ id: r.id, user_id: r.addressee, username: names.get(r.addressee)?.username ?? 'unknown', avatar_url: names.get(r.addressee)?.avatar_url ?? null }))
}

export async function respondToRequest(id: string, accept: boolean): Promise<void> {
  await supabase.from('friendships').update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() }).eq('id', id)
  notifyProfileChanged()
}

export async function removeFriend(id: string): Promise<void> {
  await supabase.from('friendships').delete().eq('id', id)
  notifyProfileChanged()
}

// Copy a friend's item into my own backlog — title/cover/refs only, never their
// rating, review, or progress.
export async function addToMyBacklog(e: Entry): Promise<void> {
  await insertEntry({
    hobby_category: e.hobby_category,
    title: e.title,
    status: 'backlog',
    rating: null,
    notes: null,
    progress_current: 0,
    progress_total: e.progress_total,
    cover_url: e.cover_url,
    external_id: e.external_id,
    external_source: e.external_source,
    metadata: { ...(e.metadata ?? {}), added_via: 'friend' },
    book_subtype: e.book_subtype,
    current_season: null,
    current_episode: null,
    priority: null,
    date_started: null,
    date_completed: null,
  })
}

// Recent activity across ALL friends — most-recently-updated entries, each tagged
// with which friend it belongs to. Powers the Friends feed.
export interface FeedItem { entry: Entry; friend: FriendView }
export async function getFriendsFeed(limit = 40): Promise<FeedItem[]> {
  const friends = await listFriends()
  if (friends.length === 0) return []
  const byId = new Map(friends.map((f) => [f.user_id, f]))
  const { data, error } = await supabase.from('web_entries').select('*')
    .in('user_id', friends.map((f) => f.user_id))
    .order('updated_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({ entry: parseEntry(r), friend: byId.get((r as Row).user_id as string)! })).filter((x) => x.friend)
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

// Averages across just your accepted friends (same shape as GlobalStats).
export async function getFriendsStats(): Promise<GlobalStats> {
  const { data, error } = await supabase.rpc('friends_stats')
  if (error) throw error
  return data as GlobalStats
}

// entry_id → total logged session minutes, for the current user.
export async function getLoggedMinutesByEntry(): Promise<Map<string, number>> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_sessions').select('entry_id, duration_minutes').eq('user_id', userId)
  const m = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ entry_id: string; duration_minutes: number | null }>) {
    if (r.duration_minutes) m.set(r.entry_id, (m.get(r.entry_id) ?? 0) + r.duration_minutes)
  }
  return m
}

// How the whole site rated one catalog item (matched by external source + id).
export interface CommunityRating { avg: number | null; count: number }
export async function getCommunityRating(source: string, extId: string): Promise<CommunityRating> {
  const { data, error } = await supabase.rpc('community_rating', { p_source: source, p_ext: extId })
  if (error) throw error
  return data as CommunityRating
}

// ── Feedback (bug reports / feature suggestions) ────────────────────────────────

export async function submitFeedback(kind: 'bug' | 'feature', message: string): Promise<void> {
  const user_id = await currentUserId()
  const page = typeof window !== 'undefined' ? window.location.pathname : null
  const { error } = await supabase.from('feedback').insert({ user_id, kind, message: message.trim(), page })
  if (error) throw error
}

const ADMIN_EMAIL = 'you@example.com'

export async function currentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

export interface FeedbackItem {
  id: string
  kind: 'bug' | 'feature'
  message: string
  page: string | null
  created_at: string
  username: string | null
  email: string | null
}

// Admin-only. The RPC re-checks the admin email server-side from the JWT, so a
// non-admin who calls this just gets a "not authorized" error, never data.
export async function getFeedbackInbox(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase.rpc('admin_feedback')
  if (error) throw error
  return (data ?? []) as FeedbackItem[]
}

export async function isAdminUser(): Promise<boolean> {
  return (await currentUserEmail()) === ADMIN_EMAIL
}

// Permanently delete the current user's account and all their data.
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
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
