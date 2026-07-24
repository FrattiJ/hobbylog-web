// Category config ported from the desktop app (src/lib/hobbies.ts), trimmed for the web.
export interface HobbyConfig {
  id: string
  label: string
  pluralLabel: string
  accent: string
  icon: string
}

export const HOBBIES: HobbyConfig[] = [
  { id: 'games',   label: 'Game',    pluralLabel: 'Video Games', accent: '#7c3aed', icon: 'Gamepad2' },
  { id: 'movies',  label: 'Movie',   pluralLabel: 'Movies',      accent: '#dc2626', icon: 'Film' },
  { id: 'tv',      label: 'TV Show', pluralLabel: 'TV Shows',    accent: '#2563eb', icon: 'Tv' },
  { id: 'books',   label: 'Book',    pluralLabel: 'Books',       accent: '#d97706', icon: 'BookOpen' },
  { id: 'gundams', label: 'Project', pluralLabel: 'Projects',    accent: '#059669', icon: 'Bot' },
  { id: 'fitness', label: 'Fitness', pluralLabel: 'Fitness',     accent: '#ea580c', icon: 'Dumbbell' },
  { id: 'art',     label: 'Art',     pluralLabel: 'Art',         accent: '#6366f1', icon: 'Palette' },
]

export const HOBBY_MAP: Record<string, HobbyConfig> = Object.fromEntries(HOBBIES.map((h) => [h.id, h]))

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', in_progress: 'In Progress', completed: 'Completed', dropped: 'Dropped',
}

export const STATUS_COLORS: Record<string, string> = {
  backlog: '#6b7280', in_progress: '#3b82f6', completed: '#22c55e', dropped: '#ef4444',
}
