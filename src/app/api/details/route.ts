import { NextRequest, NextResponse } from 'next/server'

// Fetches per-title details for ONE picked result (too heavy to run for every
// search row): movie runtime, TV episode count + per-episode runtime. Server-side
// so the TMDB key stays secret. Mirrors the desktop's fetchTMDB*Details.
export const runtime = 'nodejs'

const TMDB = process.env.TMDB_API_KEY

type Raw = Record<string, unknown>

function watchProviders(data: Raw | undefined): string | undefined {
  const us = (data?.results as Record<string, Raw> | undefined)?.US
  const flatrate = us?.flatrate as Raw[] | undefined
  if (!Array.isArray(flatrate) || flatrate.length === 0) return undefined
  return flatrate.slice(0, 4).map((p) => p.provider_name as string).join(', ')
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const empty = { progress_total: null as number | null, metadata: {} as Record<string, unknown> }
  if (!id || !TMDB || (type !== 'movie' && type !== 'tv')) return NextResponse.json(empty)

  try {
    if (type === 'movie') {
      const r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB}&append_to_response=credits,watch/providers`)
      if (!r.ok) return NextResponse.json(empty)
      const d = await r.json()
      const crew = (d.credits?.crew as Raw[] | undefined) ?? []
      const director = crew.find((c) => c.job === 'Director')?.name as string | undefined
      const studios = Array.isArray(d.production_companies) ? (d.production_companies as Raw[]).slice(0, 2).map((c) => c.name as string).join(', ') : undefined
      return NextResponse.json({
        progress_total: (d.runtime as number) || null,
        metadata: {
          runtime: (d.runtime as number) || undefined,
          director: director || undefined,
          studios: studios || undefined,
          streaming: watchProviders(d['watch/providers']),
          rating: (d.vote_average as number) || undefined,
        },
      })
    }
    // tv
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB}&append_to_response=watch/providers`)
    if (!r.ok) return NextResponse.json(empty)
    const d = await r.json()
    // TMDB's episode_run_time is frequently empty — fall back to the runtime of the
    // most recent / next episode so per-show length is accurate, not a generic guess.
    const lastEp = d.last_episode_to_air as { runtime?: number } | undefined
    const nextEp = d.next_episode_to_air as { runtime?: number } | undefined
    const episodeRuntime = (Array.isArray(d.episode_run_time) && d.episode_run_time.length > 0 ? (d.episode_run_time[0] as number) : undefined)
      || (lastEp?.runtime as number | undefined) || (nextEp?.runtime as number | undefined) || undefined
    const creator = Array.isArray(d.created_by) && d.created_by.length > 0 ? ((d.created_by as Raw[])[0].name as string) : undefined
    const networks = Array.isArray(d.networks) ? (d.networks as Raw[]).slice(0, 2).map((n) => n.name as string).join(', ') : undefined
    return NextResponse.json({
      progress_total: (d.number_of_episodes as number) || null,
      metadata: {
        episode_runtime: episodeRuntime,
        seasons: (d.number_of_seasons as number) || undefined,
        creator: creator || undefined,
        networks: networks || undefined,
        streaming: watchProviders(d['watch/providers']),
        rating: (d.vote_average as number) || undefined,
      },
    })
  } catch {
    return NextResponse.json(empty)
  }
}
