// Server-only TMDB helpers (used by /api/details and the daily TV refresh cron).
const TMDB = process.env.TMDB_API_KEY

// Representative per-episode runtime in minutes. TMDB's `episode_run_time` is
// frequently empty, and a single episode (last aired) is often a long finale — so
// when the field is missing we average a whole season's episode runtimes for an
// accurate typical length instead of a generic 22-minute guess.
export async function tvEpisodeRuntime(id: string, detail: Record<string, unknown>): Promise<number | undefined> {
  const ert = detail.episode_run_time as number[] | undefined
  if (Array.isArray(ert) && ert.length > 0 && ert[0] > 0) return ert[0]

  const seasons = (detail.number_of_seasons as number) || 1
  // Season 1 reflects a show's baseline episode length; final seasons often have
  // longer, movie-length episodes that skew the average. Prefer S1, then latest.
  for (const s of Array.from(new Set([1, seasons]))) {
    try {
      const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${TMDB}`)
      if (!r.ok) continue
      const d = await r.json()
      const runtimes = ((d.episodes as Array<{ runtime?: number }>) ?? [])
        .map((ep) => ep.runtime)
        .filter((n): n is number => typeof n === 'number' && n > 0)
      if (runtimes.length) return Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
    } catch { /* try next season */ }
  }
  return undefined
}
