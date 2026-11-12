// Recipes live in the shared entries table like any other hobby; everything
// that makes an entry a recipe sits in its metadata under these keys. Rating
// and "notes for next time" reuse the entry's own rating and notes columns.

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface RecipeData {
  ingredients: string[]
  steps: string[]
  meal_tags: string[]
  difficulty: Difficulty | null
  cook_minutes: number | null
}

export const MEAL_TAGS: { id: string; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch',     label: 'Lunch' },
  { id: 'dinner',    label: 'Dinner' },
  { id: 'entree',    label: 'Entree' },
  { id: 'side',      label: 'Side' },
  { id: 'appetizer', label: 'Appetizer' },
  { id: 'dessert',   label: 'Dessert' },
  { id: 'snack',     label: 'Snack' },
  { id: 'baking',    label: 'Baking' },
  { id: 'drink',     label: 'Drink' },
  { id: 'sauce',     label: 'Sauce' },
]

export const MEAL_TAG_LABEL: Record<string, string> = Object.fromEntries(MEAL_TAGS.map((t) => [t.id, t.label]))

export const DIFFICULTIES: { id: Difficulty; label: string; color: string }[] = [
  { id: 'easy',   label: 'Easy',   color: '#22c55e' },
  { id: 'medium', label: 'Medium', color: '#d97706' },
  { id: 'hard',   label: 'Hard',   color: '#ef4444' },
]

export const EMPTY_RECIPE: RecipeData = { ingredients: [], steps: [], meal_tags: [], difficulty: null, cook_minutes: null }

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** Read a recipe out of an entry's metadata, tolerating anything missing or malformed. */
export function readRecipe(metadata: Record<string, unknown> | null | undefined): RecipeData {
  const m = metadata ?? {}
  const d = m.difficulty
  const mins = Number(m.cook_minutes)
  return {
    ingredients: strings(m.ingredients),
    steps: strings(m.steps),
    meal_tags: strings(m.meal_tags),
    difficulty: d === 'easy' || d === 'medium' || d === 'hard' ? d : null,
    cook_minutes: m.cook_minutes != null && Number.isFinite(mins) && mins > 0 ? mins : null,
  }
}

/** The metadata keys a recipe owns, ready to spread into an insert or a metadata_patch. */
export function recipeMetadata(r: RecipeData): Record<string, unknown> {
  return {
    ingredients: r.ingredients,
    steps: r.steps,
    meal_tags: r.meal_tags,
    difficulty: r.difficulty,
    cook_minutes: r.cook_minutes,
  }
}

// One item per line is the whole editing model: it is what a recipe pasted from
// anywhere already looks like. Leading bullets and step numbers are dropped so
// "1. Preheat" and "- 2 eggs" do not end up numbered or bulleted twice.
export function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

export function formatCookTime(minutes: number | null): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
