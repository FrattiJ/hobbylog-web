import type { TrackingType } from '@/types/fitness'
import { EQUIPMENT, CATEGORIES, MUSCLES, ROWS, type CatalogRow } from './catalog.data'
import { musclesFor, type MuscleUse } from './muscles'

export interface CatalogExercise {
  id: string
  name: string
  equipment: string
  category: string
  muscles: string[]
  // Muscles that assist. Never repeats a primary one.
  secondary: string[]
}

function expand(r: CatalogRow): CatalogExercise {
  return {
    id: r[0],
    name: r[1],
    equipment: EQUIPMENT[r[2]],
    category: CATEGORIES[r[3]],
    muscles: r[4].map((i) => MUSCLES[i]),
    secondary: r[5].map((i) => MUSCLES[i]),
  }
}

export const CATALOG: CatalogExercise[] = ROWS.map(expand)
export const CATALOG_BY_ID = new Map(CATALOG.map((e) => [e.id, e]))

export const MUSCLE_OPTIONS = [...MUSCLES]
export const EQUIPMENT_OPTIONS = EQUIPMENT.filter(Boolean)

// What to measure for a catalog exercise, before the user overrides it. The
// catalog's own category/equipment fields are a good enough signal: cardio gets
// time + distance, stretches get a hold, unloaded strength work gets plain reps.
export function defaultTracking(e: Pick<CatalogExercise, 'category' | 'equipment'>): TrackingType {
  if (e.category === 'cardio') return 'time_distance'
  if (e.category === 'stretching') return 'time'
  if (e.equipment === 'body only') return 'reps'
  return 'weight_reps'
}

// Gym shorthand the catalog doesn't name directly. It has "Barbell Bench Press -
// Medium Grip", never a plain "Bench Press", so ranking alone puts Bench Dips and
// Bench Jumps above the press. These pin the lift people actually mean.
const ALIAS_NAMES: Record<string, string> = {
  'bench': 'Barbell Bench Press - Medium Grip',
  'bench press': 'Barbell Bench Press - Medium Grip',
  'squat': 'Barbell Squat',
  'back squat': 'Barbell Squat',
  'deadlift': 'Barbell Deadlift',
  'rdl': 'Romanian Deadlift',
  'romanian deadlift': 'Romanian Deadlift',
  'ohp': 'Standing Military Press',
  'overhead press': 'Standing Military Press',
  'military press': 'Standing Military Press',
  'shoulder press': 'Standing Military Press',
  'row': 'Bent Over Barbell Row',
  'barbell row': 'Bent Over Barbell Row',
  'bent over row': 'Bent Over Barbell Row',
  'curl': 'Barbell Curl',
  'bicep curl': 'Barbell Curl',
  'biceps curl': 'Barbell Curl',
  'pullup': 'Pullups',
  'pull up': 'Pullups',
  'pull-up': 'Pullups',
  'pullups': 'Pullups',
  'chinup': 'Chin-Up',
  'chin up': 'Chin-Up',
  'dip': 'Dips - Triceps Version',
  'dips': 'Dips - Triceps Version',
  'leg press': 'Leg Press',
  'lunge': 'Barbell Lunge',
}

// Resolved once. A name that no longer exists (catalog regenerated upstream) is
// simply dropped rather than throwing.
const CATALOG_BY_NAME = new Map(CATALOG.map((e) => [e.name.toLowerCase(), e]))

// The catalog entry behind one of your exercises: the one it was picked from, or
// failing that one with exactly the same name (a custom "Barbell Squat" is still
// a barbell squat).
export function catalogEntryFor(ex: { name: string; catalog_id: string | null }): CatalogExercise | undefined {
  return (ex.catalog_id ? CATALOG_BY_ID.get(ex.catalog_id) : undefined)
    ?? CATALOG_BY_NAME.get(ex.name.trim().toLowerCase())
}

// musclesFor with the catalog's secondary muscles filled in.
export function resolveMuscles(ex: { name: string; muscle: string | null; catalog_id: string | null }): MuscleUse {
  return musclesFor(ex, catalogEntryFor(ex))
}
const ALIASES = new Map<string, CatalogExercise>()
for (const [alias, name] of Object.entries(ALIAS_NAMES)) {
  const hit = CATALOG_BY_NAME.get(name.toLowerCase())
  if (hit) ALIASES.set(alias, hit)
}

// Within a match tier, prefer the kind of exercise someone probably means:
// plain strength work over competition and plyometric variants.
const CATEGORY_RANK: Record<string, number> = {
  strength: 0,
  cardio: 0,
  stretching: 1,
  powerlifting: 1,
  'olympic weightlifting': 2,
  plyometrics: 2,
  strongman: 3,
}

// Ranked substring search: exact name, then prefix, then word-start, then anywhere,
// then a muscle/equipment match. Ties break toward common categories, then shorter names.
export function searchCatalog(query: string, limit = 40): CatalogExercise[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATALOG.slice(0, limit)

  const pinned = ALIASES.get(q)

  const scored: { e: CatalogExercise; score: number }[] = []
  for (const e of CATALOG) {
    if (e === pinned) continue // already first
    const name = e.name.toLowerCase()
    let tier: number
    if (name === q) tier = 0
    else if (name.startsWith(q)) tier = 1
    else if (name.includes(` ${q}`)) tier = 2
    else if (name.includes(q)) tier = 3
    else if (e.muscles.some((m) => m.includes(q)) || e.equipment.includes(q)) tier = 4
    else continue
    scored.push({ e, score: tier * 100_000 + (CATEGORY_RANK[e.category] ?? 2) * 1_000 + name.length })
  }
  scored.sort((a, b) => a.score - b.score)

  const ranked = scored.map((s) => s.e)
  return (pinned ? [pinned, ...ranked] : ranked).slice(0, limit)
}
