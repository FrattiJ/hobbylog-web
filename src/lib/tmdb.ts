// Server-only TMDB helpers (used by /api/search, /api/details, /api/recommend and
// the daily TV refresh cron).
const TMDB = process.env.TMDB_API_KEY

type Raw = Record<string, unknown>

// Search and discover rows carry genre_ids, not names. The two genre lists are
// tiny and effectively frozen, so fetch each once per warm instance and reuse it.
const genreCache: Record<'movie' | 'tv', Map<number, string> | null> = { movie: null, tv: null }

export async function tmdbGenreMap(type: 'movie' | 'tv'): Promise<Map<number, string>> {
  const cached = genreCache[type]
  if (cached) return cached
  const m = new Map<number, string>()
  try {
    const r = await fetch(`https://api.themoviedb.org/3/genre/${type}/list?api_key=${TMDB}`)
    if (r.ok) for (const g of (((await r.json()).genres as Raw[]) ?? [])) m.set(g.id as number, g.name as string)
  } catch { /* genres are best-effort — a hit without them still works */ }
  if (m.size > 0) genreCache[type] = m
  return m
}

// The reverse direction, for building /discover queries from genre names.
export async function tmdbGenreIds(type: 'movie' | 'tv', names: string[]): Promise<number[]> {
  const map = await tmdbGenreMap(type)
  const byName = new Map([...map.entries()].map(([id, n]) => [n.toLowerCase(), id]))
  return names.map((n) => byName.get(n.toLowerCase())).filter((x): x is number => x != null)
}

// Representative per-episode runtime in minutes. TMDB's `episode_run_time` is
// frequently empty, and a single episode (last aired) is often a long finale — so
// when the field is missing we average a whole season's episode runtimes for an
// accurate typical length instead of a generic 22-minute guess.
export async function tvEpisodeRuntime(id: string, detail: Record<string, unknown>): Promise<number | undefined> {
  const ert = detail.episode_run_time as number[] | undefined
  if (Array.isArray(ert) && ert.length > 0 && ert[0] > 0) return ert[0]

  // Average every episode's runtime across all regular seasons (skip season 0 =
  // specials). This uses TMDB's per-episode `runtime` ground truth for an accurate
  // typical length, rather than one season that may skew high or low.
  const seasonNums = Array.isArray(detail.seasons)
    ? (detail.seasons as Array<{ season_number: number }>).map((s) => s.season_number).filter((n) => n > 0)
    : Array.from({ length: (detail.number_of_seasons as number) || 1 }, (_, i) => i + 1)

  const runtimes: number[] = []
  await Promise.all(seasonNums.map(async (s) => {
    try {
      const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${TMDB}`)
      if (!r.ok) return
      const d = await r.json()
      for (const ep of (d.episodes as Array<{ runtime?: number }>) ?? []) {
        if (typeof ep.runtime === 'number' && ep.runtime > 0) runtimes.push(ep.runtime)
      }
    } catch { /* skip season */ }
  }))
  if (runtimes.length) return Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
  return undefined
}
