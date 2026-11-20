import { NextResponse } from 'next/server'
import { badRequest, hobbyQuery, ok, osContext, searchParamsObject, weekdayOf } from '@/lib/os/server'
import { osGoals } from '@/lib/os/goals'

// GET /api/os/hobby?date=YYYY-MM-DD, read-only, for Personal OS.
// That weekday's active time windows, the next three things to work on, and goals.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface EntryRow {
  id: string
  title: string
  hobby_category: string
  book_subtype: string | null
  status: string
  progress_current: number | null
  progress_total: number | null
}

const ENTRY_COLUMNS = 'id, title, hobby_category, book_subtype, status, progress_current, progress_total'

function toNext(e: EntryRow) {
  return {
    id: e.id,
    title: e.title,
    // A manga reads better as "manga" than as "books".
    hobby: e.hobby_category === 'books' && e.book_subtype && e.book_subtype !== 'book' ? e.book_subtype : e.hobby_category,
    status: e.status,
    progressCurrent: e.progress_current,
    progressTotal: e.progress_total,
  }
}

export async function GET(req: Request) {
  const ctx = osContext(req)
  if (ctx instanceof NextResponse) return ctx

  const parsed = hobbyQuery.safeParse(searchParamsObject(req.url))
  if (!parsed.success) return badRequest()
  const { admin, userId } = ctx

  try {
    const [winRes, planRes, goals, progRes] = await Promise.all([
      admin.from('web_time_windows')
        .select('label, start_min, end_min, share')
        .eq('user_id', userId).eq('active', true).eq('day_of_week', weekdayOf(parsed.data.date))
        .order('start_min', { ascending: true }),
      admin.from('web_plans').select('entry_ids').eq('user_id', userId).maybeSingle(),
      osGoals(admin, userId),
      // Always the three most recently touched, whatever the saved plan says:
      // the OS shows these as a pick-list every day.
      admin.from('web_entries').select(ENTRY_COLUMNS)
        .eq('user_id', userId).eq('status', 'in_progress')
        .order('updated_at', { ascending: false }).limit(3),
    ])
    if (winRes.error) throw winRes.error
    if (progRes.error) throw progRes.error
    const inProgress = ((progRes.data ?? []) as EntryRow[]).map(toNext)

    const windows = ((winRes.data ?? []) as { label: string | null; start_min: number; end_min: number; share: number }[])
      .map((w) => ({ label: w.label, start: w.start_min, end: w.end_min, share: Number(w.share) }))

    // The saved plan's order, minus anything finished, dropped or deleted. A
    // missing web_plans table (migration not applied) counts as no plan.
    const planIds = (!planRes.error && (planRes.data as { entry_ids: string[] } | null)?.entry_ids) || []
    let next: ReturnType<typeof toNext>[] = []
    if (planIds.length > 0) {
      const { data, error } = await admin.from('web_entries').select(ENTRY_COLUMNS)
        .eq('user_id', userId).in('id', planIds)
      if (error) throw error
      const byId = new Map(((data ?? []) as EntryRow[]).map((e) => [e.id, e]))
      next = planIds
        .map((id) => byId.get(id))
        .filter((e): e is EntryRow => !!e && e.status !== 'completed' && e.status !== 'dropped')
        .slice(0, 3)
        .map(toNext)
    } else {
      next = inProgress
    }

    return ok({ windows, next, goals, inProgress })
  } catch {
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }
}
