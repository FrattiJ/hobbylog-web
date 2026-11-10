import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/serverAuth'
import { catalogCacheHeaders, noCacheHeaders, UPSTREAM_CACHE } from '@/lib/catalogCache'

// Converts "I'm on Season S, Episode E" into a total-episodes-watched count by
// summing the episode counts of seasons 1..S-1 (from TMDB) plus E. Mirrors the
// desktop's calculateTVProgressFromSeason. Server-side so the TMDB key stays secret.
export const runtime = 'nodejs'

const TMDB = process.env.TMDB_API_KEY

// Bounds that no real show exceeds; without them one request could fan out into
// thousands of upstream season lookups.
const MAX_SEASON = 100
const MAX_EPISODE = 10_000

export async function GET(req: NextRequest) {
  const denied = await requireUser(req)
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const season = parseInt(req.nextUrl.searchParams.get('season') ?? '', 10)
  const episode = parseInt(req.nextUrl.searchParams.get('episode') ?? '', 10)
  if (!/^\d{1,10}$/.test(id) || !TMDB || !(season >= 1 && season <= MAX_SEASON) || !(episode >= 1 && episode <= MAX_EPISODE)) return NextResponse.json({ episodes: null }, { headers: noCacheHeaders })

  try {
    let total = 0
    for (let s = 1; s < season; s++) {
      const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${TMDB}`, UPSTREAM_CACHE)
      if (!r.ok) continue
      const d = await r.json()
      total += Array.isArray(d.episodes) ? d.episodes.length : 0
    }
    total += episode
    return NextResponse.json({ episodes: total }, { headers: catalogCacheHeaders })
  } catch {
    return NextResponse.json({ episodes: null }, { headers: noCacheHeaders })
  }
}
