'use client'

// What sits under a progressively mounted list: the element the observer
// watches, and while there is more to come, a count and a button. The button
// is how a keyboard or screen-reader user asks for the next batch, and the
// fallback where IntersectionObserver is unavailable.
export default function ListFooter({ sentinel, shown, total, done, more, noun = 'entries' }: {
  sentinel: React.RefObject<HTMLDivElement | null>
  shown: number
  total: number
  done: boolean
  more: () => void
  noun?: string
}) {
  return (
    <>
      <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
      {!done && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '24px 0 4px' }}>
          <span role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-dim)' }}>
            Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
          </span>
          <button type="button" onClick={more}
            style={{ minHeight: 38, padding: '0 14px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', background: 'var(--bg-card)', border: '1px solid var(--border-dim)', cursor: 'pointer' }}>
            Show More
          </button>
        </div>
      )}
    </>
  )
}
