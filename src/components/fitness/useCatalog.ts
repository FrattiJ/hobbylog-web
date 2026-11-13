'use client'

import { useEffect, useState } from 'react'

// The catalog is ~60 KB of generated data, so it only loads where something
// actually needs it: the pickers, the swap sheet and the body map. It's a static
// chunk, fetched once and cached -- no database call behind it.
export function useCatalog() {
  const [mod, setMod] = useState<typeof import('@/lib/fitness/catalog') | null>(null)
  useEffect(() => { import('@/lib/fitness/catalog').then(setMod) }, [])
  return mod
}
