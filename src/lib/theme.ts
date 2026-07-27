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
