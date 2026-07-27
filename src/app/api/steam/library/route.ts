import { NextRequest, NextResponse } from 'next/server'

// Reads a user's owned games + playtime using the app's single shared Steam Web API
// key (server-side env var, never exposed to the browser). The caller passes only a
// public SteamID64 — this is what lets friends sync without registering their own key.
export const runtime = 'nodejs'

const STEAM = process.env.STEAM_API_KEY

export interface SteamLibGame { appid: number; name: string; playtime_hours: number }

export async function GET(req: NextRequest) {
  const steamid = req.nextUrl.searchParams.get('steamid') ?? ''
  if (!/^\d{17}$/.test(steamid)) return NextResponse.json({ error: 'bad_steamid' }, { status: 400 })
  if (!STEAM) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  let d: { response?: { games?: Array<{ appid: number; name: string; playtime_forever: number }> } }
  try {
    const r = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true&format=json`)
    if (r.status === 403) return NextResponse.json({ error: 'bad_key' }, { status: 502 })
    if (!r.ok) return NextResponse.json({ error: `steam_${r.status}` }, { status: 502 })
    d = await r.json()
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 })
  }

  const games = d.response?.games
  // GetOwnedGames returns an empty object (no `games`) when Game Details is private.
  if (!games) return NextResponse.json({ error: 'private', results: [] })

  const results: SteamLibGame[] = games.map((g) => ({
    appid: g.appid,
    name: g.name,
    playtime_hours: Math.round((g.playtime_forever / 60) * 10) / 10,
  }))
  return NextResponse.json({ results })
}
