import type { NextRequest } from 'next/server'

// The public origin of the current request, respecting Vercel's proxy headers.
// Steam OpenID needs return_to / realm to match the host the user actually came from.
export function baseUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  return `${proto}://${host}`
}
