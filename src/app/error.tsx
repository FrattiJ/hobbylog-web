'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

// Root error boundary — renders inside the layout, so the nav stays put while a
// page segment recovers. Next 16 passes `unstable_retry` (not `reset`).
export default function Error({ error, unstable_retry }: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 460, width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderLeft: '3px solid #ef4444', padding: 28 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#ef4444', letterSpacing: '0.08em', margin: '0 0 8px' }}>Something went wrong</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.02em', margin: '0 0 10px' }}>Something broke</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, margin: '0 0 20px' }}>
          That view hit an unexpected error. Your data is safe — try again, and if it keeps happening, send a note from Settings → Feedback.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => unstable_retry()}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#955ff0', background: '#955ff022', border: '1px solid #955ff0', borderLeft: '3px solid #955ff0', cursor: 'pointer' }}>
            Try Again
          </button>
          <button onClick={() => { window.location.href = '/' }}
            style={{ padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
