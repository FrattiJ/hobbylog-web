import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { SUPABASE_URL } from '@/lib/supabaseConfig'
import { BOOK_SUBTYPE_MAP, HOBBY_MAP } from '@/lib/hobbies'
import type { BookSubtype, HobbyCategory } from '@/types/database'

// Shared plumbing for the two read-only endpoints Personal OS calls
// (/api/os/workouts, /api/os/hobby and /api/os/library). Only the OS server calls them, so there
// are no CORS headers. Every query is pinned to OS_USER_ID; the service role is
// what lets a request with no browser session read anything at all.

// Hashing both sides first gives timingSafeEqual two buffers of equal length,
// so neither the comparison nor an early length check leaks the token's size.
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header || !header.startsWith('Bearer ')) return false
  const given = createHash('sha256').update(header.slice(7)).digest()
  const want = createHash('sha256').update(secret).digest()
  return timingSafeEqual(given, want)
}

export function unauthorized(): NextResponse {
  return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })
}

export function badRequest(): NextResponse {
  return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
}

export function ok(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

export type OsContext = { admin: SupabaseClient; userId: string }

// Returns the client and user to query, or the response to send instead.
// Anything missing on the server side is a 401 too: fail closed, say nothing.
export function osContext(req: Request): OsContext | NextResponse {
  const token = process.env.HOBBYLOG_OS_TOKEN
  const userId = process.env.OS_USER_ID
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!bearerMatches(req.headers.get('authorization'), token)) return unauthorized()
  if (!userId || !service) return unauthorized()
  const admin = createClient(SUPABASE_URL, service, { auth: { persistSession: false } })
  return { admin, userId }
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s))

export const MAX_RANGE_DAYS = 200

export const workoutsQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine(({ from, to }) => from <= to)
  .refine(({ from, to }) => daysBetween(from, to) + 1 <= MAX_RANGE_DAYS)

export const hobbyQuery = z.object({ date: isoDate })

export const libraryQuery = z.object({ since: isoDate.optional() })

// The hobby as hobbylog's own UI words it, lower case: 'project' for the
// category stored as 'gundams', 'tv show' for 'tv', and the subtype for a
// book that is not a plain book ('manga'). Shared by the hobby and library
// endpoints so both name a hobby the same way.
export function hobbyName(category: string, subtype: string | null): string {
  if (category === 'books' && subtype && subtype !== 'book') {
    return (BOOK_SUBTYPE_MAP[subtype as BookSubtype]?.label ?? subtype).toLowerCase()
  }
  return (HOBBY_MAP[category as HobbyCategory]?.label ?? category).toLowerCase()
}

// True when progress is a 0 to 100 completion (projects, art), so the OS
// shows "40%" rather than "40 of 100".
export function isPercent(category: string): boolean {
  return HOBBY_MAP[category as HobbyCategory]?.percentBased === true
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

// 0 = Sunday, the same convention web_time_windows.day_of_week uses. The date is
// a calendar date with no time zone, so reading it as UTC noon is exact.
export function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay()
}

export function searchParamsObject(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries())
}
