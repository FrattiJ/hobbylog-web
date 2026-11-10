import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig'

// Server-side gate for the catalog proxy routes. Without it, anyone who reads
// this repository (or the network tab) could call /api/search and friends
// directly and spend the app's TMDB / IGDB / Steam quotas. Requiring a signed-in
// Supabase session ties every upstream call to an account.
//
// Supabase verifies the token (signature, expiry, revocation). A verified token
// is remembered briefly per server instance so a burst of keystroke searches
// doesn't add a round trip to every one.

const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const VERIFIED_TTL_MS = 5 * 60 * 1000
const MAX_REMEMBERED = 500
const verified = new Map<string, number>() // token -> remember until (ms)

const unauthorized = () =>
  NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

/** Returns a 401 response when the request has no valid session, otherwise null. */
export async function requireUser(req: NextRequest): Promise<NextResponse | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return unauthorized()

  const now = Date.now()
  const until = verified.get(token)
  if (until && until > now) return null

  const { data, error } = await auth.auth.getUser(token)
  if (error || !data.user) {
    verified.delete(token)
    return unauthorized()
  }

  if (verified.size >= MAX_REMEMBERED) {
    for (const [t, exp] of verified) if (exp <= now) verified.delete(t)
    if (verified.size >= MAX_REMEMBERED) verified.clear()
  }
  verified.set(token, now + VERIFIED_TTL_MS)
  return null
}
