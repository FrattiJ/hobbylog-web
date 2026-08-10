// Route-level loading UI, shown while a segment's code/render streams in on
// navigation. Kept lightweight and on-brand.
export default function Loading() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.2em', animation: 'pulse-bar 1.4s ease-in-out infinite' }}>
        LOADING…
      </span>
    </div>
  )
}
