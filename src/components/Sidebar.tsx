'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart2, Search, Settings, Plus, Clock, NotebookPen, Users, Sparkles, Library,
} from 'lucide-react'
import type { Profile } from '@/types/database'
import { HOBBY_PATHS } from '@/lib/hobbies'
import { HOBBY_ICON_MAP } from './hobbyIcons'
import { useHobbies } from './HobbyContext'
import QuickAddPanel from './QuickAddPanel'
import QuickLogModal from './QuickLogModal'

interface NavItemProps {
  href: string
  icon: React.ComponentType<{ size?: number }>
  label: string
  accent?: string
  pathname: string
}

function NavItem({ href, icon: Icon, label, accent, pathname }: NavItemProps) {
  const p = pathname.replace(/\/$/, '') || '/'
  const active = p === href || (href !== '/' && href !== '/dashboard' && href !== '/settings' && p.startsWith(href))
  const color = active ? (accent ?? 'var(--text-mid)') : undefined
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
        fontSize: 15, fontFamily: 'var(--font-body)', fontWeight: active ? 600 : 500,
        color: active ? 'var(--text-hi)' : 'var(--text-mid)',
        background: active ? 'color-mix(in srgb, var(--text-hi) 4%, transparent)' : 'transparent',
        borderLeft: active ? `3px solid ${color}` : '3px solid transparent',
        transition: 'var(--t-fast)', textDecoration: 'none', position: 'relative',
      }}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-hi)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-mid)' }}
    >
      {active && (
        <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: '60%', background: color }} />
      )}
      <span aria-hidden="true" style={{ display: 'flex', color: active ? color : undefined }}><Icon size={16} /></span>
      <span>{label}</span>
    </Link>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '18px 16px 6px' }}>
      {children}
    </div>
  )
}

export default function Sidebar({ profile, mobile = false, open = true, onNavigate }: { profile: Profile | null; mobile?: boolean; open?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const [showAdd, setShowAdd] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const { enabledHobbies } = useHobbies()
  const settingsActive = (pathname.replace(/\/$/, '') || '/') === '/settings'
  const close = () => { if (mobile) onNavigate?.() }

  return (
    <>
    <aside aria-label="Main navigation" onClick={close} style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: 'var(--bg-panel)', borderRight: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', zIndex: mobile ? 80 : 60, overflowY: 'auto', transform: mobile && !open ? 'translateX(-100%)' : 'translateX(0)', transition: mobile ? 'transform 0.2s ease' : undefined, boxShadow: mobile && open ? '0 0 40px rgba(0,0,0,0.5)' : undefined }}>
      {/* Logo block */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border-dim)', position: 'relative' }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 400 400" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect width="400" height="400" fill="#06070d" />
            <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="#0d1117" />
            <polygon points="0,0 52,0 0,52" fill="#a577f2" />
            <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="none" stroke="#a577f2" strokeWidth="8" />
            <rect x="54" y="72" width="80" height="272" fill="#e2e8f0" />
            <rect x="54" y="200" width="218" height="38" fill="#e2e8f0" />
            <rect x="148" y="302" width="62" height="42" fill="#a577f2" />
            <rect x="220" y="200" width="62" height="144" fill="#a577f2" />
            <rect x="292" y="72" width="68" height="272" fill="#a577f2" />
          </svg>
          <span translate="no" style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>HOBBYLOG</span>
        </Link>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 1, background: 'linear-gradient(to left, #a577f244, transparent)' }} />
      </div>

      {/* Quick actions (route to a hobby page for now) */}
      <div style={{ padding: '14px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#a577f218', border: '1px solid #a577f244', borderLeft: '2px solid #a577f2', color: '#a577f2', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', width: '100%' }}>
          <Plus size={14} aria-hidden="true" /> Add Entry
        </button>
        <button onClick={() => setShowLog(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#099bbe18', border: '1px solid #099bbe44', borderLeft: '2px solid #099bbe', color: '#099bbe', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', width: '100%' }}>
          <Clock size={14} aria-hidden="true" /> Log Session
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <NavItem href="/search" icon={Search} label="Search" pathname={pathname} />
        <NavItem href="/suggestions" icon={Sparkles} label="What Next" accent="#a577f2" pathname={pathname} />
        <NavItem href="/shelf" icon={Library} label="Shelf" accent="#f59e0b" pathname={pathname} />
        <NavItem href="/stats" icon={BarChart2} label="Stats" pathname={pathname} />
        <NavItem href="/friends" icon={Users} label="Friends" accent="#22c55e" pathname={pathname} />
        <NavItem href="/notes" icon={NotebookPen} label="Notes" pathname={pathname} />

        <SectionLabel>Hobbies</SectionLabel>
        {enabledHobbies.map((hobby) => {
          const Icon = HOBBY_ICON_MAP[hobby.icon]
          if (!Icon) return null
          return (
            <NavItem key={hobby.id} href={HOBBY_PATHS[hobby.id]} icon={Icon} label={hobby.pluralLabel} accent={hobby.accent} pathname={pathname} />
          )
        })}

      </nav>

      {/* User → Settings */}
      <div style={{ borderTop: '1px solid var(--border-dim)', padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link href="/settings" title="Settings"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', textDecoration: 'none',
            background: settingsActive ? 'color-mix(in srgb, var(--text-hi) 5%, transparent)' : 'transparent',
            border: `1px solid ${settingsActive ? '#a577f266' : 'var(--border-dim)'}` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--text-hi) 5%, transparent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = settingsActive ? 'color-mix(in srgb, var(--text-hi) 5%, transparent)' : 'transparent' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #a577f2, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #a577f266', flexShrink: 0 }}>
            {profile?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
              : <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 700, color: '#fff' }}>{(profile?.username ?? 'O')[0].toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(profile?.username ?? 'You')}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>Settings</div>
          </div>
          <Settings size={14} aria-hidden="true" style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        </Link>
      </div>
    </aside>

    {showAdd && <QuickAddPanel onClose={() => setShowAdd(false)} />}
    {showLog && <QuickLogModal onClose={() => setShowLog(false)} />}
    </>
  )
}
