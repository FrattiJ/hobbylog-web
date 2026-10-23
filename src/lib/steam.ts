import { getEntriesByHobby, updateEntry, insertEntry } from '@/lib/db'
import { searchCatalog } from '@/lib/search'

export interface SteamGame { appid: number; name: string; playtime_hours: number; last_played: string | null }

// Steam names carry trademark glyphs that manual titles won't have
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[™®©]/g, '').trim()
}

// Fetch the linked account's library via our server route (which holds the API key).
export async function fetchSteamLibrary(steamId: string): Promise<SteamGame[]> {
  const r = await fetch(`/api/steam/library?steamid=${encodeURIComponent(steamId)}`)
  const d = await r.json().catch(() => ({}))
  if (d.error === 'not_configured') throw new Error("Steam isn't set up on the server yet — the STEAM_API_KEY env var is missing.")
  if (d.error === 'bad_key') throw new Error('The server\'s Steam API key was rejected. Double-check STEAM_API_KEY in Vercel.')
  if (d.error === 'private') throw new Error('Your Steam library is private. In Steam: Profile → Edit Profile → Privacy → set Game Details to Public, then try again.')
  if (!r.ok) throw new Error(`Steam sync failed (${d.error ?? r.status}).`)
  return (d.results ?? []) as SteamGame[]
}

// Pull current Steam playtime into games already tracked. Matches by stored appid
// first, then by exact title for manually-added games (linking the appid so future
// syncs are direct). Playtime only ever increases an entry's hours.
//
// Steam's own last-played date is stored alongside, and a write that only records
// bookkeeping (appid, last-played, unchanged playtime) passes `touch: false` so it
// doesn't read as you having picked the game up. Actually gaining hours does touch
// the entry — that is real play.
export async function syncSteamPlaytime(steamId: string): Promise<number> {
  const library = await fetchSteamLibrary(steamId)
  const byAppid = new Map(library.map((g) => [g.appid, g]))
  const byTitle = new Map(library.map((g) => [normalizeTitle(g.name), g]))

  const entries = await getEntriesByHobby('games')
  let updated = 0
  for (const entry of entries) {
    const storedAppid = (entry.metadata?.steam_appid as number | undefined)
      ?? (entry.external_source === 'steam' && entry.external_id ? Number(entry.external_id) : undefined)
    const game = storedAppid != null ? byAppid.get(storedAppid) : byTitle.get(normalizeTitle(entry.title))
    if (!game) continue

    const newlyLinked = storedAppid == null
    const hours = game.playtime_hours
    const increased = hours > (entry.progress_current || 0)
    const lastPlayedChanged = game.last_played != null
      && game.last_played !== (entry.metadata?.steam_last_played as string | undefined)
    if (!newlyLinked && !increased && !lastPlayedChanged) continue

    await updateEntry(entry.id, {
      ...(increased ? { progress_current: hours } : {}),
      metadata_patch: {
        steam_appid: game.appid,
        playtime_hours: hours,
        ...(game.last_played ? { steam_last_played: game.last_played } : {}),
      },
    }, { touch: increased })
    if (increased) updated++
  }
  return updated
}

// Fill in a Main-Story time-to-beat (from IGDB) for tracked games that don't
// have one yet — e.g. everything imported from Steam, which only carries playtime.
// Looks each title up in the catalog; never overwrites an existing time-to-beat.
export async function backfillGameTimeToBeat(onProgress?: (done: number, total: number) => void): Promise<number> {
  const games = await getEntriesByHobby('games')
  const targets = games.filter((g) => g.metadata?.time_to_beat == null)
  let done = 0, updated = 0
  onProgress?.(0, targets.length)
  const BATCH = 4 // IGDB allows ~4 req/s
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(targets.slice(i, i + BATCH).map(async (g) => {
      try {
        const hits = await searchCatalog('games', g.title)
        const lower = g.title.toLowerCase()
        const hit = hits.find((h) => h.title.toLowerCase() === lower) ?? hits[0]
        const ttb = hit?.metadata?.time_to_beat
        const n = typeof ttb === 'number' ? ttb : ttb != null ? Number(ttb) : NaN
        if (!isNaN(n) && n > 0) { await updateEntry(g.id, { metadata_patch: { time_to_beat: n } }, { touch: false }); updated++ }
      } catch { /* skip this one; a later sync retries it */ }
      onProgress?.(++done, targets.length)
    }))
  }
  return updated
}

// How many Steam games aren't tracked yet (for a "Import N new games" prompt).
export async function countUntrackedSteam(steamId: string): Promise<number> {
  return (await untrackedSteamGames(steamId)).length
}

async function untrackedSteamGames(steamId: string): Promise<SteamGame[]> {
  const library = await fetchSteamLibrary(steamId)
  const entries = await getEntriesByHobby('games')
  const known = new Set<string>()
  for (const e of entries) {
    const appid = (e.metadata?.steam_appid as number | undefined)
      ?? (e.external_source === 'steam' && e.external_id ? Number(e.external_id) : undefined)
    if (appid != null) known.add(`id:${appid}`)
    known.add(`t:${normalizeTitle(e.title)}`)
  }
  return library.filter((g) => !known.has(`id:${g.appid}`) && !known.has(`t:${normalizeTitle(g.name)}`))
}

// Add Steam games not already tracked. Games with playtime become IN PROGRESS, the
// rest land in the BACKLOG. Cover art comes from Steam's CDN.
export async function importSteamLibrary(steamId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const toAdd = await untrackedSteamGames(steamId)
  let n = 0
  for (const g of toAdd) {
    await insertEntry({
      hobby_category: 'games',
      title: g.name,
      status: g.playtime_hours > 0 ? 'in_progress' : 'backlog',
      rating: null,
      notes: null,
      progress_current: g.playtime_hours,
      progress_total: null,
      cover_url: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
      external_id: String(g.appid),
      external_source: 'steam',
      metadata: {
        steam_appid: g.appid,
        playtime_hours: g.playtime_hours,
        ...(g.last_played ? { steam_last_played: g.last_played } : {}),
        added_via: 'steam',
      },
      book_subtype: null,
      current_season: null,
      current_episode: null,
      priority: null,
      // Steam can't say when you *started*, but if it has been played at all then
      // some start date is truer than none; last-played is the best available.
      date_started: g.playtime_hours > 0 ? (g.last_played?.slice(0, 10) ?? null) : null,
      date_completed: null,
    })
    onProgress?.(++n, toAdd.length)
  }
  return n
}
