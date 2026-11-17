import { useEffect } from 'react'

// Filters, tabs and sort order live in the address bar, so a view can be
// bookmarked, shared, reloaded and returned to with the back button.
//
// This goes through window.location and history.replaceState rather than
// useSearchParams: the router picks up native history calls, and reading the
// URL only where it is needed keeps these pages out of the prerendering rules
// that hook brings with it. replaceState, not pushState, so that flicking
// through five filters does not leave five entries to back out of.

/** One query parameter from the current URL, or null. Client only. */
export function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

/** readParam, but only if the value is one of the allowed ones. */
export function readParamOneOf<T extends string>(key: string, allowed: readonly T[]): T | null {
  const v = readParam(key)
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/** Set or clear parameters on the current URL. null, undefined and '' clear. */
export function writeParams(next: Record<string, string | null | undefined>): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(next)) {
    if (value == null || value === '') params.delete(key)
    else params.set(key, value)
  }
  const query = params.toString()
  const target = window.location.pathname + (query ? `?${query}` : '') + window.location.hash
  const current = window.location.pathname + window.location.search + window.location.hash
  if (target !== current) window.history.replaceState(null, '', target)
}

/**
 * Keep a set of parameters in step with component state. Pass null for a value
 * that is at its default, so that a page with nothing filtered has a clean URL.
 * `delayMs` is for text typed into a search box: one write when the typing
 * pauses rather than one per keystroke.
 */
export function useUrlParams(params: Record<string, string | null | undefined>, delayMs = 0): void {
  // The object is new on every render; its contents are what matter.
  const signature = JSON.stringify(params)
  useEffect(() => {
    const next = JSON.parse(signature) as Record<string, string | null>
    if (delayMs === 0) { writeParams(next); return }
    // Cleared on unmount, so a pending write cannot land on the next page's URL.
    const timer = setTimeout(() => writeParams(next), delayMs)
    return () => clearTimeout(timer)
  }, [signature, delayMs])
}
