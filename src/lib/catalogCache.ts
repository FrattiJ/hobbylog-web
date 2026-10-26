// Caching policy for the catalog proxies (/api/search, /api/details,
// /api/tv-progress).
//
// These routes answer the same question for everyone -- "what does TMDB know
// about Dune" has no per-account component -- and the answers barely move: a
// film's runtime is fixed, a book's page count is fixed, a show gains episodes a
// week at a time. Every keystroke-driven lookup was still reaching upstream
// live, which spends two budgets at once: Vercel function invocations, and the
// per-key request quotas that are far smaller and fail far more rudely when
// exhausted (RAWG's free tier is ~20k/month, and a search spike is precisely
// when you don't want the catalog to start returning nothing).
//
// Two layers, because they catch different misses:
//
//  * `catalogCacheHeaders` lets the CDN answer a repeat request without running
//    the function at all. This is the layer that matters when a hundred people
//    look up the same title in the same hour -- which is what a launch is.
//
//  * `UPSTREAM_CACHE` opts the outbound GETs into Next's data cache, so a CDN
//    miss (a different spelling, a cold region) still often avoids the upstream
//    call. Next stopped caching fetches by default in 15, hence the explicit
//    opt-in. The POST-based upstreams -- IGDB and AniList -- cannot use it and
//    lean on the CDN layer alone.

const DAY = 86_400
const WEEK = 7 * DAY

/** A day fresh, then served stale for a week while it revalidates behind the
 *  request. Nobody waits on a catalog refresh. */
export const catalogCacheHeaders = {
  'Cache-Control': `public, s-maxage=${DAY}, stale-while-revalidate=${WEEK}`,
}

/** Degraded answers are never cached. An upstream outage lasts minutes; pinning
 *  its empty result list in front of the real one would last a day. */
export const noCacheHeaders = { 'Cache-Control': 'no-store' }

/** For catalog lookups: titles, runtimes, page counts, episode lists. */
export const UPSTREAM_CACHE = { next: { revalidate: DAY } }

/** For the vocabularies -- TMDB's genre lists are effectively frozen. */
export const UPSTREAM_CACHE_WEEK = { next: { revalidate: WEEK } }
