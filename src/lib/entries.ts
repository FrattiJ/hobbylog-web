import { supabase } from './supabaseClient'

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
  priority: number | null
  metadata: Record<string, unknown> | null
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
}): Promise<void> {
  const { error } = await supabase.from('web_entries').insert({
    user_id: userId,
    title: data.title,
    hobby_category: data.hobby_category,
    status: data.status,
    metadata: { added_via: 'web' },
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
