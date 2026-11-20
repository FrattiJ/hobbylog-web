import { NextResponse } from 'next/server'
import { badRequest, hobbyName, isPercent, libraryQuery, ok, osContext, searchParamsObject } from '@/lib/os/server'

// GET /api/os/library?since=YYYY-MM-DD, read-only, for Personal OS.
// This user's entries updated on or after `since` (default: all). The OS's
// nightly cron turns them into 99 Meta/data/hobbylog.json in the vault.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LibraryRow {
  id: string
  title: string
  hobby_category: string
  book_subtype: string | null
  status: string
  rating: number | null
  notes: string | null
  progress_current: number | null
  progress_total: number | null
  date_completed: string | null
  updated_at: string
}

const COLUMNS =
  'id, title, hobby_category, book_subtype, status, rating, notes, progress_current, progress_total, date_completed, updated_at'

const PAGE = 1000

export async function GET(req: Request) {
  const ctx = osContext(req)
  if (ctx instanceof NextResponse) return ctx

  const parsed = libraryQuery.safeParse(searchParamsObject(req.url))
  if (!parsed.success) return badRequest()
  const { admin, userId } = ctx
  const since = parsed.data.since

  try {
    const rows: LibraryRow[] = []
    // Page through, since PostgREST caps a single response.
    for (let from = 0; ; from += PAGE) {
      let q = admin.from('web_entries').select(COLUMNS).eq('user_id', userId)
      if (since) q = q.gte('updated_at', `${since}T00:00:00Z`)
      const { data, error } = await q
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as LibraryRow[]
      rows.push(...page)
      if (page.length < PAGE) break
    }

    const entries = rows.map((e) => ({
      id: e.id,
      title: e.title,
      hobby: hobbyName(e.hobby_category, e.book_subtype),
      status: e.status,
      rating: e.rating,
      progressCurrent: e.progress_current,
      progressTotal: e.progress_total,
      percent: isPercent(e.hobby_category),
      notes: e.notes ?? '',
      completedAt: e.date_completed ? e.date_completed.slice(0, 10) : null,
      updatedAt: e.updated_at,
    }))

    return ok({ entries })
  } catch {
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }
}
