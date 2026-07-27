'use client'

import { useParams, notFound } from 'next/navigation'
import HobbyPage from '@/components/HobbyPage'
import { HOBBY_MAP } from '@/lib/hobbies'
import type { HobbyCategory } from '@/types/database'

export default function HobbyRoute() {
  const hobbyId = useParams().hobby as HobbyCategory
  if (!HOBBY_MAP[hobbyId]) return notFound()
  return <HobbyPage hobbyId={hobbyId} />
}
