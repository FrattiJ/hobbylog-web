// Server-only IGDB helpers (used by /api/search and /api/recommend). IGDB sits
// behind Twitch OAuth, so the token is cached per warm instance and the genre /
// theme id lookups are cached alongside it — they're needed to build the filtered
// discovery queries the suggestion engine asks for.
const TWITCH_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_SECRET = process.env.TWITCH_CLIENT_SECRET

export const igdbConfigured = () => !!(TWITCH_ID && TWITCH_SECRET)

let token: { value: string; exp: number } | null = null

export async function igdbAuth(): Promise<string> {
  if (token && Date.now() < token.exp) return token.value
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  if (!r.ok) throw new Error(`Twitch auth ${r.status}`)
  const d = await r.json()
  token = { value: d.access_token as string, exp: Date.now() + ((d.expires_in as number) - 60) * 1000 }
  return token.value
}

export async function igdbHeaders(): Promise<Record<string, string>> {
  const t = await igdbAuth()
  return { 'Client-ID': TWITCH_ID as string, Authorization: `Bearer ${t}`, 'Content-Type': 'text/plain' }
}

/** POST an Apicalypse query to one IGDB endpoint. */
export async function igdbQuery<T>(endpoint: string, body: string): Promise<T[]> {
  const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, { method: 'POST', headers: await igdbHeaders(), body })
  if (!r.ok) throw new Error(`IGDB ${endpoint} ${r.status}`)
  return (await r.json()) as T[]
}

// Genre and theme vocabularies are small and static; fetch each once per instance.
const vocab: Record<'genres' | 'themes', Map<string, number> | null> = { genres: null, themes: null }

async function igdbVocab(kind: 'genres' | 'themes'): Promise<Map<string, number>> {
  const cached = vocab[kind]
  if (cached) return cached
  const m = new Map<string, number>()
  try {
    for (const row of await igdbQuery<{ id: number; name: string }>(kind, 'fields id,name; limit 100;')) {
      m.set(row.name.toLowerCase(), row.id)
    }
  } catch { /* without the vocab, discovery just falls back to seeds */ }
  if (m.size > 0) vocab[kind] = m
  return m
}

/** Map tag names onto IGDB genre and theme ids, ignoring anything it doesn't know. */
export async function igdbTagIds(names: string[]): Promise<{ genres: number[]; themes: number[] }> {
  const [g, t] = await Promise.all([igdbVocab('genres'), igdbVocab('themes')])
  const genres: number[] = []
  const themes: number[] = []
  for (const n of names) {
    const key = n.toLowerCase()
    const gi = g.get(key)
    if (gi != null) genres.push(gi)
    const ti = t.get(key)
    if (ti != null) themes.push(ti)
  }
  return { genres, themes }
}

/** game id → completion-time tiers in hours, for a batch of games. */
export async function igdbTimeToBeat(ids: number[]): Promise<Map<number, { hastily?: number; normally?: number; completely?: number }>> {
  const out = new Map<number, { hastily?: number; normally?: number; completely?: number }>()
  if (ids.length === 0) return out
  const toH = (s?: number) => (s && s > 0 ? Math.round((s / 3600) * 10) / 10 : undefined)
  try {
    const rows = await igdbQuery<{ game_id: number; hastily?: number; normally?: number; completely?: number }>(
      'game_time_to_beats',
      `fields game_id,hastily,normally,completely; where game_id = (${ids.join(',')}); limit 500;`
    )
    for (const r of rows) {
      out.set(r.game_id, { hastily: toH(r.hastily), normally: toH(r.normally), completely: toH(r.completely) })
    }
  } catch { /* times are best-effort */ }
  return out
}
