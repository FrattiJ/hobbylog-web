import type { HobbyCategory, BookSubtype } from '@/types/database'

export interface HobbyConfig {
  id: HobbyCategory
  label: string
  pluralLabel: string
  accent: string
  icon: string
  progressLabel: string
  progressUnit: string
  manualOnly: boolean
  apiSource?: string
}

export const HOBBIES: HobbyConfig[] = [
  {
    id: 'games',
    label: 'Game',
    pluralLabel: 'Video Games',
    accent: '#7c3aed',
    icon: 'Gamepad2',
    progressLabel: 'Hours Played',
    progressUnit: 'hrs',
    manualOnly: false,
    apiSource: 'igdb',
  },
  {
    id: 'movies',
    label: 'Movie',
    pluralLabel: 'Movies',
    accent: '#dc2626',
    icon: 'Film',
    progressLabel: 'Watch Progress',
    progressUnit: '%',
    manualOnly: false,
    apiSource: 'tmdb',
  },
  {
    id: 'tv',
    label: 'TV Show',
    pluralLabel: 'TV Shows',
    accent: '#2563eb',
    icon: 'Tv',
    progressLabel: 'Episode',
    progressUnit: 'ep',
    manualOnly: false,
    apiSource: 'tmdb',
  },
  {
    id: 'books',
    label: 'Book',
    pluralLabel: 'Books',
    accent: '#d97706',
    icon: 'BookOpen',
    progressLabel: 'Page',
    progressUnit: 'pg',
    manualOnly: false,
    apiSource: 'openlibrary',
  },
  {
    id: 'gundams',
    label: 'Project',
    pluralLabel: 'Projects',
    accent: '#059669',
    icon: 'Bot',
    progressLabel: '% Complete',
    progressUnit: '%',
    manualOnly: true,
  },
  {
    id: 'fitness',
    label: 'Fitness',
    pluralLabel: 'Fitness',
    accent: '#ea580c',
    icon: 'Dumbbell',
    progressLabel: 'Sessions',
    progressUnit: 'sessions',
    manualOnly: true,
  },
  {
    id: 'art',
    label: 'Art',
    pluralLabel: 'Art',
    accent: '#6366f1',
    icon: 'Palette',
    progressLabel: '% Complete',
    progressUnit: '%',
    manualOnly: true,
  },
]

export const HOBBY_MAP: Record<HobbyCategory, HobbyConfig> = Object.fromEntries(
  HOBBIES.map((h) => [h.id, h])
) as Record<HobbyCategory, HobbyConfig>

// Route for each hobby page (hobby id doubles as the route segment)
export const HOBBY_PATHS: Record<HobbyCategory, string> = Object.fromEntries(
  HOBBIES.map((h) => [h.id, `/${h.id}`])
) as Record<HobbyCategory, string>

// ── Books sub-types ───────────────────────────────────────────────────────────

export interface BookSubtypeConfig {
  id: BookSubtype
  label: string
  progressLabel: string
  progressUnit: string
  api: 'openlibrary' | 'jikan' | null
  hasVolume?: boolean
}

export const BOOK_SUBTYPES: BookSubtypeConfig[] = [
  { id: 'book',         label: 'Book',         progressLabel: 'Page',    progressUnit: 'pg',  api: 'openlibrary' },
  { id: 'audiobook',    label: 'Audiobook',     progressLabel: 'Progress', progressUnit: '%',  api: 'openlibrary' },
  { id: 'manga',        label: 'Manga',         progressLabel: 'Chapter', progressUnit: 'ch',  api: 'jikan', hasVolume: true },
  { id: 'comic',        label: 'Comic',         progressLabel: 'Issue',   progressUnit: 'issue',   api: 'openlibrary' },
  { id: 'webtoon',      label: 'Webtoon',       progressLabel: 'Episode', progressUnit: 'ep',  api: null },
  { id: 'light_novel',  label: 'Light Novel',   progressLabel: 'Chapter', progressUnit: 'ch',  api: 'openlibrary' },
]

export const BOOK_SUBTYPE_MAP: Record<BookSubtype, BookSubtypeConfig> = Object.fromEntries(
  BOOK_SUBTYPES.map((s) => [s.id, s])
) as Record<BookSubtype, BookSubtypeConfig>

// ── Shared display helpers ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  backlog:     'Backlog',
  in_progress: 'In Progress',
  completed:   'Completed',
  dropped:     'Dropped',
}

export const STATUS_COLORS: Record<string, string> = {
  backlog:     '#6b7280',
  in_progress: '#3b82f6',
  completed:   '#22c55e',
  dropped:     '#ef4444',
}
