import { useEffect, useRef, useState } from 'react'

// A long list is mounted a batch at a time as the reader approaches the end of
// what is already there, instead of all at once.
//
// This is deliberately not a windowing virtualiser. Those unmount what scrolls
// out of view, which breaks the browser's find-in-page for anything off screen
// and needs fixed row geometry that a responsive cover grid does not have.
// Mounting in batches bounds the work a page does on arrival, which is where a
// library of several hundred entries actually hurts; the rows themselves then
// use content-visibility so the browser skips layout and paint for whatever is
// off screen (see .tile and .card-link in globals.css).

export function useProgressive(total: number, resetKey: string, batch = 60) {
  const [count, setCount] = useState(batch)
  const sentinel = useRef<HTMLDivElement>(null)

  // A different filter or sort is a different list: start again from the top.
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) { setSeenKey(resetKey); setCount(batch) }

  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= total || typeof IntersectionObserver === 'undefined') return
    // Start loading the next batch well before the end is on screen. Each time
    // count changes this observer is rebuilt, and a new observer reports its
    // target's current state at once, so it keeps going until the sentinel has
    // been pushed out of range.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(total, c + batch))
    }, { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [count, total, batch])

  const shown = Math.min(count, total)
  return {
    /** How many items to render. */
    shown,
    /** Put this on an empty element directly after the list. */
    sentinel,
    /** True once everything is mounted. */
    done: shown >= total,
    /** For the "Show more" button, which is also the path without IntersectionObserver. */
    more: () => setCount((c) => Math.min(total, c + batch)),
  }
}
