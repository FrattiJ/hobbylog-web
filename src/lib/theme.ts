export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'hobbylog-theme'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light'
  } else {
    delete document.documentElement.dataset.theme
  }
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

// ── Display size (accessibility + compact view) ────────────────────────────────
// Scales the whole UI via CSS zoom, so px-based type and card density move together.
export type DisplaySize = 'compact' | 'normal' | 'large' | 'xl'

const SIZE_KEY = 'hobbylog-display-size'
const SIZE_ZOOM: Record<DisplaySize, string> = { compact: '0.9', normal: '1', large: '1.15', xl: '1.3' }

export function getDisplaySize(): DisplaySize {
  if (typeof window === 'undefined') return 'normal'
  const v = localStorage.getItem(SIZE_KEY)
  return v === 'compact' || v === 'large' || v === 'xl' ? v : 'normal'
}

export function applyDisplaySize(size: DisplaySize) {
  if (typeof document === 'undefined') return
  ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = SIZE_ZOOM[size]
}

export function setDisplaySize(size: DisplaySize) {
  localStorage.setItem(SIZE_KEY, size)
  applyDisplaySize(size)
}
