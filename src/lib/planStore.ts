import { supabase } from './supabaseClient'
import { currentUserId } from './currentUser'
import type { PlanMode, SavedPlan } from './plan'

// Where a saved plan lives: one row per person in web_plans (migration 0014).
// Working a plan out needs nothing stored; this is only for keeping one, so
// that it can be measured against later and opened on another device.

/** True when a query failed because its table has not been created yet. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/i.test(error.message ?? '')
}

/** Thrown when a feature's table is not in the database yet. */
export class NotReadyError extends Error {
  constructor(what: string) {
    super(`${what} need a database update that has not been applied yet.`)
    this.name = 'NotReadyError'
  }
}

const MODES: PlanMode[] = ['balanced', 'finishes', 'long']

export async function getSavedPlan(): Promise<SavedPlan | null> {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('web_plans').select('*').eq('user_id', userId).maybeSingle()
  // No table yet reads the same as no plan: there is nothing saved either way.
  if (error) { if (isMissingTable(error)) return null; throw error }
  if (!data) return null
  const mode = MODES.includes(data.mode as PlanMode) ? (data.mode as PlanMode) : 'balanced'
  return {
    hours_per_week: Number(data.hours_per_week),
    goal_date: data.goal_date as string,
    mode,
    entry_ids: Array.isArray(data.entry_ids) ? (data.entry_ids as string[]) : [],
    started_on: data.started_on as string,
  }
}

export async function saveSavedPlan(plan: SavedPlan): Promise<void> {
  const user_id = await currentUserId()
  const { error } = await supabase.from('web_plans').upsert({
    user_id,
    hours_per_week: Math.round(plan.hours_per_week * 100) / 100,
    goal_date: plan.goal_date,
    mode: plan.mode,
    entry_ids: plan.entry_ids,
    started_on: plan.started_on,
    updated_at: new Date().toISOString(),
  })
  if (error) { if (isMissingTable(error)) throw new NotReadyError('Saved plans'); throw error }
}

export async function deleteSavedPlan(): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('web_plans').delete().eq('user_id', userId)
  if (error && !isMissingTable(error)) throw error
}
