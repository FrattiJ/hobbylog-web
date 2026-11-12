'use client'

import { supabase } from '@/lib/supabaseClient'
import AuthShell, { authLink } from './AuthShell'
import NewPasswordForm from './NewPasswordForm'

// Where a password-reset email lands. The link has already signed the visitor
// in, so this stands between them and the app until they pick a password they
// actually know.
export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  return (
    <AuthShell tagline="Choose a new password to get back into your account.">
      <NewPasswordForm submitLabel="SAVE PASSWORD" onDone={onDone} />
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={() => supabase.auth.signOut()} style={authLink}>Cancel and sign out</button>
      </div>
    </AuthShell>
  )
}
