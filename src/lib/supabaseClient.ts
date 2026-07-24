import { createClient } from '@supabase/supabase-js'

// The anon key is designed to be public (it only grants what Row-Level Security allows).
// Real secrets (RAWG/TMDB keys, service role) will live server-side in a later phase.
const SUPABASE_URL = 'https://zicyhxiquhxprhfgekdp.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppY3loeGlxdWh4cHJoZmdla2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTc3MjEsImV4cCI6MjA5ODc3MzcyMX0.U-Z3u0ArVk2iUjp4hD7ksVdD1OVptDtenWPtS7scRoM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
