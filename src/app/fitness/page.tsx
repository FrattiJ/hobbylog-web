'use client'

// Fitness has its own section rather than a /[hobby] backlog list: routines and
// set-by-set logging don't fit the entry/status/rating shape the other hobbies use.
// This static segment takes precedence over the [hobby] dynamic route.
import FitnessPage from '@/components/fitness/FitnessPage'

export default function FitnessRoute() {
  return <FitnessPage />
}
