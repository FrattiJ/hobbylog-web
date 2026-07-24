import { NextRequest, NextResponse } from 'next/server'

// Runs server-side on Vercel. API keys come from environment variables and never
// reach the browser — this is what lets friends use the app with zero setup.
export const runtime = 'nodejs'

const RAWG = process.env.RAWG_API_KEY
const TMDB = process.env.TMDB_API_KEY

export interface CatalogHit {
  external_id: string
  external_source: string
  title: string
  cover_url: string | null
  year: number | null
  progress_total: number | null
  metadata: Record<string, unknown>
}

type Raw = Record<string, unknown>

async function searchGames(q: string): Promise<CatalogHit[]> {
  if (!RAWG) throw new Error('RAWG_API_KEY not configured')
  const r = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(q)}&key=${RAWG}&page_size=12`)
  if (!r.ok) throw new Error(`RAWG ${r.status}`)
  const d = await r.json()
  return ((d.results as Raw[]) ?? []).map((g) => {
    const year = g.released ? new Date(String(g.released)).getFullYear() : null
    return {
      external_id: String(g.id),
      external_source: 'rawg',
      title: String(g.name),
      cover_url: (g.background_image as string) || null,
      year,
      progress_total: null,
      metadata: {
        genres: Array.isArray(g.genres) ? (g.genres as Raw[]).map((x) => x.name).join(', ') : undefined,
        platforms: Array.isArray(g.platforms) ? (g.platforms as Raw[]).map((p) => (p.platform as Raw)?.name).filter(Boolean).join(', ') : undefined,
        rating: (g.rating as number) || undefined,
        release_year: year ?? undefined,
      },
    }
  })
}

async function searchTMDB(q: string, type: 'movie' | 'tv'): Promise<CatalogHit[]> {
  if (!TMDB) throw new Error('TMDB_API_KEY not configured')
  const r = await fetch(`https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(q)}&api_key=${TMDB}`)
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  const d = await r.json()
  return ((d.results as Raw[]) ?? []).slice(0, 12).map((m) => {
    const date = (m.release_date ?? m.first_air_date) as string | undefined
    return {
      external_id: String(m.id),
      external_source: 'tmdb',
      title: String(m.title ?? m.name),
      cover_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      year: date ? new Date(date).getFullYear() : null,
      progress_total: null,
      metadata: { rating: (m.vote_average as number) || undefined },
    }
  })
}

async function searchBooks(q: string): Promise<CatalogHit[]> {
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median&limit=12`)
  if (!r.ok) throw new Error(`OpenLibrary ${r.status}`)
  const d = await r.json()
  return ((d.docs as Raw[]) ?? []).map((b) => ({
    external_id: String(b.key),
    external_source: 'openlibrary',
    title: String(b.title),
    cover_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null,
    year: (b.first_publish_year as number) || null,
    progress_total: (b.number_of_pages_median as number) || null,
    metadata: { author: Array.isArray(b.author_name) ? (b.author_name as string[])[0] : undefined },
  }))
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ results: [] })
  try {
    let results: CatalogHit[] = []
    if (type === 'games') results = await searchGames(q)
    else if (type === 'movie' || type === 'tv') results = await searchTMDB(q, type)
    else if (type === 'books') results = await searchBooks(q)
    return NextResponse.json({ results })
  } catch (e) {
    // Degrade gracefully so the UI never breaks (e.g. before keys are set)
    return NextResponse.json({ results: [], error: (e as Error).message })
  }
}
