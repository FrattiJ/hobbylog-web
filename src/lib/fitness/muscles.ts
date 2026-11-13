// Which muscles an exercise works, and how hard a session hit each one.
//
// Kept free of the catalog on purpose: everything here runs off an exercise's own
// row (its stored muscle, or a guess from its name), so History and Today can
// name muscles without pulling in ~60 KB of generated data. The catalog only adds
// secondary muscles on top, where it's already loaded.

// The seventeen muscles free-exercise-db uses. web_exercises.muscle holds one of
// these strings, so the ids are the catalog's own spelling.
export const MUSCLE_IDS = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms',
  'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps',
  'shoulders', 'traps', 'triceps',
] as const

export type MuscleId = (typeof MUSCLE_IDS)[number]

const MUSCLE_SET = new Set<string>(MUSCLE_IDS)

export function asMuscle(value: string | null | undefined): MuscleId | null {
  return value && MUSCLE_SET.has(value) ? (value as MuscleId) : null
}

// What the gym calls them, not what the anatomy chart does.
export const MUSCLE_LABELS: Record<MuscleId, string> = {
  abdominals: 'Abs',
  abductors: 'Outer hips',
  adductors: 'Inner thighs',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  forearms: 'Forearms',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  lats: 'Lats',
  'lower back': 'Lower back',
  'middle back': 'Mid back',
  neck: 'Neck',
  quadriceps: 'Quads',
  shoulders: 'Shoulders',
  traps: 'Traps',
  triceps: 'Triceps',
}

// Where each one is, for someone who doesn't know the names yet. Shown beside the
// label anywhere a muscle has to be chosen.
export const MUSCLE_WHERE: Record<MuscleId, string> = {
  abdominals: 'stomach and sides',
  abductors: 'outside of the hips',
  adductors: 'inside of the thighs',
  biceps: 'front of the upper arm',
  calves: 'back of the lower leg',
  chest: 'front of the torso',
  forearms: 'lower arm and grip',
  glutes: 'backside',
  hamstrings: 'back of the thigh',
  lats: 'sides of the back, used to pull down',
  'lower back': 'base of the spine',
  'middle back': 'between the shoulder blades, used to row',
  neck: 'neck',
  quadriceps: 'front of the thigh',
  shoulders: 'top of the arm',
  traps: 'neck to shoulder',
  triceps: 'back of the upper arm',
}

// Body regions, for laying out a chooser in an order people can scan.
export const MUSCLE_REGIONS: { label: string; muscles: MuscleId[] }[] = [
  { label: 'Chest and shoulders', muscles: ['chest', 'shoulders'] },
  { label: 'Back', muscles: ['lats', 'middle back', 'traps', 'lower back'] },
  { label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Core', muscles: ['abdominals'] },
  { label: 'Legs', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { label: 'Other', muscles: ['neck'] },
]

// -- Guessing from a name -----------------------------------------------------

// A custom exercise has no muscle unless someone typed one, and a beginner often
// can't. The name nearly always gives it away, though: anything called a squat
// works the quads. First match wins, so the specific patterns sit above the
// general ones they would otherwise be swallowed by ("leg curl" before "curl").
interface Rule { test: RegExp; primary: MuscleId; secondary?: MuscleId[] }

const RULES: Rule[] = [
  { test: /\b(calf|calves)\b/, primary: 'calves' },
  { test: /^neck\b|\bneck (curls?|extensions?|flexions?|stretch(es)?|raises?|bridges?)\b/, primary: 'neck' },
  { test: /\bshrugs?\b/, primary: 'traps' },

  // Core, ahead of "raise", "hang" and "twist" patterns further down.
  { test: /\b(crunch(es)?|sit ?ups?|planks?|(leg|knee) raises?|ab (wheel|roller)|roll ?outs?|russian twists?|wood ?chop(per|pers|s)?|v ?ups?|flutter kicks?|mountain climbers?|hollow|dead ?bugs?|pallof|abs?|obliques?|toes to bar|rotational|side bridges?)\b/, primary: 'abdominals' },

  // Hips and glutes, ahead of "kickback" (triceps) and "bridge".
  { test: /\b(abduct(ion|or|ors)?|clam ?shells?|fire hydrants?|monster walks?|band(ed)? walks?)\b/, primary: 'abductors', secondary: ['glutes'] },
  { test: /\b(adduct(ion|or|ors)?|copenhagen|groin)\b/, primary: 'adductors' },
  { test: /\b(hip thrusts?|glutes?|bridges?|donkey kicks?|pull throughs?)\b/, primary: 'glutes', secondary: ['hamstrings'] },

  // Hamstrings and lower back. Cleans, snatches and swings are hip-hinge work
  // too, and sit here so "hang clean" isn't read as a hang.
  { test: /\b(leg curls?|hamstrings?|nordic|good ?mornings?|romanian|rdl|stiff leg(ged)?|deadlifts?|cleans?|snatch(es)?|swings?)\b/, primary: 'hamstrings', secondary: ['glutes', 'lower back'] },
  { test: /\b(hyperextensions?|back extensions?|supermans?|bird ?dogs?)\b/, primary: 'lower back', secondary: ['glutes', 'hamstrings'] },

  // Quads. "Leg press" has to beat the bare "press" at the bottom.
  { test: /\b(squats?|lunges?|leg press(es)?|leg extensions?|step ?ups?|wall sits?|pistols?|sled (push(es)?|pulls?|drags?)|skaters?|quads?|(box|broad|squat|tuck) jumps?|bounds?|hops?)\b/, primary: 'quadriceps', secondary: ['glutes', 'hamstrings'] },

  // Shoulders: the small rotator and raise work, then overhead pressing.
  { test: /\b(face pulls?|rear delts?|reverse fl(y|ye|ies|yes)|pull ?aparts?|(external|internal) rotations?|(lateral|front|side|t|y|y t w) raises?|upright|arnold|delts?|cuban)\b/, primary: 'shoulders', secondary: ['traps'] },
  { test: /\b((overhead|military|shoulder|push|landmine) press(es)?|ohp|handstand)\b/, primary: 'shoulders', secondary: ['triceps'] },

  // Arms.
  // Isolation work first, so a "triceps extension" doesn't pick up the chest and
  // shoulders that only the pressing movements below it bring in.
  { test: /\b(triceps?|skull ?crushers?|push ?downs?|kickbacks?)\b/, primary: 'triceps' },
  { test: /\b(close grip (bench|press|push ?ups?)|dips?)\b/, primary: 'triceps', secondary: ['chest', 'shoulders'] },
  { test: /\b(wrist|grippers?|farmers?|carry|carries|dead hang|hangs?)\b/, primary: 'forearms', secondary: ['traps'] },
  { test: /\b(curls?|biceps?)\b/, primary: 'biceps', secondary: ['forearms'] },

  // Chest. "Bench" only counts as the lift, not as the thing you jump onto, and
  // an incline or decline press is a chest press whatever it's done with.
  { test: /\b(bench press(es)?|chest|pecs?|push ?ups?|press ?ups?|fl(y|ye|ies|yes)|cross ?overs?|floor press(es)?)\b|^((incline|decline|flat) )?bench$|\b(incline|decline)\b.*\bpress/, primary: 'chest', secondary: ['shoulders', 'triceps'] },

  // Back: pulling down is lats, pulling toward you is the mid back.
  { test: /\b(pull ?ups?|chin ?ups?|pull ?downs?|lats?|pull ?overs?|muscle ?ups?)\b/, primary: 'lats', secondary: ['biceps', 'middle back'] },
  { test: /\b(rows?|t bar|thoracic|thread the needle|open book)\b/, primary: 'middle back', secondary: ['lats', 'biceps'] },

  // Cardio lands on the legs, which is where the catalog puts it too.
  { test: /\b(run(ning)?|jog(ging)?|sprints?|treadmill|walk(ing)?|hik(e|ing)|bik(e|ing)|cycl(e|ing)|elliptical|stairs?|stair ?master|rowing)\b/, primary: 'quadriceps', secondary: ['calves', 'hamstrings', 'glutes'] },
  { test: /\b(jump rope|skipping)\b/, primary: 'calves', secondary: ['quadriceps'] },
  { test: /\bswim(ming)?\b/, primary: 'lats', secondary: ['shoulders'] },

  // A press with no other clue is most often an overhead one.
  { test: /\bpress(es)?\b/, primary: 'shoulders', secondary: ['triceps'] },
]

// Lower-case, and turn every run of punctuation into a space so "Pull-Up",
// "Pull Up" and "pullup" all read the same to the rules.
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface MuscleGuess { primary: MuscleId; secondary: MuscleId[] }

export function guessMuscles(name: string): MuscleGuess | null {
  const n = normalizeName(name)
  if (!n) return null
  for (const r of RULES) {
    if (r.test.test(n)) return { primary: r.primary, secondary: r.secondary ?? [] }
  }
  return null
}

// -- Resolving an exercise ----------------------------------------------------

// Where the answer came from. A guess is shown as one, so it can be corrected.
export type MuscleSource = 'set' | 'catalog' | 'guess' | 'none'

export interface MuscleUse {
  primary: MuscleId[]
  secondary: MuscleId[]
  source: MuscleSource
}

const NONE: MuscleUse = { primary: [], secondary: [], source: 'none' }

interface CatalogMuscles { muscles: string[]; secondary: string[] }

function clean(list: string[]): MuscleId[] {
  return list.map(asMuscle).filter((m): m is MuscleId => m !== null)
}

// The muscles an exercise works, in order of trust: what's stored on the row,
// then the catalog entry it came from, then a guess from the name. Pass the
// catalog entry when the catalog happens to be loaded; without it the answer is
// the same primary muscle with a thinner list of secondaries.
export function musclesFor(
  ex: { name: string; muscle: string | null },
  entry?: CatalogMuscles | null,
): MuscleUse {
  const stored = asMuscle(ex.muscle)
  const fromCatalog = entry ? { primary: clean(entry.muscles), secondary: clean(entry.secondary) } : null
  const guess = guessMuscles(ex.name)

  if (stored) {
    // The stored muscle is the one someone chose, so it always leads. Secondaries
    // are borrowed only from a source that agrees with it about the primary.
    if (fromCatalog?.primary.includes(stored)) {
      return {
        primary: [stored, ...fromCatalog.primary.filter((m) => m !== stored)],
        secondary: fromCatalog.secondary,
        source: 'set',
      }
    }
    if (guess?.primary === stored) return { primary: [stored], secondary: guess.secondary, source: 'set' }
    return { primary: [stored], secondary: [], source: 'set' }
  }

  if (fromCatalog && fromCatalog.primary.length > 0) return { ...fromCatalog, source: 'catalog' }
  if (guess) return { primary: [guess.primary], secondary: guess.secondary, source: 'guess' }
  return NONE
}

// -- How hard a session hit each muscle ---------------------------------------

export interface MuscleTally {
  muscle: MuscleId
  // Sets where this was the main muscle, and sets where it only helped.
  sets: number
  assistSets: number
  // 0..1 against the hardest-hit muscle of the session. Drives the map's shading.
  intensity: number
}

export interface SessionMuscles {
  // Hardest hit first.
  tallies: MuscleTally[]
  byMuscle: Map<MuscleId, MuscleTally>
  // Names of exercises nothing could be worked out for, so the map can say so
  // instead of quietly looking emptier than the session was.
  unmapped: string[]
}

// A set counts in full toward the muscle an exercise targets, and for less
// toward the ones that only assist: a squat is a quad exercise that also works
// the glutes, not half of each.
const ASSIST_WEIGHT = 0.3

export function sessionMuscles(
  work: { name: string; use: MuscleUse; sets: number }[],
): SessionMuscles {
  const raw = new Map<MuscleId, { sets: number; assistSets: number }>()
  const unmapped: string[] = []
  const bump = (m: MuscleId, key: 'sets' | 'assistSets', n: number) => {
    const cur = raw.get(m) ?? { sets: 0, assistSets: 0 }
    cur[key] += n
    raw.set(m, cur)
  }

  for (const w of work) {
    if (w.sets <= 0) continue
    if (w.use.primary.length === 0) { unmapped.push(w.name); continue }
    for (const m of w.use.primary) bump(m, 'sets', w.sets)
    for (const m of w.use.secondary) if (!w.use.primary.includes(m)) bump(m, 'assistSets', w.sets)
  }

  const score = (t: { sets: number; assistSets: number }) => t.sets + t.assistSets * ASSIST_WEIGHT
  const top = Math.max(0, ...[...raw.values()].map(score))

  const tallies: MuscleTally[] = [...raw.entries()]
    .map(([muscle, t]) => ({ muscle, ...t, intensity: top > 0 ? score(t) / top : 0 }))
    .sort((a, b) => b.intensity - a.intensity || a.muscle.localeCompare(b.muscle))

  return { tallies, byMuscle: new Map(tallies.map((t) => [t.muscle, t])), unmapped }
}

// -- Finding a substitute -----------------------------------------------------

// Words that say how or with what, not which movement. Stripped so "Smith
// Machine Squat" and "Dumbbell Squat" are recognised as the same lift.
const FILLER = new Set([
  'smith', 'machine', 'barbell', 'dumbbell', 'dumbbells', 'db', 'bb', 'cable', 'cables',
  'band', 'bands', 'banded', 'kettlebell', 'kettlebells', 'kb', 'ez', 'e', 'z', 'bar',
  'bodyweight', 'weighted', 'assisted', 'plate', 'lever', 'trx',
  'with', 'the', 'a', 'an', 'on', 'of', 'to', 'and', 'using', 'version', 'style',
  'seated', 'standing', 'lying', 'kneeling', 'half',
  'one', 'two', 'single', 'arm', 'alternating', 'alternate',
  'wide', 'close', 'medium', 'narrow', 'grip',
])

// The words that name the movement, singular, e.g. ["incline", "bench", "press"].
export function movementTokens(name: string): string[] {
  const out: string[] = []
  for (const raw of normalizeName(name).split(' ')) {
    if (!raw || FILLER.has(raw)) continue
    // "squats" and "squat" are one word here. "press" keeps its double s.
    const word = raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw
    if (!out.includes(word)) out.push(word)
  }
  return out
}

export type ExerciseKind = 'strength' | 'stretching' | 'cardio'

// Broad kind, so a swap never offers a stretch in place of a lift.
export function kindOf(category: string | null | undefined, trackingType: string, name: string): ExerciseKind {
  if (category === 'stretching' || category === 'cardio') return category
  if (category) return 'strength'
  if (trackingType === 'time_distance') return 'cardio'
  if (/\bstretch/.test(normalizeName(name))) return 'stretching'
  return 'strength'
}

// Equipment most gyms have several of, so a taken machine usually has one of
// these free. Used only to break ties between equally similar movements.
const EQUIPMENT_RANK: Record<string, number> = {
  barbell: 4, dumbbell: 4, machine: 3, cable: 3, 'body only': 3,
  kettlebells: 1, bands: 1, 'e-z curl bar': 1,
}

const CATEGORY_RANK: Record<string, number> = { strength: 6, powerlifting: 3 }

export interface SwapCandidate {
  name: string
  equipment: string | null
  category: string | null
  primary: MuscleId[]
  kind: ExerciseKind
}

// How good a stand-in a candidate is for the target: 0 means not one at all.
// Sharing the target's main muscle is the entry fee; after that it's how much of
// the movement's name carries over, so a squat is offered squats before leg
// extensions even though both are quad work.
export function swapScore(
  target: { name: string; primary: MuscleId[]; kind: ExerciseKind },
  cand: SwapCandidate,
): number {
  if (cand.kind !== target.kind) return 0
  if (!cand.primary.some((m) => target.primary.includes(m))) return 0

  const want = movementTokens(target.name)
  const have = movementTokens(cand.name)
  const shared = want.filter((t) => have.includes(t)).length
  const extra = have.length - shared

  return 10 // any same-muscle exercise is a valid answer
    + (want.length > 0 ? (shared / want.length) * 100 : 0)
    - extra * 3
    + (CATEGORY_RANK[cand.category ?? 'strength'] ?? 0)
    + (EQUIPMENT_RANK[cand.equipment ?? ''] ?? 0)
}
