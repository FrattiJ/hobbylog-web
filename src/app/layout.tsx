import type { Metadata } from 'next'
import { Orbitron, Share_Tech_Mono } from 'next/font/google'
import './globals.css'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${shareTechMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
