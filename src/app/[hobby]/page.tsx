'use client'

import { useParams, notFound } from 'next/navigation'
import HobbyPage from '@/components/HobbyPage'
import { HOBBY_MAP } from '@/lib/hobbies'
import type { HobbyCategory } from '@/types/database'

export default function HobbyRoute() {
  const hobbyId = useParams().hobby as HobbyCategory
  const hobby = HOBBY_MAP[hobbyId]
  // Hobbies with their own section (fitness) are served by a static route that
  // already wins over this one; bail out rather than render an empty backlog.
  if (!hobby || hobby.customSection) return notFound()
  return <HobbyPage hobbyId={hobbyId} />
}
