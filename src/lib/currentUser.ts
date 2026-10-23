import { supabase } from './supabaseClient'

// The user id every data helper needs in order to scope its query.
//
// This used to be `supabase.auth.getUser()`, which is not a local read: it sends
// GET /auth/v1/user to revalidate the JWT on every single call. Since practically
// every helper in lib/db.ts and lib/fitness/db.ts starts by asking who you are,
// one screen could fire dozens of those on top of its actual queries -- which is
// what made the app expensive to open on a phone, where each round trip wakes the
// radio.
//
// getSession() reads the JWT that's already in storage, no network. The id it
// yields is only ever used to filter queries; it is never the security boundary.
// Postgres re-derives auth.uid() from the JWT itself on every PostgREST request,
// so a stale or tampered id here returns no rows rather than someone else's.
let cached: string | null = null
let inflight: Promise<string> | null = null

export async function currentUserId(): Promise<string> {
  if (cached !== null) return cached
  // Collapse the burst of concurrent calls a page load makes into one read.
  if (!inflight) {
    inflight = supabase.auth.getSession()
      .then(({ data }) => {
        const id = data.session?.user?.id ?? ''
        cached = id
        return id
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

// Signing in, signing out or switching accounts must not leave the previous id
// behind. Clearing to null (rather than '') sends the next caller back to storage.
supabase.auth.onAuthStateChange((_event, session) => {
  cached = session?.user?.id ?? null
})
