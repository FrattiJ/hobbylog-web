'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, arrivedViaRecoveryLink } from '@/lib/supabaseClient'
import { useIsMobile } from '@/lib/useIsMobile'
import Sidebar from './Sidebar'
import Landing from './Landing'
import ResetPasswordScreen from './ResetPasswordScreen'
import OnboardingSelector from './OnboardingSelector'
import WhatsNew from './WhatsNew'
import { HobbyContext } from './HobbyContext'
import { hasUnseenChangelog, markChangelogSeen } from '@/lib/changelog'
import { HOBBIES } from '@/lib/hobbies'
import { getProfile, setEnabledHobbies, completeOnboarding, PROFILE_CHANGED_EVENT, type WebProfile } from '@/lib/db'
import { getTheme, applyTheme, getDisplaySize, applyDisplaySize } from '@/lib/theme'
import type { HobbyCategory } from '@/types/database'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  // Set while a password-reset link's session is waiting on a new password.
  // Seeded from the URL the page opened with, because the client's own
  // PASSWORD_RECOVERY event can fire before the subscription below exists.
  const [recovering, setRecovering] = useState(arrivedViaRecoveryLink)
  const [profile, setProfile] = useState<WebProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [enabledIds, setEnabledIds] = useState<HobbyCategory[]>(HOBBIES.map((h) => h.id))
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  useEffect(() => {
    applyTheme(getTheme())
    applyDisplaySize(getDisplaySize())
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      // Backing out of the reset must not leave the next sign-in stuck on it.
      if (event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(() => {
    getProfile().then((p) => {
      setProfile(p)
      if (p.enabled_hobbies) setEnabledIds(p.enabled_hobbies)
      setProfileReady(true)
      if (p.onboarded && hasUnseenChangelog()) setShowWhatsNew(true)
    }).catch(() => { setProfileReady(true) })
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); setProfileReady(false); return }
    loadProfile()
    window.addEventListener(PROFILE_CHANGED_EVENT, loadProfile)
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, loadProfile)
  }, [session, loadProfile])

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const handleSetEnabledIds = useCallback(async (ids: HobbyCategory[]) => {
    await setEnabledHobbies(ids)
    setEnabledIds(ids)
  }, [])

  const handleOnboardingComplete = useCallback(async (ids: HobbyCategory[], goToImport: boolean) => {
    await completeOnboarding(ids)
    markChangelogSeen() // brand-new users skip the popup for the version they joined on
    setEnabledIds(ids)
    loadProfile()
    if (goToImport) router.push('/import')
  }, [loadProfile, router])

  const enabledHobbies = HOBBIES.filter((h) => enabledIds.includes(h.id))

  const loading = (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>Loading…</span>
    </div>
  )

  if (!ready) return loading
  if (!session) return <Landing />
  if (recovering) return <ResetPasswordScreen onDone={() => setRecovering(false)} />
  if (!profileReady) return loading
  if (profile && !profile.onboarded) return <OnboardingSelector onComplete={handleOnboardingComplete} />

  return (
    <HobbyContext.Provider value={{ enabledIds, enabledHobbies, setEnabledIds: handleSetEnabledIds }}>
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
        <a href="#main" className="skip-link">Skip to content</a>
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

        {/* Mobile top bar */}
        {isMobile && (
          <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 70, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}>
            <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: 'transparent', border: '1px solid var(--border-dim)', color: 'var(--text-mid)', cursor: 'pointer' }}>
              <Menu size={18} />
            </button>
            <span translate="no" style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>HOBBYLOG</span>
          </header>
        )}

        {/* Drawer backdrop */}
        {isMobile && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 75, background: 'rgba(0,0,0,0.5)' }} />
        )}

        <Sidebar profile={profile} mobile={isMobile} open={!isMobile || drawerOpen} onNavigate={() => setDrawerOpen(false)} />

        <main id="main" style={{ marginLeft: isMobile ? 0 : 220, paddingTop: isMobile ? 52 : 0, minHeight: '100vh', position: 'relative', zIndex: 1 }}>
          {children}
        </main>

        {showWhatsNew && <WhatsNew onClose={() => setShowWhatsNew(false)} />}
      </div>
    </HobbyContext.Provider>
  )
}
