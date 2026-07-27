import { supabase } from './supabaseClient'
import { searchCatalog, searchTypeFor } from './search'

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
  metadata: Record<string, unknown> | null
  date_started: string | null
  date_completed: string | null
  created_at: string
  updated_at: string
}

export async function listEntries(): Promise<WebEntry[]> {
  const { data, error } = await supabase
    .from('web_entries')
    .select('*')
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

// Generic field update from the entry detail editor
export async function updateEntry(id: string, patch: Partial<WebEntry>): Promise<void> {
  const { error } = await supabase.from('web_entries')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// Re-fetch cover + metadata for an entry by looking its title up in the catalog.
// Fills a missing cover and refreshes metadata/total; returns the applied patch.
export async function refetchDetails(entry: WebEntry): Promise<Partial<WebEntry> | null> {
  const type = searchTypeFor(entry.hobby_category)
  if (!type) return null
  const results = await searchCatalog(type, entry.title)
  const lower = entry.title.toLowerCase()
  const hit = results.find((r) => r.title.toLowerCase() === lower) ?? results[0]
  if (!hit) return null
  const patch: Partial<WebEntry> = {
    cover_url: entry.cover_url || hit.cover_url,
    external_id: hit.external_id,
    external_source: hit.external_source,
    progress_total: entry.progress_total ?? hit.progress_total,
    metadata: { ...(entry.metadata ?? {}), ...hit.metadata },
  }
  await updateEntry(entry.id, patch)
  return patch
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('web_entries').delete().eq('id', id)
  if (error) throw error
}

// One-time import of the desktop library snapshot (pushed by the desktop app).
// Non-destructive and re-runnable: only inserts titles not already present.
// Brings titles/status/rank now; covers, notes, ratings arrive in a later phase.
export async function importFromDesktop(userId: string): Promise<number> {
  const { data: lib, error } = await supabase.from('library').select('*')
  if (error) throw error
  if (!lib || lib.length === 0) return 0

  const { data: existing } = await supabase
    .from('web_entries').select('title, hobby_category').eq('user_id', userId)
  const have = new Set((existing ?? []).map((e) => `${e.hobby_category}::${String(e.title).toLowerCase()}`))

  const rows = lib
    .filter((l) => !have.has(`${l.hobby_category}::${String(l.title).toLowerCase()}`))
    .map((l) => ({
      user_id: userId,
      title: l.title,
      hobby_category: l.hobby_category,
      status: l.status,
      progress_current: l.progress_current,
      progress_total: l.progress_total,
      priority: l.priority,
      metadata: { imported_from: 'desktop' },
    }))

  if (rows.length === 0) return 0
  const { error: insErr } = await supabase.from('web_entries').insert(rows)
  if (insErr) throw insErr
  return rows.length
}

// Backfill missing cover art (and metadata) for searchable entries by looking up
// the title through the server-side catalog. Fixes the lite import's missing covers.
export async function backfillCovers(onProgress?: (done: number, total: number) => void): Promise<number> {
  const entries = await listEntries()
  const targets = entries.filter((e) => !e.cover_url && searchTypeFor(e.hobby_category))
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
