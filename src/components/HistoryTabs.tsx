'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Library, History, BarChart2 } from 'lucide-react'

// Shelf, Timeline and Stats are three views of the same thing: what you have
// done. They share one entry in the sidebar ("History") and this strip of tabs
// across the top of each, so moving between them is one press.

export const HISTORY_PAGES = [
  { href: '/shelf', label: 'Shelf', icon: Library, accent: '#f59e0b' },
  { href: '/timeline', label: 'Timeline', icon: History, accent: '#099bbe' },
  { href: '/stats', label: 'Stats', icon: BarChart2, accent: '#a577f2' },
] as const

export default function HistoryTabs() {
  const pathname = (usePathname() ?? '').replace(/\/$/, '')
  return (
    <nav aria-label="History" className="tab-row" style={{ marginBottom: 22, borderBottom: '1px solid var(--border-dim)', paddingBottom: 12 }}>
      {HISTORY_PAGES.map(({ href, label, icon: Icon, accent }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', textDecoration: 'none',
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: active ? 600 : 500,
              background: active ? `${accent}1f` : 'transparent',
              border: `1px solid ${active ? accent : 'var(--border-dim)'}`,
              color: active ? accent : 'var(--text-mid)', transition: 'var(--t-fast)',
            }}>
            <Icon size={16} aria-hidden="true" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
