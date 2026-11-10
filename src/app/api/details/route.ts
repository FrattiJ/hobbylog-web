import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/serverAuth'
import { tvEpisodeRuntime } from '@/lib/tmdb'
import { catalogCacheHeaders, noCacheHeaders, UPSTREAM_CACHE } from '@/lib/catalogCache'

// Fetches per-title details for ONE picked result (too heavy to run for every
// search row): movie runtime, TV episode count + per-episode runtime. Server-side
// so the TMDB key stays secret. Mirrors the desktop's fetchTMDB*Details.
export const runtime = 'nodejs'

const TMDB = process.env.TMDB_API_KEY

type Raw = Record<string, unknown>

function genreNames(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined
  const names = (raw as Raw[]).map((g) => g.name as string).filter(Boolean)
  return names.length > 0 ? names.join(', ') : undefined
}

function watchProviders(data: Raw | undefined): string | undefined {
  const us = (data?.results as Record<string, Raw> | undefined)?.US
  const flatrate = us?.flatrate as Raw[] | undefined
  if (!Array.isArray(flatrate) || flatrate.length === 0) return undefined
  return flatrate.slice(0, 4).map((p) => p.provider_name as string).join(', ')
}

export async function GET(req: NextRequest) {
  const denied = await requireUser(req)
  if (denied) return denied
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const empty = { progress_total: null as number | null, metadata: {} as Record<string, unknown> }
  // TMDB ids are numeric; anything else would be spliced into the upstream URL.
  if (!/^\d{1,10}$/.test(id) || !TMDB || (type !== 'movie' && type !== 'tv')) return NextResponse.json(empty, { headers: noCacheHeaders })

  try {
    if (type === 'movie') {
      const r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB}&append_to_response=credits,watch/providers`, UPSTREAM_CACHE)
      if (!r.ok) return NextResponse.json(empty, { headers: noCacheHeaders })
      const d = await r.json()
      const crew = (d.credits?.crew as Raw[] | undefined) ?? []
      const director = crew.find((c) => c.job === 'Director')?.name as string | undefined
      const studios = Array.isArray(d.production_companies) ? (d.production_companies as Raw[]).slice(0, 2).map((c) => c.name as string).join(', ') : undefined
      return NextResponse.json({
        progress_total: (d.runtime as number) || null,
        metadata: {
          runtime: (d.runtime as number) || undefined,
          genres: genreNames(d.genres),
          release_year: d.release_date ? Number(String(d.release_date).slice(0, 4)) || undefined : undefined,
          director: director || undefined,
          studios: studios || undefined,
          streaming: watchProviders(d['watch/providers']),
          rating: (d.vote_average as number) || undefined,
        },
      }, { headers: catalogCacheHeaders })
    }
    // tv
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB}&append_to_response=watch/providers`, UPSTREAM_CACHE)
    if (!r.ok) return NextResponse.json(empty, { headers: noCacheHeaders })
    const d = await r.json()
    const episodeRuntime = await tvEpisodeRuntime(id, d)
    const creator = Array.isArray(d.created_by) && d.created_by.length > 0 ? ((d.created_by as Raw[])[0].name as string) : undefined
    const networks = Array.isArray(d.networks) ? (d.networks as Raw[]).slice(0, 2).map((n) => n.name as string).join(', ') : undefined
    return NextResponse.json({
      progress_total: (d.number_of_episodes as number) || null,
      metadata: {
        episode_runtime: episodeRuntime,
        seasons: (d.number_of_seasons as number) || undefined,
        genres: genreNames(d.genres),
        release_year: d.first_air_date ? Number(String(d.first_air_date).slice(0, 4)) || undefined : undefined,
        // "Is this thing finished?" — a still-running show is an open-ended
        // commitment, which the suggestion engine treats very differently.
        show_status: (d.status as string) || undefined,
        in_production: typeof d.in_production === 'boolean' ? (d.in_production as boolean) : undefined,
        creator: creator || undefined,
        networks: networks || undefined,
        streaming: watchProviders(d['watch/providers']),
        rating: (d.vote_average as number) || undefined,
      },
    }, { headers: catalogCacheHeaders })
  } catch {
    return NextResponse.json(empty, { headers: noCacheHeaders })
  }
}
