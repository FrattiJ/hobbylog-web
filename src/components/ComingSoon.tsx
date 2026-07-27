export default function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>SYSTEM / {title.toUpperCase()}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0 }}>{title.toUpperCase()}</h1>
      </div>
      <div style={{ padding: '48px 32px', textAlign: 'center', border: '1px solid var(--border-dim)', borderLeft: '3px solid #7c3aed', background: 'var(--bg-card)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 10 }}>◈ MODULE PENDING</p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mute)', letterSpacing: '0.08em', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>{note}</p>
      </div>
    </div>
  )
}
