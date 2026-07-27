import { NextRequest, NextResponse } from 'next/server'

// Converts "I'm on Season S, Episode E" into a total-episodes-watched count by
// summing the episode counts of seasons 1..S-1 (from TMDB) plus E. Mirrors the
// desktop's calculateTVProgressFromSeason. Server-side so the TMDB key stays secret.
export const runtime = 'nodejs'

const TMDB = process.env.TMDB_API_KEY

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const season = parseInt(req.nextUrl.searchParams.get('season') ?? '', 10)
  const episode = parseInt(req.nextUrl.searchParams.get('episode') ?? '', 10)
  if (!id || !TMDB || !season || !episode) return NextResponse.json({ episodes: null })

  try {
    let total = 0
    for (let s = 1; s < season; s++) {
      const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${TMDB}`)
      if (!r.ok) continue
      const d = await r.json()
      total += Array.isArray(d.episodes) ? d.episodes.length : 0
    }
    total += episode
    return NextResponse.json({ episodes: total })
  } catch {
    return NextResponse.json({ episodes: null })
  }
}
