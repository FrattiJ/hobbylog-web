import type { Metadata } from 'next'
import { Orbitron, Share_Tech_Mono } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'

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

export const metadata: Metadata = {
  title: 'Hobbylog',
  description: 'Track everything you love — one backlog for games, movies, books, and more.',
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
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
