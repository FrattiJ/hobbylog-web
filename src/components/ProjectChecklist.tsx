'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, ChevronUp, ChevronDown } from 'lucide-react'

export interface ChecklistItem { id: string; text: string; done: boolean }

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

export default function ProjectChecklist({ items, accent, onChange }: {
  items: ChecklistItem[]
  accent: string
  onChange: (items: ChecklistItem[]) => void
}) {
  const [text, setText] = useState('')
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  function add() {
    const t = text.trim()
    if (!t) return
    onChange([...items, { id: newId(), text: t, done: false }])
    setText('')
  }
  function toggle(id: string) { onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i))) }
  function remove(id: string) { onChange(items.filter((i) => i.id !== id)) }
  function move(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', margin: 0 }}>BUILD CHECKLIST</p>
        {items.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: accent }}>{done}/{items.length} · {pct}%</span>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ height: 4, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width 0.3s ease' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {items.map((it, idx) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)' }}>
            <button onClick={() => toggle(it.id)} aria-label="Toggle step"
              style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? accent : 'transparent', border: `1px solid ${it.done ? accent : 'var(--border-dim)'}`, cursor: 'pointer', color: '#fff' }}>
              {it.done && <Check size={12} />}
            </button>
            <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: it.done ? 'var(--text-dim)' : 'var(--text-hi)', textDecoration: it.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.text}</span>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up"
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: 2, display: 'flex' }}>
                <ChevronUp size={14} />
              </button>
              <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="Move down"
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: idx === items.length - 1 ? 'default' : 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1, padding: 2, display: 'flex' }}>
                <ChevronDown size={14} />
              </button>
            </div>
            <button onClick={() => remove(it.id)} aria-label="Remove step"
              style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="Add a step…" spellCheck autoCapitalize="sentences"
          style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-dim)', borderLeft: `2px solid ${accent}66`, padding: '8px 10px', color: 'var(--text-hi)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none' }} />
        <button onClick={add} disabled={!text.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', color: accent, background: `${accent}22`, border: `1px solid ${accent}`, cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() ? 1 : 0.5 }}>
          <Plus size={13} /> ADD
        </button>
      </div>
    </div>
  )
}
