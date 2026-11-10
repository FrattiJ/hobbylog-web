import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/serverAuth'
import { tmdbGenreMap } from '@/lib/tmdb'
import { igdbHeaders } from '@/lib/igdb'
import { catalogCacheHeaders, noCacheHeaders, UPSTREAM_CACHE } from '@/lib/catalogCache'

// Runs server-side on Vercel. API keys come from environment variables and never
// reach the browser — this is what lets friends use the app with zero setup.
export const runtime = 'nodejs'

const RAWG = process.env.RAWG_API_KEY
const TMDB = process.env.TMDB_API_KEY
const TWITCH_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_SECRET = process.env.TWITCH_CLIENT_SECRET

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

// IGDB (Twitch OAuth) is the primary game source: real completion-time tiers
// (Hastily / Normally / Completely) + proper box-art covers. Auth and the
// completion-time lookup live in @/lib/igdb, shared with /api/recommend. Falls
// back to RAWG when the Twitch keys aren't configured.
async function searchGamesIGDB(q: string): Promise<CatalogHit[]> {
  const headers = await igdbHeaders()
  const gr = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST', headers,
    body: `search "${q.replace(/["\\]/g, '')}"; fields name,first_release_date,cover.image_id,genres.name,themes.name,platforms.name,total_rating; limit 12;`,
  })
  if (!gr.ok) throw new Error(`IGDB ${gr.status}`)
  const games = (await gr.json()) as Array<Raw & { id: number; cover?: { image_id?: string }; genres?: Raw[]; themes?: Raw[]; platforms?: Raw[] }>
  if (!games.length) return []

  // Fetch the completion-time tiers for these games in one call.
  const ttb = new Map<number, { hastily?: number; normally?: number; completely?: number }>()
  try {
    const tr = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
      method: 'POST', headers,
      body: `fields game_id,hastily,normally,completely; where game_id = (${games.map((g) => g.id).join(',')}); limit 100;`,
    })
    if (tr.ok) for (const row of (await tr.json()) as Array<{ game_id: number; hastily?: number; normally?: number; completely?: number }>) ttb.set(row.game_id, row)
  } catch { /* times are best-effort */ }

  const toH = (s?: number) => (s && s > 0 ? Math.round((s / 3600) * 10) / 10 : undefined)
  return games.map((g) => {
    const t = ttb.get(g.id)
    const hastily = toH(t?.hastily), normally = toH(t?.normally), completely = toH(t?.completely)
    const year = g.first_release_date ? new Date((g.first_release_date as number) * 1000).getFullYear() : null
    const imageId = g.cover?.image_id
    return {
      external_id: String(g.id),
      external_source: 'igdb',
      title: String(g.name),
      cover_url: imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : null,
      year,
      progress_total: null,
      metadata: {
        genres: Array.isArray(g.genres) ? g.genres.map((x) => x.name).join(', ') : undefined,
        // IGDB themes carry the shape of the commitment (Open world, Sandbox,
        // Survival) in a way genres don't — the suggestion engine leans on these.
        themes: Array.isArray(g.themes) ? g.themes.map((x) => x.name).join(', ') : undefined,
        platforms: Array.isArray(g.platforms) ? g.platforms.map((p) => p.name).join(', ') : undefined,
        rating: typeof g.total_rating === 'number' ? Math.round((g.total_rating as number) / 10 * 10) / 10 : undefined,
        release_year: year ?? undefined,
        time_to_beat: normally ?? hastily ?? completely, // default = Main Story
        ttb: (hastily ?? normally ?? completely) != null ? { hastily, normally, completely } : undefined,
      },
    }
  })
}

async function searchGamesRAWG(q: string): Promise<CatalogHit[]> {
  if (!RAWG) throw new Error('RAWG_API_KEY not configured')
  const r = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(q)}&key=${RAWG}&page_size=12`, UPSTREAM_CACHE)
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
        time_to_beat: (g.playtime as number) || undefined, // community-average playtime
      },
    }
  })
}

async function searchGames(q: string): Promise<{ results: CatalogHit[]; igdb_error?: string }> {
  if (TWITCH_ID && TWITCH_SECRET) {
    try {
      const hits = await searchGamesIGDB(q)
      if (hits.length > 0) return { results: hits }
      const rawg = await searchGamesRAWG(q).catch(() => [])
      return { results: rawg, igdb_error: 'IGDB returned 0 results' }
    } catch (e) {
      const rawg = await searchGamesRAWG(q).catch(() => [])
      return { results: rawg, igdb_error: (e as Error).message }
    }
  }
  return { results: await searchGamesRAWG(q) }
}

async function searchTMDB(q: string, type: 'movie' | 'tv'): Promise<CatalogHit[]> {
  if (!TMDB) throw new Error('TMDB_API_KEY not configured')
  const r = await fetch(`https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(q)}&api_key=${TMDB}`, UPSTREAM_CACHE)
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  const d = await r.json()
  const genreNames = await tmdbGenreMap(type)
  return ((d.results as Raw[]) ?? []).slice(0, 12).map((m) => {
    const date = (m.release_date ?? m.first_air_date) as string | undefined
    const genres = Array.isArray(m.genre_ids)
      ? (m.genre_ids as number[]).map((id) => genreNames.get(id)).filter(Boolean).join(', ')
      : undefined
    return {
      external_id: String(m.id),
      external_source: 'tmdb',
      title: String(m.title ?? m.name),
      cover_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      year: date ? new Date(date).getFullYear() : null,
      progress_total: null,
      metadata: {
        rating: (m.vote_average as number) || undefined,
        genres: genres || undefined,
        release_year: date ? new Date(date).getFullYear() : undefined,
      },
    }
  })
}

// AniList (GraphQL, no key) is the primary manga source — far more reliable than
// Jikan/MAL, and returns the whole series with chapters + volumes.
async function searchMangaAniList(q: string): Promise<CatalogHit[]> {
  const query = `query($q:String){Page(perPage:12){media(search:$q,type:MANGA,sort:SEARCH_MATCH,isAdult:false){id title{english romaji} coverImage{large} chapters volumes genres startDate{year} staff(perPage:1){nodes{name{full}}}}}}`
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { q } }),
  })
  if (!r.ok) throw new Error(`AniList ${r.status}`)
  const d = await r.json()
  const media = (d.data?.Page?.media as Raw[]) ?? []
  return media.map((m) => {
    const title = m.title as Record<string, string> | undefined
    const cover = m.coverImage as Record<string, string> | undefined
    const start = m.startDate as Record<string, number> | undefined
    const staff = (m.staff as { nodes?: Array<{ name?: { full?: string } }> } | undefined)?.nodes
    const year = start?.year ?? null
    return {
      external_id: String(m.id),
      external_source: 'anilist',
      title: String(title?.english ?? title?.romaji ?? 'Untitled'),
      cover_url: cover?.large ?? null,
      year,
      progress_total: (m.chapters as number) || null,
      metadata: {
        author: staff?.[0]?.name?.full ?? undefined,
        volumes: (m.volumes as number) || undefined,
        genres: Array.isArray(m.genres) ? (m.genres as string[]).join(', ') : undefined,
        release_year: year ?? undefined,
      },
    }
  })
}

// Jikan/MyAnimeList fallback (whole series). Frequently 504s when MAL is down.
async function searchMangaJikan(q: string): Promise<CatalogHit[]> {
  const r = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(q)}&limit=12&sfw=true`, UPSTREAM_CACHE)
  if (!r.ok) throw new Error(`Jikan ${r.status}`)
  const d = await r.json()
  return ((d.data as Raw[]) ?? []).map((m) => {
    const images = m.images as Record<string, Record<string, string>> | undefined
    const published = m.published as Record<string, unknown> | undefined
    const prop = published?.prop as Record<string, Record<string, unknown>> | undefined
    const year = (prop?.from?.year as number) ?? null
    return {
      external_id: String(m.mal_id),
      external_source: 'jikan',
      title: String(m.title_english ?? m.title),
      cover_url: images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? null,
      year,
      progress_total: (m.chapters as number) || null,
      metadata: {
        author: Array.isArray(m.authors) ? (m.authors as Raw[])[0]?.name as string : undefined,
        rating: (m.score as number) || undefined,
        volumes: (m.volumes as number) || undefined,
        genres: Array.isArray(m.genres) ? (m.genres as Raw[]).map((g) => g.name as string).join(', ') : undefined,
        release_year: year ?? undefined,
      },
    }
  })
}

async function searchManga(q: string): Promise<CatalogHit[]> {
  try {
    const hits = await searchMangaAniList(q)
    if (hits.length > 0) return hits
  } catch { /* fall through to Jikan */ }
  return searchMangaJikan(q)
}

// OpenLibrary subjects are a firehose: twenty per book, mixing real genres with
// catalogue noise ("New York Times reviewed", "award:hugo_award=1966"), place and
// character qualifiers ("Dune (Imaginary place)"), and entries that are themselves
// comma-lists ("Fiction, science fiction, general"). Flatten to single tokens so
// near-duplicates actually collapse, then keep the few that read like genres.
const SUBJECT_NOISE = /(accessible|daisy|in library|lending|overdrive|internet archive|nyt|new york times|award|bestseller|open library|ebook|large type|reading level|translations|specimens|collectible)/i
const SUBJECT_GENERIC = new Set([
  'fiction', 'nonfiction', 'non fiction', 'general', 'literature', 'novel', 'novels',
  'english fiction', 'juvenile', 'juvenile fiction', 'reading', 'books', 'texts',
])

function olSubjects(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw as string[]) {
    if (typeof entry !== 'string') continue
    for (const part of entry.split(',')) {
      // "Science-fiction" and "Science fiction" are the same subject to a reader.
      const tag = part.trim().replace(/(?<=[a-z])-(?=[a-z])/gi, ' ').replace(/\s+/g, ' ')
      if (!tag || tag.length < 3 || tag.length > 32) continue
      if (tag.includes(':') || tag.includes('=') || tag.includes('(')) continue
      if (SUBJECT_NOISE.test(tag) || SUBJECT_GENERIC.has(tag.toLowerCase())) continue
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(tag)
      if (out.length === 6) return out.join(', ')
    }
  }
  return out.length > 0 ? out.join(', ') : undefined
}

async function searchBooks(q: string): Promise<CatalogHit[]> {
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject&limit=12`, UPSTREAM_CACHE)
  if (!r.ok) throw new Error(`OpenLibrary ${r.status}`)
  const d = await r.json()
  return ((d.docs as Raw[]) ?? []).map((b) => ({
    external_id: String(b.key),
    external_source: 'openlibrary',
    title: String(b.title),
    cover_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null,
    year: (b.first_publish_year as number) || null,
    progress_total: (b.number_of_pages_median as number) || null,
    metadata: {
      author: Array.isArray(b.author_name) ? (b.author_name as string[])[0] : undefined,
      genres: olSubjects(b.subject),
      release_year: (b.first_publish_year as number) || undefined,
    },
  }))
}

// Audiobooks: Audible's public catalog API gives the REAL listening length
// (runtime_length_min) + narrator + cover — far better than estimating hours from
// a print page count. No key required. Unofficial endpoint, so callers keep a
// page-based fallback for anything it can't find.
// Audible returns a category ladder per title (Fiction > Science Fiction > Space
// Opera). The leaf is the most specific, so walk each ladder from the bottom up.
function audibleCategories(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  for (const entry of raw as Array<{ ladder?: Array<{ name?: string }> }>) {
    const rungs = entry?.ladder
    if (!Array.isArray(rungs)) continue
    for (const rung of [...rungs].reverse()) {
      const name = rung?.name?.trim()
      if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name)
    }
  }
  return out.length > 0 ? out.slice(0, 5).join(', ') : undefined
}

async function searchAudible(q: string): Promise<CatalogHit[]> {
  const url = `https://api.audible.com/1.0/catalog/products?keywords=${encodeURIComponent(q)}`
    + '&num_results=12&products_sort_by=Relevance'
    + '&response_groups=contributors,product_desc,product_attrs,media,category_ladders&image_sizes=500'
  const r = await fetch(url, UPSTREAM_CACHE)
  if (!r.ok) throw new Error(`Audible ${r.status}`)
  const d = await r.json()
  const names = (arr: unknown): string | undefined =>
    Array.isArray(arr) ? (arr.map((x) => (x as Raw).name).filter(Boolean).join(', ') || undefined) : undefined
  return ((d.products as Raw[]) ?? [])
    .filter((p) => p.runtime_length_min && String(p.content_delivery_type ?? '').includes('Book'))
    .map((p) => ({
      external_id: String(p.asin),
      external_source: 'audible',
      title: String(p.title),
      cover_url: ((p.product_images as Record<string, string>) ?? {})['500'] ?? null,
      year: p.release_date ? Number(String(p.release_date).slice(0, 4)) || null : null,
      progress_total: p.runtime_length_min as number, // minutes of audio
      metadata: {
        audio_runtime_min: p.runtime_length_min as number,
        narrator: names(p.narrators),
        author: names(p.authors),
        genres: audibleCategories(p.category_ladders),
        asin: String(p.asin),
      },
    }))
}

export async function GET(req: NextRequest) {
  const denied = await requireUser(req)
  if (denied) return denied
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200)
  if (!q) return NextResponse.json({ results: [] }, { headers: noCacheHeaders })
  try {
    if (type === 'games') {
      const { results, igdb_error } = await searchGames(q)
      // A RAWG answer standing in for a failed IGDB lookup is the wrong one to
      // pin in front of the real one for a day.
      return NextResponse.json(
        { results, ...(igdb_error ? { igdb_error } : {}) },
        { headers: !igdb_error && results.length > 0 ? catalogCacheHeaders : noCacheHeaders },
      )
    }
    let results: CatalogHit[] = []
    if (type === 'movie' || type === 'tv') results = await searchTMDB(q, type)
    else if (type === 'manga') results = await searchManga(q)
    else if (type === 'audiobook') {
      // Prefer Audible (real runtime); if it's unreachable, still return results
      // from OpenLibrary so audiobook search never dead-ends.
      try { results = await searchAudible(q) } catch { results = [] }
      if (results.length === 0) results = await searchBooks(q)
    }
    else if (type === 'books') results = await searchBooks(q)
    return NextResponse.json({ results }, { headers: results.length > 0 ? catalogCacheHeaders : noCacheHeaders })
  } catch (e) {
    // Degrade gracefully so the UI never breaks (e.g. before keys are set)
    return NextResponse.json({ results: [], error: (e as Error).message }, { headers: noCacheHeaders })
  }
}
