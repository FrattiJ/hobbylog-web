import { supabase } from './supabaseClient'

// Headers for calls to this app's own /api routes. Those routes spend the app's
// catalog API quotas (TMDB, IGDB, Steam), so they only answer signed-in users;
// this attaches the current session's access token so they can check.
export async function apiAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
