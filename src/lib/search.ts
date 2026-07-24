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
