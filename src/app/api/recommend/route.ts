import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/serverAuth'
import { tmdbGenreMap, tmdbGenreIds, tvEpisodeRuntime } from '@/lib/tmdb'
import { igdbConfigured, igdbQuery, igdbTagIds, igdbTimeToBeat } from '@/lib/igdb'
import { catalogHours } from '@/lib/hours'

// Candidate discovery for the suggestion engine. The browser works out WHAT to
// look for (see lib/taste.ts + lib/recommend.ts) and posts that brief here; this
// route only knows how to ask each catalog for it, because that's where the API
// keys are. Scoring and ranking stay on the client, against the taste profile.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const TMDB = process.env.TMDB_API_KEY

type Raw = Record<string, unknown>

/** What the client asks for, per media type. Mirrors DiscoveryBrief. */
interface Brief {
  category: 'games' | 'movies' | 'tv' | 'books'
  includeTags?: string[]
  avoidTags?: string[]
  maxHours?: number | null
  seeds?: Array<{ source: string; id: string; title: string }>
  /** books only: which sub-type to search, since manga and prose differ. */
  subtype?: string | null
}

interface CandidateRow {
  external_id: string
  external_source: string
  title: string
  cover_url: string | null
  year: number | null
  hours: number | null
  tags: string[]
  communityRating: number | null
  category: string
  ongoing?: boolean
  via?: string
  // Carried so "add to backlog" creates a fully-populated entry rather than a
  // bare title that needs enriching all over again.
  progress_total: number | null
  metadata: Record<string, unknown>
  book_subtype?: string | null
}

const CANDIDATES_PER_CATEGORY = 24
/** Cap the per-title detail lookups that turn a discover row into a real length. */
const ENRICH_LIMIT = 12
/** How far past the brief's length ceiling a candidate may still go. */
const LENGTH_CEILING_SLACK = 1.25

/**
 * Enforce the brief's length ceiling on whatever lengths we actually know.
 * Every source routes through this: upstream length filters are unreliable
 * (TMDB's with_runtime.lte doesn't hold on /discover) or absent (IGDB has no
 * time-to-beat facet, TV runtime isn't a discover field), so the bound is applied
 * here rather than trusted to each catalog. Unknown lengths are kept — the client
 * scores those neutral, so dropping them would bias toward measured titles.
 */
function capLength(rows: CandidateRow[], maxHours: number | null | undefined): CandidateRow[] {
  if (!maxHours) return rows
  const ceiling = maxHours * LENGTH_CEILING_SLACK
  return rows.filter((c) => c.hours == null || c.hours <= ceiling)
}

// Catalog lookups are all best-effort — one dead upstream shouldn't fail the whole
// request. But swallowing the reason made a broken query indistinguishable from
// "no good matches", which hid a bad IGDB filter for a whole release. Failures are
// collected per request (never module-level: a warm instance serves many) and
// returned alongside the candidates.
type Ctx = { problems: string[] }
const note = (ctx: Ctx, where: string, e: unknown) =>
  ctx.problems.push(`${where}: ${e instanceof Error ? e.message : String(e)}`)

const uniqBy = <T>(xs: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>()
  return xs.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ── Games (IGDB) ─────────────────────────────────────────────────────────────

interface IgdbGame {
  id: number
  name?: string
  first_release_date?: number
  cover?: { image_id?: string }
  genres?: Array<{ name?: string }>
  themes?: Array<{ name?: string }>
  total_rating?: number
  similar_games?: IgdbGame[]
}

const GAME_FIELDS = 'name,first_release_date,cover.image_id,genres.name,themes.name,total_rating'
// Apicalypse needs every nested field spelled out: similar_games.name, etc.
const SIMILAR_FIELDS = GAME_FIELDS.split(',').map((f) => `similar_games.${f}`).join(',')

function igdbRow(g: IgdbGame, ttb: { hastily?: number; normally?: number; completely?: number } | undefined, via?: string): CandidateRow {
  const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null
  const genres = (g.genres ?? []).map((x) => x.name).filter((n): n is string => !!n)
  const themes = (g.themes ?? []).map((x) => x.name).filter((n): n is string => !!n)
  const est = ttb?.normally ?? ttb?.hastily ?? ttb?.completely ?? null
  const rating = typeof g.total_rating === 'number' ? Math.round((g.total_rating / 10) * 10) / 10 : null
  return {
    external_id: String(g.id),
    external_source: 'igdb',
    title: String(g.name ?? 'Untitled'),
    cover_url: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    year,
    hours: catalogHours({ kind: 'games', timeToBeat: est }),
    tags: [...genres, ...themes],
    communityRating: rating,
    category: 'games',
    via,
    progress_total: null,
    metadata: {
      genres: genres.join(', ') || undefined,
      themes: themes.join(', ') || undefined,
      rating: rating ?? undefined,
      release_year: year ?? undefined,
      time_to_beat: est ?? undefined,
      ttb: est != null ? ttb : undefined,
    },
  }
}

async function discoverGames(brief: Brief, ctx: Ctx): Promise<CandidateRow[]> {
  if (!igdbConfigured()) return []
  const found: Array<{ game: IgdbGame; via?: string }> = []

  // "More like this" from your best-loved games — IGDB curates similar_games, and
  // it beats genre matching nearly every time.
  await Promise.all((brief.seeds ?? []).filter((s) => s.source === 'igdb').map(async (seed) => {
    try {
      const rows = await igdbQuery<IgdbGame>('games', `fields ${SIMILAR_FIELDS}; where id = ${Number(seed.id)}; limit 1;`)
      for (const g of rows[0]?.similar_games ?? []) found.push({ game: g, via: seed.title })
    } catch (e) { note(ctx, `igdb similar(${seed.title})`, e) }
  }))

  // Then fill out with a filtered sweep of the genres and themes you reliably
  // finish. No `category = 0` clause here: IGDB deprecated that field in favour of
  // game_type, and including it returned zero rows for every sweep while the
  // error sat inside a silent catch. A stray DLC entry is a far cheaper problem
  // than a filter that quietly matches nothing.
  try {
    const { genres, themes, unknown } = await igdbTagIds(brief.includeTags ?? [])
    if (genres.length === 0 && themes.length === 0) {
      if ((brief.includeTags ?? []).length > 0) note(ctx, 'igdb genre sweep skipped', `no IGDB genre or theme matches [${unknown.join(', ')}]`)
    } else {
      const tagClause = [
        genres.length ? `genres = (${genres.join(',')})` : null,
        themes.length ? `themes = (${themes.join(',')})` : null,
      ].filter(Boolean).join(' | ')
      const rows = await igdbQuery<IgdbGame>('games',
        `fields ${GAME_FIELDS}; where (${tagClause}) & total_rating > 75 & total_rating_count > 30; `
        + `sort total_rating desc; limit 40;`)
      for (const g of rows) found.push({ game: g })
    }
  } catch (e) { note(ctx, 'igdb genre sweep', e) }

  const deduped = uniqBy(found, (f) => String(f.game.id))
  const ttb = await igdbTimeToBeat(deduped.map((f) => f.game.id))
  return deduped.map((f) => igdbRow(f.game, ttb.get(f.game.id), f.via))
}

// ── Movies & TV (TMDB) ───────────────────────────────────────────────────────

async function tmdbJson(path: string, params: Record<string, string | number> = {}): Promise<Raw | null> {
  const qs = new URLSearchParams({ api_key: TMDB as string, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  try {
    const r = await fetch(`https://api.themoviedb.org/3/${path}?${qs}`)
    return r.ok ? ((await r.json()) as Raw) : null
  } catch { return null }
}

async function discoverTmdb(brief: Brief, ctx: Ctx): Promise<CandidateRow[]> {
  if (!TMDB) return []
  const type = brief.category === 'movies' ? 'movie' : 'tv'
  const genreNames = await tmdbGenreMap(type)
  const rows: Array<{ row: Raw; via?: string }> = []

  // Seeded recommendations first — TMDB's are genuinely good and cost one call.
  await Promise.all((brief.seeds ?? []).filter((s) => s.source === 'tmdb').map(async (seed) => {
    const d = await tmdbJson(`${type}/${encodeURIComponent(seed.id)}/recommendations`)
    for (const r of ((d?.results as Raw[]) ?? []).slice(0, 10)) rows.push({ row: r, via: seed.title })
  }))

  // Then a quality-filtered discover sweep over your strongest genres.
  const ids = await tmdbGenreIds(type, brief.includeTags ?? [])
  if (ids.length > 0) {
    const params: Record<string, string | number> = {
      with_genres: ids.join('|'),
      sort_by: 'vote_average.desc',
      'vote_count.gte': type === 'movie' ? 300 : 120,
      'vote_average.gte': 7,
    }
    // Movies can be length-filtered at the source; TV runtime isn't a discover
    // facet, so TV length gets sorted out during enrichment below.
    if (type === 'movie' && brief.maxHours) params['with_runtime.lte'] = Math.round(brief.maxHours * 60)
    const d = await tmdbJson(`discover/${type}`, params)
    for (const r of ((d?.results as Raw[]) ?? []).slice(0, 20)) rows.push({ row: r })
  }

  const deduped = uniqBy(rows, (r) => String(r.row.id))
  const mapped: CandidateRow[] = deduped.map(({ row, via }) => {
    const date = (row.release_date ?? row.first_air_date) as string | undefined
    const year = date ? new Date(date).getFullYear() || null : null
    const genres = Array.isArray(row.genre_ids)
      ? (row.genre_ids as number[]).map((id) => genreNames.get(id)).filter((n): n is string => !!n)
      : []
    const rating = typeof row.vote_average === 'number' ? Math.round((row.vote_average as number) * 10) / 10 : null
    return {
      external_id: String(row.id),
      external_source: 'tmdb',
      title: String(row.title ?? row.name ?? 'Untitled'),
      cover_url: row.poster_path ? `https://image.tmdb.org/t/p/w500${row.poster_path}` : null,
      year,
      hours: null,
      tags: genres,
      communityRating: rating,
      category: brief.category,
      via,
      progress_total: null,
      metadata: {
        genres: genres.join(', ') || undefined,
        rating: rating ?? undefined,
        release_year: year ?? undefined,
      },
    }
  })

  // Discover rows carry no runtime or episode count, so some get a real detail
  // lookup — without a length, the whole length model has nothing to say.
  //
  // Seeded rows go first: "more like something you loved" is the strongest signal
  // here, so those are the ones that must come back with a usable length. Note the
  // copy — sort() mutates, and sorting `mapped` in place used to reorder the rows
  // by catalog rating, which then let the final slice drop the seeds entirely.
  const head = [...mapped]
    .sort((a, b) => Number(!!b.via) - Number(!!a.via) || (b.communityRating ?? 0) - (a.communityRating ?? 0))
    .slice(0, ENRICH_LIMIT)
  await Promise.all(head.map(async (c) => {
    const d = await tmdbJson(`${type}/${c.external_id}`)
    if (!d) return
    if (type === 'movie') {
      const runtime = (d.runtime as number) || null
      c.hours = catalogHours({ kind: 'movies', runtimeMin: runtime })
      c.progress_total = runtime
      c.metadata = { ...c.metadata, runtime: runtime ?? undefined }
      return
    }
    const epRuntime = await tvEpisodeRuntime(c.external_id, d)
    const episodes = (d.number_of_episodes as number) || null
    c.hours = catalogHours({ kind: 'tv', episodes, episodeRuntimeMin: epRuntime ?? null })
    c.progress_total = episodes
    c.ongoing = d.in_production === true || ['returning series', 'in production', 'planned'].includes(String(d.status ?? '').toLowerCase())
    c.metadata = {
      ...c.metadata,
      episode_runtime: epRuntime ?? undefined,
      seasons: (d.number_of_seasons as number) || undefined,
      show_status: (d.status as string) || undefined,
      in_production: typeof d.in_production === 'boolean' ? (d.in_production as boolean) : undefined,
    }
  }))

  return capLength(mapped, brief.maxHours)
}

// ── Manga (AniList) ──────────────────────────────────────────────────────────

const ANILIST_MEDIA = 'id title{english romaji} coverImage{large} chapters genres averageScore startDate{year}'

interface AniMedia {
  id: number
  title?: { english?: string; romaji?: string }
  coverImage?: { large?: string }
  chapters?: number
  genres?: string[]
  averageScore?: number
  startDate?: { year?: number }
}

function aniRow(m: AniMedia, via?: string): CandidateRow {
  const year = m.startDate?.year ?? null
  const rating = typeof m.averageScore === 'number' ? Math.round((m.averageScore / 10) * 10) / 10 : null
  return {
    external_id: String(m.id),
    external_source: 'anilist',
    title: String(m.title?.english ?? m.title?.romaji ?? 'Untitled'),
    cover_url: m.coverImage?.large ?? null,
    year,
    hours: catalogHours({ kind: 'manga', chapters: m.chapters ?? null }),
    tags: m.genres ?? [],
    communityRating: rating,
    category: 'books',
    via,
    progress_total: m.chapters ?? null,
    book_subtype: 'manga',
    metadata: {
      genres: (m.genres ?? []).join(', ') || undefined,
      rating: rating ?? undefined,
      release_year: year ?? undefined,
    },
  }
}

async function anilist<T>(query: string, variables: Raw): Promise<T | null> {
  try {
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!r.ok) return null
    return (await r.json()).data as T
  } catch { return null }
}

async function discoverManga(brief: Brief, ctx: Ctx): Promise<CandidateRow[]> {
  const out: CandidateRow[] = []

  // AniList keeps user-voted recommendations per title — the best source here.
  await Promise.all((brief.seeds ?? []).filter((s) => s.source === 'anilist').map(async (seed) => {
    const d = await anilist<{ Media?: { recommendations?: { nodes?: Array<{ mediaRecommendation?: AniMedia }> } } }>(
      `query($id:Int){Media(id:$id){recommendations(perPage:10,sort:RATING_DESC){nodes{mediaRecommendation{${ANILIST_MEDIA}}}}}}`,
      { id: Number(seed.id) }
    )
    for (const n of d?.Media?.recommendations?.nodes ?? []) {
      if (n.mediaRecommendation) out.push(aniRow(n.mediaRecommendation, seed.title))
    }
  }))

  // AniList takes genre names directly, so the brief's tags go straight through
  // (filtered to the ones it recognises by simply letting unknowns return nothing).
  const genres = (brief.includeTags ?? []).map((t) => t.replace(/\b\w/g, (c) => c.toUpperCase()))
  if (genres.length > 0) {
    const d = await anilist<{ Page?: { media?: AniMedia[] } }>(
      `query($g:[String]){Page(perPage:20){media(type:MANGA,genre_in:$g,sort:SCORE_DESC,isAdult:false,averageScore_greater:70){${ANILIST_MEDIA}}}}`,
      { g: genres }
    )
    for (const m of d?.Page?.media ?? []) out.push(aniRow(m))
  }
  return out
}

// ── Prose books (OpenLibrary) ────────────────────────────────────────────────

async function discoverBooks(brief: Brief, ctx: Ctx): Promise<CandidateRow[]> {
  const subjects = (brief.includeTags ?? []).slice(0, 3)
  if (subjects.length === 0) return []
  const out: CandidateRow[] = []
  // OpenLibrary has no "similar to" endpoint, so subject browse sorted by rating
  // is the best available. Weaker than the other catalogues, and worth saying so.
  await Promise.all(subjects.map(async (subject) => {
    try {
      const url = 'https://openlibrary.org/search.json'
        + `?q=${encodeURIComponent(`subject:"${subject}"`)}`
        + '&sort=rating&limit=10'
        + '&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject,ratings_average'
      const r = await fetch(url)
      if (!r.ok) return
      const d = await r.json()
      for (const b of ((d.docs as Raw[]) ?? [])) {
        const pages = (b.number_of_pages_median as number) || null
        const year = (b.first_publish_year as number) || null
        const author = Array.isArray(b.author_name) ? (b.author_name as string[])[0] : undefined
        const tags = Array.isArray(b.subject) ? (b.subject as string[]).slice(0, 8) : [subject]
        const rating = typeof b.ratings_average === 'number'
          ? Math.round((b.ratings_average as number) * 2 * 10) / 10 // 5-point scale → 10
          : null
        out.push({
          external_id: String(b.key),
          external_source: 'openlibrary',
          title: String(b.title ?? 'Untitled'),
          cover_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null,
          year,
          hours: catalogHours({ kind: 'books', pages }),
          tags,
          communityRating: rating,
          category: 'books',
          progress_total: pages,
          book_subtype: 'book',
          metadata: { genres: tags.join(', ') || undefined, author, release_year: year ?? undefined },
        })
      }
    } catch (e) { note(ctx, `openlibrary subject(${subject})`, e) }
  }))
  return out
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function runBrief(brief: Brief, ctx: Ctx): Promise<CandidateRow[]> {
  let rows: CandidateRow[] = []
  if (brief.category === 'games') rows = await discoverGames(brief, ctx)
  else if (brief.category === 'movies' || brief.category === 'tv') rows = await discoverTmdb(brief, ctx)
  else if (brief.category === 'books') {
    rows = brief.subtype === 'manga' ? await discoverManga(brief, ctx) : await discoverBooks(brief, ctx)
  }
  // Seeded rows sort first so the cap can never cut "more like what you loved".
  const ranked = capLength(uniqBy(rows, (r) => `${r.external_source}:${r.external_id}`), brief.maxHours)
    .sort((a, b) => Number(!!b.via) - Number(!!a.via))
  return ranked.slice(0, CANDIDATES_PER_CATEGORY)
}

// Each seed and tag turns into upstream calls, so a request only gets so many.
const MAX_SEEDS = 10
const MAX_TAGS = 12

function boundBrief(b: Brief): Brief {
  const strings = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string').slice(0, MAX_TAGS) : [])
  return {
    ...b,
    includeTags: strings(b.includeTags),
    avoidTags: strings(b.avoidTags),
    seeds: Array.isArray(b.seeds) ? b.seeds.slice(0, MAX_SEEDS) : [],
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUser(req)
  if (denied) return denied
  let briefs: Brief[] = []
  try {
    const body = await req.json()
    briefs = Array.isArray(body?.briefs) ? (body.briefs as Brief[]).slice(0, 6).map(boundBrief) : []
  } catch {
    return NextResponse.json({ candidates: [], error: 'bad_request' }, { status: 400 })
  }
  if (briefs.length === 0) return NextResponse.json({ candidates: [] })

  const ctx: Ctx = { problems: [] }
  const results = await Promise.all(briefs.map(async (b) => {
    try { return await runBrief(b, ctx) } catch (e) { note(ctx, `brief(${b.category})`, e); return [] as CandidateRow[] }
  }))
  return NextResponse.json({
    candidates: results.flat(),
    ...(ctx.problems.length ? { problems: ctx.problems } : {}),
  })
}
