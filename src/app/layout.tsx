import type { Metadata, Viewport } from 'next'
import { Orbitron, Share_Tech_Mono, Barlow } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'
import ToastProvider from '@/components/Toast'
import ConfirmProvider from '@/components/ConfirmDialog'

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

// Everything that is read or pressed. A signage face: plain, slightly narrow,
// legible small, and at home next to Orbitron without competing with it.
const barlow = Barlow({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
  // Pinch-zoom stays on: people who need it should not have to find a setting
  // first. The iOS zoom-on-focus this used to guard against is handled in
  // globals.css by keeping inputs at 16px on touch screens.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Runs synchronously before first paint so a light-theme / non-default display
// size user doesn't get a dark (or unscaled) flash before hydration. Mirrors the
// storage keys in lib/theme.ts.
const noFlash = `try{var t=localStorage.getItem('hobbylog-theme');if(t==='light')document.documentElement.dataset.theme='light';var s=localStorage.getItem('hobbylog-display-size'),z={compact:'0.9',normal:'1',large:'1.15',xl:'1.3'}[s];if(z)document.documentElement.style.zoom=z;}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script below sets the theme and display size on <html> before
    // React hydrates, on purpose, so those two attributes are expected to differ
    // from the server's markup.
    <html lang="en" suppressHydrationWarning className={`${orbitron.variable} ${shareTechMono.variable} ${barlow.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        <ToastProvider>
          <ConfirmProvider>
            <ClientLayout>{children}</ClientLayout>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
