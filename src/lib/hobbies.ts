import type { HobbyCategory, BookSubtype, EntryStatus } from '@/types/database'

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
  // Progress is a 0–100% completion (total always 100). These hobbies get the
  // build checklist that drives the percentage. e.g. projects, art.
  percentBased?: boolean
  // Hide the 10/10 rating field (doesn't fit productivity-style hobbies).
  hideRating?: boolean
  // This hobby has a purpose-built section instead of the shared backlog list, so
  // it's skipped anywhere the UI assumes "a list of entries with a status". e.g.
  // fitness, which tracks routines, sets and PRs rather than things to finish.
  customSection?: boolean
  // Entries are recipes: ingredients, steps, meal tags, difficulty and cook time
  // in place of a progress bar, and progress_current counts the times it was made.
  recipe?: boolean
  // The statuses this hobby offers, when the full four do not all fit.
  statuses?: EntryStatus[]
  // Wording for those statuses where "backlog" and "completed" read wrong.
  statusLabels?: Partial<Record<EntryStatus, string>>
}

export const HOBBIES: HobbyConfig[] = [
  {
    id: 'games',
    label: 'Game',
    pluralLabel: 'Video Games',
    accent: '#955ff0',
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
    accent: '#e14545',
    icon: 'Film',
    progressLabel: 'Minutes Watched',
    progressUnit: 'min',
    manualOnly: false,
    apiSource: 'tmdb',
  },
  {
    id: 'tv',
    label: 'TV Show',
    pluralLabel: 'TV Shows',
    accent: '#4379ee',
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
    percentBased: true,
    hideRating: true,
  },
  {
    id: 'fitness',
    label: 'Fitness',
    pluralLabel: 'Fitness',
    accent: '#ea580c',
    icon: 'Dumbbell',
    progressLabel: 'Workouts',
    progressUnit: 'workouts',
    manualOnly: true,
    hideRating: true,
    customSection: true,
  },
  {
    id: 'art',
    label: 'Art',
    pluralLabel: 'Art',
    accent: '#6c6ff2',
    icon: 'Palette',
    progressLabel: '% Complete',
    progressUnit: '%',
    manualOnly: true,
    percentBased: true,
  },
  {
    id: 'cooking',
    label: 'Recipe',
    pluralLabel: 'Cooking',
    accent: '#0d9488',
    icon: 'ChefHat',
    progressLabel: 'Times Made',
    progressUnit: 'made',
    manualOnly: true,
    recipe: true,
    // A recipe is either one you mean to try, one you have made, or one you
    // would not make again; there is no "halfway through" worth tracking.
    statuses: ['backlog', 'completed', 'dropped'],
    statusLabels: { backlog: 'To Try', completed: 'Made', dropped: 'Not Again' },
  },
]

// Hobbies that live in the shared entries table. Use this anywhere the UI is about
// backlog items — quick-add, per-category entry counts, completion charts.
export const ENTRY_HOBBIES: HobbyConfig[] = HOBBIES.filter((h) => !h.customSection)

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
  { id: 'audiobook',    label: 'Audiobook',     progressLabel: 'Minutes', progressUnit: 'min', api: 'openlibrary' },
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

const ALL_STATUSES: EntryStatus[] = ['backlog', 'in_progress', 'completed', 'dropped']

/** The statuses to offer for a hobby, in display order. */
export function statusesFor(hobby: HobbyConfig | undefined): EntryStatus[] {
  return hobby?.statuses ?? ALL_STATUSES
}

/** A status's label as this hobby words it ("Made" for a recipe, "Completed" otherwise). */
export function statusLabelFor(hobby: HobbyConfig | undefined, status: string): string {
  return hobby?.statusLabels?.[status as EntryStatus] ?? STATUS_LABELS[status] ?? status
}

export const STATUS_COLORS: Record<string, string> = {
  backlog:     '#8590a0',
  in_progress: '#3b82f6',
  completed:   '#22c55e',
  dropped:     '#ef4444',
}
