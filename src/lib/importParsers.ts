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
      enriched.push({
        ...e,
        cover_url: cover ?? e.cover_url,
        progress_total: e.progress_total ?? ((type === 'anime' ? item?.episodes : item?.chapters) as number | null),
      })
    } catch {
      enriched.push(e)
    }
    if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 1100))
  }
  return enriched
}
