import { NextRequest, NextResponse } from 'next/server'
import { baseUrl } from '../base'

// Steam redirects the user back here after they authorize. We confirm the response
// is genuine by asking Steam to re-check it (check_authentication), extract the
// 17-digit SteamID64, look up their persona name, then hand the verified id back to
// the client via /settings — the client (which holds the Supabase session) links it.
export const runtime = 'nodejs'

const STEAM = process.env.STEAM_API_KEY

export async function GET(req: NextRequest) {
  const base = baseUrl(req)
  const params = req.nextUrl.searchParams

  // Re-post every openid.* param back to Steam with mode=check_authentication.
  const check = new URLSearchParams()
  params.forEach((v, k) => check.set(k, v))
  check.set('openid.mode', 'check_authentication')

  let valid = false
  try {
    const r = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: check.toString(),
    })
    valid = /is_valid\s*:\s*true/i.test(await r.text())
  } catch {
    return NextResponse.redirect(`${base}/import?steam_error=network`)
  }
  if (!valid) return NextResponse.redirect(`${base}/import?steam_error=verify`)

  const steamId = (params.get('openid.claimed_id') ?? '').match(/(\d{17})\/?$/)?.[1]
  if (!steamId) return NextResponse.redirect(`${base}/import?steam_error=noid`)

  // Best-effort persona name for a friendly "Connected as …" label.
  let persona = ''
  if (STEAM) {
    try {
      const s = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM}&steamids=${steamId}`)
      if (s.ok) persona = (await s.json())?.response?.players?.[0]?.personaname ?? ''
    } catch { /* non-fatal */ }
  }

  const out = new URLSearchParams({ steam_linked: steamId })
  if (persona) out.set('steam_name', persona)
  return NextResponse.redirect(`${base}/import?${out.toString()}`)
}
