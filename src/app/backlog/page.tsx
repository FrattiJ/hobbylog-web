'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ListOrdered } from 'lucide-react'
import { getAllEntries, setGlobalPriorities } from '@/lib/db'
import { HOBBY_MAP, STATUS_LABELS } from '@/lib/hobbies'
import { useToast } from '@/components/Toast'
import type { Entry } from '@/types/database'

// One unified, cross-hobby priority list for everything still in the backlog —
// so "I have an hour free, what do I tackle?" has a single answer. Independent of
// each hobby's own rank.
export default function BacklogPage() {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [list, setList] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    getAllEntries().then((all) => {
      const backlog = all.filter((e) => e.status === 'backlog')
      backlog.sort((a, b) => {
        const ap = a.global_priority ?? Infinity, bp = b.global_priority ?? Infinity
        if (ap !== bp) return ap - bp
        return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0
      })
      setList(backlog)
    }).catch(() => toastError('Could not load your backlog')).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function move(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= list.length) return
    const id = list[index].id
    const next = [...list]
    ;[next[index], next[to]] = [next[to], next[index]]
    setList(next) // optimistic
    setFlashId(id); setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 500)
    setGlobalPriorities(next.map((e) => e.id)).catch(() => toastError('Could not save the new order — try again'))
  }

  return (
    <div style={{ padding: 32, maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 4 }}>QUEUE / PRIORITY</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.08em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ListOrdered size={20} /> BACKLOG PRIORITY
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
          Rank everything you want to get to next, across every hobby. Reorder with the arrows — top of the list is what to tackle first. Per-hobby ranks stay separate.
        </p>
      </div>

      {loading && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>LOADING…</p>}
      {!loading && list.length === 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Nothing in your backlog yet. Add something you want to get to and it&apos;ll show up here to prioritize.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((e, idx) => {
          const hobby = HOBBY_MAP[e.hobby_category]
          const accent = hobby?.accent ?? '#7c3aed'
          return (
            <div key={e.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: flashId === e.id ? `${accent}22` : 'var(--bg-card)', border: `1px solid ${flashId === e.id ? accent : 'var(--border-dim)'}`, borderLeft: `3px solid ${accent}`, transition: 'background 0.45s ease, border-color 0.45s ease' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: accent, width: 26, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
              {e.cover_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={e.cover_url} alt="" style={{ width: 34, height: 48, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 34, height: 48, background: 'var(--bg-base)', flexShrink: 0 }} />}
              <button onClick={() => router.push(`/entry?id=${e.id}`)}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '1px 6px', background: `${accent}18`, color: accent, border: `1px solid ${accent}44` }}>{hobby?.label ?? e.hobby_category}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{STATUS_LABELS[e.status]}</span>
                </div>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up"
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 2, display: 'flex' }}>
                  <ChevronUp size={16} />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === list.length - 1} aria-label="Move down"
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: idx === list.length - 1 ? 'default' : 'pointer', opacity: idx === list.length - 1 ? 0.3 : 1, padding: 2, display: 'flex' }}>
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
