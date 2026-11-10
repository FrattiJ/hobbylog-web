import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tvEpisodeRuntime } from '@/lib/tmdb'

// Daily job (see vercel.json): refresh every TMDB-linked TV show's episode count
// and per-episode runtime, and flip a completed show back to In Progress when it
// has gained episodes/seasons (keeping the user's watched count). Uses the service
// role to reach all users' rows, so it needs SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const TMDB = process.env.TMDB_API_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = 'https://zicyhxiquhxprhfgekdp.supabase.co'

interface TvRow { id: string; external_id: string | null; status: string; progress_total: number | null; metadata: Record<string, unknown> | null }

export async function GET(req: NextRequest) {
  // Fail closed: without a configured secret nobody may trigger the job.
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!TMDB || !SERVICE) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })

  const { data: rows, error } = await admin.from('web_entries')
    .select('id, external_id, status, progress_total, metadata')
    .eq('hobby_category', 'tv').eq('external_source', 'tmdb')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let checked = 0, updated = 0, reopened = 0

  async function processOne(e: TvRow) {
    checked++
    if (!e.external_id) return
    try {
      const r = await fetch(`https://api.themoviedb.org/3/tv/${e.external_id}?api_key=${TMDB}`)
      if (!r.ok) return
      const d = await r.json()
      const eps = d.number_of_episodes as number | undefined
      const runtime = await tvEpisodeRuntime(e.external_id, d)
      const meta = e.metadata ?? {}
      const patch: Record<string, unknown> = {}
      if (runtime && meta.episode_runtime !== runtime) patch.metadata = { ...meta, episode_runtime: runtime }
      if (eps && eps !== e.progress_total) patch.progress_total = eps
      // Completed show that grew → reopen to In Progress, keep watched count.
      if (e.status === 'completed' && eps && e.progress_total && eps > e.progress_total) { patch.status = 'in_progress'; reopened++ }
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString()
        await admin.from('web_entries').update(patch).eq('id', e.id)
        updated++
      }
    } catch { /* skip this show */ }
  }

  const list = (rows ?? []) as TvRow[]
  const BATCH = 4 // each show may fan out to several season requests
  for (let i = 0; i < list.length; i += BATCH) {
    await Promise.all(list.slice(i, i + BATCH).map(processOne))
  }

  return NextResponse.json({ checked, updated, reopened })
}
