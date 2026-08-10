import type { Metadata, Viewport } from 'next'
import { Orbitron, Share_Tech_Mono } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'
import ToastProvider from '@/components/Toast'

const orbitron = Orbitron({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  display: 'swap',
})

const shareTechMono = Share_Tech_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
})

const DESCRIPTION = 'Track everything you love — one backlog for games, movies, books, and more.'

export const metadata: Metadata = {
  metadataBase: new URL('https://hobbylog-web.vercel.app'),
  title: { default: 'Hobbylog', template: '%s · Hobbylog' },
  description: DESCRIPTION,
  applicationName: 'Hobbylog',
  openGraph: {
    title: 'Hobbylog',
    description: DESCRIPTION,
    url: '/',
    siteName: 'Hobbylog',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Hobbylog', description: DESCRIPTION },
}

export const viewport: Viewport = {
  themeColor: '#080a0e',
  // Lock zoom on mobile so tapping inputs/cards doesn't trigger iOS's auto zoom-in.
  // (The in-app Display Size setting covers users who need larger text.)
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// Runs synchronously before first paint so a light-theme / non-default display
// size user doesn't get a dark (or unscaled) flash before hydration. Mirrors the
// storage keys in lib/theme.ts.
const noFlash = `try{var t=localStorage.getItem('hobbylog-theme');if(t==='light')document.documentElement.dataset.theme='light';var s=localStorage.getItem('hobbylog-display-size'),z={compact:'0.9',normal:'1',large:'1.15',xl:'1.3'}[s];if(z)document.documentElement.style.zoom=z;}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${shareTechMono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        <ToastProvider>
          <ClientLayout>{children}</ClientLayout>
        </ToastProvider>
      </body>
    </html>
  )
}
