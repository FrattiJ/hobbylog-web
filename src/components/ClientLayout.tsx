'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import Sidebar from './Sidebar'
import LoginScreen from './LoginScreen'
import OnboardingSelector from './OnboardingSelector'
import { HobbyContext } from './HobbyContext'
import { HOBBIES } from '@/lib/hobbies'
import { getProfile, setEnabledHobbies, completeOnboarding, PROFILE_CHANGED_EVENT, type WebProfile } from '@/lib/db'
import { getTheme, applyTheme } from '@/lib/theme'
import type { HobbyCategory } from '@/types/database'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<WebProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [enabledIds, setEnabledIds] = useState<HobbyCategory[]>(HOBBIES.map((h) => h.id))

  useEffect(() => {
    applyTheme(getTheme())
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(() => {
    getProfile().then((p) => {
      setProfile(p)
      if (p.enabled_hobbies) setEnabledIds(p.enabled_hobbies)
      setProfileReady(true)
    }).catch(() => { setProfileReady(true) })
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); setProfileReady(false); return }
    loadProfile()
    window.addEventListener(PROFILE_CHANGED_EVENT, loadProfile)
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, loadProfile)
  }, [session, loadProfile])

  const handleSetEnabledIds = useCallback(async (ids: HobbyCategory[]) => {
    await setEnabledHobbies(ids)
    setEnabledIds(ids)
  }, [])

  const handleOnboardingComplete = useCallback(async (ids: HobbyCategory[], goToImport: boolean) => {
    await completeOnboarding(ids)
    setEnabledIds(ids)
    loadProfile()
    if (goToImport) router.push('/import')
  }, [loadProfile, router])

  const enabledHobbies = HOBBIES.filter((h) => enabledIds.includes(h.id))

  const loading = (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>INITIALIZING…</span>
    </div>
  )

  if (!ready) return loading
  if (!session) return <LoginScreen />
  if (!profileReady) return loading
  if (profile && !profile.onboarded) return <OnboardingSelector onComplete={handleOnboardingComplete} />

  return (
    <HobbyContext.Provider value={{ enabledIds, enabledHobbies, setEnabledIds: handleSetEnabledIds }}>
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
        {/* Blueprint grid overlay */}
        <div aria-hidden style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
          backgroundSize: '40px 40px', opacity: 0.25,
        }} />
        {/* Scanline overlay */}
        <div aria-hidden style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        }} />

        <Sidebar profile={profile} />

        <main style={{ marginLeft: 220, minHeight: '100vh', position: 'relative', zIndex: 1 }}>
          {children}
        </main>
      </div>
    </HobbyContext.Provider>
  )
}
