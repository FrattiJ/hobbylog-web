import { NextRequest, NextResponse } from 'next/server'
import { baseUrl } from '../base'

// Kicks off "Sign in through Steam" (OpenID 2.0). The browser navigates here, we
// bounce it to Steam's login page; Steam sends the user back to /api/steam/verify.
// No API key needed for this step — OpenID just proves which Steam account they own.
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const base = baseUrl(req)
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${base}/api/steam/verify`,
    'openid.realm': base,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })
  return NextResponse.redirect(`https://steamcommunity.com/openid/login?${params.toString()}`)
}
