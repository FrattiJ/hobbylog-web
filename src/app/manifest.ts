import type { MetadataRoute } from 'next'

// Makes Hobbylog installable to a phone home screen (mobile is a target).
// Next serves /icon.svg from app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hobbylog',
    short_name: 'Hobbylog',
    description: 'Track everything you love — one backlog for games, movies, books, and more.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080a0e',
    theme_color: '#080a0e',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
