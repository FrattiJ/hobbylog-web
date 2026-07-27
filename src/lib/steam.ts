import { getEntriesByHobby, updateEntry, insertEntry } from '@/lib/db'

export interface SteamGame { appid: number; name: string; playtime_hours: number }

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
    if (!newlyLinked && !increased) continue

    await updateEntry(entry.id, {
      ...(increased ? { progress_current: hours } : {}),
      metadata_patch: { steam_appid: game.appid, playtime_hours: hours },
    })
    updated++
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
      metadata: { steam_appid: g.appid, playtime_hours: g.playtime_hours, added_via: 'steam' },
      book_subtype: null,
      current_season: null,
      current_episode: null,
      priority: null,
      date_started: null,
      date_completed: null,
    })
    onProgress?.(++n, toAdd.length)
  }
  return n
}
