'use client'

import { useState } from 'react'
import { MEAL_TAGS, DIFFICULTIES, linesToList, type RecipeData } from '@/lib/recipe'

// The recipe half of an entry form: meal tags, difficulty, time, ingredients
// and steps. Controlled by the parent, which decides when it gets saved.
export default function RecipeFields({ value, onChange, accent }: {
  value: RecipeData
  onChange: (next: RecipeData) => void
  accent: string
}) {
  // The textareas keep their own raw text so blank lines and half-typed rows
  // survive while typing; the parsed list is what gets handed up.
  const [ingredientsText, setIngredientsText] = useState(() => value.ingredients.join('\n'))
  const [stepsText, setStepsText] = useState(() => value.steps.join('\n'))

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderLeft: `2px solid ${accent}66`, padding: '9px 12px', color: 'var(--text-hi)',
    fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
  }
  const label: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '0 0 6px' }
  const pill = (active: boolean, c: string): React.CSSProperties => ({ padding: '5px 10px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.05em', background: active ? `${c}22` : 'transparent', border: `1px solid ${active ? c : 'var(--border-dim)'}`, color: active ? c : 'var(--text-dim)', cursor: 'pointer' })

  function toggleTag(id: string) {
    const has = value.meal_tags.includes(id)
    onChange({ ...value, meal_tags: has ? value.meal_tags.filter((t) => t !== id) : [...value.meal_tags, id] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={label}>Meal / Course</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MEAL_TAGS.map((t) => (
            <button type="button" key={t.id} aria-pressed={value.meal_tags.includes(t.id)} onClick={() => toggleTag(t.id)} style={pill(value.meal_tags.includes(t.id), accent)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <p style={label}>Difficulty (optional)</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <button type="button" key={d.id} aria-pressed={value.difficulty === d.id}
                onClick={() => onChange({ ...value, difficulty: value.difficulty === d.id ? null : d.id })}
                style={pill(value.difficulty === d.id, d.color)}>{d.label}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <p style={label}>Time to Cook (min, optional)</p>
          <input type="number" min={0} value={value.cook_minutes ?? ''} placeholder="—" aria-label="Time to cook in minutes"
            onChange={(e) => { const n = parseFloat(e.target.value); onChange({ ...value, cook_minutes: Number.isFinite(n) && n > 0 ? n : null }) }}
            style={inp} />
        </div>
      </div>

      <div>
        <p style={label}>Ingredients (one per line)</p>
        <textarea value={ingredientsText} rows={6} spellCheck aria-label="Ingredients, one per line"
          placeholder={'2 cups flour\n1 tsp salt\n…'}
          onChange={(e) => { setIngredientsText(e.target.value); onChange({ ...value, ingredients: linesToList(e.target.value) }) }}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      <div>
        <p style={label}>Steps (one per line)</p>
        <textarea value={stepsText} rows={6} spellCheck autoCapitalize="sentences" aria-label="Steps, one per line"
          placeholder={'Preheat the oven to 400°F\nMix the dry ingredients\n…'}
          onChange={(e) => { setStepsText(e.target.value); onChange({ ...value, steps: linesToList(e.target.value) }) }}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
      </div>
    </div>
  )
}
