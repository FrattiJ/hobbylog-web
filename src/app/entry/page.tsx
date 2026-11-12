'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import EntryDetail from '@/components/EntryDetail'
import { getEntryById } from '@/lib/db'
import type { WebEntry } from '@/lib/entries'

function EntryInner() {
  const id = useSearchParams().get('id') ?? ''
  const router = useRouter()
  const [entry, setEntry] = useState<WebEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!id) { setLoading(false); return }
    getEntryById(id).then((e) => setEntry(e as unknown as WebEntry)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 40, fontFamily: 'var(--font-body)', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Loading…</div>
  if (!entry) return <div style={{ padding: 40, fontFamily: 'var(--font-body)', color: 'var(--text-dim)' }}>Entry not found.</div>

  return <EntryDetail entry={entry} onBack={() => router.push(`/${entry.hobby_category}`)} onChanged={load} />
}

export default function EntryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }} />}>
      <EntryInner />
    </Suspense>
  )
}
