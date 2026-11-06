import type { Entry, EntryStatus } from '@/types/database'

// Parsers for the external-service exports the desktop app supported: MyAnimeList
// (XML), Letterboxd (CSV), Goodreads (CSV). Ported verbatim so the web imports the
// same shape. A PreviewEntry is exactly what insertEntry/bulkInsertEntries expect.
export type PreviewEntry = Omit<Entry, 'id' | 'created_at' | 'updated_at'>

// ── CSV parser ───────────────────────────────────────────────────────────────

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const row: string[] = []
    let inQuote = false
    let cell = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        row.push(cell); cell = ''
      } else {
        cell += ch
      }
    }
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// ── MAL XML parser ───────────────────────────────────────────────────────────

function malStatus(s: string): EntryStatus {
  if (s === 'Completed') return 'completed'
  if (s === 'Dropped') return 'dropped'
  if (s === 'Watching' || s === 'Reading' || s === 'On-Hold') return 'in_progress'
  return 'backlog'
}

export function parseMAL(xml: string): PreviewEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const entries: PreviewEntry[] = []
  const get = (node: Element, tag: string) => node.querySelector(tag)?.textContent?.trim() ?? ''
  const validDate = (d: string) => (d && d !== '0000-00-00' ? d : null)

  for (const node of Array.from(doc.querySelectorAll('anime'))) {
    const score = parseInt(get(node, 'my_score') || '0', 10)
    entries.push({
      title: get(node, 'series_title'),
      hobby_category: 'tv',
      status: malStatus(get(node, 'my_status')),
      rating: score > 0 ? score : null,
      notes: null,
      progress_current: parseInt(get(node, 'my_watched_episodes') || '0', 10),
      progress_total: parseInt(get(node, 'series_episodes') || '0', 10) || null,
      cover_url: null,
      external_id: get(node, 'series_animedb_id') || null,
      external_source: 'myanimelist',
      metadata: { mal_id: get(node, 'series_animedb_id') },
      book_subtype: null,
      current_season: null, current_episode: null, priority: null,
      date_started: validDate(get(node, 'my_start_date')),
      date_completed: validDate(get(node, 'my_finish_date')),
    })
  }

  for (const node of Array.from(doc.querySelectorAll('manga'))) {
    const score = parseInt(get(node, 'my_score') || '0', 10)
    entries.push({
      title: get(node, 'manga_title'),
      hobby_category: 'books',
      status: malStatus(get(node, 'my_status')),
      rating: score > 0 ? score : null,
      notes: null,
      progress_current: parseInt(get(node, 'my_read_chapters') || '0', 10),
      progress_total: parseInt(get(node, 'manga_chapters') || '0', 10) || null,
      cover_url: null,
      external_id: get(node, 'manga_mangadb_id') || null,
      external_source: 'myanimelist',
      metadata: { mal_id: get(node, 'manga_mangadb_id') },
      book_subtype: 'manga',
      current_season: null, current_episode: null, priority: null,
      date_started: validDate(get(node, 'my_start_date')),
      date_completed: validDate(get(node, 'my_finish_date')),
    })
  }

  return entries.filter((e) => e.title)
}

// ── Letterboxd CSV parser ────────────────────────────────────────────────────

export function parseLetterboxd(text: string): PreviewEntry[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const h = rows[0].map((c) => c.toLowerCase().trim())
  const nameIdx = h.indexOf('name')
  const ratingIdx = h.indexOf('rating')
  const dateIdx = h.indexOf('date')
  if (nameIdx === -1) return []
  const isWatchlist = ratingIdx === -1

  return rows.slice(1).flatMap((row): PreviewEntry[] => {
    const title = row[nameIdx]?.trim()
    if (!title) return []
    const ratingRaw = ratingIdx !== -1 ? parseFloat(row[ratingIdx] ?? '') : NaN
    const rating = !isNaN(ratingRaw) && ratingRaw > 0 ? Math.min(10, Math.round(ratingRaw * 2)) : null
    const date = dateIdx !== -1 ? row[dateIdx]?.trim() || null : null
    return [{
      title,
      hobby_category: 'movies',
      status: isWatchlist ? 'backlog' : 'completed',
      rating,
      notes: null,
      progress_current: 0,
      progress_total: null,
      cover_url: null,
      external_id: null,
      external_source: 'letterboxd',
      metadata: { source: 'letterboxd' },
      book_subtype: null,
      current_season: null, current_episode: null, priority: null,
      date_started: null,
      date_completed: !isWatchlist ? date : null,
    }]
  })
}

// ── Goodreads CSV parser ─────────────────────────────────────────────────────

export function parseGoodreads(text: string): PreviewEntry[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const h = rows[0].map((c) => c.toLowerCase().trim())
  const idx = (name: string) => h.indexOf(name)
  const titleI = idx('title')
  const ratingI = idx('my rating')
  const pagesI = idx('number of pages')
  const shelfI = idx('exclusive shelf')
  const dateReadI = idx('date read')
  const authorI = idx('author')
  if (titleI === -1 || shelfI === -1) return []

  return rows.slice(1).flatMap((row): PreviewEntry[] => {
    const title = row[titleI]?.trim()
    if (!title) return []
    const shelf = row[shelfI]?.trim() || 'to-read'
    const ratingRaw = ratingI !== -1 ? parseInt(row[ratingI] ?? '0', 10) : 0
    const rating = ratingRaw > 0 ? ratingRaw * 2 : null
    const pages = pagesI !== -1 ? parseInt(row[pagesI] ?? '0', 10) : 0
    const status: EntryStatus = shelf === 'read' ? 'completed' : shelf === 'currently-reading' ? 'in_progress' : 'backlog'
    const author = authorI !== -1 ? row[authorI]?.trim() || null : null
    const dateRead = dateReadI !== -1 ? row[dateReadI]?.trim() || null : null
    return [{
      title,
      hobby_category: 'books',
      status,
      rating,
      notes: author ? `Author: ${author}` : null,
      progress_current: status === 'completed' ? (pages || 0) : 0,
      progress_total: pages || null,
      cover_url: null,
      external_id: null,
      external_source: 'goodreads',
      metadata: { source: 'goodreads' },
      book_subtype: 'book',
      current_season: null, current_episode: null, priority: null,
      date_started: null,
      date_completed: status === 'completed' ? dateRead : null,
    }]
  })
}

// ── MAL cover enrichment (Jikan / MyAnimeList) ───────────────────────────────

// Fetch cover art (and missing totals) from Jikan for MAL entries, keyed by MAL id.
// ── Jikan (MyAnimeList) ──────────────────────────────────────────────────────

interface JikanNamed { name?: string }

/**
 * The taste-relevant fields of a Jikan record.
 *
 * Genres are the reason this exists. The suggestion engine scores on
 * metadata.genres + metadata.themes (see lib/taste.ts tagsOf), so a MAL import
 * that doesn't capture them produces a library the engine cannot read at all —
 * which is exactly what happened to every anime imported before this: the record
 * below was already being fetched for the cover, and everything but the cover and
 * the episode count was being dropped on the floor.
 *
 * Jikan's vocabulary is also a better fit than TMDB's here. TMDB files anime
 * under "Animation, Action & Adventure, Sci-Fi & Fantasy", which is true of
 * almost every show in an anime-heavy library and so separates nothing; Jikan
 * carries themes (Isekai, Military, Mecha) and demographics (Shounen, Seinen)
 * that actually discriminate. Themes and demographics both land in
 * metadata.themes, which tagsOf already reads.
 */
export function jikanMetadata(item: Record<string, unknown>): Record<string, unknown> {
  const names = (v: unknown) =>
    Array.isArray(v) ? (v as JikanNamed[]).map((x) => x.name).filter(Boolean).join(', ') : ''
  const genres = names(item.genres)
  // Themes and demographics are the fine-grained half of the signal; keep them
  // under one key so tagsOf picks them up without needing to know the difference.
  const themes = [names(item.themes), names(item.demographics)].filter(Boolean).join(', ')
  // Jikan says "Finished Airing" / "Currently Airing"; taste.ts isOngoingSeries
  // compares against TMDB's wording, so map onto that rather than inventing a
  // third spelling of the same fact.
  // Anime say "Currently Airing", manga say "Publishing"; both mean still going.
  const status = String(item.status ?? '')
  const airing = item.airing === true || status === 'Currently Airing' || status === 'Publishing'
  // `year` is only set for seasonal shows; fall back to the start of the air date.
  const airedFrom = (item.aired as { from?: string } | undefined)?.from
  const year = Number(item.year) || Number(String(airedFrom ?? '').slice(0, 4)) || undefined
  return {
    genres: genres || undefined,
    themes: themes || undefined,
    show_status: airing ? 'Returning Series' : item.status ? 'Ended' : undefined,
    in_production: item.status ? airing : undefined,
    release_year: year,
    // Community score, matching what the TMDB/IGDB paths put here. The user's own
    // score is a column (Entry.rating), not metadata, so the two never collide.
    rating: Number(item.score) || undefined,
  }
}

/** Fetch one Jikan record's taste metadata by MAL id. `{}` if unavailable. */
export async function fetchJikanMetadata(
  type: 'anime' | 'manga',
  malId: string | number,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/${type}/${malId}`)
    if (!res.ok) return {}
    const item = (await res.json())?.data as Record<string, unknown>
    return item ? jikanMetadata(item) : {}
  } catch {
    return {}
  }
}

// Jikan allows 60 req/min, so requests are spaced ~1.1s apart. Failures (incl. MAL
// outages) leave the entry untouched — the import still completes.
export async function enrichMALWithJikan(
  entries: PreviewEntry[],
  onProgress?: (current: number, total: number) => void,
): Promise<PreviewEntry[]> {
  const enriched: PreviewEntry[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    onProgress?.(i + 1, entries.length)
    const malId = e.metadata?.mal_id
    if (!malId) { enriched.push(e); continue }
    try {
      const type = e.hobby_category === 'tv' ? 'anime' : 'manga'
      const res = await fetch(`https://api.jikan.moe/v4/${type}/${malId}`)
      if (!res.ok) throw new Error(String(res.status))
      const item = (await res.json())?.data as Record<string, unknown>
      const images = item?.images as { jpg?: { large_image_url?: string; image_url?: string } } | undefined
      const cover = images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? null
      const meta = jikanMetadata(item ?? {})
      enriched.push({
        ...e,
        cover_url: cover ?? e.cover_url,
        progress_total: e.progress_total ?? ((type === 'anime' ? item?.episodes : item?.chapters) as number | null),
        // Whatever the XML already established (mal_id) wins; the catalog only
        // fills what the export didn't carry.
        metadata: { ...meta, ...e.metadata },
      })
    } catch {
      enriched.push(e)
    }
    if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 1100))
  }
  return enriched
}
