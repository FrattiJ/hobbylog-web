'use client'

import { createContext, useContext } from 'react'
import type { HobbyCategory } from '@/types/database'
import { HOBBIES, type HobbyConfig } from '@/lib/hobbies'

interface HobbyContextValue {
  /** Categories the user has chosen to track */
  enabledIds: HobbyCategory[]
  /** Hobby configs for the enabled categories, in canonical order */
  enabledHobbies: HobbyConfig[]
  /** Persist a new set of tracked categories */
  setEnabledIds: (ids: HobbyCategory[]) => Promise<void>
}

export const HobbyContext = createContext<HobbyContextValue>({
  enabledIds: HOBBIES.map((h) => h.id),
  enabledHobbies: HOBBIES,
  setEnabledIds: async () => {},
})

export function useHobbies() {
  return useContext(HobbyContext)
}
