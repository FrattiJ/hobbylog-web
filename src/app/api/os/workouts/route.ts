import { NextResponse } from 'next/server'
import { badRequest, ok, osContext, searchParamsObject, workoutsQuery } from '@/lib/os/server'

// GET /api/os/workouts?from=YYYY-MM-DD&to=YYYY-MM-DD, read-only, for Personal OS.
// Bearer HOBBYLOG_OS_TOKEN; the range is inclusive and at most 200 days.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ctx = osContext(req)
  if (ctx instanceof NextResponse) return ctx

  const parsed = workoutsQuery.safeParse(searchParamsObject(req.url))
  if (!parsed.success) return badRequest()
  const { from, to } = parsed.data

  const { data, error } = await ctx.admin
    .from('web_workouts')
    .select('date, routine_name, duration_minutes')
    .eq('user_id', ctx.userId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })

  const workouts = ((data ?? []) as { date: string; routine_name: string | null; duration_minutes: number | null }[])
    .map((r) => ({ date: r.date, routineName: r.routine_name, durationMinutes: r.duration_minutes }))
  return ok({ workouts })
}
