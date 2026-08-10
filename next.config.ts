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
}

export default nextConfig
