import type { TrackingType } from '@/types/fitness'
import { EQUIPMENT, CATEGORIES, MUSCLES, ROWS, type CatalogRow } from './catalog.data'

export interface CatalogExercise {
  id: string
  name: string
  equipment: string
  category: string
  muscles: string[]
}

function expand(r: CatalogRow): CatalogExercise {
  return {
    id: r[0],
    name: r[1],
    equipment: EQUIPMENT[r[2]],
    category: CATEGORIES[r[3]],
    muscles: r[4].map((i) => MUSCLES[i]),
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

// Ranked substring search. Exact match first, then prefix, then word-start, then
// anywhere — so "bench" surfaces "Bench Press" above "Dumbbell Bench Press ...".
export function searchCatalog(query: string, limit = 40): CatalogExercise[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATALOG.slice(0, limit)

  const scored: { e: CatalogExercise; score: number }[] = []
  for (const e of CATALOG) {
    const name = e.name.toLowerCase()
    let score: number
    if (name === q) score = 0
    else if (name.startsWith(q)) score = 1
    else if (name.includes(` ${q}`)) score = 2
    else if (name.includes(q)) score = 3
    else if (e.muscles.some((m) => m.includes(q)) || e.equipment.includes(q)) score = 4
    else continue
    // Shorter names win within a tier: "Squat" before "Squat with Bands".
    scored.push({ e, score: score * 1000 + name.length })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.e)
}
