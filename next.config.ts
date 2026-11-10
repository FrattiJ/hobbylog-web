import type { NextConfig } from 'next'

// Real web app on Vercel — no static export (that was for the Tauri desktop build).
const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Sibling repos (the Tauri desktop app)
  // have their own lockfiles, which otherwise make Next guess the wrong root.
  turbopack: {
    root: __dirname,
  },
  devIndicators: {
    position: 'bottom-right',
  },
  // Baseline browser protections for every page and route: no framing (stops
  // clickjacking), no MIME sniffing, no full URLs leaked to other sites, and no
  // access to device features the app never uses.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
}

export default nextConfig
