import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig'

// What the auth link that opened this page said, read before the client exists.
//
// A password-reset email lands here with `#access_token=...&type=recovery`, and
// an expired one with `#error=...&error_description=...`. createClient consumes
// that fragment during its own start-up and wipes it from the address bar, and
// it announces PASSWORD_RECOVERY on a timer that can fire before any component
// has subscribed. Reading the fragment here, on the line before the client is
// built, is the one place that cannot lose the race.
const hash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')
const hashParams = new URLSearchParams(hash)

/** True when this page load came from a password-reset email. */
export const arrivedViaRecoveryLink = hashParams.get('type') === 'recovery'

/** Why an emailed link failed (expired, already used), or null. */
export const authLinkError: string | null = hashParams.get('error_description')

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
