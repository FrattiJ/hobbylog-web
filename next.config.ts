import type { NextConfig } from 'next'

// Real web app on Vercel — no static export (that was for the Tauri desktop build).
const nextConfig: NextConfig = {
  devIndicators: {
    position: 'bottom-right',
  },
}

export default nextConfig
