import { useEffect, useState } from 'react'

// Fill colours for chart marks, one set per theme. Each set was run through the
// dataviz palette validator against that theme's card surface (#0d1117 dark,
// #eef2f7 light): lightness band, chroma floor, colour-blind separation and at
// least 3:1 against the surface. They are the app's own hues (the green of
// "completed", the brand violet, the amber of ratings, the cyan of logged time)
// stepped to where they pass; the light theme needs darker steps of each.
//
// These are for marks only. Text beside a chart uses the text tokens, never
// the series colour.
const DARK = { finished: '#1a9e4e', added: '#a577f2', rating: '#d97706', hours: '#099bbe' }
const LIGHT = { finished: '#15803d', added: '#7c3aed', rating: '#b45309', hours: '#0b7fa3' }

export type ChartPalette = typeof DARK

/** The mark colours for the theme in use, following a theme switch while mounted. */
export function useChartPalette(): ChartPalette {
  const [light, setLight] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const read = () => setLight(root.dataset.theme === 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return light ? LIGHT : DARK
}

/** True when the reader has asked for less motion; charts then draw without animating in. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setReduced(mq.matches)
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])
  return reduced
}
