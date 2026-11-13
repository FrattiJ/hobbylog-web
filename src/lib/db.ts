import { supabase } from './supabaseClient'
import { currentUserId } from './currentUser'
import type { Entry, EntryStatus, HobbyCategory, Profile, Session } from '@/types/database'
import type { NewTimeWindow, TimeWindow } from './windows'

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

/**
 * `touch: false` leaves updated_at alone. Use it for writes that aren't you doing
 * something with the entry — filling in genres, backfilling a time-to-beat,
 * recording a Steam appid. updated_at is read as "when did I last touch this",
 * both by Recent Activity and by the suggestion engine's stalled detection, so a
 * housekeeping sweep that bumped every row would wipe out exactly that signal.
 */
export async function updateEntry(
  id: string,
  data: Partial<Entry> & { metadata_patch?: Record<string, unknown> },
  opts: { touch?: boolean } = {}
): Promise<Entry> {
  const patch: Row = {}
  const UPDATABLE = ['status', 'rating', 'notes', 'progress_current', 'progress_total', 'cover_url', 'book_subtype', 'current_season', 'current_episode', 'priority', 'date_started', 'date_completed', 'external_id', 'external_source']
  for (const k of UPDATABLE) if (k in data) patch[k] = (data as Row)[k]
  if (data.metadata_patch) {
    const existing = await getEntryById(id)
    patch.metadata = { ...(existing?.metadata ?? {}), ...data.metadata_patch }
  }
  if (opts.touch !== false) patch.updated_at = new Date().toISOString()
  const { error } = await supabase.from('web_entries').update(patch).eq('id', id)
  if (error) throw error
  notifyEntriesChanged()
  return (await getEntryById(id))!
}

export async function deleteEntry(id: string): Promise<void> {
  await supabase.from('web_entries').delete().eq('id', id)
  notifyEntriesChanged()
}

// Bulk clean-up helpers (RLS keeps these scoped to the caller's own rows).
export async function bulkDeleteEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('web_entries').delete().in('id', ids)
  if (error) throw error
  notifyEntriesChanged()
}

export async function bulkSetStatus(ids: string[], status: EntryStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('web_entries').update({ status, updated_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
  notifyEntriesChanged()
}

// Record when a batch of entries was finished. Filling in a date is record
// keeping, not activity, so updated_at is left alone: it feeds Recent Activity
// and the suggestion engine's idea of what you last touched.
export async function bulkSetCompletedDate(ids: string[], date: string): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('web_entries').update({ date_completed: date }).in('id', ids)
  if (error) throw error
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

export type WebProfile = Profile & { onboarded: boolean; steam_id: string | null; steam_persona: string | null; steam_sync_playtime: boolean; steam_auto_import: boolean }

export async function getProfile(): Promise<WebProfile> {
  // getSession() reads the stored JWT locally; getUser() would round-trip to the
  // auth server, and this runs on every page load and every profile change.
  const { data: s } = await supabase.auth.getSession()
  const user = s.session?.user
  const userId = user?.id ?? ''
  const emailName = (user?.email ?? 'operator').split('@')[0].toUpperCase()
  let username = emailName
  let enabled: HobbyCategory[] | null = null
  let onboarded = false
  let steam_id: string | null = null
  let steam_persona: string | null = null
  let avatar_url: string | null = null
  let steam_sync_playtime = true
  let steam_auto_import = false
  if (userId) {
    const { data: row } = await supabase.from('web_profile').select('username, enabled_hobbies, onboarded, steam_id, steam_persona, avatar_url, steam_sync_playtime, steam_auto_import').eq('user_id', userId).maybeSingle()
    if (row) {
      username = (row.username as string) || emailName
      enabled = (row.enabled_hobbies as HobbyCategory[]) ?? null
      onboarded = (row.onboarded as boolean) ?? false
      steam_id = (row.steam_id as string) ?? null
      steam_persona = (row.steam_persona as string) ?? null
      avatar_url = (row.avatar_url as string) ?? null
      steam_sync_playtime = (row.steam_sync_playtime as boolean) ?? true
      steam_auto_import = (row.steam_auto_import as boolean) ?? false
    } else {
      // First read — create the profile. Existing users (with entries) skip onboarding.
      const { count } = await supabase.from('web_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      onboarded = (count ?? 0) > 0
      await supabase.from('web_profile').insert({ user_id: userId, username, onboarded })
    }
  }
  return { id: userId || '1', username, avatar_url, bio: null, enabled_hobbies: enabled, created_at: '', onboarded, steam_id, steam_persona, steam_sync_playtime, steam_auto_import }
}

export async function setSteamPrefs(prefs: { sync_playtime?: boolean; auto_import?: boolean }): Promise<void> {
  const userId = await currentUserId()
  const patch: Record<string, boolean> = {}
  if (prefs.sync_playtime !== undefined) patch.steam_sync_playtime = prefs.sync_playtime
  if (prefs.auto_import !== undefined) patch.steam_auto_import = prefs.auto_import
  await supabase.from('web_profile').upsert({ user_id: userId, ...patch })
  notifyProfileChanged()
}


const AVATAR_BUCKET = 'avatars'

// Avatars go in a PUBLIC bucket, unlike photos: discover_users and search_users
// already hand your avatar to every signed-in user by design, so there is no
// privacy left for signing to protect -- only latency to lose. It also means
// avatar_url can hold the CDN URL itself, so every <img src={avatar_url}> in the
// app keeps working untouched, legacy data URLs included.
export async function setAvatar(image: Blob | null): Promise<string | null> {
  const userId = await currentUserId()
  const path = `${userId}/avatar.jpg`
  if (!image) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
    await supabase.from('web_profile').upsert({ user_id: userId, avatar_url: null })
    notifyProfileChanged()
    return null
  }
  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, image, { contentType: 'image/jpeg', upsert: true })
  if (upErr) throw upErr
  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  // One fixed path per user keeps the bucket from collecting every face someone
  // has ever had -- but it also means the CDN would happily go on serving the
  // old one. The version string is what makes a change visible.
  const url = `${pub.publicUrl}?v=${Date.now()}`
  await supabase.from('web_profile').upsert({ user_id: userId, avatar_url: url })
  notifyProfileChanged()
  return url
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

// Everyone else on the app, newest first. Search only ever answered a handle you
// already knew, so this is what the Friends page shows before you type anything.
export async function discoverUsers(limit = 24): Promise<UserRef[]> {
  const { data, error } = await supabase.rpc('discover_users', { limit_n: limit })
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

// Take back a request you sent. Deleting the row (rather than marking it
// declined) is what lets you send another one later -- the table's unique pair
// index would otherwise treat the withdrawn request as one still standing.
//
// The delete policy already allowed either side to remove a friendship row, so
// this needed no new grant; there was simply no way to ask for it.
export async function cancelFriendRequest(id: string): Promise<void> {
  const { data, error } = await supabase.from('friendships').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('That request is already gone — they may have just accepted it.')
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

// One pass over the session log, shaped for the suggestion engine: when each entry
// was last actually touched (so a stalled item can be told apart from a fresh one),
// and the raw dated minutes so pace per week can be worked out.
export interface SessionActivity {
  byEntry: Map<string, { lastDate: string; minutes: number; count: number }>
  log: Array<{ date: string; minutes: number }>
}

export async function getSessionActivity(): Promise<SessionActivity> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_sessions')
    .select('entry_id, date, duration_minutes').eq('user_id', userId)
  const byEntry = new Map<string, { lastDate: string; minutes: number; count: number }>()
  const log: Array<{ date: string; minutes: number }> = []
  for (const r of (data ?? []) as Array<{ entry_id: string; date: string; duration_minutes: number | null }>) {
    const minutes = r.duration_minutes ?? 0
    const prev = byEntry.get(r.entry_id)
    if (!prev) byEntry.set(r.entry_id, { lastDate: r.date, minutes, count: 1 })
    else byEntry.set(r.entry_id, {
      lastDate: r.date > prev.lastDate ? r.date : prev.lastDate,
      minutes: prev.minutes + minutes,
      count: prev.count + 1,
    })
    if (r.date) log.push({ date: r.date, minutes })
  }
  return { byEntry, log }
}

// The session log with the entry each sitting belongs to, for stats that need
// to say which hobby the time went to. A row with no date keeps an empty one:
// its minutes still count toward the entry, it just cannot be placed in time.
export interface SessionLogRow { entry_id: string; date: string; minutes: number }

export async function getSessionLog(): Promise<SessionLogRow[]> {
  const userId = await currentUserId()
  const { data } = await supabase.from('web_sessions').select('entry_id, date, duration_minutes').eq('user_id', userId)
  return ((data ?? []) as Array<{ entry_id: string; date: string | null; duration_minutes: number | null }>)
    .map((r) => ({ entry_id: r.entry_id, date: r.date ?? '', minutes: r.duration_minutes ?? 0 }))
}

// The two summaries other code wants from that log, derived locally so a page
// that needs all three makes one request rather than three.
export function activityFromLog(rows: SessionLogRow[]): SessionActivity {
  const byEntry = new Map<string, { lastDate: string; minutes: number; count: number }>()
  const log: Array<{ date: string; minutes: number }> = []
  for (const r of rows) {
    const prev = byEntry.get(r.entry_id)
    if (!prev) byEntry.set(r.entry_id, { lastDate: r.date, minutes: r.minutes, count: 1 })
    else byEntry.set(r.entry_id, { lastDate: r.date > prev.lastDate ? r.date : prev.lastDate, minutes: prev.minutes + r.minutes, count: prev.count + 1 })
    if (r.date) log.push({ date: r.date, minutes: r.minutes })
  }
  return { byEntry, log }
}

export function loggedMinutesFromLog(rows: SessionLogRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) if (r.minutes) m.set(r.entry_id, (m.get(r.entry_id) ?? 0) + r.minutes)
  return m
}

// What everyone else on the site is doing with one catalog item: how many track
// it, how many finished it, how many are on it now, and how they rated it. Other
// people's entries only, and never the ones they marked private.
export interface CommunityStats {
  tracking: number
  completed: number
  in_progress: number
  avg_rating: number | null
  rating_count: number
}

export async function getCommunityStats(source: string, extId: string): Promise<CommunityStats> {
  const { data, error } = await supabase.rpc('community_stats', { p_source: source, p_ext: extId })
  if (!error && data) return data as CommunityStats
  // The counts come from a newer database function. Where it has not been
  // applied yet, fall back to the rating-only one so the strip still shows
  // something true rather than nothing.
  const old = await getCommunityRating(source, extId)
  return { tracking: 0, completed: 0, in_progress: 0, avg_rating: old.avg, rating_count: old.count }
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

export async function currentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
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

// Admin-only. The RPC re-checks admin status server-side from the JWT, so a
// non-admin who calls this just gets a "not authorized" error, never data.
export async function getFeedbackInbox(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase.rpc('admin_feedback')
  if (error) throw error
  return (data ?? []) as FeedbackItem[]
}

// Whether to show the inbox card. Admins are listed by user id in the
// app_admins table (see migration 0011); this is only a UI hint, the RPC above
// is the real check.
export async function isAdminUser(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return data === true
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

const PHOTO_BUCKET = 'photos'

// An hour. A signed URL only has to outlive the gallery view that asked for it,
// and a short window is the point of signing rather than making the bucket
// public.
const PHOTO_URL_TTL = 60 * 60

export interface Photo {
  id: string
  entry_id: string
  /** Ready to put in an <img src>: a signed Storage URL for photos saved since
   *  they moved into the bucket, or the inline data URL for the handful saved
   *  before. Callers should not care which. */
  url: string
  storage_path: string | null
  caption: string | null
  photo_type: string
  created_at: string
}

type PhotoRow = Omit<Photo, 'url'> & { data_url: string | null }

// The photos bucket is private, so a storage_path is not yet something a browser
// can load. Sign the whole batch in one call: a gallery of twelve photos should
// cost one round trip, not twelve. A photo whose URL could not be produced is
// dropped rather than rendered as a broken tile.
async function withUrls(rows: PhotoRow[]): Promise<Photo[]> {
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p)
  const signed = new Map<string, string>()
  if (paths.length > 0) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }
  const out: Photo[] = []
  for (const r of rows) {
    const url = r.storage_path ? signed.get(r.storage_path) : r.data_url
    if (url) out.push({ ...r, url })
  }
  return out
}

export async function getPhotosByEntry(entryId: string): Promise<Photo[]> {
  const { data } = await supabase.from('web_photos').select('*').eq('entry_id', entryId).order('created_at', { ascending: true })
  return withUrls((data ?? []) as PhotoRow[])
}

export async function insertPhoto(input: { entry_id: string; image: Blob; caption: string | null; photo_type: string }): Promise<Photo> {
  const user_id = await currentUserId()
  // The shape of this path is load-bearing, not cosmetic: both storage policies
  // read the owner out of the first segment and the entry out of the second.
  const path = `${user_id}/${input.entry_id}/${crypto.randomUUID()}.jpg`
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, input.image, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw upErr
  const { data: row, error } = await supabase.from('web_photos').insert({
    user_id,
    entry_id: input.entry_id,
    storage_path: path,
    caption: input.caption,
    photo_type: input.photo_type,
  }).select().single()
  if (error) {
    // Otherwise the object sits in the bucket forever, billed, with no row
    // pointing at it and nothing left that knows it exists.
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
    throw error
  }
  const [photo] = await withUrls([row as PhotoRow])
  return photo
}

export async function deletePhoto(id: string): Promise<void> {
  const { data } = await supabase.from('web_photos').select('storage_path').eq('id', id).single()
  const path = (data as { storage_path: string | null } | null)?.storage_path
  await supabase.from('web_photos').delete().eq('id', id)
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path])
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

// ── Hobby time windows (the recurring blocks you have free) ────────────────────

export const WINDOWS_CHANGED_EVENT = 'time-windows-changed'

function notifyWindowsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WINDOWS_CHANGED_EVENT))
}

export async function getTimeWindows(): Promise<TimeWindow[]> {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('web_time_windows').select('*')
    .eq('user_id', userId)
    .order('day_of_week', { ascending: true })
    .order('start_min', { ascending: true })
  if (error) throw error
  // share arrives from numeric(3,2) as a string on some driver versions.
  return (data ?? []).map((r) => ({ ...(r as unknown as TimeWindow), share: Number((r as Row).share) }))
}

export async function insertTimeWindow(w: NewTimeWindow): Promise<TimeWindow> {
  const user_id = await currentUserId()
  const { data, error } = await supabase.from('web_time_windows').insert({
    user_id,
    label: w.label?.trim() || null,
    day_of_week: w.day_of_week,
    start_min: w.start_min,
    end_min: w.end_min,
    share: w.share,
    active: w.active,
  }).select().single()
  if (error) throw error
  notifyWindowsChanged()
  return { ...(data as unknown as TimeWindow), share: Number((data as Row).share) }
}

export async function updateTimeWindow(id: string, patch: Partial<NewTimeWindow>): Promise<void> {
  const row: Row = {}
  for (const k of ['label', 'day_of_week', 'start_min', 'end_min', 'share', 'active'] as const) {
    if (k in patch) row[k] = k === 'label' ? ((patch.label ?? '').trim() || null) : (patch as Row)[k]
  }
  if (Object.keys(row).length === 0) return
  const { error } = await supabase.from('web_time_windows').update(row).eq('id', id)
  if (error) throw error
  notifyWindowsChanged()
}

export async function deleteTimeWindow(id: string): Promise<void> {
  const { error } = await supabase.from('web_time_windows').delete().eq('id', id)
  if (error) throw error
  notifyWindowsChanged()
}
