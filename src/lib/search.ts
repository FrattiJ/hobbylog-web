export interface CatalogHit {
  external_id: string
  external_source: string
  title: string
  cover_url: string | null
  year: number | null
  progress_total: number | null
  metadata: Record<string, unknown>
}

// Which hobby categories can be searched, and the API `type` each maps to.
export function searchTypeFor(hobby: string): string | null {
  if (hobby === 'games') return 'games'
  if (hobby === 'movies') return 'movie'
  if (hobby === 'tv') return 'tv'
  if (hobby === 'books') return 'books'
  return null // gundams, fitness, art — manual only
}

export async function searchCatalog(type: string, q: string): Promise<CatalogHit[]> {
  const res = await fetch(`/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? []) as CatalogHit[]
}

export interface CatalogDetails {
  progress_total: number | null
  metadata: Record<string, unknown>
}

// Per-title enrichment for a single picked result (movie runtime, TV episode count).
export async function fetchCatalogDetails(type: string, id: string): Promise<CatalogDetails> {
  try {
    const res = await fetch(`/api/details?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
    if (!res.ok) return { progress_total: null, metadata: {} }
    return (await res.json()) as CatalogDetails
  } catch {
    return { progress_total: null, metadata: {} }
  }
}

// Total episodes watched given a TMDB show id + "Season S, Episode E".
export async function computeTVProgress(tmdbId: string, season: number, episode: number): Promise<number | null> {
  try {
    const res = await fetch(`/api/tv-progress?id=${encodeURIComponent(tmdbId)}&season=${season}&episode=${episode}`)
    if (!res.ok) return null
    const d = await res.json()
    return typeof d.episodes === 'number' ? d.episodes : null
  } catch {
    return null
  }
}
