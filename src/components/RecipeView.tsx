'use client'

import { useState } from 'react'
import { Clock, Gauge, Check } from 'lucide-react'
import { DIFFICULTIES, MEAL_TAG_LABEL, formatCookTime, type RecipeData } from '@/lib/recipe'

// The recipe as you read it while cooking: tags and timings up top, ingredients
// you can tick off as you gather them, and numbered steps.
export default function RecipeView({ recipe, accent }: { recipe: RecipeData; accent: string }) {
  // Ticks are a cooking aid for this sitting only; nothing is saved, so the
  // list is fresh the next time the recipe is opened.
  const [have, setHave] = useState<Set<number>>(new Set())
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())
  const toggle = (set: Set<number>, i: number) => { const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); return n }

  const difficulty = DIFFICULTIES.find((d) => d.id === recipe.difficulty)
  const time = formatCookTime(recipe.cook_minutes)
  const heading: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 8px' }
  const chip = (c: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', padding: '3px 8px', background: `${c}18`, color: c, border: `1px solid ${c}44` })
  const empty = recipe.ingredients.length === 0 && recipe.steps.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {(time || difficulty || recipe.meal_tags.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {time && <span style={chip('#0891b2')}><Clock size={11} /> {time}</span>}
          {difficulty && <span style={chip(difficulty.color)}><Gauge size={11} /> {difficulty.label}</span>}
          {recipe.meal_tags.map((t) => <span key={t} style={chip(accent)}>{MEAL_TAG_LABEL[t] ?? t}</span>)}
        </div>
      )}

      {empty && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          No ingredients or steps yet. Use EDIT to add them.
        </p>
      )}

      {recipe.ingredients.length > 0 && (
        <div>
          <p style={heading}>Ingredients · {recipe.ingredients.length}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recipe.ingredients.map((ing, i) => {
              const on = have.has(i)
              return (
                <li key={i}>
                  <button type="button" aria-pressed={on} onClick={() => setHave((s) => toggle(s, i))}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '6px 4px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? accent : 'var(--border-dim)'}`, background: on ? accent : 'transparent', color: '#fff' }}>
                      {on && <Check size={11} />}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5, color: on ? 'var(--text-dim)' : 'var(--text-hi)', textDecoration: on ? 'line-through' : 'none' }}>{ing}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {recipe.steps.length > 0 && (
        <div>
          <p style={heading}>Steps · {recipe.steps.length}</p>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recipe.steps.map((step, i) => {
              const on = doneSteps.has(i)
              return (
                <li key={i}>
                  <button type="button" aria-pressed={on} onClick={() => setDoneSteps((s) => toggle(s, i))}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '8px 4px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ minWidth: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, border: `1px solid ${accent}`, background: on ? accent : `${accent}18`, color: on ? '#fff' : accent }}>
                      {on ? <Check size={12} /> : i + 1}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65, color: on ? 'var(--text-dim)' : 'var(--text-hi)' }}>{step}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
