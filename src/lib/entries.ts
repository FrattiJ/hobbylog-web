import { supabase } from './supabaseClient'
import { searchCatalog, searchTypeFor, fetchCatalogDetails } from './search'

export interface WebEntry {
  id: string
  user_id: string
  hobby_category: string
  title: string
  status: string
  rating: number | null
  notes: string | null
  progress_current: number | null
  progress_total: number | null
  cover_url: string | null
  external_id: string | null
  external_source: string | null
  priority: number | null
  is_private?: boolean
  metadata: Record<string, unknown> | null
  book_subtype: string | null
  current_season: number | null
  current_episode: number | null
  date_started: string | null
  date_completed: string | null
  created_at: string
  updated_at: string
}

export async function listEntries(): Promise<WebEntry[]> {
  // Scope to the current user — friend-read RLS would otherwise return friends' rows too.
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('web_entries')
    .select('*')
    .eq('user_id', u.user?.id ?? '')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as WebEntry[]
}

export async function addEntry(userId: string, data: {
  title: string
  hobby_category: string
  status: string
  cover_url?: string | null
  external_id?: string | null
  external_source?: string | null
  progress_total?: number | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('web_entries').insert({
    user_id: userId,
    title: data.title,
    hobby_category: data.hobby_category,
    status: data.status,
    cover_url: data.cover_url ?? null,
    external_id: data.external_id ?? null,
    external_source: data.external_source ?? null,
    progress_total: data.progress_total ?? null,
    metadata: { added_via: 'web', ...(data.metadata ?? {}) },
  })
  if (error) throw error
}

export async function setEntryStatus(id: string, status: string): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  const today = new Date().toISOString().split('T')[0]
  if (status === 'completed') patch.date_completed = today
  if (status === 'in_progress') patch.date_started = today
  const { error } = await supabase.from('web_entries').update(patch).eq('id', id)
  if (error) throw error
}

// Generic field update from the entry detail editor. `touch: false` skips the
// updated_at bump — see the note on db.ts's updateEntry for why that matters.
export async function updateEntry(id: string, patch: Partial<WebEntry>, opts: { touch?: boolean } = {}): Promise<void> {
  const { error } = await supabase.from('web_entries')
    .update(opts.touch === false ? patch : { ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Re-fetch cover + metadata for an entry by looking its title up in the catalog.
// Fills a missing cover and refreshes metadata/total; returns the applied patch.
export async function refetchDetails(entry: WebEntry): Promise<Partial<WebEntry> | null> {
  // Books route by subtype so an audiobook upgrades via Audible (real runtime),
  // manga via Jikan/AniList — matching how the add form searches.
  const type = entry.hobby_category === 'books'
    ? (entry.book_subtype === 'manga' ? 'manga' : entry.book_subtype === 'audiobook' ? 'audiobook' : 'books')
    : searchTypeFor(entry.hobby_category)
  if (!type) return null
  const results = await searchCatalog(type, entry.title)
  const lower = entry.title.toLowerCase()
  const hit = results.find((r) => r.title.toLowerCase() === lower) ?? results[0]
  if (!hit) return null
  let total = hit.progress_total
  let meta = { ...hit.metadata }
  // Movies/TV: pull per-title details so runtime / episode count / per-episode
  // runtime are accurate (search results don't carry these).
  if (type === 'movie' || type === 'tv') {
    const d = await fetchCatalogDetails(type, hit.external_id)
    if (d.progress_total != null) total = d.progress_total
    meta = { ...meta, ...d.metadata }
  }
  const patch: Partial<WebEntry> = {
    cover_url: entry.cover_url || hit.cover_url,
    external_id: hit.external_id,
    external_source: hit.external_source,
    progress_total: total ?? entry.progress_total,
    metadata: { ...(entry.metadata ?? {}), ...meta },
  }
  await updateEntry(entry.id, patch)
  return patch
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('web_entries').delete().eq('id', id)
  if (error) throw error
}

// Backfill missing cover art (and metadata) for searchable entries by looking up
// the title through the server-side catalog. Fixes the lite import's missing covers.
export async function backfillCovers(onProgress?: (done: number, total: number) => void): Promise<number> {
  const entries = await listEntries()
  const targets = entries.filter((e) => !e.cover_url && searchTypeFor(e.hobby_category))
  onProgress?.(0, targets.length)
  let updated = 0
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i]
    try {
      const type = searchTypeFor(e.hobby_category)!
      const results = await searchCatalog(type, e.title)
      const lower = e.title.toLowerCase()
      const hit = results.find((r) => r.title.toLowerCase() === lower) ?? results[0]
      if (hit?.cover_url) {
        await supabase.from('web_entries').update({
          cover_url: hit.cover_url,
          external_id: hit.external_id,
          external_source: hit.external_source,
          metadata: { ...(e.metadata ?? {}), ...hit.metadata },
          updated_at: new Date().toISOString(),
        }).eq('id', e.id)
        updated++
      }
    } catch { /* skip this one */ }
    onProgress?.(i + 1, targets.length)
  }
  return updated
}

// ── Taste enrichment ──────────────────────────────────────────────────────────
// The suggestion engine runs on genres, and entries added before genres were
// captured (or imported from MAL / Letterboxd / Goodreads) don't have them. This
// is the same lookup as refetchDetails, but it only fills holes — anything the
// entry already knows, including values you've corrected by hand, is left alone.

function searchTypeForEntry(e: { hobby_category: string; book_subtype?: string | null }): string | null {
  if (e.hobby_category !== 'books') return searchTypeFor(e.hobby_category)
  return e.book_subtype === 'manga' ? 'manga' : e.book_subtype === 'audiobook' ? 'audiobook' : 'books'
}

// True when an entry is missing data the taste profile needs. Genres are the one
// that matters everywhere; TV additionally needs to know whether a show has ended.
export function needsTasteEnrichment(
  e: { hobby_category: string; book_subtype?: string | null; metadata?: Record<string, unknown> | null }
): boolean {
  if (!searchTypeForEntry(e)) return false // manual hobbies have nothing to look up
  const meta = e.metadata ?? {}
  if (!meta.genres) return true
  if (e.hobby_category === 'tv' && meta.show_status === undefined) return true
  return false
}

// Merge fresh catalog values in WITHOUT overwriting anything already set.
function fillMissing(existing: Record<string, unknown>, fresh: Record<string, unknown>): Record<string, unknown> {
  const out = { ...existing }
  for (const [k, v] of Object.entries(fresh)) {
    if (v === undefined || v === null || v === '') continue
    const cur = out[k]
    if (cur === undefined || cur === null || cur === '') out[k] = v
  }
  return out
}

export async function backfillTaste(onProgress?: (done: number, total: number) => void): Promise<number> {
  const entries = await listEntries()
  const targets = entries.filter(needsTasteEnrichment)
  onProgress?.(0, targets.length)
  let updated = 0
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i]
    try {
      const type = searchTypeForEntry(e)!
      const results = await searchCatalog(type, e.title)
      const lower = e.title.toLowerCase()
      const hit = results.find((r) => r.title.toLowerCase() === lower) ?? results[0]
      if (hit) {
        let meta = { ...hit.metadata }
        // Movies/TV keep genres and show status in the per-title details call.
        if (type === 'movie' || type === 'tv') {
          const d = await fetchCatalogDetails(type, hit.external_id)
          meta = { ...meta, ...d.metadata }
        }
        const merged = fillMissing(e.metadata ?? {}, meta)
        await updateEntry(e.id, {
          metadata: merged,
          // Link the entry to its catalog row if it never was (lite imports).
          external_id: e.external_id ?? hit.external_id,
          external_source: e.external_source ?? hit.external_source,
          cover_url: e.cover_url || hit.cover_url,
        }, { touch: false })
        updated++
      }
    } catch { /* skip this one — a single bad lookup shouldn't stop the sweep */ }
    onProgress?.(i + 1, targets.length)
  }
  return updated
}
