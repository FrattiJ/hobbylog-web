'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart2, Search, Settings, Plus, Clock, NotebookPen, Users, ListOrdered,
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
        fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: active ? 600 : 400,
        letterSpacing: '0.06em', color: active ? 'var(--text-hi)' : 'var(--text-dim)',
        background: active ? 'color-mix(in srgb, var(--text-hi) 4%, transparent)' : 'transparent',
        borderLeft: active ? `3px solid ${color}` : '3px solid transparent',
        transition: 'all 0.15s ease', textDecoration: 'none', position: 'relative',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-mid)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-dim)' }}
    >
      {active && (
        <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: '60%', background: color, animation: 'pulse-bar 2s ease-in-out infinite' }} />
      )}
      <Icon size={14} />
      <span>{label}</span>
    </Link>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '0.2em', color: 'var(--text-mute)', padding: '16px 16px 6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
      {children}
      <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
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
    <aside onClick={close} style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: 'var(--bg-panel)', borderRight: '1px solid var(--border-dim)', display: 'flex', flexDirection: 'column', zIndex: mobile ? 80 : 60, overflowY: 'auto', transform: mobile && !open ? 'translateX(-100%)' : 'translateX(0)', transition: mobile ? 'transform 0.2s ease' : undefined, boxShadow: mobile && open ? '0 0 40px rgba(0,0,0,0.5)' : undefined }}>
      {/* Logo block */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border-dim)', position: 'relative' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-mute)', letterSpacing: '0.2em', marginBottom: 6 }}>PANEL 01 /</div>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 400 400" style={{ flexShrink: 0 }}>
            <rect width="400" height="400" fill="#06070d" />
            <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="#0d1117" />
            <polygon points="0,0 52,0 0,52" fill="#7c3aed" />
            <polygon points="52,0 400,0 400,348 348,400 0,400 0,52" fill="none" stroke="#7c3aed" strokeWidth="8" />
            <rect x="54" y="72" width="80" height="272" fill="#e2e8f0" />
            <rect x="54" y="200" width="218" height="38" fill="#e2e8f0" />
            <rect x="148" y="302" width="62" height="42" fill="#7c3aed" />
            <rect x="220" y="200" width="62" height="144" fill="#7c3aed" />
            <rect x="292" y="72" width="68" height="272" fill="#7c3aed" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 900, color: 'var(--text-hi)', letterSpacing: '0.12em' }}>HOBBYLOG</span>
        </Link>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 1, background: 'linear-gradient(to left, #7c3aed44, transparent)' }} />
      </div>

      {/* Quick actions (route to a hobby page for now) */}
      <SectionLabel>ACTIONS</SectionLabel>
      <div style={{ padding: '4px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#7c3aed18', border: '1px solid #7c3aed44', borderLeft: '2px solid #7c3aed', color: '#7c3aed', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', width: '100%' }}>
          <Plus size={11} /> ADD ENTRY
        </button>
        <button onClick={() => setShowLog(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0891b218', border: '1px solid #0891b244', borderLeft: '2px solid #0891b2', color: '#0891b2', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', width: '100%' }}>
          <Clock size={11} /> LOG SESSION
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        <SectionLabel>MAIN</SectionLabel>
        <NavItem href="/search" icon={Search} label="Search" pathname={pathname} />
        <NavItem href="/backlog" icon={ListOrdered} label="Backlog" accent="#d97706" pathname={pathname} />
        <NavItem href="/stats" icon={BarChart2} label="Stats" pathname={pathname} />
        <NavItem href="/friends" icon={Users} label="Friends" accent="#22c55e" pathname={pathname} />
        <NavItem href="/notes" icon={NotebookPen} label="Notes" pathname={pathname} />

        <SectionLabel>HOBBIES</SectionLabel>
        {enabledHobbies.map((hobby) => {
          const Icon = HOBBY_ICON_MAP[hobby.icon]
          if (!Icon) return null
          return (
            <NavItem key={hobby.id} href={HOBBY_PATHS[hobby.id]} icon={Icon} label={hobby.pluralLabel.toUpperCase()} accent={hobby.accent} pathname={pathname} />
          )
        })}

      </nav>

      {/* User → Settings */}
      <div style={{ borderTop: '1px solid var(--border-dim)', padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link href="/settings" title="Settings"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', textDecoration: 'none',
            background: settingsActive ? 'color-mix(in srgb, var(--text-hi) 5%, transparent)' : 'transparent',
            border: `1px solid ${settingsActive ? '#7c3aed66' : 'var(--border-dim)'}` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--text-hi) 5%, transparent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = settingsActive ? 'color-mix(in srgb, var(--text-hi) 5%, transparent)' : 'transparent' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #7c3aed66', flexShrink: 0 }}>
            {profile?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#fff' }}>{(profile?.username ?? 'O')[0].toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(profile?.username ?? 'OPERATOR').toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)', letterSpacing: '0.14em' }}>SETTINGS</div>
          </div>
          <Settings size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, animation: 'status-blink 3s ease-in-out infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.14em', whiteSpace: 'nowrap' }}>ALL SYSTEMS NOMINAL</span>
        </div>
      </div>
    </aside>

    {showAdd && <QuickAddPanel onClose={() => setShowAdd(false)} />}
    {showLog && <QuickLogModal onClose={() => setShowLog(false)} />}
    </>
  )
}
