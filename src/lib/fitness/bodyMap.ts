import type { MuscleId } from './muscles'

// The body map's drawing: a front and a back figure built entirely out of
// muscle-shaped pieces, so lighting one up is just a fill.
//
// Each figure sits in a 100 x 176 box with the spine on x = 50. Paired pieces are
// drawn once, for the left half, and mirrored across the spine when rendered;
// that halves the path data and guarantees the two sides match.

export interface BodyPiece {
  // Null for the parts that aren't a trainable muscle: head, hands, knees, feet.
  muscle: MuscleId | null
  d: string
  // Draw a second copy flipped across x = 50.
  mirror: boolean
}

export const BODY_VIEWBOX = '0 0 100 176'

const HEAD: BodyPiece = { muscle: null, mirror: false, d: 'M42.5 13a7.5 9.5 0 1 0 15 0a7.5 9.5 0 1 0-15 0Z' }
const NECK: BodyPiece = { muscle: 'neck', mirror: false, d: 'M46.2 22.5Q50 24.5 53.8 22.5L54.6 28.6Q50 30.6 45.4 28.6Z' }
const SHOULDER = 'M33.6 31.2Q27 30.6 24.4 36Q22.6 41 24 46.6Q29.6 44.6 34.4 38.4Q35.6 34.4 33.6 31.2Z'
const UPPER_ARM = 'M24.6 48.4Q29.8 46.4 33.6 41.4Q34.4 51 31.6 60.6Q28 63.4 24.2 61Q22.8 54.4 24.6 48.4Z'
const FOREARM = 'M23.6 63.6Q27.8 65.8 31.2 63.2Q30.2 76 25.4 88.4L20.6 87.4Q20.2 74.6 23.6 63.6Z'
const HAND: BodyPiece = { muscle: null, mirror: true, d: 'M20.4 89.6L25 90.6Q25.6 96 23 99.4Q20 100 18.8 96.6Q18.8 92.6 20.4 89.6Z' }
const KNEE: BodyPiece = { muscle: null, mirror: true, d: 'M37.2 124.4a4 3 0 1 0 8 0a4 3 0 1 0-8 0Z' }
const FOOT: BodyPiece = { muscle: null, mirror: true, d: 'M39.2 165.4L44 165.4Q45.2 170 44.2 172.6L36.4 172.6Q36.4 168.4 39.2 165.4Z' }

export const BODY_FRONT: BodyPiece[] = [
  HEAD,
  NECK,
  { muscle: 'traps', mirror: true, d: 'M44.4 25.2L44.6 30.2Q39 31 34.5 30.4Q41 28.6 44.4 25.2Z' },
  { muscle: 'shoulders', mirror: true, d: SHOULDER },
  { muscle: 'chest', mirror: true, d: 'M36.6 32.6Q43 31.2 49.2 32.8L49.2 45.8Q44 49 38.6 46.4Q35.4 42.6 36.6 32.6Z' },
  { muscle: 'biceps', mirror: true, d: UPPER_ARM },
  { muscle: 'forearms', mirror: true, d: FOREARM },
  HAND,
  // Abs as four rows either side of the midline, then the obliques outside them.
  { muscle: 'abdominals', mirror: true, d: 'M44.2 49.4Q46.8 50.2 49.3 48.8L49.3 54.6L44 54.6Z' },
  { muscle: 'abdominals', mirror: true, d: 'M44 56L49.3 56L49.3 61.8L43.9 61.8Z' },
  { muscle: 'abdominals', mirror: true, d: 'M43.9 63.2L49.3 63.2L49.3 69L44 69Z' },
  { muscle: 'abdominals', mirror: true, d: 'M44 70.4L49.3 70.4L49.3 79.6Q46 77.6 44.4 74Z' },
  { muscle: 'abdominals', mirror: true, d: 'M37.6 48.8Q40.2 50.6 42.8 50.2L42.6 62Q42.6 69 43.4 73.4Q40.4 72.6 38.6 69.6Q36.8 58.6 37.6 48.8Z' },
  { muscle: 'abductors', mirror: true, d: 'M37.2 72Q38.6 74.6 38.8 78.6Q36.2 83.6 34.6 91Q33 84 34.2 77Q35.4 73.6 37.2 72Z' },
  { muscle: 'quadriceps', mirror: true, d: 'M40 79.6Q43.4 79.4 45.6 82.6Q46.8 100 45.2 117.6Q41.2 121.2 37.2 118.2Q33.8 104 35.2 93Q36.8 85 40 79.6Z' },
  { muscle: 'adductors', mirror: true, d: 'M46.8 81.4Q48.4 80.2 49.3 81.2L49.3 99.6Q48.2 107.6 46.5 111.6Q47.4 96 46.8 81.4Z' },
  KNEE,
  // The shin stands in for the calves from the front, as on most muscle charts.
  { muscle: 'calves', mirror: true, d: 'M37 129.6Q41.2 131.2 45.2 129.6Q46.2 145 43.6 163L39.6 163Q35.6 146 37 129.6Z' },
  FOOT,
]

export const BODY_BACK: BodyPiece[] = [
  HEAD,
  NECK,
  { muscle: 'traps', mirror: true, d: 'M49.4 23.8L45.6 24Q41.4 29.4 34.4 30.8Q42 33.6 45.4 39.6L49.4 49.6Z' },
  { muscle: 'shoulders', mirror: true, d: SHOULDER },
  { muscle: 'middle back', mirror: true, d: 'M36.4 34.4Q42 36 44.4 41L48.4 51.2Q43 50.8 39.4 47.4Q36.6 42 36.4 34.4Z' },
  { muscle: 'lats', mirror: true, d: 'M36.2 45Q38.8 49.6 43 52.4Q46 53.4 49.3 53.2L49.3 59.6Q44.6 64 41.8 70.6Q38 62 36.4 54Q35.6 49 36.2 45Z' },
  { muscle: 'lower back', mirror: true, d: 'M49.3 61.6L49.3 77.4Q45.4 76.6 43 73.2Q44.2 66.6 49.3 61.6Z' },
  { muscle: 'triceps', mirror: true, d: UPPER_ARM },
  { muscle: 'forearms', mirror: true, d: FOREARM },
  HAND,
  { muscle: 'abductors', mirror: true, d: 'M37 71.4Q38.2 73.4 37.8 75.6Q35.6 80 35 86Q33.2 80 34.4 75.6Q35.4 73 37 71.4Z' },
  { muscle: 'glutes', mirror: true, d: 'M38.8 76.2Q44 75.2 49.3 78.2L49.3 93.4Q44 96.6 38.6 94Q35.4 86 38.8 76.2Z' },
  { muscle: 'hamstrings', mirror: true, d: 'M36.2 96.6Q41 99.6 45.8 97.6Q46.8 108 45 119.4Q41 122 37 119.4Q34 108 36.2 96.6Z' },
  { muscle: 'adductors', mirror: true, d: 'M46.9 98.4Q48.4 97.2 49.3 97.4L49.3 104Q48.2 110 46.7 113Q47.5 105 46.9 98.4Z' },
  KNEE,
  { muscle: 'calves', mirror: true, d: 'M36.4 128.4Q41 126.4 45.6 128.4Q47.2 138 44.6 149Q43.6 156 43.4 163L39.6 163Q39 155 37 148Q34.6 138 36.4 128.4Z' },
  FOOT,
]
